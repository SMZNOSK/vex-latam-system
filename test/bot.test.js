import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PermissionFlagsBits as P, MessageFlags } from 'discord.js';
import { Store } from '../src/store.js';
import { Tracker } from '../src/tracker.js';
import { validateProfile, validateSearch, parseRange, compatible, blockedTerm, parseStanding, UserError } from '../src/domain.js';
import { assertAssignable } from '../src/roles.js';
import { panelPayload, profileModal, searchPayload, publishModal } from '../src/ui.js';
import { commands } from '../src/commands.js';

const profile = { embarkId: 'Jugador#1234', sponsorId: 'ospuze', score: 20000, playerClass: 'Mediano', specializationIds: ['healing_beam'] };
const filters = validateSearch({ mode: 'Ranked', description: 'Con micrófono', teammates: 2, ...parseRange('10000-30000'), playerClass: 'Mediano', specializationIds: ['healing_beam'] });
const data = { player: { embarkId: 'Jugador#1234', standing: { state: 'onBoard', rankScore: 25000, league: 'Gold 1' } }, meta: { season: 's11' } };

test('registro exige ID, puntos y especializaciones; rango automático', () => {
  assert.equal(validateProfile(profile).rank, 'Oro 4');
  assert.throws(() => validateProfile({ ...profile, embarkId: 'Jugador' }), UserError);
  assert.throws(() => validateProfile({ ...profile, score: '-5' }), UserError);
  assert.throws(() => validateProfile({ ...profile, playerClass: 'Admin' }), UserError);
  assert.throws(() => validateProfile({ ...profile, score: '' }), UserError);
  assert.throws(() => validateProfile({ ...profile, specializationIds: [] }), UserError);
});

test('filtros RS, habilidad, rango bilingüe y perfiles pausados', () => {
  assert.equal(compatible({ ...profile, searchable: true }, filters), true);
  assert.equal(compatible({ ...profile, searchable: false }, filters), false);
  assert.equal(compatible({ ...profile, score: null, searchable: true }, filters), false);
  assert.equal(compatible({ ...profile, score: 50000, searchable: true }, filters), false);
  assert.equal(compatible({ ...profile, specializationIds: ['guardian_turret'], searchable: true }, filters), false);
  assert.throws(() => parseRange('30000-10000'), UserError);
  assert.throws(() => parseRange('20k'), UserError);
  assert.throws(() => validateSearch({ ...filters, teammates: 8 }), UserError);
});

test('perfiles y búsquedas sobreviven reinicios, mantienen capacidad y aislamiento por servidor', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vex-db-'));
  const file = path.join(dir, 'test.sqlite');
  let store = new Store(file);
  try {
    for (const user of ['host', 'a', 'b', 'c']) store.saveProfile('g1', user, validateProfile(profile));
    store.saveProfile('g2', 'a', { ...profile, embarkId: 'Otro#4321' });
    const s = store.createSearch('g1', 'host', 'channel', filters, 600000, 120000);
    s.status = 'open'; s.message = 'message'; store.updateSearch(s);
    store.close(); store = new Store(file);
    assert.equal(store.profile('g2', 'a').embarkId, 'Otro#4321');
    assert.equal(store.search(s.id).message, 'message');
    assert.throws(() => store.createSearch('g1', 'host', 'channel', filters, 600000, 120000), UserError);
    store.join(s.id, 'a'); store.join(s.id, 'b');
    assert.throws(() => store.join(s.id, 'c'), UserError);
    assert.throws(() => store.join(s.id, 'a'), UserError);
    store.leave(s.id, 'a'); store.join(s.id, 'c');
    assert.equal(store.search(s.id).members.length, 3);
    assert.throws(() => store.leave(s.id, 'host'), UserError);
    store.deleteProfile('g1', 'c');
    assert.equal(store.search(s.id).members.includes('c'), false);
    assert.equal(store.profile('g2', 'a').embarkId, 'Otro#4321');
    store.deleteProfile('g1', 'host');
    assert.equal(store.search(s.id).status, 'closed');
    assert.equal(store.profile('g1', 'host'), null);
  } finally { store.close(); rmSync(dir, { recursive: true }); }
});

test('búsquedas caducadas no aceptan jugadores y retirar perfil limpia grupos', () => {
  const store = new Store(':memory:');
  try {
    store.saveProfile('g', 'host', profile);
    store.saveProfile('g', 'a', profile);
    const now = Date.now();
    const s = store.createSearch('g', 'host', 'c', filters, 50, 0, now);
    s.status = 'open'; store.updateSearch(s);
    assert.throws(() => store.join(s.id, 'a', now + 100), UserError);
    assert.deepEqual(store.expire(now + 100), [s.id]);
    assert.equal(store.search(s.id).status, 'expired');
    assert.throws(() => store.join(s.id, 'a'), UserError);
  } finally { store.close(); }
});

test('API no acepta estimaciones, RS ausentes ni identidad diferente', () => {
  assert.equal(parseStanding(data, profile.embarkId).score, 25000);
  assert.equal(parseStanding({ ...data, player: { ...data.player, standing: { ...data.player.standing, state: 'offBoard' } } }, profile.embarkId), null);
  assert.equal(parseStanding({ ...data, player: { ...data.player, estimated: true } }, profile.embarkId), null);
  assert.equal(parseStanding(data, 'Otro#4321'), null);
  assert.equal(parseStanding({ player: { embarkId: profile.embarkId, standing: { state: 'onBoard', league: 'Gold' } } }, profile.embarkId), null);
});

test('consultas concurrentes comparten solicitud, codifican # y cachean resultados', async () => {
  let calls = 0;
  const tracker = new Tracker(600000, async url => {
    calls++;
    assert.ok(url.endsWith('Jugador%231234'));
    return { ok: true, status: 200, json: async () => data };
  });
  await Promise.all([tracker.lookup(profile.embarkId), tracker.lookup(profile.embarkId)]);
  await tracker.lookup(profile.embarkId);
  assert.equal(calls, 1);
  tracker.forget(profile.embarkId);
  await tracker.lookup(profile.embarkId);
  assert.equal(calls, 2);
  const missing = new Tracker(600000, async () => ({ ok: false, status: 404 }));
  assert.equal(await missing.lookup(profile.embarkId), null);
  const unavailable = new Tracker(600000, async () => { throw new Error('network'); });
  await assert.rejects(() => unavailable.lookup(profile.embarkId), UserError);
});

test('autoasignación rechaza permisos peligrosos y roles superiores al bot', () => {
  const me = { permissions: { has: () => true }, roles: { highest: { position: 5 } } };
  const role = { id: 'role', guild: { id: 'guild' }, managed: false, position: 2, permissions: { has: () => false } };
  assert.doesNotThrow(() => assertAssignable(role, me));
  assert.throws(() => assertAssignable({ ...role, permissions: { has: p => p === P.Administrator } }, me), UserError);
  assert.throws(() => assertAssignable({ ...role, position: 6 }, me), UserError);
  assert.throws(() => assertAssignable({ ...role, managed: true }, me), UserError);
  assert.throws(() => assertAssignable({ ...role, id: 'guild' }, me), UserError);
});

test('moderación ignora coincidencias dentro de palabras y reconoce acentos y puntuación', () => {
  assert.equal(blockedTerm('Un tonto.', ['tonto']), 'tonto');
  assert.equal(blockedTerm('Contonton', ['tonto']), undefined);
  assert.equal(blockedTerm('¡TÓnto!', ['tonto']), 'tonto');
  assert.equal(blockedTerm('esto está mal', []), undefined);
});

test('tarjetas y formularios completos validan el esquema y no hacen menciones amplias', () => {
  const settings = { roles: [{ id: '123456789012345678', label: 'Mediano' }], rules: 'Respeta a los demás.' };
  for (const type of ['registro', 'buscar']) {
    const p = panelPayload(type, settings);
    assert.equal(p.flags, MessageFlags.IsComponentsV2);
    assert.deepEqual(p.allowedMentions.parse, []);
    p.components.forEach(c => c.toJSON());
  }
  for (const type of ['roles', 'reglas']) {
    const p = panelPayload(type, settings);
    assert.equal(p.flags, undefined);
    assert.deepEqual(p.allowedMentions.parse, []);
    p.embeds.forEach(e => e.toJSON());
  }
  for (const modal of [profileModal(null), profileModal(profile), publishModal('anuncio', '123456789012345678'), publishModal('reglas', '123456789012345678')]) {
    const json = modal.toJSON();
    assert.ok(json.components.length <= 5);
  }
  const p = searchPayload({ id: 'abc', host: '123456789012345678', status: 'open', expires: Date.now()+60000, filters, members: ['123456789012345678'] });
  p.components.forEach(c => c.toJSON());
  assert.deepEqual(p.allowedMentions.roles, []);
  assert.ok(commands.every(c => c.name && c.description));
});
