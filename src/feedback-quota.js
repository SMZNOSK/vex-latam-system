import { createHmac, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { UserError } from './domain.js';

export const FEEDBACK_DAILY_LIMIT = 3;
export const FEEDBACK_TIME_ZONE = 'America/Mexico_City';
const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: FEEDBACK_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
export const feedbackDay = now => dateFormat.format(now);

// La cuota no conserva IDs, nombres, texto ni referencias a los envíos.
// El HMAC cambia por día y servidor; su clave permanece fuera de SQLite.
export class FeedbackQuota {
  constructor(store, { secret, clock = Date.now } = {}) { this.store = store; this.secret = secret; this.clock = clock; }
  key() {
    if (this.secret) return this.secret;
    if (this.store.feedbackQuotaSecret) return this.secret = this.store.feedbackQuotaSecret;
    let value;
    if (this.store.filename === ':memory:') value = randomBytes(32);
    else {
      const file = path.join(path.dirname(path.resolve(this.store.filename)), 'feedback-quota.key');
      mkdirSync(path.dirname(file), { recursive: true });
      try { writeFileSync(file, randomBytes(32), { flag: 'wx', mode: 0o600 }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      value = readFileSync(file);
      if (value.length !== 32) throw new UserError('El contador de feedback está pendiente de reparar. Contacta con un administrador.');
    }
    this.store.feedbackQuotaSecret = value;
    return this.secret = value;
  }
  status(guild, user, day = feedbackDay(this.clock())) {
    const tag = createHmac('sha256', this.key()).update(JSON.stringify([guild, day, user])).digest('hex');
    const quota = this.store.settings(guild).mailboxes?.feedbackQuota;
    const used = quota?.day === day ? quota.counts?.[tag] ?? 0 : 0;
    return { guild, day, tag, used, remaining: Math.max(0, FEEDBACK_DAILY_LIMIT - used) };
  }
  assert(guild, user) {
    const status = this.status(guild, user);
    if (!status.remaining) throw new UserError(`Ya alcanzaste tus ${FEEDBACK_DAILY_LIMIT} feedbacks de hoy. Podrás enviar más a partir de las 00:00, hora de CDMX.`);
    return status;
  }
  reserve(guild, user) {
    const slot = this.assert(guild, user), settings = this.store.settings(guild);
    settings.mailboxes ??= {};
    if (settings.mailboxes.feedbackQuota?.day !== slot.day) settings.mailboxes.feedbackQuota = { day: slot.day, counts: {} };
    settings.mailboxes.feedbackQuota.counts[slot.tag] = slot.used + 1;
    this.store.saveSettings(guild, settings);
    return { ...slot, remaining: slot.remaining - 1, released: false };
  }
  release(slot) {
    if (slot.released) return;
    slot.released = true;
    const settings = this.store.settings(slot.guild), quota = settings.mailboxes?.feedbackQuota;
    if (quota?.day !== slot.day) return;
    const count = (quota.counts[slot.tag] ?? 0) - 1;
    if (count > 0) quota.counts[slot.tag] = count;
    else delete quota.counts[slot.tag];
    this.store.saveSettings(slot.guild, settings);
  }
}
