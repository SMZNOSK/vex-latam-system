import { createHash } from 'node:crypto';
import { ChannelType, MessageFlags, PermissionFlagsBits as P, ButtonStyle } from 'discord.js';
import { requireProductionChannel } from './channel-names.js';
import { Drafts } from './drafts.js';
import { UserError } from './domain.js';
import { assertAssignable } from './roles.js';
import { boundRole, assertPermanentRoleCreation } from './role-provisioning.js';
import { pinIfAllowed } from './pins.js';
import { ReactionRoles, parseEmoji } from './reaction-roles.js';
import { resolveEmbedEmojis } from './inline-emojis.js';
import { validateEmbed } from './community-ui.js';
import { defaultRules, defaultWelcome, defaultFarewell, legacyFarewell, rudeFarewell, defaultRoleEmbed, embedModal, modalEmbed, nativePayload, rolesPayload, rulesPayload, welcomePayload, farewellPayload } from './community-ui.js';
import { card, noMentions, privateFlags, row, button, safe } from './ui.js';

const names = { welcome: 'bienvenidos', farewell: 'despedidas', reglas: 'reglas', roles: 'seleccion-de-roles' };
const clone = value => structuredClone(value);
const nonce = key => createHash('sha256').update(key).digest('hex').slice(0, 25);
const link = (guild, ref) => `https://discord.com/channels/${guild}/${ref.channel}/${ref.message}`;

export class Community {
  constructor(bot) {
    this.bot = bot; this.drafts = new Drafts(); this.pending = new Set(); this.reactions = new ReactionRoles(bot);
  }
  async ensureChannel(guild, type) {
    const settings = this.bot.store.settings(guild.id);
    const lifecycle = ['welcome', 'farewell'].includes(type);
    const saved = lifecycle ? settings.community?.[`${type}Channel`] : settings.panels?.[type]?.channel;
    let channel = saved ? await guild.channels.fetch(saved).catch(error => { if (error.code !== 10003) throw error; return null; }) : null;
    requireProductionChannel(guild, channel, names[type]);
    if (!channel) {
      const matches = guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.name === names[type]);
      if (matches.size > 1) throw new UserError(`Hay varios canales #${names[type]}. Elige uno con /panel o /bienvenida editar.`);
      channel = matches.first();
    }
    if (!channel) channel = await guild.channels.create({ name: names[type], type: ChannelType.GuildText,
      topic: type === 'welcome' ? 'Bienvenidas e indicaciones para nuevos miembros de VEX LATAM.'
        : type === 'farewell' ? 'Un hasta pronto para quienes dejan la comunidad VEX LATAM.'
          : type === 'roles' ? 'Reacciona a los juegos que juegas para recibir sus roles.' : 'Reglas de la comunidad VEX LATAM.',
      reason: 'Instalación de VEX LATAM SYSTEM' });
    await this.permissions(guild, channel, type === 'roles');
    if (lifecycle) {
      const latest = this.bot.store.settings(guild.id); latest.community ??= {};
      latest.community[`${type}Channel`] = channel.id; this.bot.store.saveSettings(guild.id, latest);
    }
    return channel;
  }
  async permissions(guild, channel, reactions = false) {
    const me = await guild.members.fetchMe();
    if (!channel.permissionsFor(me)?.has(P.ManageChannels)) throw new UserError(`Falta Administrar canales en #${channel.name}.`);
    const integration=this.bot.store.settings(guild.id).integration;
    if(integration?.preservedChannels?.includes(channel.id)&&!integration.readOnlyExisting?.includes(channel.id)) {
      await channel.permissionOverwrites.edit(me.id,{ViewChannel:true,SendMessages:true,EmbedLinks:true,AttachFiles:true,ReadMessageHistory:true,AddReactions:true},{reason:'Permitir publicaciones V1 sin cambiar permisos existentes'});
      return;
    }
    // Conservar los permisos de publicación del staff; bloquear excepciones de miembros comunes.
    for (const overwrite of channel.permissionOverwrites.cache.values()) {
      if ([guild.id, me.id, me.roles.botRole?.id].includes(overwrite.id) || !overwrite.allow.has(P.SendMessages)) continue;
      const principal = overwrite.type === 0 ? guild.roles.cache.get(overwrite.id) : await guild.members.fetch(overwrite.id).catch(() => null);
      if (principal?.permissions.any([P.Administrator, P.ManageGuild, P.ManageMessages], false)) continue;
      await overwrite.edit({ SendMessages: false, SendMessagesInThreads: false, CreatePublicThreads: false, CreatePrivateThreads: false }, { reason: 'Canal de información de VEX LATAM SYSTEM' });
    }
    await channel.permissionOverwrites.edit(guild.id, { ViewChannel: true, ReadMessageHistory: true, SendMessages: false,
      SendMessagesInThreads: false, CreatePublicThreads: false, CreatePrivateThreads: false, AddReactions: reactions }, { reason: 'Información pública y roles por reacciones' });
    await channel.permissionOverwrites.edit(me.id, { ViewChannel: true, SendMessages: true, EmbedLinks: true, AttachFiles: true,
      ReadMessageHistory: true, AddReactions: channel.permissionsFor(me)?.has(P.AddReactions)?true:null, PinMessages: me.permissions.has(P.PinMessages)?true:null }, { reason: 'Publicaciones de VEX LATAM SYSTEM' });
    for (const staff of guild.roles.cache.values()) {
      if (staff.id === guild.id || staff.managed || !staff.permissions.any([P.ManageGuild, P.ManageMessages], false)) continue;
      await channel.permissionOverwrites.edit(staff.id, { ViewChannel: true, SendMessages: true }, { reason: 'El staff conserva acceso de publicación' });
    }
  }
  async setup(guild) {
    this.pending.add(guild.id);
    let settings = this.bot.store.settings(guild.id);
    settings.community ??= {};
    settings.roles ??= [];
    settings.community.welcome ??= clone(defaultWelcome);
    settings.community.roleEmbed ??= clone(defaultRoleEmbed);
    settings.community.welcomeEnabled ??= true;
    const previousFarewell = settings.community.farewell;
    if (previousFarewell && [legacyFarewell, rudeFarewell].some(previous => Object.keys(previous).every(k => JSON.stringify(previousFarewell[k]) === JSON.stringify(previous[k])))) {
      settings.community.farewell = clone(defaultFarewell);
      settings.community.farewellVersion = (settings.community.farewellVersion ?? 0) + 1;
    }
    settings.community.farewell ??= clone(defaultFarewell);
    settings.community.farewellEnabled ??= true;
    settings.community.rules ??= settings.rulesRaw
      ? { ...clone(defaultRules), title: settings.rulesTitle || '📜 Reglas de la comunidad', description: settings.rulesRaw, fields: [] }
      : clone(defaultRules);
    this.bot.store.saveSettings(guild.id, settings);
    await this.ensureChannel(guild, 'welcome');
    await this.ensureChannel(guild, 'farewell');
    for (const type of ['reglas', 'roles']) {
      if (settings.community.externalPanels?.includes(type)) continue;
      const channel = await this.ensureChannel(guild, type);
      if (type === 'roles') await this.seedGameRoles(guild);
      await this.postPanel(guild, type, channel);
    }
    await this.cleanup(guild);
    this.pending.delete(guild.id);
  }
  async seedGameRoles(guild) {
    if (this.bot.store.settings(guild.id).community.gamesSeeded) return;
    await guild.roles.fetch();
    const me = await guild.members.fetchMe();
    for (const [name, emoji] of [['THE FINALS', '🔺'], ['HELLDIVERS 2', '🪖'], ['ARC RAIDERS', '🤖']]) {
      let settings = this.bot.store.settings(guild.id);
      const key = name === 'THE FINALS' ? 'finals' : name === 'HELLDIVERS 2' ? 'game.helldivers2' : 'game.arcRaiders';
      let role = boundRole(guild, key) ?? (name === 'THE FINALS' ? (settings.finalsRole ? guild.roles.cache.get(settings.finalsRole) : null) : guild.roles.cache.find(r => r.name === name && !r.managed));
      if (!role) { assertPermanentRoleCreation(guild, name); role = await guild.roles.create({ name, permissions: [], reason: 'Roles de juegos de VEX LATAM SYSTEM' }); }
      assertAssignable(role, me);
      // Los roles anteriores se conservan sin inventarles un emoji.
      if (settings.roles.some(r => r.id === role.id)) continue;
      const parsed = parseEmoji(emoji, guild);
      if (settings.roles.some(r => r.emojiKey === parsed.emojiKey)) continue;
      settings.roles.push({ id: role.id, label: role.name, ...parsed });
      this.bot.store.saveSettings(guild.id, settings);
    }
    const latest = this.bot.store.settings(guild.id); latest.community.gamesSeeded = true;
    this.bot.store.saveSettings(guild.id, latest);
  }
  async write(guild, channel, old, payload, key, save) {
    channel = await this.bot.channel(guild, channel.id);
    if (!channel.permissionsFor(await guild.members.fetchMe())?.has(P.EmbedLinks)) throw new UserError(`Falta Insertar enlaces en #${channel.name}.`);
    let previous;
    if (old?.channel === channel.id && old.message) {
      try { previous = await channel.messages.fetch(old.message); }
      catch (error) { if (error.code !== 10008) throw error; }
      if (previous?.author && previous.author.id !== this.bot.client.user.id) throw new UserError('La publicación guardada no pertenece a este bot.');
    }
    let message;
    if (previous && !previous.flags.has(MessageFlags.IsComponentsV2)) message = await previous.edit(payload);
    else message = await channel.send({ ...payload, nonce: nonce(key), enforceNonce: true });
    save({ channel: channel.id, message: message.id });
    if (old?.message && old.message !== message.id) {
      const latest = this.bot.store.settings(guild.id); latest.community ??= {};
      latest.community.retired ??= [];
      if (!latest.community.retired.some(r => r.message === old.message)) latest.community.retired.push(old);
      this.bot.store.saveSettings(guild.id, latest);
      await this.cleanup(guild);
    }
    return message;
  }
  async cleanup(guild) {
    const retired = this.bot.store.settings(guild.id).community?.retired ?? [];
    for (const ref of retired) {
      try {
        const channel = await guild.channels.fetch(ref.channel), message = await channel.messages.fetch(ref.message);
        if (message.author.id !== this.bot.client.user.id) throw new UserError('No se retirará una publicación ajena al bot.');
        await message.delete();
      } catch (error) {
        if (![10003, 10008].includes(error.code)) { this.bot.log(error, 'Retirar panel anterior'); continue; }
      }
      const settings = this.bot.store.settings(guild.id);
      settings.community.retired = settings.community.retired.filter(r => r.message !== ref.message);
      this.bot.store.saveSettings(guild.id, settings);
    }
  }
  async postPanel(guild, type, channel) {
    return this.bot.queue(`panel:${guild.id}:${type}`, async () => {
      await this.permissions(guild, channel, type === 'roles');
      const settings = this.bot.store.settings(guild.id), old = settings.panels?.[type];
      const payload = type === 'roles' ? rolesPayload(settings) : rulesPayload(settings);
      const message = await this.write(guild, channel, old, payload, `community:${guild.id}:${type}:${channel.id}`, ref => {
        const latest = this.bot.store.settings(guild.id); latest.panels ??= {}; latest.panels[type] = ref;
        this.bot.store.saveSettings(guild.id, latest);
      });
      if (type === 'roles') await this.reactions.seed(message, this.bot.store.settings(guild.id).roles);
      await pinIfAllowed(message,`Panel ${type} · VEX LATAM SYSTEM`);
      return message;
    });
  }
  async welcome(member) {
    if (!this.bot.membersIntent || !this.bot.guilds.has(member.guild.id) || member.user.bot) return;
    const joined = member.joinedTimestamp;
    if (!Number.isInteger(joined)) return;
    await this.bot.queue(`welcome:${member.guild.id}:${member.id}:${joined}`, async () => {
      const settings = this.bot.store.settings(member.guild.id);
      if (settings.community?.welcomeEnabled === false || !settings.community?.welcomeChannel || this.bot.store.welcomed(member.guild.id, member.id, joined)) return;
      const channel = await this.bot.channel(member.guild, settings.community.welcomeChannel);
      const payload = await this.memberPayload('welcome', member, settings);
      const message = await this.deliverMember(p => channel.send({ ...p, nonce: nonce(`welcome:${member.guild.id}:${member.id}:${joined}`), enforceNonce: true }), payload, 'welcome', member, settings);
      this.bot.store.saveWelcome(member.guild.id, member.id, joined, message.id);
    });
  }
  async farewell(member) {
    if (!this.bot.membersIntent || !this.bot.guilds.has(member.guild.id) || member.user?.bot) return;
    await this.bot.queue(`farewell:${member.guild.id}:${member.id}`, async () => {
      const settings = this.bot.store.settings(member.guild.id), joined = member.joinedTimestamp;
      if (settings.community?.farewellEnabled === false || !settings.community?.farewellChannel
        || this.bot.store.farewelled(member.guild.id, member.id, joined)) return;
      const channel = await this.bot.channel(member.guild, settings.community.farewellChannel);
      const payload = await this.memberPayload('farewell', member, settings);
      const event = Number.isInteger(joined) ? joined : Math.floor(Date.now() / 60000);
      const message = await this.deliverMember(p => channel.send({ ...p, nonce: nonce(`farewell:${member.guild.id}:${member.id}:${event}`), enforceNonce: true }), payload, 'farewell', member, settings);
      this.bot.store.saveFarewell(member.guild.id, member.id, joined, message.id);
    });
  }
  async memberPayload(kind, member, settings) {
    const payload = kind === 'welcome' ? welcomePayload(member, settings) : farewellPayload(member, settings);
    if (!this.bot.memberCards) return payload;
    try {
      const buffer = await this.bot.memberCards.render(kind, member);
      const name = `vex-${kind}.png`;
      payload.embeds[0].setImage(`attachment://${name}`);
      const user = member.displayName ?? member.user?.globalName ?? member.user?.username ?? 'Jugador';
      payload.files = [{ attachment: buffer, name, description: `${kind === 'welcome' ? 'Bienvenida' : 'Despedida'} de ${user} · VEX LATAM` }];
    } catch (error) { this.bot.log(error, 'Generar tarjeta de miembro; se usará el mensaje de texto'); }
    return payload;
  }
  async deliverMember(deliver, payload, kind, member, settings) {
    try { return await deliver(payload); }
    catch (error) {
      if (!payload.files?.length || ![50013, 50035].includes(error.code)) throw error;
      this.bot.log(error, 'Adjuntar tarjeta de miembro; se usará el mensaje de texto');
      return deliver(kind === 'welcome' ? welcomePayload(member, settings) : farewellPayload(member, settings));
    }
  }
  open(i, kind, data) {
    const draft = this.drafts.create(`embed-${kind}`, i.guildId, i.user.id, { kind, ...data });
    return i.showModal(embedModal(draft));
  }
  async command(i) {
    const name = i.commandName;
    if (!['embed', 'bienvenida', 'despedida', 'reglas', 'roles'].includes(name)) return false;
    if (name === 'roles' && i.options.getSubcommand() !== 'editar') return false;
    this.bot.admin(i);
    const settings = this.bot.store.settings(i.guildId);
    if (name === 'roles') {
      await this.open(i, 'roles', { channel: settings.panels?.roles?.channel,
        embed: settings.community?.roleEmbed ?? clone(defaultRoleEmbed), version: settings.community?.rolesVersion ?? 0 });
      return true;
    }
    if (name === 'reglas') {
      await this.open(i, 'reglas', { channel: i.options.getChannel('canal').id, embed: settings.community?.rules ?? clone(defaultRules), version: settings.community?.rulesVersion ?? 0 });
      return true;
    }
    const sub = i.options.getSubcommand();
    if (name === 'embed' && sub === 'emojis') { await this.bot.inlineEmojis.list(i); return true; }
    if (['bienvenida', 'despedida'].includes(name)) {
      const kind = name === 'bienvenida' ? 'welcome' : 'farewell';
      if (sub === 'editar') {
        await this.open(i, kind, { channel: i.options.getChannel('canal')?.id ?? settings.community?.[`${kind}Channel`],
          embed: settings.community?.[kind] ?? clone(kind === 'welcome' ? defaultWelcome : defaultFarewell), version: settings.community?.[`${kind}Version`] ?? 0 });
        return true;
      }
      if (sub === 'probar') {
        await i.deferReply({ flags: privateFlags });
        const member = await i.guild.members.fetch(i.user.id);
        const payload = await this.memberPayload(kind, member, settings);
        payload.allowedMentions = noMentions;
        const response = await this.deliverMember(p => i.editReply(p), payload, kind, member, settings);
        await this.bot.privateReplies.remember(i, response); return true;
      }
      await i.deferReply({ flags: privateFlags });
      if (['activar', 'desactivar'].includes(sub)) {
        settings.community ??= {}; settings.community[`${kind}Enabled`] = sub === 'activar'; this.bot.store.saveSettings(i.guildId, settings);
      }
      await this.bot.sendPrivate(i, `${kind === 'welcome' ? 'Bienvenida' : 'Despedida'}: **${settings.community?.[`${kind}Enabled`] === false ? 'desactivada' : 'activada'}**.\nCanal: ${settings.community?.[`${kind}Channel`] ? `<#${settings.community[`${kind}Channel`]}>` : 'pendiente'}.\nServer Members Intent: **${this.bot.membersIntent ? 'disponible' : 'pendiente en el Portal de Desarrolladores; actívalo y reinicia'}**.\nUsa /${name} editar o /${name} probar.`);
      return true;
    }
    if (sub === 'listar') {
      const embeds = this.bot.store.embeds(i.guildId);
      await this.bot.sendPrivate(i, embeds.length ? embeds.map(e => `**${safe(e.name)}** · [Abrir tarjeta](${link(i.guildId, e)})`).join('\n').slice(0, 1900) : 'No hay embeds guardados. Usa /embed crear.');
      return true;
    }
    const key = i.options.getString('nombre').trim().toLowerCase();
    if (!/^[a-z0-9-]{1,40}$/.test(key)) throw new UserError('Usa un nombre de 1 a 40 letras minúsculas, números o guiones.');
    const saved = this.bot.store.embed(i.guildId, key);
    if (sub === 'crear' && saved) throw new UserError('Ese nombre ya existe. Usa /embed editar.');
    if (sub !== 'crear' && !saved) throw new UserError('No existe una tarjeta con ese nombre. Usa /embed listar.');
    if (sub === 'retirar') {
      const draft = this.drafts.create('embed-remove', i.guildId, i.user.id, { name: key, version: saved.version });
      await this.bot.replyCard(i, card('Retirar embed', `Se eliminará **${safe(key)}** y su publicación.`, [row(button(`community:remove:${draft.id}`, 'Retirar tarjeta', ButtonStyle.Danger), button('private:close', 'Cancelar'))]));
    } else await this.open(i, 'custom', { name: key, creating: sub === 'crear', channel: saved?.channel ?? i.options.getChannel('canal').id,
      embed: saved?.embed ?? { title: 'Nuevo mensaje', description: '', fields: [], color: '#ed243b', image: '' }, version: saved?.version ?? 0 });
    return true;
  }
  async handle(i) {
    if (!i.customId?.startsWith('community:')) return false;
    this.bot.admin(i);
    const [, action, id] = i.customId.split(':');
    const draft = this.drafts.get(id, i.guildId, i.user.id), data = draft.data;
    if ((action === 'remove') !== (draft.kind === 'embed-remove')) throw new UserError('Este control no corresponde al borrador. Vuelve a abrir el editor.');
    if (draft.submitting) throw new UserError('Este formulario ya se está guardando.');
    let input = action === 'save' ? modalEmbed(i) : null;
    if (!['save', 'remove'].includes(action)) throw new UserError('Control de embeds no válido.');
    draft.submitting = true;
    await this.bot.ackCard(i);
    try {
      if (input) input = validateEmbed(await resolveEmbedEmojis(input, i.guild));
      await this.bot.queue(`community-edit:${i.guildId}:${data.kind ?? 'custom'}:${data.name ?? ''}`, async () => {
        const settings = this.bot.store.settings(i.guildId); settings.community ??= {};
        if (action === 'remove') {
          const saved = this.bot.store.embed(i.guildId, data.name);
          if (!saved || saved.version !== data.version) throw new UserError('La tarjeta cambió. Vuelve a abrir /embed retirar.');
          const channel = await i.guild.channels.fetch(saved.channel).catch(e => { if (e.code !== 10003) throw e; return null; });
          if (channel) {
            try {
              const message = await channel.messages.fetch(saved.message);
              if (message.author.id !== this.bot.client.user.id) throw new UserError('La tarjeta guardada no pertenece a este bot.');
              await message.delete();
            } catch (error) { if (error.code !== 10008) throw error; }
          }
          this.bot.store.removeEmbed(i.guildId, data.name);
          await this.bot.sendPrivate(i, `Tarjeta **${safe(data.name)}** retirada.`);
        } else if (data.kind === 'custom') {
          const saved = this.bot.store.embed(i.guildId, data.name);
          if ((data.creating && saved) || (!data.creating && (!saved || saved.version !== data.version))) throw new UserError('La tarjeta cambió. Abre de nuevo el editor.');
          const channel = await this.bot.channel(i.guild, data.channel);
          const message = await this.write(i.guild, channel, saved, nativePayload(input), `custom:${i.guildId}:${draft.id}`, ref => {
            this.bot.store.saveEmbed(i.guildId, { name: data.name, ...ref, embed: input, version: data.version + 1 });
          });
          await this.bot.sendPrivate(i, `Embed **${safe(data.name)}** guardado: ${message.url}`);
        } else {
          const versionKey = { welcome: 'welcomeVersion', farewell: 'farewellVersion', reglas: 'rulesVersion', roles: 'rolesVersion' }[data.kind];
          if (!versionKey) throw new UserError('Borrador de publicación no válido.');
          if ((settings.community[versionKey] ?? 0) !== data.version) throw new UserError('La configuración cambió. Abre de nuevo el editor.');
          const channel = await this.bot.channel(i.guild, data.channel);
          settings.community[{ welcome: 'welcome', farewell: 'farewell', reglas: 'rules', roles: 'roleEmbed' }[data.kind]] = input;
          settings.community[versionKey] = data.version + 1;
          if (['welcome', 'farewell'].includes(data.kind)) {
            settings.community[`${data.kind}Channel`] = channel.id;
            (data.kind === 'welcome' ? welcomePayload : farewellPayload)({ id: i.user.id, user: i.user, guild: i.guild }, settings);
          }
          if (data.kind === 'roles') rolesPayload(settings);
          this.bot.store.saveSettings(i.guildId, settings);
          this.pending.add(i.guildId);
          if (['welcome', 'farewell'].includes(data.kind)) {
            await this.permissions(i.guild, channel);
            await this.bot.sendPrivate(i, `${data.kind === 'welcome' ? 'Bienvenida' : 'Despedida'} guardada para <#${channel.id}>. Usa /${data.kind === 'welcome' ? 'bienvenida' : 'despedida'} probar para revisarla.`);
          } else {
            const message = await this.postPanel(i.guild, data.kind, channel);
            await this.bot.sendPrivate(i, `Panel guardado: ${message.url}`);
          }
        }
        this.drafts.remove(id);
      });
    } finally { draft.submitting = false; }
    return true;
  }
  async tick(guild) {
    this.drafts.expire();
    let setupError;
    if (this.pending.has(guild.id)) {
      try { await this.setup(guild); } catch (error) { setupError = error; }
    }
    await this.cleanup(guild);
    await this.reactions.process(guild);
    if (setupError) throw setupError;
  }
}
