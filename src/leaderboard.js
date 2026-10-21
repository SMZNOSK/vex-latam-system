import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { createHash } from 'node:crypto';
import { config } from './config.js';
import { rankFromRS, UserError } from './domain.js';
import { card, row, button, safe, withImage, deliverCard } from './ui.js';
import { lockControlChannel } from './setup.js';
import { pinIfAllowed } from './pins.js';

export function topPlayers(profiles) {
  return profiles.filter(p => Number.isInteger(p.score) && p.score >= 0 && p.score <= 999999 && typeof p.embarkId === 'string')
    .sort((a, b) => b.score - a.score || a.embarkId.localeCompare(b.embarkId, 'es', { sensitivity: 'base' })
      || String(a.user).localeCompare(String(b.user)))
    .slice(0, 10).map(p => ({ user: p.user, embarkId: p.embarkId, score: p.score,
      // A community position must never grant Ruby. Only the game standing can.
      rank: rankFromRS(p.score, p.rankSource === 'finalstracker' ? p.leaderboardPosition : null), cardImage: p.cardImage ?? null }));
}
export function leaderboardPayload(players) {
  const lines = players.map((p, n) => `${n === 0 ? '🥇' : n === 1 ? '🥈' : n === 2 ? '🥉' : `**${n + 1}.**`} **${safe(p.embarkId)}** · ${p.score.toLocaleString('es-MX')} RS · ${safe(p.rank)}`);
  return card('🏆 Top 10 · RS de la comunidad', lines.join('\n') || 'Todavía no hay jugadores con RS registrados.', [
    row(button('profile:edit', 'Editar mi perfil'), button('leaderboard:view', 'Ver top 10')),
  ], 'Se usa el RS actual guardado en cada perfil, declarado o consultado por el jugador. El récord no determina este top. No es la clasificación oficial. Los empates se ordenan por Embark ID. Pausar las búsquedas conserva tu puesto; eliminar el perfil lo retira.');
}
export class Leaderboard {
  constructor(bot) { this.bot = bot; this.pending = new Set(); }
  players(guild) { return topPlayers(this.bot.store.profiles(guild)); }
  async payload(guild, players = this.players(guild)) {
    const display = await Promise.all(players.map(p => this.bot.visualProfile(p)));
    return withImage(leaderboardPayload(players), this.bot.renderer, 'leaderboard', { players: display });
  }
  async view(i) {
    await this.bot.ackCard(i);
    return this.bot.replyCard(i, await this.payload(i.guildId));
  }
  refresh(guild, { setup = false, channel = null, force = false } = {}) {
    return this.bot.queue(`leaderboard:${guild.id}`, async () => {
      const saved = this.bot.store.settings(guild.id).leaderboard;
      if (!saved && !setup && !channel) return;
      const players = this.players(guild.id);
      const hash = createHash('sha256').update(JSON.stringify(['v1-finals-illustrated', players])).digest('hex');
      if (!force && !setup && !channel && saved?.hash === hash) return;
      let target = channel;
      if (!target && saved?.channel) {
        try { target = await guild.channels.fetch(saved.channel); }
        catch (error) { if (error.code !== 10003) throw error; }
      }
      if (!target) {
        const matches = guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.name === (config.leaderboardChannelName ?? 'leaderboard'));
        if (matches.size > 1) throw new UserError('Hay varios canales #leaderboard. Elige uno con /panel tipo:leaderboard.');
        target = matches.first();
      }
      if (!target) {
        const me = await guild.members.fetchMe();
        if (!me.permissions.has(P.ManageChannels)) throw new UserError('VEX LATAM SYSTEM necesita Administrar canales para crear #leaderboard.');
        target = await guild.channels.create({ name: config.leaderboardChannelName ?? 'leaderboard', type: ChannelType.GuildText,
          topic: 'Top 10 por RS registrados en los perfiles. Clasificación local de VEX LATAM, no oficial.',
          permissionOverwrites: [{ id: guild.id, deny: [P.SendMessages] }, { id: me.id,
            allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles, P.ReadMessageHistory, P.PinMessages] }],
          reason: 'Leaderboard solicitado para VEX LATAM SYSTEM' });
      }
      target = await this.bot.channel(guild, target.id);
      // Lock only when setting up or relocating, so updates need one edit request.
      if (setup || channel || !saved || saved.channel !== target.id) await lockControlChannel(guild, target);
      const payload = await this.payload(guild.id, players);
      let message;
      if (saved?.channel === target.id && saved.message) {
        try { message = await deliverCard(p => target.messages.edit(saved.message, p), payload); }
        catch (error) { if (error.code !== 10008) throw error; }
      }
      if (!message) message = await deliverCard(p => target.send({ ...p,
        nonce: createHash('sha256').update(`leaderboard:${guild.id}:${target.id}`).digest('hex').slice(0, 25), enforceNonce: true }), payload);
      const latest = this.bot.store.settings(guild.id);
      latest.leaderboard = { channel: target.id, message: message.id, hash };
      this.bot.store.saveSettings(guild.id, latest);
      await pinIfAllowed(message,'Top 10 de la comunidad');
      this.pending.delete(guild.id);
      return message;
    });
  }
}
