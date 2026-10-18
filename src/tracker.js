import { parseStanding, UserError } from './domain.js';

export class Tracker {
  constructor(cacheMs, fetcher = fetch) { this.cacheMs = cacheMs; this.fetcher = fetcher; this.cache = new Map(); this.pending = new Map(); }
  forget(embarkId) {
    const key = embarkId.toLowerCase();
    this.cache.delete(key);
    this.pending.delete(key);
  }
  async lookup(embarkId) {
    const key = embarkId.toLowerCase();
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.time < this.cacheMs) return cached.value;
    if (this.pending.has(key)) return this.pending.get(key);
    if (this.cache.size > 1000) this.cache.clear();
    const promise = this.fetchStanding(embarkId).then(value => {
      if (this.pending.get(key) === promise) this.cache.set(key, { time: Date.now(), value });
      return value;
    }).finally(() => { if (this.pending.get(key) === promise) this.pending.delete(key); });
    this.pending.set(key, promise);
    return promise;
  }
  async fetchStanding(embarkId) {
    const url = `https://api.finalstracker.net/v1/players/${encodeURIComponent(embarkId)}`;
    let response;
    try {
      response = await this.fetcher(url, { signal: AbortSignal.timeout(8000), redirect: 'error',
        headers: { Accept: 'application/json', 'User-Agent': 'VEX-BOT/1.0 (community matchmaking)' } });
    } catch { throw new UserError('La consulta de clasificación no está disponible. Tu perfil conserva sus datos.'); }
    if (response.status === 404) return null;
    if (response.status === 429) throw new UserError('El servicio de clasificación pidió esperar. Intenta más tarde.');
    if (!response.ok) throw new UserError('El servicio de clasificación no está disponible. Intenta más tarde.');
    let data;
    try { data = await response.json(); } catch { throw new UserError('El servicio devolvió una respuesta no válida.'); }
    return parseStanding(data, embarkId);
  }
}
