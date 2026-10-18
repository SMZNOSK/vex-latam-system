import { createHash } from 'node:crypto';
import { ChannelType, MessageFlags, PermissionFlagsBits as P, ButtonStyle } from 'discord.js';
import { Drafts } from './drafts.js';
import { UserError } from './domain.js';
import { assertAssignable } from './roles.js';
import { ReactionRoles, parseEmoji } from './reaction-roles.js';
import { defaultRules, defaultWelcome, defaultRoleEmbed, embedModal, modalEmbed, nativePayload, rolesPayload, rulesPayload, welcomePayload } from './community-ui.js';
import { card, noMentions, privateFlags, row, button, safe } from './ui.js';

const names = { welcome: 'bienvenidos', reglas: 'reglas', roles: 'seleccion-de-roles' };
const clone = value => structuredClone(value);
const nonce = key => createHash('sha256').update(key).digest('hex').slice(0, 25);
const link = (guild, ref) => `https://discord.com/channels/${guild}/${ref.channel}/${ref.message}`;

export class Community {
  constructor(bot) {
    this.bot = bot; this.drafts = new Drafts(); this.pending = new Set(); this.reactions = new ReactionRoles(bot);
  }
  async ensureChannel(guild, type) {
    const settings = this.bot.store.settings(guild.id);
    const saved = type === 'welcome' ? settings.community?.welcomeChannel : settings.panels?.[type]?.channel;
    let channel = saved ? await guild.channels.fetch(saved).catch(error => { if (error.code !== 10003) throw error; return null; }) : null;
    if (!channel) {
      const matches = guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.name === names[type]);
      if (matches.size > 1) throw new UserError(`Hay varios canales #${names[type]}. Elige uno con /panel o /bienvenida editar.`);
      channel = matches.first();
    }
    if (!channel) channel = await guild.channels.create({ name: names[type], type: ChannelType.GuildText,
      topic: type === 'welcome' ? 'Bienvenidas e indicaciones para nuevos miembros de VEX LATAM.'
        : type === 'roles' ? 'Reacciona a los juegos que juegas para recibir sus roles.' : 'Reglas de la comunidad VEX LATAM.',
      reason: 'Instalación de VEX LATAM SYSTEM' });
    await this.permissions(guild, channel, type === 'roles');
    if (type === 'welcome') {
      const latest = this.bot.store.settings(guild.id); latest.community ??= {};
      latest.community.welcomeChannel = channel.id; this.bot.store.saveSettings(guild.id, latest);
    }
    return channel;
  }
  async permissions(guild, channel, reactions = false) {
    const me = await guild.members.fetchMe();
    if (!channel.permissionsFor(me)?.has(P.ManageChannels)) throw new UserError(`Falta Administrar canales en #${channel.name}.`);
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
      ReadMessageHistory: true, AddReactions: true, PinMessages: true }, { reason: 'Publicaciones de VEX LATAM SYSTEM' });
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
    settings.community.rules ??= settings.rulesRaw
      ? { ...clone(defaultRules), title: settings.rulesTitle || '📜 Reglas de la comunidad', description: settings.rulesRaw, fields: [] }
      : clone(defaultRules);
    this.bot.store.saveSettings(guild.id, settings);
    await this.ensureChannel(guild, 'welcome');
    for (const type of ['reglas', 'roles']) {
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
      let role = name === 'THE FINALS' ? await guild.roles.fetch(settings.finalsRole) : guild.roles.cache.find(r => r.name === name && !r.managed);
      if (!role) role = await guild.roles.create({ name, permissions: [], reason: 'Roles de juegos de VEX LATAM SYSTEM' });
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
      if (!message.pinned) await message.pin(`Panel ${type} · VEX LATAM SYSTEM`);
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
      const message = await channel.send({ ...welcomePayload(member, settings), nonce: nonce(`welcome:${member.guild.id}:${member.id}:${joined}`), enforceNonce: true });
      this.bot.store.saveWelcome(member.guild.id, member.id, joined, message.id);
    });
  }
  open(i, kind, data) {
    const draft = this.drafts.create(`embed-${kind}`, i.guildId, i.user.id, { kind, ...data });
    return i.showModal(embedModal(draft));
  }
  async command(i) {
    const name = i.commandName;
    if (!['embed', 'bienvenida', 'reglas', 'roles'].includes(name)) return false;
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
    if (name === 'bienvenida') {
      if (sub === 'editar') {
        await this.open(i, 'welcome', { channel: i.options.getChannel('canal')?.id ?? settings.community?.welcomeChannel,
          embed: settings.community?.welcome ?? clone(defaultWelcome), version: settings.community?.welcomeVersion ?? 0 });
        return true;
      }
      if (sub === 'probar') {
        const payload = welcomePayload({ id: i.user.id, guild: i.guild }, settings);
        payload.allowedMentions = noMentions;
        const response = await i.reply({ ...payload, flags: privateFlags, withResponse: true });
        await this.bot.privateReplies.remember(i, response); return true;
      }
      await i.deferReply({ flags: privateFlags });
      if (['activar', 'desactivar'].includes(sub)) {
        settings.community ??= {}; settings.community.welcomeEnabled = sub === 'activar'; this.bot.store.saveSettings(i.guildId, settings);
      }
      await this.bot.sendPrivate(i, `Bienvenida: **${settings.community?.welcomeEnabled === false ? 'desactivada' : 'activada'}**.\nCanal: ${settings.community?.welcomeChannel ? `<#${settings.community.welcomeChannel}>` : 'pendiente'}.\nServer Members Intent: **${this.bot.membersIntent ? 'disponible' : 'pendiente en el Portal de Desarrolladores; actívalo y reinicia'}**.\nUsa /bienvenida editar o /bienvenida probar.`);
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
    const input = action === 'save' ? modalEmbed(i) : null;
    if (!['save', 'remove'].includes(action)) throw new UserError('Control de embeds no válido.');
    draft.submitting = true;
    await this.bot.ackCard(i);
    try {
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
          const versionKey = { welcome: 'welcomeVersion', reglas: 'rulesVersion', roles: 'rolesVersion' }[data.kind];
          if (!versionKey) throw new UserError('Borrador de publicación no válido.');
          if ((settings.community[versionKey] ?? 0) !== data.version) throw new UserError('La configuración cambió. Abre de nuevo el editor.');
          const channel = await this.bot.channel(i.guild, data.channel);
          settings.community[{ welcome: 'welcome', reglas: 'rules', roles: 'roleEmbed' }[data.kind]] = input;
          settings.community[versionKey] = data.version + 1;
          if (data.kind === 'welcome') {
            settings.community.welcomeChannel = channel.id;
            welcomePayload({ id: i.user.id, guild: i.guild }, settings);
          }
          if (data.kind === 'roles') rolesPayload(settings);
          this.bot.store.saveSettings(i.guildId, settings);
          this.pending.add(i.guildId);
          if (data.kind === 'welcome') {
            await this.permissions(i.guild, channel);
            await this.bot.sendPrivate(i, `Bienvenida guardada para <#${channel.id}>. Usa /bienvenida probar para revisarla.`);
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
