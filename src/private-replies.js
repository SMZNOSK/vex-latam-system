import { button, row, privateFlags } from './ui.js';

export const PRIVATE_IDLE_MS = 10 * 60000;
const TOKEN_LIFETIME_MS = 15 * 60000;
export const isPrivateMessage = i => Boolean(i.message?.flags?.has?.(privateFlags));
export const closePanelRow = () => row(button('private:close', 'Cerrar panel'));

// Los tokens de interacción viven solo en memoria. No se pueden enumerar
// respuestas efímeras antiguas usando el historial público del canal.
export class PrivateReplies {
  constructor(bot) { this.bot = bot; this.items = new Map(); }
  scope(i) { return `${i.guildId}:${i.user.id}:${i.channelId ?? i.channel?.id ?? 'unknown'}`; }
  async remember(i, response, { replace = true, ttl = PRIVATE_IDLE_MS } = {}) {
    if (typeof i.deleteReply !== 'function') return;
    let id = response?.resource?.message?.id ?? response?.id;
    if (!id && i.vexUpdate) id = i.message?.id;
    if (!id && i.fetchReply) id = (await i.fetchReply()).id;
    if (!id) return;
    const key = `${this.scope(i)}:${id}`;
    const previous = this.items.get(key);
    if (previous) clearTimeout(previous.timer);
    const now = Date.now();
    const item = { key, id, scope: this.scope(i), guild: i.guildId, user: i.user.id,
      deadline: (i.createdTimestamp ?? now) + TOKEN_LIFETIME_MS - 30000,
      remove: () => i.deleteReply(id), timer: null };
    this.items.set(key, item);
    const delay = Math.max(0, Math.min(ttl, item.deadline - now));
    this.schedule(item, delay);
    if (replace) for (const old of [...this.items.values()]) {
      if (old.scope === item.scope && old.key !== key) await this.remove(old);
    }
  }
  schedule(item, delay) {
    item.timer = setTimeout(() => this.bot.queue(`private:${item.scope}`, () => this.remove(item)).catch(e => this.bot.log(e, 'Limpiar respuesta privada')), delay);
    item.timer.unref();
  }
  async remove(item) {
    if (this.items.get(item.key) !== item) return false;
    clearTimeout(item.timer);
    if (Date.now() < item.deadline) {
      try { await item.remove(); }
      catch (error) {
        if (![10008, 10015, 50027].includes(error.code)) {
          const remaining = item.deadline - Date.now();
          if (remaining > 20000) { this.schedule(item, 20000); return false; }
          this.bot.log(error, 'Limpiar respuesta privada');
        }
      }
    }
    // No quitar un registro que otro callback ya renovó con un token nuevo.
    if (this.items.get(item.key) === item) this.items.delete(item.key);
    return true;
  }
  async clear(i) {
    let count = 0;
    for (const item of [...this.items.values()]) {
      if (item.guild !== i.guildId || item.user !== i.user.id) continue;
      await this.bot.queue(`private:${item.scope}`, async () => { if (await this.remove(item)) count++; });
    }
    return count;
  }
  async close(i) {
    if (!isPrivateMessage(i)) return false;
    await i.deferUpdate();
    i.vexUpdate = true;
    await i.deleteReply();
    for (const item of [...this.items.values()]) {
      if (item.guild === i.guildId && item.user === i.user.id && item.id === i.message.id) {
        clearTimeout(item.timer); this.items.delete(item.key);
      }
    }
    return true;
  }
  stop() { for (const item of this.items.values()) clearTimeout(item.timer); this.items.clear(); }
}
