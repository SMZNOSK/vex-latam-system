import { createHash } from 'node:crypto';
import { ChannelType, PermissionFlagsBits as P, PermissionsBitField } from 'discord.js';
import { config } from './config.js';
import { Drafts } from './drafts.js';
import { UserError } from './domain.js';
import { mailboxEntry, mailboxModal, mailboxPanel } from './mailbox-ui.js';
import { privateFlags } from './ui.js';
import { FeedbackQuota } from './feedback-quota.js';
import { requireOperator, operatorIds, restrictedOperators, securePrivateChannel } from './admin-access.js';
import { pinIfAllowed } from './pins.js';
import { channelDisplayName } from './channel-names.js';

export const mailboxChannels = {
  adminCommands: 'admin-bot', feedbackInbox: 'buzon-feedback', reportInbox: 'buzon-reportes', testing: 'pruebas-bot',
  feedbackPublic: 'feedback', reportPublic: 'reportes',
};
const publicCommands = new Set(['ayuda', 'perfil', 'buscar', 'leaderboard', 'agregar']);
export const isAdministrativeCommand = name => !publicCommands.has(name);
const unknown = error => { if (error.code !== 10003) throw error; return null; };
const nonce = text => createHash('sha256').update(text).digest('hex').slice(0, 25);
const privateChannel = securePrivateChannel;

export class Mailboxes {
  constructor(bot) { this.bot = bot; this.pending = new Set(); this.drafts = new Drafts(); this.quota = new FeedbackQuota(bot.store); }
  settings(guild) { return this.bot.store.settings(guild).mailboxes ?? {}; }
  save(guild, section, key, value) {
    const settings = this.bot.store.settings(guild); settings.mailboxes ??= {};
    settings.mailboxes[section] ??= {}; settings.mailboxes[section][key] = value;
    this.bot.store.saveSettings(guild, settings);
  }
  permissions(guild, me, privateAccess) {
    return [
      { id: guild.id, type: 0, allow: privateAccess ? [] : [P.ViewChannel, P.ReadMessageHistory],
        deny: privateAccess ? [P.ViewChannel] : [P.SendMessages, P.SendMessagesInThreads, P.CreatePublicThreads, P.CreatePrivateThreads, P.AddReactions] },
      { id: me.id, type: 1, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.EmbedLinks, P.AttachFiles, P.ManageChannels,...(me.permissions.has(P.PinMessages)?[P.PinMessages]:[])], deny: [] },
      ...(privateAccess && restrictedOperators(guild) ? operatorIds(guild).filter(id => id !== me.id).map(id => ({ id, type: 1,
        allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles], deny: [] })) : []),
    ];
  }
  async ensure(guild, key, name, type, parent, permissions) {
    name = channelDisplayName(guild.id, name);
    const saved = this.settings(guild.id).channels?.[key];
    let channel = saved ? await guild.channels.fetch(saved, { force: true }).catch(unknown) : null;
    if (channel && channel.type !== type) throw new UserError(`El canal guardado para ${name} tiene un tipo incorrecto.`);
    if (channel && this.bot.store.settings(guild.id).integration?.preservedChannels?.includes(channel.id)) {
      await this.bot.community.permissions(guild, channel);
      return channel;
    }
    if (!channel) {
      const matches = guild.channels.cache.filter(c => c.name === name && c.type === type && (c.parentId ?? null) === (parent?.id ?? null));
      if (matches.size > 1) throw new UserError(`Hay más de un ${name} en la categoría prevista. Revisa los canales duplicados.`);
      channel = matches.first();
    }
    if (!channel) channel = await guild.channels.create({ name, type, ...(parent ? { parent: parent.id } : {}),
      permissionOverwrites: permissions, reason: 'Buzones privados y públicos de VEX LATAM SYSTEM' });
    this.save(guild.id, 'channels', key, channel.id);
    if (channel.name !== name || (channel.parentId ?? null) !== (parent?.id ?? null)) {
      await channel.edit({ name, parent: parent?.id ?? null, reason: 'Organización de buzones VEX LATAM' });
    }
    const actual = [...channel.permissionOverwrites.cache.values()];
    if (actual.length !== permissions.length || permissions.some(p => {
      const o = channel.permissionOverwrites.cache.get(p.id);
      return !o || o.allow.bitfield !== PermissionsBitField.resolve(p.allow) || o.deny.bitfield !== PermissionsBitField.resolve(p.deny);
    })) await channel.permissionOverwrites.set(permissions, 'Privacidad de buzones y paneles VEX LATAM');
    return channel;
  }
  async setup(guild) {
    this.pending.add(guild.id);
    return this.bot.queue(`mailboxes:setup:${guild.id}`, async () => {
      await guild.channels.fetch(); await guild.roles.fetch();
      const me = await guild.members.fetchMe();
      if (!me.permissions.has(P.ManageChannels)) throw new UserError('Los buzones necesitan Administrar canales para preparar sus permisos.');
      const hidden = this.permissions(guild, me, true), visible = this.permissions(guild, me, false);
      const admin = await this.ensure(guild, 'adminCategory', 'ADMIN PANEL', ChannelType.GuildCategory, null, hidden);
      for (const key of ['adminCommands', 'feedbackInbox', 'reportInbox', ...(guild.id === config.testGuildId ? ['testing'] : [])]) {
        await this.ensure(guild, key, mailboxChannels[key], ChannelType.GuildText, admin, hidden);
      }
      const mappedParent = this.bot.store.settings(guild.id).integration?.publicMailboxParent;
      const publicCategory = mappedParent ? await guild.channels.fetch(mappedParent) : await this.ensure(guild, 'publicCategory', 'BUZONES', ChannelType.GuildCategory, null, visible);
      for (const kind of ['feedback', 'report']) {
        const key = `${kind}Public`;
        const channel = await this.ensure(guild, key, mailboxChannels[key], ChannelType.GuildText, publicCategory, visible);
        await this.postPanel(guild, kind, channel);
      }
      this.pending.delete(guild.id);
    });
  }
  async postPanel(guild, kind, channel) {
    const me = await guild.members.fetchMe();
    if (!channel.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages])) {
      throw new UserError(`Faltan permisos para publicar y fijar el cartel de #${channel.name}.`);
    }
    const old = this.settings(guild.id).panels?.[kind];
    let message;
    if (old?.channel === channel.id) {
      try { message = await channel.messages.fetch(old.message); }
      catch (error) { if (error.code !== 10008) throw error; }
      if (message && message.author.id !== this.bot.client.user.id) throw new UserError('El cartel guardado no pertenece al bot.');
    }
    if (!message) {
      // Recuperar el cartel si Discord lo recibió antes de guardar su referencia.
      const recent = await channel.messages.fetch({ limit: 50 });
      message = recent.find(m => m.author.id === this.bot.client.user.id
        && JSON.stringify(m.components).includes(`mailbox:open:${kind}`));
    }
    const payload = mailboxPanel(kind);
    if (message) message = await message.edit(payload);
    else message = await channel.send({ ...payload, nonce: nonce(`mailbox:panel:${guild.id}:${kind}:${channel.id}`), enforceNonce: true });
    this.save(guild.id, 'panels', kind, { channel: channel.id, message: message.id });
    await pinIfAllowed(message,'Buzón de la comunidad · VEX LATAM SYSTEM');
    return message;
  }
  assertAdminCommand(i) {
    requireOperator(i);
    const channel = this.settings(i.guildId).channels?.adminCommands;
    if (!channel) throw new UserError('El canal administrativo está pendiente de preparar. Revisa los permisos del bot.');
    if (i.channelId !== channel) throw new UserError(`Usa los comandos administrativos en <#${channel}> (#admin-bot).`);
  }
  async inbox(guild, kind) {
    const ids = this.settings(guild.id).channels;
    if (!ids) throw new UserError('El buzón está pendiente de preparar. Inténtalo más tarde.');
    await guild.roles.fetch();
    const [category, channel] = await Promise.all([
      guild.channels.fetch(ids.adminCategory, { force: true }).catch(unknown),
      guild.channels.fetch(ids[`${kind}Inbox`], { force: true }).catch(unknown),
    ]);
    const me = await guild.members.fetchMe();
    if (category?.type !== ChannelType.GuildCategory || channel?.type !== ChannelType.GuildText || channel.parentId !== category.id
      || !privateChannel(category, guild, me.id) || !privateChannel(channel, guild, me.id)) {
      this.pending.add(guild.id);
      throw new UserError('El buzón está pendiente de asegurar sus permisos privados. No se envió el mensaje; vuelve a intentarlo más tarde.');
    }
    if (!channel.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks])) {
      this.pending.add(guild.id);
      throw new UserError('El bot no puede entregar mensajes al buzón privado. No se envió tu mensaje.');
    }
    return channel;
  }
  async handle(i) {
    if (!i.customId?.startsWith('mailbox:')) return false;
    const [, action, id] = i.customId.split(':');
    if (action === 'open' && i.isButton()) {
      const panel = this.settings(i.guildId).panels?.[id];
      if (!['feedback', 'report'].includes(id) || !panel || panel.channel !== i.channelId
        || panel.message !== i.message?.id || i.message.author?.id !== this.bot.client.user.id) {
        throw new UserError('Usa el cartel actualizado del canal de feedback o reportes.');
      }
      if (id === 'feedback') this.quota.assert(i.guildId, i.user.id);
      const d = this.drafts.create(id, i.guildId, i.user.id, { channel: i.channelId });
      await i.showModal(mailboxModal(d)); return true;
    }
    if (action !== 'submit' || !i.isModalSubmit()) throw new UserError('Control de buzón no válido. Abre el formulario desde su cartel.');
    const d = this.drafts.get(id, i.guildId, i.user.id);
    if (d.submitting) throw new UserError('Este formulario ya se está enviando.');
    if (d.data.channel !== i.channelId || this.settings(i.guildId).panels?.[d.kind]?.channel !== i.channelId) {
      throw new UserError('El formulario cambió de canal. Abre uno nuevo desde el cartel.');
    }
    const input = { body: i.fields.getTextInputValue('body').trim(), anonymous: false };
    if (!input.body || input.body.length > 3000) throw new UserError('Escribe un mensaje de hasta 3000 caracteres.');
    let target;
    if (d.kind === 'feedback') {
      input.subject = i.fields.getTextInputValue('subject').trim();
      input.anonymous = i.fields.getCheckbox('anonymous');
      if (!input.subject || input.subject.length > 120) throw new UserError('Escribe un asunto de hasta 120 caracteres.');
    } else {
      const users = i.fields.getSelectedUsers('target', true);
      if (users.size !== 1) throw new UserError('Selecciona un miembro del servidor para el reporte.');
      target = users.first();
      input.evidence = i.fields.getTextInputValue('evidence').trim();
      if (input.evidence) {
        let url;
        try { url = new URL(input.evidence); } catch { throw new UserError('La evidencia debe ser un enlace HTTP o HTTPS válido.'); }
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || input.evidence.length > 500) {
          throw new UserError('Usa un enlace HTTP o HTTPS de hasta 500 caracteres para la evidencia.');
        }
      }
    }
    d.submitting = true;
    try {
      // Nunca se usa deferUpdate sobre el cartel público.
      await i.deferReply({ flags: privateFlags });
      if (target) {
        const member = await i.guild.members.fetch({ user: target.id, force: true }).catch(error => {
          if (error.code !== 10007) throw error; return null;
        });
        if (!member) throw new UserError('Ese usuario ya no pertenece al servidor. Abre un nuevo reporte.');
      }
      const deliver = async () => {
        // Serializar por remitente y reservar antes de Discord impide superar la cuota con formularios simultáneos.
        const slot = d.kind === 'feedback' ? this.quota.reserve(i.guildId, i.user.id) : null;
        try {
          const channel = await this.inbox(i.guild, d.kind);
          await channel.send({ ...mailboxEntry(d.kind, input, i.user, target, d.id), nonce: nonce(`mailbox:entry:${d.id}`), enforceNonce: true });
        } catch (error) {
          if (slot) this.quota.release(slot);
          throw error;
        }
        this.drafts.remove(d.id);
        await this.bot.sendPrivate(i, d.kind === 'feedback'
          ? `Feedback entregado a los administradores.${input.anonymous ? ' Se envió sin tu nombre ni ID.' : ' Solo ellos pueden ver quién lo envió.'}\nTe quedan ${this.quota.status(i.guildId, i.user.id).remaining} feedbacks hoy. El límite se reinicia a las 00:00, hora de CDMX.`
          : 'Reporte entregado únicamente a los administradores. Tu identidad y el contenido permanecen en el buzón privado.');
      };
      if (d.kind === 'feedback') await this.bot.queue(`mailbox:feedback:${i.guildId}:${i.user.id}`, deliver);
      else await deliver();
    } finally { d.submitting = false; }
    return true;
  }
  async tick(guild) {
    this.drafts.expire();
    if (this.pending.has(guild.id)) await this.setup(guild);
  }
}
