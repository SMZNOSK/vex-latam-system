import { createHash } from 'node:crypto';
import { deliverCard, noMentions } from './ui.js';

// Every copy uses the same search ID; membership and capacity live in SQLite once.
export class SearchMirrors {
  constructor(bot) { this.bot = bot; }
  async sync(id, payload) {
    return this.bot.queue(`search-mirrors:${id}`, async () => {
      let search = this.bot.store.search(id);
      if (!search || search.filters.mode === 'HOT') return;
      const configured = this.bot.store.settings(search.guild).searchPublicationChannels ?? [];
      const targets = [...new Set([...configured, ...(search.mirrors ?? []).map(r => r.channel)])].filter(channel => channel !== search.channel);
      if (!targets.length) return;
      payload ??= await this.bot.searchCard(search, false);
      const body = { ...payload, allowedMentions: noMentions };
      const guild = await this.bot.client.guilds.fetch(search.guild);
      let failed = false;
      for (const channelId of targets) {
        try {
          const channel = await this.bot.channel(guild, channelId);
          search = this.bot.store.search(id);
          if (!search) return;
          let ref = search.mirrors?.find(r => r.channel === channelId);
          if (ref) {
            try { await deliverCard(p => channel.messages.edit(ref.message, p), body); continue; }
            catch (error) {
              if (error.code !== 10008) throw error;
              const latest = this.bot.store.search(id);
              if (!latest) return;
              latest.mirrors = (latest.mirrors ?? []).filter(r => r.channel !== channelId);
              this.bot.store.updateSearch(latest); ref = null;
            }
          }
          search = this.bot.store.search(id);
          if (!search || search.status !== 'open' || search.expires <= Date.now()) continue;
          const nonce = createHash('sha256').update(`search-mirror:${id}:${channelId}`).digest('hex').slice(0, 25);
          const message = await deliverCard(p => channel.send({ ...p, nonce, enforceNonce: true }), body);
          const latest = this.bot.store.search(id);
          if (!latest) return;
          latest.mirrors = [...(latest.mirrors ?? []).filter(r => r.channel !== channelId), { channel: channelId, message: message.id }];
          this.bot.store.updateSearch(latest);
        } catch (error) {
          failed = true;
          this.bot.log(error, `Copia de búsqueda pendiente en ${channelId}`);
        }
      }
      const latest = this.bot.store.search(id);
      if (latest) { latest.mirrorPending = failed; this.bot.store.updateSearch(latest); }
      if (failed) this.bot.refreshPending.add(id);
    });
  }
}
