import { ChannelType, PermissionFlagsBits as P, ButtonBuilder, ButtonStyle } from 'discord.js';
import { UserError } from './domain.js';
import { row } from './ui.js';
import { teamPrivatePayload } from './wizard-ui.js';

export const EMPTY_VOICE_GRACE = 30000;
export const NEW_VOICE_GRACE = 120000;
const active = s => s?.status === 'open' && s.expires > Date.now();

// La cola evita crear dos salas o borrar una mientras se atiende su botón.
// Solo administra canales registrados por el bot, incluidos equipos cerrados.
export class VoiceRooms {
  constructor(bot) { this.bot = bot; }
  async channel(guild, id) {
    try { return await guild.channels.fetch(id, { force: true }); }
    catch (error) { if (error.code === 10003) return null; throw error; }
  }
  overwrites(guild, me, members) {
    return [
      { id: guild.id, allow: [P.ViewChannel], deny: [P.Connect] },
      { id: me.id, allow: [P.ViewChannel, P.Connect] },
      ...members.filter(id => id !== me.id)
        .map(id => ({ id, allow: [P.ViewChannel, P.Connect, P.Speak] })),
    ];
  }
  requireMember(guild, searchId, user) {
    const s = this.bot.store.search(searchId);
    if (!s || s.guild !== guild.id || !s.members.includes(user)) throw new UserError('Solo los integrantes pueden acceder a la sala de este equipo.');
    return s;
  }
  async refreshHot(searchId) {
    if (this.bot.store.search(searchId)?.filters.mode !== 'HOT') return;
    try { await this.bot.refreshSearch(searchId); }
    catch (error) { this.bot.refreshPending.add(searchId); this.bot.log(error, 'Actualizar sala en búsqueda HOT'); }
  }
  async access(i, searchId) {
    return this.bot.queue(`voice:${i.guildId}`, async () => {
      const guild = i.guild;
      if (!guild || guild.available === false) throw new UserError('El servidor no está disponible. Inténtalo en un momento.');
      let s = this.requireMember(guild, searchId, i.user.id);
      let record = this.bot.store.voiceRoom(searchId);
      let channel = record ? await this.channel(guild, record.channel) : null;
      if (record && (!channel || channel.type !== ChannelType.GuildVoice)) {
        this.bot.store.removeVoiceRoom(searchId); record = null; channel = null;
      }
      if (!channel) {
        if (!active(s)) throw new UserError('La búsqueda terminó y su sala ya no existe.');
        if (s.host !== i.user.id) throw new UserError('El organizador debe crear primero la sala desde Mis equipos.');
        const me = await guild.members.fetchMe();
        if (!me.permissions.has([P.ManageChannels, P.ViewChannel, P.Connect, P.Speak])) {
          throw new UserError('Para crear la sala, VEX LATAM SYSTEM necesita Administrar canales, Ver canales, Conectar y Hablar.');
        }
        s = this.requireMember(guild, searchId, i.user.id);
        if (!active(s)) throw new UserError('La búsqueda terminó antes de crear la sala.');
        channel = await guild.channels.create({ name: `Equipo · ${s.filters.mode} · ${s.id.slice(0, 6)}`,
          type: ChannelType.GuildVoice, userLimit: s.filters.teammates + 1,
          permissionOverwrites: this.overwrites(guild, me, s.members), reason: 'Sala temporal solicitada por el organizador de VEX LATAM SYSTEM' });
        record = { searchId, guild: guild.id, channel: channel.id, created: Date.now(), emptySince: Date.now(),
          used: false, members: [...s.members], accessVersion: 2 };
        try { this.bot.store.saveVoiceRoom(record); }
        catch (error) { if (!channel.members.size) await channel.delete('No se pudo guardar la sala temporal'); throw error; }
      }
      await this.syncMembers(guild, channel, record);
      await this.refreshHot(searchId);
      this.requireMember(guild, searchId, i.user.id);
      const me = await guild.members.fetchMe(), member = await guild.members.fetch(i.user.id);
      this.requireMember(guild, searchId, i.user.id);
      let notice;
      if (member.voice.channelId === channel.id) notice = 'Ya estás en la sala de tu equipo.';
      else if (member.voice.channelId && channel.permissionsFor(me)?.has([P.MoveMembers, P.Connect])) {
        try { await member.voice.setChannel(channel, 'Acceso a la sala solicitado por el jugador'); notice = 'Te trasladé a la sala de tu equipo.'; }
        catch (error) {
          if (![40032, 50013].includes(error.code)) throw error;
          notice = error.code === 40032
            ? 'Ya no estás conectado a voz. Pulsa Abrir sala de voz y después Conectarse en Discord. El bot solo puede trasladarte desde otra sala de este servidor.'
            : 'Discord no permitió el traslado. Pulsa Abrir sala de voz para entrar manualmente; revisa los permisos del bot en la sala.';
        }
      } else notice = member.voice.channelId
        ? 'La sala está lista. Para trasladarte automáticamente, el bot necesita Mover miembros; puedes entrar con el botón.'
        : 'No estás conectado a voz. Discord no permite que el bot te conecte desde cero. Pulsa Abrir sala de voz y después Conectarse en Discord. Si ya estás en otra sala de este servidor, el botón Acceder a sala de voz puede trasladarte.';
      const payload = teamPrivatePayload(this.requireMember(guild, searchId, i.user.id), i.user.id, notice);
      payload.components[0].addActionRowComponents(row(new ButtonBuilder().setStyle(ButtonStyle.Link)
        .setLabel('Abrir sala de voz').setURL(`https://discord.com/channels/${guild.id}/${channel.id}`)));
      await this.bot.replyCard(i, payload);
    });
  }
  async syncMembers(guild, channel, record) {
    const version = 2;
    const members = this.bot.store.search(record.searchId)?.members ?? [];
    if (record.accessVersion === version && JSON.stringify([...members].sort()) === JSON.stringify([...record.members].sort())) return;
    const me = await guild.members.fetchMe();
    await channel.permissionOverwrites.set(this.overwrites(guild, me, members), 'Actualizar integrantes de la sala temporal');
    record.members = [...members];
    record.accessVersion = version;
    this.bot.store.saveVoiceRoom(record);
  }
  async reconcile(guild, now = Date.now()) {
    if (!guild || !this.bot.store.voiceRooms(guild.id).length || guild.available === false || this.bot.client.isReady?.() === false) return;
    return this.bot.queue(`voice:${guild.id}`, async () => {
      for (const record of this.bot.store.voiceRooms(guild.id)) {
        try {
          const channel = await this.channel(guild, record.channel);
          if (!channel || channel.type !== ChannelType.GuildVoice) {
            this.bot.store.removeVoiceRoom(record.searchId); await this.refreshHot(record.searchId); continue;
          }
          await this.syncMembers(guild, channel, record);
          if (channel.members.size) { record.used = true; record.emptySince = null; }
          else {
            record.emptySince ??= now;
            const grace = record.used ? EMPTY_VOICE_GRACE : NEW_VOICE_GRACE;
            if (now - record.emptySince >= grace) {
              if (channel.members.size) continue;
              await channel.delete('Sala temporal vacía');
              this.bot.store.removeVoiceRoom(record.searchId);
              await this.refreshHot(record.searchId);
              continue;
            }
          }
          this.bot.store.saveVoiceRoom(record);
        } catch (error) { this.bot.log(error, 'Sala temporal pendiente; se reintentará'); }
      }
    });
  }
  async sweep() {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      for (const id of this.bot.guilds) {
        if (!this.bot.store.voiceRooms(id).length) continue;
        try { await this.reconcile(await this.bot.client.guilds.fetch(id)); }
        catch (error) { this.bot.log(error, 'Revisar salas temporales'); }
      }
    } finally { this.sweeping = false; }
  }
  start() { this.timer = setInterval(() => this.sweep(), 10000); this.timer.unref(); }
  stop() { clearInterval(this.timer); }
}
