import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { createHash } from 'node:crypto';
import { config, contentIntent } from './config.js';
import { requireOperator } from './admin-access.js';
import { prepareProduction } from './production.js';
import { pinIfAllowed } from './pins.js';
import { commands } from './commands.js';
import { UserError, compatible, blockedTerm } from './domain.js';
import { assertAssignable } from './roles.js';
import { parseEmoji } from './reaction-roles.js';
import { Community } from './community.js';
import { SYSTEM_NAME, nativePayload } from './community-ui.js';
import { card, panelPayload, publishModal,
  searchPayload, privateFlags, noMentions, safe, button, withImage, deliverCard } from './ui.js';
import { ActionRowBuilder, ButtonStyle } from 'discord.js';
import { Workflows } from './workflows.js';
import { teamPrivatePayload, profilePrivatePayload } from './wizard-ui.js';
import { VoiceRooms } from './voice-rooms.js';
import { PrivateReplies, isPrivateMessage, closePanelRow } from './private-replies.js';
import { Leaderboard } from './leaderboard.js';
import { skillLabels } from './catalog.js';
import { AccessGate } from './access-gate.js';
import { ChatSearch } from './chat-search.js';
import { Tournaments, tournamentCommands, requireTournamentAdmin } from './tournaments.js';
import { Mailboxes, isAdministrativeCommand } from './mailboxes.js';
import { MemberCards } from './member-cards.js';
import { WordLists, parseModerationTerms } from './word-lists.js';
import { MemberGuide } from './member-guide.js';
import { InlineEmojis, resolveEmbedEmojis } from './inline-emojis.js';
import { Clans, clanCommands } from './clans.js';
import { ensureFinalsRole, processRoleJobs, ensureTeamsChannel, lockControlChannel, relocateSearches } from './setup.js';

export class VexBot {
  constructor(client, store, tracker, renderer = null, playerCards = null) {
    this.client = client;
    this.store = store;
    this.tracker = tracker;
    this.guilds = new Set();
    this.queues = new Map();
    this.renderer = renderer;
    this.playerCards = playerCards;
    this.refreshPending = new Set();
    this.workflows = new Workflows(this);
    this.setupPending = new Set();
    this.voiceRooms = new VoiceRooms(this);
    this.privateReplies = new PrivateReplies(this);
    this.leaderboard = new Leaderboard(this);
    this.community = new Community(this);
    this.accessGate = new AccessGate(this);
    this.chatSearch = new ChatSearch(this);
    this.tournaments = new Tournaments(this);
    this.mailboxes = new Mailboxes(this);
    this.wordLists = new WordLists(this);
    this.memberGuide = new MemberGuide(this);
    this.inlineEmojis = new InlineEmojis(this);
    this.clans = new Clans(this);
    this.memberCards = renderer ? new MemberCards(renderer) : null;
    this.membersIntent = false;
  }
  admin(i) {
    requireOperator(i);
  }
  queue(key, task) {
    const next = (this.queues.get(key) ?? Promise.resolve()).catch(() => {}).then(task);
    this.queues.set(key, next);
    next.finally(() => { if (this.queues.get(key) === next) this.queues.delete(key); }).catch(() => {});
    return next;
  }
  async ready() {
    const configured = process.env.DISCORD_GUILD_ID?.trim();
    let guild;
    if (configured) guild = await this.client.guilds.fetch(configured);
    else {
      const named = this.client.guilds.cache.filter(g => g.name === config.guildName);
      if (named.size === 1) guild = named.first();
      else if (this.client.guilds.cache.size === 1) guild = this.client.guilds.cache.first();
      else throw new UserError('Hay varios servidores o ninguno. Completa DISCORD_GUILD_ID en .env.');
    }
    if (!guild) throw new UserError('El bot todavía no está instalado en un servidor.');
    this.guilds.add(guild.id);
    if (this.client.user.username !== SYSTEM_NAME) await this.client.user.setUsername(SYSTEM_NAME).catch(e => this.log(e, 'Cambiar nombre del bot'));
    await guild.commands.set(commands);
    console.log(`VEX LATAM SYSTEM conectado en ${guild.name}. Comandos registrados.`);
    await guild.channels.fetch();
    await prepareProduction(this, guild);
    await this.mailboxes.setup(guild).catch(e => this.log(e, 'Preparar panel administrativo y buzones; se reintentará'));
    await this.tournaments.setup(guild).catch(e => this.log(e, 'Preparar torneos; se reintentará'));
    await ensureFinalsRole(this, guild).catch(e => { this.setupPending.add(guild.id); this.log(e, 'Preparar rol THE FINALS'); });
    for (const p of this.store.profiles(guild.id)) this.store.queueRole(guild.id, p.user);
    await processRoleJobs(this, guild);
    const teams = await ensureTeamsChannel(this, guild).catch(e => { this.setupPending.add(guild.id); this.log(e, 'Preparar #equipos'); return null; });
    const saved = this.store.settings(guild.id);
    for (const [type, name] of [['registro', config.registrationChannelName], ['buscar', config.searchChannelName]]) {
      try {
        let channel = saved.panels?.[type]?.channel ? await guild.channels.fetch(saved.panels[type].channel) : null;
        if (!channel) {
          const matches = guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.name === name);
          if (matches.size > 1) throw new UserError(`Hay varios canales ${name}. Selecciona uno con /panel.`);
          channel = matches.first();
        }
        if (!channel && type === 'buscar' && config.createSearchChannelIfMissing) {
          const me = await guild.members.fetchMe();
          if (me.permissions.has(P.ManageChannels)) {
            channel = await guild.channels.create({ name, type: ChannelType.GuildText,
              topic: 'Forma tu equipo de THE FINALS usando el panel de VEX LATAM SYSTEM.',
              permissionOverwrites: [
                { id: guild.id, deny: [P.SendMessages] },
                { id: me.id, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles, P.ReadMessageHistory] },
              ], reason: 'Canal de búsqueda de compañeros solicitado para VEX LATAM SYSTEM' });
          }
        }
        if (!channel) throw new UserError(`Crea el canal #${name} en Discord y usa /panel tipo:${type} canal:#${name}.`);
        await this.postPanel(guild, type, channel);
        console.log(`Panel ${type} listo en #${channel.name}.`);
      } catch (error) { this.setupPending.add(guild.id); this.log(error, `Panel ${type}`); }
    }
    if (teams) await relocateSearches(this, guild, teams).catch(e => { this.setupPending.add(guild.id); this.log(e, 'Trasladar solicitudes'); });
    await this.chatSearch.setup(guild).catch(e => this.log(e, 'Preparar búsqueda por chat; se reintentará'));
    await this.community.setup(guild).catch(e => this.log(e, 'Preparar bienvenida, reglas y reacciones; se reintentará'));
    await this.clans.setup(guild).catch(e => this.log(e, 'Preparar clanes y formularios; se reintentará'));
    await this.memberGuide.setup(guild).catch(e => this.log(e, 'Publicar guía de comandos para miembros; se reintentará'));
    await this.community.reactions.reconcile(guild).catch(e => this.log(e, 'Recuperar reacciones de roles'));
    // Una publicación interrumpida antes de obtener un mensaje no debe bloquear al organizador.
    for (const s of this.store.searches(guild.id)) {
      if (s.status === 'pending') this.store.removeSearch(s.id);
      else await this.refreshSearch(s.id).catch(e => this.log(e, 'Recuperar búsqueda'));
    }
    await this.leaderboard.refresh(guild, { setup: true, force: true }).catch(e => {
      this.leaderboard.pending.add(guild.id); this.log(e, 'Preparar leaderboard');
    });
    await this.accessGate.setup(guild).catch(e => this.log(e, 'Restaurar acceso libre y preparar roles de perfil; se reintentará'));
    if (!this.store.settings(guild.id).accessGate?.restorePending) console.log('Acceso al servidor: perfil opcional.');
    await processRoleJobs(this, guild);
    await this.expire();
    await this.voiceRooms.reconcile(guild);
    this.voiceRooms.start();
    this.timer = setInterval(() => this.expire().catch(e => this.log(e, 'Caducidad')), 60000);
    this.timer.unref();
    if (!contentIntent) console.log('Lectura de texto desactivada. Moderación y ayuda de búsqueda por chat requieren Message Content Intent.');
    else {
      const chat = this.store.settings(guild.id).chatSearch;
      console.log(`Búsqueda HOT por chat: ${chat?.enabled ? 'activa' : 'desactivada'}; canal ${chat?.channel ?? 'pendiente'}; una búsqueda activa por organizador; recordatorios cada ${chat?.cooldownSeconds ?? 300}s.`);
    }
  }
  log(error, context) {
    if (error instanceof UserError) console.error(`${context}: ${error.message}`);
    else console.error(`${context}: error ${error.code ?? error.name ?? 'desconocido'}. Revisa permisos y conexión.`);
  }
  async channel(guild, id) {
    const channel = await guild.channels.fetch(id);
    if (!channel || channel.type !== ChannelType.GuildText) throw new UserError('Selecciona un canal de texto del servidor.');
    const me = await guild.members.fetchMe();
    if (!channel.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages])) {
      throw new UserError(`Dale al bot Ver canales y Enviar mensajes en #${channel.name}.`);
    }
    return channel;
  }
  postPanel(guild, type, channel) {
    if (['roles', 'reglas'].includes(type)) return this.community.postPanel(guild, type, channel);
    if (type === 'leaderboard') return this.leaderboard.refresh(guild, { setup: true, force: true, channel });
    return this.queue(`panel:${guild.id}:${type}`, async () => {
      channel = await this.channel(guild, channel?.id);
      const settings = this.store.settings(guild.id);
      const previous = settings.panels?.[type];
      let payload = panelPayload(type, this.store.settings(guild.id));
      if (['registro', 'buscar'].includes(type)) payload = await withImage(payload, this.renderer, type, {});
      let message;
      if (previous?.channel === channel.id && previous.message) {
        // Editar el mensaje propio por ID evita exigir Leer historial al bot.
        try { message = await deliverCard(p => channel.messages.edit(previous.message, p), payload); }
        catch (error) { if (error.code !== 10008) throw error; }
      }
      if (!message) {
        const nonce = createHash('sha256').update(`panel:${channel.id}:${type}`).digest('hex').slice(0, 25);
        message = await deliverCard(p => channel.send({ ...p, nonce, enforceNonce: true }), payload);
      }
      const latest = this.store.settings(guild.id);
      latest.panels ??= {};
      latest.panels[type] = { channel: channel.id, message: message.id };
      this.store.saveSettings(guild.id, latest);
      if (['registro', 'buscar'].includes(type)) {
        await lockControlChannel(guild, channel);
        await pinIfAllowed(message,'Panel principal VEX LATAM SYSTEM');
      }
      if (previous && previous.channel !== channel.id) {
        try {
          const old = await guild.channels.fetch(previous.channel);
          if (old?.isTextBased()) await old.messages.edit(previous.message, card('Panel trasladado', `Usa el panel de <#${channel.id}>.`));
        } catch (error) { this.log(error, 'Actualizar panel anterior'); }
      }
      return message;
    });
  }
  requireProfile(i) {
    const profile = this.store.profile(i.guildId, i.user.id);
    if (!profile) throw new UserError('Primero completa tu perfil desde la tarjeta de registro-de-datos.');
    return profile;
  }
  async sendPrivate(i, content, extra = {}, followup = false) {
    if (i.vexUpdate && !followup) return this.replyCard(i, card('VEX LATAM SYSTEM', content, extra.components ?? []));
    const payload = { content, allowedMentions: noMentions, ...extra };
    if (typeof i.deleteReply === 'function') payload.components = [...(payload.components ?? []), closePanelRow()];
    return this.queue(`private:${this.privateReplies.scope(i)}`, async () => {
      let response;
      if (followup || i.replied && !i.deferred) response = await i.followUp({ ...payload, flags: privateFlags });
      else if (i.deferred) response = await i.editReply(payload);
      else response = await i.reply({ ...payload, flags: privateFlags, withResponse: true });
      await this.privateReplies.remember(i, response, { replace: !followup, ...(followup ? { ttl: 60000 } : {}) });
      return response;
    });
  }
  async ackCard(i, update = false) {
    if (i.deferred || i.replied) return;
    if (update || isPrivateMessage(i)) { await i.deferUpdate(); i.vexUpdate = true; }
    else await i.deferReply({ flags: privateFlags });
  }
  async replyCard(i, payload) {
    if (!i.deferred && !i.replied && isPrivateMessage(i)) await this.ackCard(i);
    payload.attachments ??= [];
    if (typeof i.deleteReply === 'function') {
      const container = payload.components.find(c => c.addActionRowComponents);
      if (container) container.addActionRowComponents(closePanelRow());
    }
    return this.queue(`private:${this.privateReplies.scope(i)}`, async () => {
      let response;
      if (i.deferred) {
        try { response = await deliverCard(p => i.editReply(p), payload); }
        catch (error) {
          if (error.code !== 10008 || !i.vexUpdate || !isPrivateMessage(i)) throw error;
          // El usuario pudo enviar un modal después de la limpieza automática.
          response = await deliverCard(p => i.followUp({ ...p, flags: p.flags | privateFlags }), payload);
        }
      }
      else if (i.replied) response = await deliverCard(p => i.followUp({ ...p, flags: p.flags | privateFlags }), payload);
      else response = await deliverCard(p => i.reply({ ...p, flags: p.flags | privateFlags, withResponse: true }), payload);
      await this.privateReplies.remember(i, response);
      return response;
    });
  }
  async searchCard(s, notify = false) {
    const membersDisplay = await Promise.all(s.members.map(async id => {
      const profile = this.store.profile(s.guild, id);
      return { embarkId: profile?.embarkId ?? 'Perfil no disponible', sponsorId: profile?.sponsorId ?? null,
        cardImageData: await this.playerCards?.dataURI(profile?.cardImage) ?? null };
    }));
    const hostProfile = this.store.profile(s.guild, s.host);
    const data = { ...s, membersDisplay, sponsorId: hostProfile?.sponsorId ?? null, hostScore: hostProfile?.score ?? null };
    const settings = this.store.settings(s.guild);
    return withImage(searchPayload(data, s.filters.mode === 'HOT' ? settings.chatSearch?.gameRole ?? settings.finalsRole : settings.finalsRole, notify), this.renderer, 'team', data);
  }
  async visualProfile(p) {
    return { ...p, cardImageData: await this.playerCards?.dataURI(p.cardImage) ?? null };
  }
  async refreshMemberTeams(guild, user) {
    for (const s of this.store.searches(guild).filter(s => s.members.includes(user) && s.message)) {
      try { await this.refreshSearch(s.id); this.refreshPending.delete(s.id); }
      catch (error) { this.refreshPending.add(s.id); this.log(error, 'Actualizar tarjeta del equipo pendiente'); }
    }
    await this.refreshLeaderboard(guild);
  }
  async refreshLeaderboard(guild) {
    if (!this.store.settings(guild).leaderboard) return;
    try { await this.leaderboard.refresh(await this.client.guilds.fetch(guild)); }
    catch (error) { this.leaderboard.pending.add(guild); this.log(error, 'Actualizar leaderboard pendiente'); }
  }
  async interaction(i) {
    if (!i.inGuild() || !this.guilds.has(i.guildId)) return;
    try {
      if (i.isAutocomplete?.() && tournamentCommands.includes(i.commandName)) {
        try { this.mailboxes.assertAdminCommand(i); } catch { return await i.respond([]); }
        return await this.tournaments.autocomplete(i);
      }
      if (i.customId?.startsWith('mailbox:')) return await this.mailboxes.handle(i);
      if (i.customId?.startsWith('words:')) return await this.wordLists.handle(i);
      if (i.customId?.startsWith('emoji:')) return await this.inlineEmojis.handle(i);
      if (i.customId?.startsWith('clan:')) return await this.clans.handle(i);
      if (i.customId?.startsWith('tour:')) return await this.tournaments.handle(i);
      if (i.customId === 'leaderboard:view') return await this.leaderboard.view(i);
      if (i.customId === 'private:close') {
        if (!await this.privateReplies.close(i)) throw new UserError('Este botón solo cierra tu panel privado.');
        return;
      }
      if (i.customId === 'private:clear') {
        await i.deferReply({ flags: privateFlags });
        await this.privateReplies.clear(i);
        const response = await i.editReply({ content: 'Paneles privados recientes limpiados. Los anteriores al reinicio se quitan con Eliminar este mensaje en Discord.', allowedMentions: noMentions });
        await this.privateReplies.remember(i, response, { ttl: 5000 });
        return;
      }
      if (i.customId && await this.community.handle(i)) return;
      if (i.customId && await this.workflows.handle(i)) return;
      if (i.isChatInputCommand()) return await this.command(i);
      if (i.isButton()) return await this.button(i);
      if (i.isModalSubmit()) return await this.modal(i);
      if (i.isStringSelectMenu() && i.customId === 'roles:select') {
        throw new UserError('Este menú fue sustituido por reacciones. Usa el panel actualizado de selección de roles.');
      }
    } catch (error) {
      this.log(error, 'Interacción');
      const message = error instanceof UserError ? error.message : 'No pude completar la acción. Revisa los permisos del bot o vuelve a intentarlo.';
      try {
        // Los errores de un control privado no reemplazan el asistente ni revelan datos en público.
        if (i.vexUpdate) await this.sendPrivate(i, message, {}, true);
        else await this.sendPrivate(i, message);
      } catch { /* La interacción pudo haber caducado. */ }
    }
  }
  async command(i) {
    const name = i.commandName;
    if (isAdministrativeCommand(name)) {
      if (tournamentCommands.includes(name) || name === 'anuncio') requireTournamentAdmin(i);
      else this.admin(i);
      this.mailboxes.assertAdminCommand(i);
    }
    if (tournamentCommands.includes(name)) return this.tournaments.command(i);
    if (clanCommands.includes(name)) return this.clans.command(i);
    if (name === 'anuncio') requireTournamentAdmin(i);
    if (name === 'ping') return this.sendPrivate(i, `VEX LATAM SYSTEM está conectado. Latencia: ${this.client.ws.ping} ms.`);
    if (name === 'ayuda') return this.sendPrivate(i,
      '**Jugadores:** usa las tarjetas de registro-de-datos, buscar-equipo y leaderboard. También puedes usar /perfil, /buscar y /leaderboard.\n'
      + '**Buzones:** usa los botones de #feedback y #reportes. Solo los administradores reciben los envíos; el feedback admite anonimato opcional.\n'
      + '**VLS Find Squad:** perfiles, búsquedas, leaderboard y salas de voz temporales.\n'
      + '**Administración:** usa #admin-bot para /panel, /roles, /embed, /bienvenida, /despedida, /avisos, /anuncio, /reglas, /moderacion y /busqueda-chat.\n'
      + '**Torneos:** inscríbete desde el panel del torneo. Solo Administradores: /torneo crear, /torneo editar, /torneo revisar, /torneo cerrar convocatoria, /torneo terminar, /torneo-formar-equipo, /torneo-chat-de-voz-general y /torneo-chat-de-voz-equipos. Cerrar convocatoria bloquea inscripciones; terminar inicia 7 días para eliminar los canales del torneo.\n'
      + 'Los perfiles se guardan por servidor. El registro y la consulta de tu perfil son privados. Tu tarjeta, Embark ID y RS pueden aparecer en solicitudes públicas y en el top 10 de esta comunidad.');
    if (name === 'perfil') return this.store.profile(i.guildId, i.user.id) ? this.workflows.profile(i) : this.workflows.startProfile(i);
    if (name === 'buscar') {
      return this.workflows.startSearch(i);
    }
    if (name === 'leaderboard') return this.leaderboard.view(i);
    this.admin(i);
    if (await this.community.command(i)) return;
    if (name === 'anuncio') {
      return i.showModal(publishModal(name, i.options.getChannel('canal').id));
    }
    if (['busqueda-chat', 'moderacion'].includes(name) && i.options.getSubcommand() === 'palabras') {
      return this.wordLists.open(i, name === 'busqueda-chat' ? 'chat' : 'moderation');
    }
    await i.deferReply({ flags: privateFlags });
    if (name === 'panel') {
      const message = await this.postPanel(i.guild, i.options.getString('tipo'), i.options.getChannel('canal'));
      return this.sendPrivate(i, `Tarjeta lista: ${message.url}`);
    }
    if (name === 'roles') return this.configureRoles(i);
    if (name === 'avisos') {
      const settings = this.store.settings(i.guildId);
      return this.sendPrivate(i, `Rol de equipos: ${settings.finalsRole ? `<@&${settings.finalsRole}>` : 'Pendiente de preparar'}. Todas las solicitudes muestran THE FINALS; se notifica como máximo una vez cada diez minutos. Editar o trasladar una tarjeta no notifica.`);
    }
    if (name === 'moderacion') return this.configureModeration(i);
    if (name === 'busqueda-chat') return this.chatSearch.configure(i);
  }
  async configureRoles(i) {
    const sub = i.options.getSubcommand();
    if (sub === 'listar') {
      const roles = this.store.settings(i.guildId).roles;
      return this.sendPrivate(i, roles.length ? roles.map(r => `${r.emoji ?? '⚠️ Sin emoji: usa /roles agregar'} · <@&${r.id}> · ${safe(r.label)}`).join('\n') : 'Todavía no hay roles configurados.');
    }
    if (!i.memberPermissions.has(P.ManageRoles)) throw new UserError('También necesitas Administrar roles para configurar este menú.');
    const role = i.options.getRole('rol');
    const parsed = sub === 'agregar' ? parseEmoji(i.options.getString('emoji'), i.guild) : null;
    if (sub === 'agregar') {
      assertAssignable(role, await i.guild.members.fetchMe());
      const member = await i.guild.members.fetch(i.user.id);
      if (!member.permissions.has(P.Administrator) && role.position >= member.roles.highest.position) throw new UserError('Elige un rol por debajo de tu rol más alto.');
    }
    const settings = this.store.settings(i.guildId);
    if (sub === 'agregar' && [settings.verifiedRole, ...Object.values(settings.sponsorRoles ?? {}),settings.clans?.vxtg?.role,settings.clans?.vxltm?.role].includes(role.id)) {
      throw new UserError('Verificado y los patrocinadores se asignan con el perfil. Los clanes requieren aprobación. Estos roles no se añaden al panel de reacciones.');
    }
    if (parsed && settings.roles.some(r => r.id !== role.id && r.emojiKey === parsed.emojiKey)) throw new UserError('Ese emoji ya está vinculado a otro rol. Elige otro o retira el vínculo anterior.');
    const before = settings.roles.find(r => r.id === role.id);
    if (sub === 'quitar' || before?.emojiKey !== parsed?.emojiKey) this.store.forgetReactionRole(i.guildId, role.id);
    settings.roles = settings.roles.filter(r => r.id !== role.id);
    if (sub === 'agregar') {
      if (settings.roles.length >= 20) throw new UserError('El panel admite hasta 20 roles por el límite de reacciones de Discord.');
      settings.roles.push({ id: role.id, label: i.options.getString('etiqueta') ?? role.name, ...parsed });
    } else if (settings.pingRole === role.id) settings.pingRole = null;
    this.store.saveSettings(i.guildId, settings);
    const panel = settings.panels?.roles;
    if (panel) await this.postPanel(i.guild, 'roles', await i.guild.channels.fetch(panel.channel));
    return this.sendPrivate(i, 'Panel de reacciones actualizado. Usa /panel tipo:roles para cambiar su canal. Retirar un vínculo no elimina los roles ya asignados.');
  }
  configureModeration(i) {
    const settings = this.store.settings(i.guildId);
    const sub = i.options.getSubcommand();
    const moderation = settings.moderation;
    if (sub === 'activar') {
      if (!contentIntent) throw new UserError('Activa Message Content Intent en el portal, cambia ENABLE_MESSAGE_CONTENT=true en .env y reinicia el bot.');
      if (!moderation.terms.length) throw new UserError('Primero configura /moderacion palabras.');
      moderation.enabled = true;
    }
    if (sub === 'desactivar') moderation.enabled = false;
    if (sub === 'palabras') {
      const input = i.options.getString('lista');
      moderation.terms = parseModerationTerms(input);
      if (!moderation.terms.length) moderation.enabled = false;
    }
    this.store.saveSettings(i.guildId, settings);
    return this.sendPrivate(i, `Filtro: **${moderation.enabled ? 'activo' : 'desactivado'}**. Lectura de texto: **${contentIntent ? 'habilitada' : 'deshabilitada'}**.\n`
      + `Palabras: ${moderation.terms.length ? moderation.terms.map(safe).join(', ') : 'ninguna'}.\n`
      + 'El bot borra mensajes que contienen estas palabras completas; no modifica mensajes ajenos ni interpreta el contexto.');
  }
  async button(i) {
    const id = i.customId;
    if (id === 'profile:toggle') {
      const p = this.requireProfile(i);
      this.store.saveProfile(i.guildId, i.user.id, { searchable: !p.searchable });
      return this.workflows.profile(i, p.searchable ? 'Búsquedas pausadas. Conservas THE FINALS.' : 'Búsquedas activadas.');
    }
    if (id === 'profile:delete') {
      this.requireProfile(i);
      return this.sendPrivate(i, '¿Eliminar tu perfil? Saldrás de los equipos y se cerrarán tus búsquedas. Se retirarán tus roles de patrocinador y Verificado. Tu acceso al servidor seguirá dependiendo de sus permisos normales.', {
        components: [new ActionRowBuilder().addComponents(button(`profile:confirm-delete:${i.user.id}`, 'Eliminar definitivamente', ButtonStyle.Danger))],
      });
    }
    if (id.startsWith('profile:confirm-delete:')) {
      if (id.split(':')[2] !== i.user.id) throw new UserError('Solo puedes eliminar tu perfil.');
      const p = this.requireProfile(i);
      await i.deferReply({ flags: privateFlags });
      this.tracker.forget(p.embarkId);
      const affected = this.store.deleteProfile(i.guildId, i.user.id);
      await this.voiceRooms.reconcile(i.guild);
      this.store.queueRole(i.guildId, i.user.id);
      for (const [key, d] of this.workflows.drafts.items) if (d.guild === i.guildId && d.user === i.user.id) this.workflows.drafts.remove(key);
      for (const search of affected) await this.refreshSearch(search).catch(e => this.log(e, 'Eliminar perfil del grupo'));
      await this.refreshLeaderboard(i.guildId);
      if (i.guild) await processRoleJobs(this, i.guild);
      const pending = this.store.roleJobs(i.guildId, Number.MAX_SAFE_INTEGER).some(j => j.user === i.user.id);
      return this.sendPrivate(i, pending ? 'Perfil eliminado. Retirar tus roles está pendiente; se reintentará automáticamente.' : 'Perfil y patrocinador retirados. Tu acceso al servidor y las búsquedas HOT siguen disponibles. Puedes volver a registrar tu perfil cuando quieras.');
    }
    if (id === 'profile:sync') return this.syncProfile(i);
    if (!id.startsWith('search:')) return;
    const [, action, searchId] = id.split(':');
    let s = this.store.search(searchId);
    if (!s || s.guild !== i.guildId) throw new UserError('No se encontró esta búsqueda.');
    await this.ackCard(i);
    s = this.store.search(searchId);
    if (!s || s.guild !== i.guildId) throw new UserError('No se encontró esta búsqueda.');
    const active = s.status === 'open' && s.expires > Date.now();
    if (action === 'controls') {
      if (!s.members.includes(i.user.id)) throw new UserError('Solo los integrantes pueden abrir los controles de este equipo.');
      return this.replyCard(i, teamPrivatePayload(s, i.user.id));
    }
    if (action === 'voice') return this.voiceRooms.access(i, s.id);
    if (action === 'join') {
      if (s.members.includes(i.user.id)) return this.replyCard(i, teamPrivatePayload(s, i.user.id));
      if (!active) throw new UserError('La búsqueda ya terminó.');
      this.store.join(s.id, i.user.id);
      await this.refreshSearch(s.id);
      s = this.store.search(s.id);
      if (!s.members.includes(i.user.id)) throw new UserError('Ya no perteneces a este equipo.');
      return this.replyCard(i, teamPrivatePayload(s, i.user.id, 'Te uniste al equipo.'));
    }
    if (action === 'leave') {
      if (!active) throw new UserError('La búsqueda ya terminó.');
      this.store.leave(s.id, i.user.id);
      await this.voiceRooms.reconcile(i.guild);
      await this.refreshSearch(s.id);
      return this.sendPrivate(i, 'Saliste del equipo.');
    }
    if (action === 'close') {
      if (!active) throw new UserError('La búsqueda ya terminó.');
      if (s.host !== i.user.id) throw new UserError('Solo el organizador puede cerrar esta búsqueda.');
      s.status = 'closed';
      this.store.updateSearch(s);
      await this.refreshSearch(s.id);
      return this.replyCard(i, teamPrivatePayload(this.store.search(s.id), i.user.id, 'Búsqueda cerrada.'));
    }
    if (action === 'team') {
      if (!s.members.includes(i.user.id)) throw new UserError('Solo los integrantes pueden ver los Embark ID de este equipo.');
      const body = s.members.map(user => {
        const p = this.store.profile(i.guildId, user);
        return p ? `<@${user}> · **${safe(p.embarkId)}**\n${safe(p.playerClass)} · ${skillLabels(p.specializationIds).map(safe).join(', ') || 'Especializaciones pendientes'}` : `<@${user}> · Sin perfil`;
      }).join('\n\n');
      const payload = teamPrivatePayload(s, i.user.id);
      payload.components[0].addTextDisplayComponents({ type: 10, content: body || 'Sin integrantes' });
      return this.replyCard(i, payload);
    }
    if (action === 'candidates') {
      if (!active) throw new UserError('La búsqueda ya terminó.');
      if (s.host !== i.user.id) throw new UserError('Solo el organizador puede ver las sugerencias de esta búsqueda.');
      const candidates = this.store.profiles(i.guildId).filter(p => !s.members.includes(p.user) && compatible(p, s.filters)).slice(0, 10);
      const body = candidates.length ? candidates.map(p => `<@${p.user}> · ${safe(p.playerClass)} · ${safe(p.rank)} · RS ${p.score ?? '?'} · ${skillLabels(p.specializationIds).map(safe).join(', ')}`).join('\n') : 'Todavía no hay perfiles compatibles.';
      const payload = teamPrivatePayload(s, i.user.id);
      payload.components[0].addTextDisplayComponents({ type: 10, content: body });
      return this.replyCard(i, payload);
    }
    throw new UserError('Acción de equipo no válida.');
  }
  async syncProfile(i) {
    if (!config.trackerEnabled) throw new UserError('La consulta de clasificación está desactivada en este servidor.');
    this.workflows.assertProfileSaved(i.guildId,i.user.id);
    const before = this.requireProfile(i);
    await this.ackCard(i);
    const standing = await this.tracker.lookup(before.embarkId);
    const current = this.store.profile(i.guildId, i.user.id);
    if (!current || current.embarkId !== before.embarkId || current.updatedAt !== before.updatedAt) throw new UserError('El perfil cambió durante la consulta. Vuelve a intentar desde el perfil actualizado.');
    if (!standing) return this.sendPrivate(i, 'No encontré puntos RS actuales publicados para ese Embark ID. Puede estar fuera del top 10 000 o haber cambiado de nombre. Tus datos registrados se conservaron.');
    const p = this.store.saveProfile(i.guildId, i.user.id, { ...standing, rankSource: 'finalstracker', rankUpdatedAt: Date.now() });
    await this.refreshMemberTeams(i.guildId, i.user.id);
    return this.replyCard(i, await withImage(profilePrivatePayload(p, 'Clasificación actualizada desde FINALSTRACKER. Fuente comunitaria no oficial.'), this.renderer, 'profile', await this.visualProfile(p)));
  }
  async modal(i) {
    if (['profile:save', 'search:save'].includes(i.customId)) throw new UserError('Este formulario es antiguo. Usa el panel actualizado.');
    if (i.customId.startsWith('publish:')) {
      requireTournamentAdmin(i);
      const [, type, channelId] = i.customId.split(':');
      if (type !== 'anuncio') throw new UserError('Ese formulario es anterior al nuevo editor. Vuelve a abrir /reglas.');
      await i.deferReply({ flags: privateFlags });
      const channel = await this.channel(i.guild, channelId);
      const title = i.fields.getTextInputValue('title');
      const body = i.fields.getTextInputValue('body');
      const message = await channel.send(nativePayload(await resolveEmbedEmojis({ title: `📣 ${title}`, description: body, color: '#ed243b' }, i.guild)));
      return this.sendPrivate(i, `Publicado: ${message.url}`);
    }
  }
  async publishSearch(i, filters) {
    const profile = this.requireProfile(i);
    if (!profile.searchable || profile.needsCompletion) throw new UserError('Completa y activa tu perfil antes de crear búsquedas.');
    const settings = this.store.settings(i.guildId);
    if (!settings.teamsChannel || !settings.finalsRole) throw new UserError('El bot todavía debe preparar #equipos y THE FINALS. Revisa sus permisos.');
    const channel = await this.channel(i.guild, settings.teamsChannel);
    const s = await this.publishTeam(i.guildId, i.user.id, channel, filters);
    // Un fallo de la respuesta privada no debe borrar una solicitud ya publicada.
    return this.replyCard(i, teamPrivatePayload(s, i.user.id, 'Búsqueda publicada en #equipos.'));
  }
  async publishTeam(guildId, host, channel, filters, { beforeSend, reply } = {}) {
    const hot = filters.mode === 'HOT';
    // La reserva es síncrona y compartida por chat y asistente: cuenta también mientras se renderiza.
    const s = this.store.createSearch(guildId, host, channel.id, filters,
      config.searchLifetimeMinutes * 60000, config.searchCooldownSeconds * 1000);
    try {
      await this.queue(`publish:${guildId}`, async () => {
        s.status = 'open';
        // Renderizar antes de reservar la notificación. Editar nunca reserva ni notifica.
        const payload = await this.searchCard(s, false);
        const latest = this.store.search(s.id), current = this.store.profile(guildId, host);
        if (latest?.status !== 'pending' || latest.expires <= Date.now() || (!hot && (!current?.searchable || current.needsCompletion))) throw new UserError('El perfil o la búsqueda cambió antes de publicar. Abre una búsqueda nueva.');
        if (beforeSend && !beforeSend()) return;
        const notify = !hot && this.store.reservePing(guildId);
        if (notify) payload.allowedMentions = { ...noMentions, roles: [this.store.settings(guildId).finalsRole] };
        const message = await deliverCard(p => channel.send({ ...p, ...(reply ? { reply } : {}), nonce: `team:${s.id.slice(0, 20)}`, enforceNonce: true }), payload);
        // El perfil puede eliminarse mientras Discord confirma el mensaje. Conservar el cierre y los integrantes actuales.
        const confirmed = this.store.search(s.id);
        if (!confirmed) throw new UserError('La búsqueda fue retirada durante la publicación.');
        confirmed.message = message.id;
        if (confirmed.status === 'pending') confirmed.status = 'open';
        Object.assign(s, confirmed); this.store.updateSearch(s);
        if (s.status !== 'open' || JSON.stringify(s.members) !== JSON.stringify(latest.members)) await this.refreshSearch(s.id);
      });
    } catch (error) {
      if (!s.message) this.store.removeSearch(s.id);
      throw error;
    }
    if (!s.message) { this.store.removeSearch(s.id); return null; }
    return s;
  }
  refreshSearch(id) {
    return this.queue(`search:${id}`, async () => {
      let s = this.store.search(id);
      if (!s?.message || !this.guilds.has(s.guild)) return;
      const guild = await this.client.guilds.fetch(s.guild);
      const channel = await guild.channels.fetch(s.channel);
      if (!channel?.isTextBased()) { s.status = 'closed'; this.store.updateSearch(s); return; }
      s = this.store.search(id);
      if (!s) return;
      try { await deliverCard(p => channel.messages.edit(s.message, p), await this.searchCard(s, false)); }
      catch (error) {
        if ([10008, 10003].includes(error.code)) { s.status = 'closed'; this.store.updateSearch(s); return; }
        throw error;
      }
    });
  }
  async expire() {
    for (const id of this.store.expire()) await this.refreshSearch(id).catch(e => this.log(e, 'Actualizar búsqueda caducada'));
    this.workflows.drafts.expire();
    for (const id of [...this.refreshPending]) {
      try { await this.refreshSearch(id); this.refreshPending.delete(id); } catch { /* Reintentar en el siguiente ciclo. */ }
    }
    if (this.playerCards) await this.playerCards.collect([...this.store.imageKeys(), ...[...this.workflows.drafts.items.values()].map(d => d.data.cardImage?.key).filter(Boolean)]);
    for (const id of this.guilds) {
      const guild = await this.client.guilds.fetch(id);
      if (this.setupPending.has(id)) {
        // Permitir completar la instalación al conceder permisos, sin reiniciar ni duplicar mensajes.
        try {
          await guild.channels.fetch();
          await ensureFinalsRole(this, guild);
          const teams = await ensureTeamsChannel(this, guild);
          for (const [type, name] of [['registro', config.registrationChannelName], ['buscar', config.searchChannelName]]) {
            const saved = this.store.settings(id).panels?.[type];
            const channel = saved ? await guild.channels.fetch(saved.channel) : guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === name);
            if (channel) await this.postPanel(guild, type, channel);
            else throw new UserError(`Falta #${name}. Crea el canal o usa /panel.`);
          }
          await relocateSearches(this, guild, teams);
          this.setupPending.delete(id);
          console.log('Instalación del rediseño completada; paneles fijados y canal #equipos listo.');
        } catch { /* La primera comprobación de inicio ya indica qué permiso falta. */ }
      }
      await processRoleJobs(this, guild);
      if (this.chatSearch.pending.has(id)) {
        await this.chatSearch.setup(guild).then(async () => {
          const panel = this.store.settings(id).panels?.roles;
          if (panel) await this.community.postPanel(guild, 'roles', await guild.channels.fetch(panel.channel));
        }).catch(e => this.log(e, 'Búsqueda por chat pendiente'));
      }
      await this.community.tick(guild).catch(e => this.log(e, 'Módulo de comunidad; se reintentará'));
      await this.memberGuide.tick(guild).catch(e => this.log(e, 'Guía de comandos pendiente; se reintentará'));
      await this.mailboxes.tick(guild).catch(e => this.log(e, 'Buzones pendientes; se reintentará'));
      await this.clans.tick(guild).catch(e => this.log(e, 'Clanes pendientes; se reintentará'));
      await this.tournaments.tick(guild).catch(e => this.log(e, 'Módulo de torneos; se reintentará'));
      if (this.accessGate.pending.has(id)) await this.accessGate.setup(guild).catch(e => this.log(e, 'Acceso libre o roles de perfil pendientes'));
      await this.leaderboard.refresh(guild, { setup: this.leaderboard.pending.has(id) }).catch(error => {
        this.leaderboard.pending.add(id); this.log(error, 'Actualizar leaderboard pendiente');
      });
    }
  }
  async handleMessage(message) {
    try {
      if (await this.moderate(message)) return;
      await this.chatSearch.handle(message);
    } catch (error) { this.log(error, 'Ayuda de búsqueda por chat'); }
  }
  async moderate(message) {
    if (!contentIntent || !message.guildId || !this.guilds.has(message.guildId) || message.author.bot || message.webhookId) return;
    const moderation = this.store.settings(message.guildId).moderation;
    if (!moderation.enabled || !blockedTerm(message.content, moderation.terms)) return;
    try {
      if (!message.deletable) { console.error('Moderación: falta Administrar mensajes en el canal.'); return true; }
      await message.delete();
      console.log(`Moderación: retirado mensaje ${message.id} del canal ${message.channelId}.`);
      const notice = await message.channel.send({ content: `<@${message.author.id}>, retiré tu mensaje por una palabra o frase configurada por el servidor.`,
        allowedMentions: { ...noMentions, users: [message.author.id] } });
      const timeout = setTimeout(() => notice.delete().catch(() => {}), 8000);
      timeout.unref();
    } catch (error) { this.log(error, 'Moderación'); }
    return true;
  }
}
