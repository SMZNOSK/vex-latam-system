import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { FeedbackQuota, feedbackDay } from '../src/feedback-quota.js';

test('tres envíos por usuario y servidor; abrir no consume y liberar un fallo devuelve su cupo una vez', async () => {
  const store = new Store(':memory:'); await store.migrate();
  try {
    const quota = new FeedbackQuota(store);
    for (let i = 0; i < 10; i++) quota.assert('g', 'private-user');
    assert.equal(quota.status('g', 'private-user').remaining, 3);
    const first = quota.reserve('g', 'private-user');
    quota.reserve('g', 'private-user'); quota.reserve('g', 'private-user');
    assert.throws(() => quota.reserve('g', 'private-user'), /3 feedbacks/);
    assert.equal(quota.status('other', 'private-user').remaining, 3); assert.equal(quota.status('g', 'someone-else').remaining, 3);
    quota.release(first); quota.release(first); assert.equal(quota.status('g', 'private-user').remaining, 1);
    quota.reserve('g', 'private-user'); assert.equal(quota.status('g', 'private-user').remaining, 0);
    const state = JSON.stringify(store.settings('g'));
    assert.ok(!state.includes('private-user')); assert.ok(!state.includes('someone-else'));
    assert.ok(Object.keys(store.settings('g').mailboxes.feedbackQuota.counts).every(tag => /^[a-f0-9]{64}$/.test(tag)));
    assert.equal(new FeedbackQuota(store).status('g', 'private-user').remaining, 0);
  } finally { store.close(); }
});

test('el día cambia a medianoche CDMX; cambia el seudónimo y una reserva anterior no altera el día nuevo', async () => {
  const store = new Store(':memory:'); await store.migrate();
  let now = Date.parse('2026-10-20T05:59:59Z');
  try {
    const quota = new FeedbackQuota(store, { clock: () => now });
    assert.equal(feedbackDay(now), '2026-10-19');
    const yesterday = quota.reserve('g', 'user'); quota.reserve('g', 'user'); quota.reserve('g', 'user');
    assert.equal(quota.status('g', 'user').remaining, 0);
    now = Date.parse('2026-10-20T06:00:00Z'); assert.equal(feedbackDay(now), '2026-10-20');
    assert.equal(quota.status('g', 'user').remaining, 3);
    const today = quota.reserve('g', 'user'); assert.notEqual(today.tag, yesterday.tag);
    quota.release(yesterday); assert.equal(quota.status('g', 'user').remaining, 2);
    assert.equal(Object.keys(store.settings('g').mailboxes.feedbackQuota.counts).length, 1);
  } finally { store.close(); }
});

test('SQLite conserva la cuota al reiniciar y la clave se guarda separada sin nombres ni contenido', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vex-feedback-quota-')), file = path.join(dir, 'bot.sqlite');
  let store = new Store(file);
  try {
    await store.migrate(); const quota = new FeedbackQuota(store);
    for (let i = 0; i < 3; i++) quota.reserve('g', 'anonymous-discord-id');
    const tag = quota.status('g', 'anonymous-discord-id').tag;
    assert.equal(readFileSync(path.join(dir, 'feedback-quota.key')).length, 32);
    store.close(); store = new Store(file);
    const after = new FeedbackQuota(store); assert.equal(after.status('g', 'anonymous-discord-id').remaining, 0);
    assert.equal(after.status('g', 'anonymous-discord-id').tag, tag);
    assert.ok(!JSON.stringify(store.settings('g')).includes('anonymous-discord-id'));
    assert.deepEqual(Object.keys(store.settings('g').mailboxes.feedbackQuota).sort(), ['counts', 'day']);
  } finally { store.close(); assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep)); rmSync(dir, { recursive: true }); }
});
