import { ChannelType } from 'discord.js';
import { UserError } from './domain.js';

const missing = error => { if (error.code === 10003) return null; throw error; };

export class TournamentLayout {
  constructor(tournaments) { this.tournaments = tournaments; this.bot = tournaments.bot; this.store = tournaments.store; }
  async ensure(guild, t, required = 0) {
    return this.bot.queue(`tournament-layout:${guild.id}`, async () => {
      await guild.channels.fetch();
      const channels = [...new Set([t.registrationChannel, t.teamsChannel, t.voiceChannel, ...this.store.teams(t.id).map(team => team.voiceChannel)].filter(Boolean))];
      const saved = t.categoryChannels ?? (t.categoryChannel ? [t.categoryChannel] : []);
      const pages = Math.max(saved.length, Math.ceil(Math.max(required, channels.length, 1) / 50));
      const categories = [];
      for (let page = 0; page < pages; page++) {
        let category = saved[page] ? await guild.channels.fetch(saved[page]).catch(missing) : null;
        if (category && category.type !== ChannelType.GuildCategory) throw new UserError('La categoría guardada del torneo apunta a otro tipo de canal.');
        const suffix = ` · ${page + 1} · ${t.id}`;
        if (!category) {
          const matches = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory
            && /^(🏆 TORNEO|🏁 FINALIZADO) · /u.test(c.name) && c.name.endsWith(suffix));
          if (matches.size > 1) throw new UserError('Hay varias categorías para este torneo. Revisa las categorías antes de continuar.');
          category = matches.first();
        }
        const name = `${t.status === 'finished' ? '🏁 FINALIZADO' : '🏆 TORNEO'} · ${t.name.slice(0, 56)}${suffix}`;
        if (!category) category = await guild.channels.create({ name, type: ChannelType.GuildCategory,
          permissionOverwrites: this.tournaments.textPermissions(guild), reason: `Agrupar canales del torneo ${t.id}` });
        else if (category.name !== name) await category.setName(name, `Estado del torneo ${t.id}`);
        categories.push(category);
        t.categoryChannels = [...categories.map(c => c.id), ...saved.slice(page + 1)];
        t.categoryChannel = categories[0].id; this.store.save(t);
      }
      const sharedSettings = this.bot.store.settings(guild.id);
      const shared = new Set([sharedSettings.tournamentsChannel, sharedSettings.teamsChannel, t.announcementChannel].filter(Boolean));
      for (const [index, id] of channels.entries()) {
        const channel = await guild.channels.fetch(id).catch(missing);
        if (!channel) continue;
        if (shared.has(id) || ![ChannelType.GuildText, ChannelType.GuildVoice].includes(channel.type)) throw new UserError('Un canal del torneo apunta a un canal compartido o de otro tipo. Revisa sus referencias.');
        // Mantener las restricciones de las salas de voz y los permisos particulares de cada canal.
        const category = categories[Math.floor(index / 50)];
        if (channel.parentId !== category.id) await channel.setParent(category, { lockPermissions: false, reason: `Agrupar canales del torneo ${t.id}` });
      }
      await this.order(guild);
      return categories[0];
    });
  }
  async voiceParent(guild, t) {
    const categories = t.categoryChannels ?? [t.categoryChannel];
    for (const id of categories) if (id && guild.channels.cache.filter(c => c.parentId === id).size < 50) return id;
    await this.ensure(guild, t, categories.length * 50 + 1);
    return t.categoryChannels.at(-1);
  }
  async order(guild) {
    const events = this.store.list(guild.id);
    const ids = t => t.categoryChannels ?? [t.categoryChannel];
    const finished = new Set(events.filter(t => t.status === 'finished').flatMap(ids).filter(Boolean));
    const active = new Set(events.filter(t => t.status !== 'finished').flatMap(ids).filter(Boolean));
    const categories = [...guild.channels.cache.values()].filter(c => c.type === ChannelType.GuildCategory)
      .sort((a, b) => a.rawPosition - b.rawPosition || (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    const desired = [...categories.filter(c => !active.has(c.id) && !finished.has(c.id)),
      ...categories.filter(c => active.has(c.id)), ...categories.filter(c => finished.has(c.id))];
    if (categories.some((c, index) => c.id !== desired[index].id)) {
      await guild.channels.setPositions(desired.map((channel, position) => ({ channel, position })));
    }
  }
  async removeEmpty(guild, t) {
    if (!t.categoryChannel && !t.categoryChannels?.length) return;
    await guild.channels.fetch();
    const remaining = [];
    for (const id of t.categoryChannels ?? [t.categoryChannel]) {
      const category = await guild.channels.fetch(id).catch(missing);
      if (category && category.type !== ChannelType.GuildCategory) throw new UserError('La referencia de categoría del torneo no es una categoría.');
      if (category && guild.channels.cache.some(c => c.parentId === category.id)) { remaining.push(id); continue; }
      if (category) await category.delete('Torneo terminado: categoría vacía tras los 7 días de conservación');
    }
    if (remaining.length) { t.categoryChannels = remaining; t.categoryChannel = remaining[0]; }
    else { delete t.categoryChannel; delete t.categoryChannels; }
    this.store.save(t);
  }
}
