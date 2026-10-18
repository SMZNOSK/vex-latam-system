import { randomBytes } from 'node:crypto';
import { UserError } from './domain.js';
export class Drafts {
  constructor(ttl = 20 * 60000) { this.ttl = ttl; this.items = new Map(); }
  create(kind, guild, user, data, now = Date.now()) {
    this.expire(now);
    // Un solo asistente de cada tipo por jugador; las tarjetas antiguas caducan.
    for (const [key, d] of this.items) if (d.kind === kind && d.guild === guild && d.user === user) this.items.delete(key);
    const draft = { id: randomBytes(8).toString('hex'), kind, guild, user, data, step: kind === 'profile' ? 'identity' : 'filters', expires: now + this.ttl, revision: 0 };
    this.items.set(draft.id, draft); return draft;
  }
  get(id, guild, user, now = Date.now()) {
    const d = this.items.get(id);
    if (!d || d.expires <= now) { this.items.delete(id); throw new UserError('El borrador caducó. Abre un nuevo asistente desde la tarjeta.'); }
    if (d.guild !== guild || d.user !== user) throw new UserError('Este asistente pertenece a otra persona.');
    return d;
  }
  remove(id) { this.items.delete(id); }
  expire(now = Date.now()) { for (const [id, d] of this.items) if (d.expires <= now) this.items.delete(id); }
}
