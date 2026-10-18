import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PermissionsBitField, MessageFlags } from 'discord.js';
import { Store } from '../src/store.js';
import { VexBot } from '../src/bot.js';
import { Drafts } from '../src/drafts.js';
import { specializations, ALL_CLASSES } from '../src/catalog.js';
import { rankFromRS, validateProfile, validateSearch, compatible, migrateProfile, parseStanding, UserError } from '../src/domain.js';
import { skillsModal, searchDraftPayload, draftId } from '../src/wizard-ui.js';
import { searchPayload, withImage, card, deliverCard } from '../src/ui.js';
import { processRoleJobs, relocateSearches } from '../src/setup.js';
import { template } from '../src/renderer.js';

const profile = validateProfile({ embarkId: 'Jugador#1234', sponsorId: 'ospuze', score: 34000, playerClass: 'Mediano', specializationIds: ['healing_beam', 'guardian_turret'] });
const filters = validateSearch({ description: '', mode: 'Ranked', minScore: 29000, maxScore: 39000, playerClass: ALL_CLASSES, specializationIds: [], teammates: 2 });
const json = payload => JSON.stringify(payload);
const componentIds = payload => {
  const ids = [], visit = c => { if (c.custom_id) ids.push(c.custom_id); for (const sub of c.components ?? []) visit(sub); };
  for (const c of payload.components) visit(c.toJSON()); return ids;
};
function fakeGuild() {
  const role = { id: 'finals', name: 'THE FINALS', position: 1, managed: false, guild: { id: 'g' }, permissions: new PermissionsBitField(0n) };
  const me = { id: 'bot', permissions: { has: () => true }, roles: { highest: { position: 5 } } };
  const members = new Map();
  const guild = { id: 'g', members: { fetchMe: async () => me, cache: members, async fetch(user) {
    if (!members.has(user)) members.set(user, { displayName: user, roles: { cache: new Map(),
      async add(id) { members.get(user).roles.cache.set(id, role); }, async remove(id) { members.get(user).roles.cache.delete(id); } } });
    return members.get(user);
  } }, roles: { fetch: async () => role }, channels: { fetch: async () => null } };
  return guild;
}
function interaction(user, guild, customId, extra = {}) {
  const i = { guild, guildId: guild.id, user: { id: user }, customId, replies: [], modals: [],
    inGuild: () => true, isChatInputCommand: () => false, isButton: () => true, isModalSubmit: () => false, isStringSelectMenu: () => false,
    memberPermissions: { has: () => false }, async reply(p) { i.replied = true; i.replies.push(p); },
    async deferReply(p) { i.deferred = true; i.replies.push(p); }, async deferUpdate() { i.deferred = true; },
    async editReply(p) { i.replies.push(p); }, async followUp(p) { i.replies.push(p); }, async showModal(m) { i.modals.push(m.toJSON()); }, ...extra };
  return i;
}
async function setup() {
  const store = new Store(':memory:'); await store.migrate();
  const guild = fakeGuild(), client = { guilds: { cache: new Map([['g', guild]]), fetch: async () => guild } };
  const bot = new VexBot(client, store, { forget() {} }); bot.guilds.add('g'); bot.log = () => {};
  store.saveSettings('g', { ...store.settings('g'), finalsRole: 'finals' }); return { bot, store, guild };
}

test('todos los extremos de las veinte divisiones; Ruby exige una posición real', () => {
  for (let n = 0; n < 20; n++) {
    const expected = `${['Bronce', 'Plata', 'Oro', 'Platino', 'Diamante'][Math.floor(n / 4)]} ${4 - n % 4}`;
    assert.equal(rankFromRS(n * 2500), expected);
    assert.equal(rankFromRS(n * 2500 + 2499), expected);
  }
  assert.equal(rankFromRS(999999), 'Diamante 1');
  for (const position of [null, 0, -1, '1', 501]) assert.equal(rankFromRS(60000, position), 'Diamante 1');
  assert.equal(rankFromRS(60000, 1), 'Ruby'); assert.equal(rankFromRS(60000, 500), 'Ruby');
  const api = position => ({ player: { embarkId: profile.embarkId, standing: { state: 'onBoard', rankScore: 60000, league: 'Ruby', rank: position } } });
  assert.equal(parseStanding(api(null), profile.embarkId).rank, 'Diamante 1');
  assert.equal(parseStanding(api(500), profile.embarkId).rank, 'Ruby');
  assert.equal(parseStanding(api(501), profile.embarkId).rank, 'Diamante 1');
});
test('todas las clases, selección múltiple y coincidencia con cualquiera; Chill ignora RS', () => {
  const p = { ...profile, searchable: true, specializationIds: ['guardian_turret'] };
  const f = { ...filters, playerClass: 'Mediano', specializationIds: ['healing_beam', 'guardian_turret'] };
  assert.equal(compatible(p, f), true);
  assert.equal(compatible({ ...p, specializationIds: ['shockwave'] }, f), false);
  assert.equal(compatible({ ...p, playerClass: ALL_CLASSES }, f), true);
  assert.equal(compatible({ ...p, needsCompletion: true }, f), false);
  assert.equal(compatible({ ...p, score: 0 }, { ...f, mode: 'Chill' }), true);
  assert.deepEqual(validateSearch({ ...f, mode: 'Chill', minScore: 'bad', maxScore: -1 }).minScore, null);
  assert.throws(() => validateSearch({ ...f, maxScore: f.minScore - 1 }), UserError);
  assert.throws(() => validateProfile({ ...profile, specializationIds: ['mesh_shield'] }), UserError);
  assert.throws(() => validateProfile({ ...profile, specializationIds: [] }), UserError);
});
test('casillas nativas: solo cuatro por clase o tres grupos; doce selecciones válidas', () => {
  const d = new Drafts().create('profile', 'g', 'u', { ...profile, playerClass: ALL_CLASSES, specializationIds: specializations.map(s => s.id) });
  const modal = skillsModal(d).toJSON();
  assert.equal(modal.components.length, 3);
  for (const label of modal.components) { assert.equal(label.component.type, 22); assert.equal(label.component.options.length, 4); assert.equal(label.component.options.every(o => o.default), true); }
  d.data.playerClass = 'Mediano'; assert.equal(skillsModal(d).toJSON().components.length, 1);
});
test('borradores privados: propietario, servidor, veinte minutos y reemplazo del asistente', () => {
  const drafts = new Drafts(); const d = drafts.create('profile', 'g', 'u', profile, 1000);
  assert.throws(() => drafts.get(d.id, 'g', 'other', 1001), UserError);
  assert.throws(() => drafts.get(d.id, 'other', 'u', 1001), UserError);
  assert.equal(drafts.get(d.id, 'g', 'u', 1200999), d);
  assert.throws(() => drafts.get(d.id, 'g', 'u', 1201000), UserError);
  const old = drafts.create('profile', 'g', 'u', profile); drafts.create('profile', 'g', 'u', profile);
  assert.throws(() => drafts.get(old.id, 'g', 'u'), UserError);
});
test('asistente de perfil: obliga a revisar, depura cambios de clase, guarda y asigna rol', async () => {
  const { bot, store, guild } = await setup();
  try {
    const first = interaction('u', guild, 'profile:edit'); await bot.interaction(first);
    const d = [...bot.workflows.drafts.items.values()][0]; assert.equal(store.profile('g', 'u'), null);
    const submit = interaction('u', guild, first.modals[0].custom_id, { isButton: () => false, isModalSubmit: () => true,
      fields: { getStringSelectValues: () => ['ospuze'], getTextInputValue: id => id === 'embarkId' ? 'Jugador#1234' : '34000' } }); await bot.interaction(submit);
    assert.equal(d.step, 'class'); assert.equal(d.data.rank, 'Platino 3');
    d.data.specializationIds = ['cloaking_device'];
    const change = interaction('u', guild, draftId(d, 'class'), { isButton: () => false, isStringSelectMenu: () => true, values: ['Mediano'] });
    await bot.interaction(change); assert.deepEqual(d.data.specializationIds, []); assert.match(d.notice, /retiraron/);
    const skill = interaction('u', guild, draftId(d, 'skills-submit'), { isButton: () => false, isModalSubmit: () => true,
      fields: { getCheckboxGroup: id => { assert.equal(id, 'skills-Mediano'); return ['healing_beam', 'guardian_turret']; } } });
    await bot.interaction(skill); assert.equal(d.step, 'review'); assert.equal(store.profile('g', 'u'), null);
    const save = interaction('u', guild, draftId(d, 'save')); await bot.interaction(save);
    assert.equal(store.profile('g', 'u').rank, 'Platino 3'); assert.deepEqual(store.profile('g', 'u').specializationIds, ['healing_beam', 'guardian_turret']);
    assert.equal((await guild.members.fetch('u')).roles.cache.has('finals'), true); assert.equal(bot.workflows.drafts.items.size, 0);
    assert.ok(submit.replies[0].flags & MessageFlags.Ephemeral); assert.ok(save.replies.at(-1).flags & MessageFlags.IsComponentsV2);
  } finally { store.close(); }
});
test('controles RS conservan mínimo ≤ máximo, límites, modo Chill y versión del borrador', async () => {
  const { bot, store, guild } = await setup();
  try {
    store.saveProfile('g', 'u', profile);
    const start = interaction('u', guild, 'search:create'); await bot.interaction(start);
    const d = [...bot.workflows.drafts.items.values()][0]; assert.equal(d.data.minScore, 29000); assert.equal(d.data.maxScore, 39000); assert.equal(d.data.teammates, 2);
    d.data.minScore = 999998; d.data.maxScore = 999999;
    await bot.interaction(interaction('u', guild, draftId(d, 'min', '2500'))); assert.equal(d.data.minScore, 999999);
    const old = draftId(d, 'max', '-2500');
    await bot.interaction(interaction('u', guild, draftId(d, 'mode', 'Chill')));
    assert.ok(!componentIds(searchDraftPayload(d)).some(id => /:(min|max|range):?/.test(id)));
    const stale = interaction('u', guild, old); await bot.interaction(stale); assert.match(stale.replies.at(-1).content, /anterior/);
    assert.equal(d.data.maxScore, 999999);
  } finally { store.close(); }
});
test('migración hace respaldo antes de recalcular y conserva referencias y búsquedas', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vex-v2-')), file = path.join(dir, 'data.sqlite');
  let store = new Store(file);
  try {
    store.saveProfile('g', 'u', { ...profile, schemaVersion: 1, specializationIds: undefined, specialization: 'Daga', rank: 'Oro 3' });
    const search = store.createSearch('g', 'u', 'old', { teammates: 2, description: 'Ranks', specialization: 'Daga', minScore: 0, maxScore: 999999 }, 600000, 0);
    search.status = 'open'; search.message = 'old-m'; search.members.push('friend'); store.updateSearch(search);
    const snapshot = await store.migrate(); assert.ok(existsSync(snapshot));
    const old = new Store(snapshot); assert.equal(old.profile('g', 'u').rank, 'Oro 3'); old.close();
    const p = store.profile('g', 'u'); assert.equal(p.rank, 'Platino 3'); assert.equal(p.legacySpecialization, 'Daga'); assert.equal(p.needsCompletion, true); assert.deepEqual(p.specializationIds, []);
    assert.deepEqual(store.search(search.id).members, ['u', 'friend']); assert.equal(store.search(search.id).expires, search.expires);
    assert.equal(await store.migrate(), null);
    store.close(); store = new Store(file); assert.equal(store.schemaVersion, 5); assert.equal(store.roleJobs('g').length, 1);
    assert.equal(migrateProfile({ ...profile, score: null, specialization: 'Rayo curativo', schemaVersion: 1 }).needsCompletion, true);
  } finally { store.close(); assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep)); rmSync(dir, { recursive: true }); }
});
test('solicitud pública tiene solo Unirme; miembros recuperan controles sin ingresar dos veces', async () => {
  const { bot, store, guild } = await setup();
  try {
    store.saveProfile('g', 'host', profile); store.saveProfile('g', 'member', profile);
    const s = store.createSearch('g', 'host', 'c', filters, 600000, 0); s.status = 'open'; s.message = 'm'; store.updateSearch(s); store.join(s.id, 'member');
    assert.deepEqual(componentIds(searchPayload(s)), [`search:join:${s.id}`]);
    const member = interaction('member', guild, `search:join:${s.id}`); await bot.interaction(member);
    assert.deepEqual(componentIds(member.replies.at(-1)), [`search:team:${s.id}`, `search:leave:${s.id}`, `search:voice:${s.id}`]);
    assert.equal(store.search(s.id).members.length, 2);
    const host = interaction('host', guild, 'search:mine'); await bot.interaction(host);
    assert.deepEqual(componentIds(host.replies.at(-1)), [`search:team:${s.id}`, `search:candidates:${s.id}`, `search:close:${s.id}`, `search:voice:${s.id}`]);
    const attacker = interaction('member', guild, `search:close:${s.id}`, { memberPermissions: { has: () => true } }); await bot.interaction(attacker);
    assert.match(attacker.replies.at(-1).content, /Solo el organizador/); assert.equal(store.search(s.id).status, 'open');
  } finally { store.close(); }
});
test('dos pulsaciones simultáneas en el último cupo solo admiten un integrante', async () => {
  const { bot, store, guild } = await setup();
  try {
    for (const user of ['host', 'a', 'b']) store.saveProfile('g', user, profile);
    const s = store.createSearch('g', 'host', 'c', { ...filters, teammates: 1 }, 600000, 0); s.status = 'open'; store.updateSearch(s);
    bot.refreshSearch = async () => {};
    const a = interaction('a', guild, `search:join:${s.id}`), b = interaction('b', guild, `search:join:${s.id}`);
    await Promise.all([bot.interaction(a), bot.interaction(b)]); assert.equal(store.search(s.id).members.length, 2);
    assert.ok([a, b].some(i => i.replies.at(-1).content?.includes('completo')));
  } finally { store.close(); }
});
test('asignaciones pendientes se reintentan; pausar conserva rol y eliminar lo retira', async () => {
  const { bot, store, guild } = await setup();
  try {
    store.saveProfile('g', 'u', profile); const member = await guild.members.fetch('u'); const add = member.roles.add; let attempts = 0;
    member.roles.add = async id => { attempts++; if (attempts === 1) throw new Error('Forbidden'); return add(id); };
    await processRoleJobs(bot, guild); assert.equal(store.roleJobs('g').length, 0); assert.equal(store.roleJobs('g', Number.MAX_SAFE_INTEGER).length, 1);
    store.queueRole('g', 'u'); await processRoleJobs(bot, guild); assert.equal(member.roles.cache.has('finals'), true);
    store.saveProfile('g', 'u', { searchable: false }); await processRoleJobs(bot, guild); assert.equal(member.roles.cache.has('finals'), true);
    store.deleteProfile('g', 'u'); await processRoleJobs(bot, guild); assert.equal(member.roles.cache.has('finals'), false); assert.equal(store.roleJobs('g').length, 0);
  } finally { store.close(); }
});
test('notificaciones: una cada diez minutos; todas las tarjetas muestran el rol y editar no notifica', async () => {
  const { store } = await setup();
  try {
    const now = Date.now(); assert.equal(store.reservePing('g', now), true); assert.equal(store.reservePing('g', now), false);
    assert.equal(store.reservePing('g', now + 599999), false); assert.equal(store.reservePing('g', now + 600000), true);
    const s = { id: 's', host: 'u', members: ['u'], status: 'open', expires: now + 60000, filters };
    assert.ok(json(searchPayload(s, 'finals')).includes('<@&finals>')); assert.deepEqual(searchPayload(s, 'finals').allowedMentions.roles, []);
    assert.deepEqual(searchPayload(s, 'finals', true).allowedMentions.roles, ['finals']);
  } finally { store.close(); }
});
test('traslado conserva integrantes y caducidad, deja enlace y es idempotente sin pings', async () => {
  const { bot, store, guild } = await setup();
  try {
    store.saveProfile('g', 'u', profile); const s = store.createSearch('g', 'u', 'old', filters, 600000, 0); s.status = 'open'; s.message = 'old-m'; s.members.push('friend'); store.updateSearch(s);
    let sent = 0, edited = 0;
    const target = { id: 'new', async send(payload) { assert.deepEqual(payload.allowedMentions.roles, []); sent++; return { id: 'new-m' }; } };
    guild.channels.fetch = async () => ({ messages: { async edit(id, payload) { assert.equal(id, 'old-m'); assert.ok(json(payload).includes('/new/new-m')); edited++; } } });
    await relocateSearches(bot, guild, target); await relocateSearches(bot, guild, target);
    const migrated = store.search(s.id); assert.equal(migrated.channel, 'new'); assert.equal(migrated.expires, s.expires); assert.deepEqual(migrated.members, ['u', 'friend']); assert.equal(sent, 1); assert.equal(edited, 1);
  } finally { store.close(); }
});
test('fallo de render deja texto y controles; HTML escapa entradas y no carga datos externos', async () => {
  const renderer = { warned: true, render: async () => { throw new Error('Missing browser'); } };
  const payload = await withImage(card('Perfil', 'Datos', []), renderer, 'profile', profile);
  assert.equal(payload.files, undefined); assert.ok(json(payload).includes('Datos'));
  const html = template('profile', { ...profile, embarkId: '<img src=x onerror=alert(1)>#1234' });
  assert.ok(html.includes('&lt;img')); assert.ok(!html.includes('<img src=x')); assert.ok(html.includes("default-src 'none'"));
});

test('múltiples equipos se recuperan con selector privado; una selección antigua no revela controles', async () => {
  const { bot, store, guild } = await setup();
  try {
    for (const user of ['host1', 'host2', 'member']) store.saveProfile('g', user, profile);
    const searches = ['host1', 'host2'].map(host => {
      const s = store.createSearch('g', host, 'c', filters, 600000, 0); s.status = 'open'; store.updateSearch(s); store.join(s.id, 'member'); return s;
    });
    const mine = interaction('member', guild, 'search:mine'); await bot.interaction(mine);
    assert.deepEqual(componentIds(mine.replies.at(-1)), ['teams:select']);
    assert.ok(mine.replies[0].flags & MessageFlags.Ephemeral);
    store.leave(searches[0].id, 'member');
    const stale = interaction('member', guild, 'teams:select', { isStringSelectMenu: () => true, values: [searches[0].id] });
    await bot.interaction(stale); assert.match(stale.replies.at(-1).content, /Ya no perteneces/);
  } finally { store.close(); }
});
test('eliminar durante la publicación no vuelve a abrir la búsqueda ni recrea el perfil', async () => {
  const { bot, store, guild } = await setup();
  try {
    store.saveProfile('g', 'u', profile);
    store.saveSettings('g', { ...store.settings('g'), teamsChannel: 'teams' });
    bot.channel = async () => ({ id: 'teams', async send(payload) {
      assert.deepEqual(payload.allowedMentions.roles, ['finals']); store.deleteProfile('g', 'u'); return { id: 'm' };
    } });
    bot.refreshSearch = async () => {};
    const i = interaction('u', guild, ''); await bot.publishSearch(i, filters);
    const s = store.db.prepare('SELECT status,id FROM searches').get(); assert.equal(s.status, 'closed');
    assert.deepEqual(store.search(s.id).members, []); assert.equal(store.profile('g', 'u'), null);
  } finally { store.close(); }
});
test('publicaciones simultáneas solo notifican una vez y muestran los Embark ID solicitados', async () => {
  const { bot, store, guild } = await setup();
  try {
    for (const user of ['a', 'b']) store.saveProfile('g', user, profile);
    store.saveSettings('g', { ...store.settings('g'), teamsChannel: 'teams' });
    const sent = [];
    bot.channel = async () => ({ id: 'teams', async send(p) { sent.push(p); return { id: `m${sent.length}` }; } });
    await Promise.all(['a', 'b'].map(u => bot.publishSearch(interaction(u, guild, ''), filters)));
    assert.equal(sent.length, 2); assert.equal(sent.filter(p => p.allowedMentions.roles.includes('finals')).length, 1);
    assert.ok(sent.every(p => json(p).includes(profile.embarkId))); assert.ok(sent.every(p => componentIds(p).length === 1));
  } finally { store.close(); }
});
test('si Discord rechaza Adjuntar archivos se entrega la tarjeta nativa funcional', async () => {
  const p = await withImage(card('Perfil', 'Texto accesible'), { render: async () => Buffer.from('synthetic') }, 'profile', profile);
  let calls = 0;
  const result = await deliverCard(async payload => {
    calls++;
    if (calls === 1) throw Object.assign(new Error('Missing permissions'), { code: 50013 });
    assert.deepEqual(payload.files, []); assert.equal(payload.components.length, 1); assert.ok(json(payload).includes('Texto accesible')); return 'delivered';
  }, p);
  assert.equal(result, 'delivered'); assert.equal(calls, 2);
});

test('guardar un asistente antiguo no recrea un perfil eliminado durante la espera', async () => {
  const { bot, store, guild } = await setup();
  try {
    const current = store.saveProfile('g', 'u', profile);
    const d = bot.workflows.drafts.create('profile', 'g', 'u', { ...profile }); d.base = current; d.step = 'review';
    const i = interaction('u', guild, draftId(d, 'save'), { async deferUpdate() { i.deferred = true; store.deleteProfile('g', 'u'); } });
    await bot.interaction(i); assert.equal(store.profile('g', 'u'), null);
    assert.ok(i.replies.some(p => p.content?.includes('perfil cambió')));
  } finally { store.close(); }
});
test('editar manualmente RS invalida Ruby; mantener datos consultados conserva la posición', async () => {
  const { bot, store, guild } = await setup();
  try {
    store.saveProfile('g', 'u', { ...profile, rank: 'Ruby', rankSource: 'finalstracker', leaderboardPosition: 500, score: 60000 });
    await bot.workflows.startProfile(interaction('u', guild, 'profile:edit'));
    const d = [...bot.workflows.drafts.items.values()][0];
    const submit = value => interaction('u', guild, draftId(d, 'identity-submit'), { isButton: () => false, isModalSubmit: () => true,
      fields: { getStringSelectValues: () => ['ospuze'], getTextInputValue: id => id === 'embarkId' ? profile.embarkId : value } });
    await bot.interaction(submit('60000')); assert.equal(d.data.rank, 'Ruby'); assert.equal(d.data.leaderboardPosition, 500);
    await bot.interaction(submit('55000')); assert.equal(d.data.rank, 'Diamante 1'); assert.equal(d.data.leaderboardPosition, null);
  } finally { store.close(); }
});
