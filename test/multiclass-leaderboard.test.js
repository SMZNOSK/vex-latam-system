import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection, ChannelType, MessageFlags } from 'discord.js';
import { Store } from '../src/store.js';
import { VexBot } from '../src/bot.js';
import { validateSearch, compatible, UserError } from '../src/domain.js';
import { classes, ALL_CLASSES } from '../src/catalog.js';
import { draftId, skillsModal, searchDraftPayload } from '../src/wizard-ui.js';
import { topPlayers, leaderboardPayload } from '../src/leaderboard.js';
import { template } from '../src/renderer.js';

const profile = { embarkId: 'Jugador#1234', playerClass: 'Ligero', score: 34000, specializationIds: ['evasive_dash'], searchable: true };
const input = { mode: 'Ranked', teammates: 2, playerClasses: ['Mediano', 'Ligero'], minScore: 30000, maxScore: 40000, specializationIds: ['evasive_dash', 'healing_beam'] };
function interaction(guild, id, extra = {}) {
  const i = { guildId: guild.id, guild, user: { id: 'u' }, customId: id, inGuild: () => true,
    isButton: () => true, isChatInputCommand: () => false, isStringSelectMenu: () => false, isModalSubmit: () => false,
    replies: [], async deferReply() { this.deferred = true; }, async deferUpdate() { this.deferred = true; },
    async reply(p) { this.replied = true; this.replies.push(p); }, async editReply(p) { this.replies.push(p); }, async followUp(p) { this.replies.push(p); },
    async showModal(p) { this.modal = p.toJSON(); }, ...extra };
  return i;
}
async function fixture() {
  const store = new Store(':memory:'); await store.migrate();
  const guild = { id: 'g' }, client = { guilds: { fetch: async () => guild } };
  const bot = new VexBot(client, store, { forget() {} }); bot.guilds.add('g'); bot.log = () => {};
  return { bot, store, guild };
}
test('selección de varias clases: OR entre clases y habilidades; persistencia y filtros antiguos compatibles', async () => {
  const f = validateSearch(input);
  assert.deepEqual(f.playerClasses, ['Ligero', 'Mediano']); assert.equal(f.playerClass, 'Ligero + Mediano');
  assert.equal(compatible(profile, f), true);
  assert.equal(compatible({ ...profile, playerClass: 'Mediano', specializationIds: ['healing_beam'] }, f), true);
  assert.equal(compatible({ ...profile, playerClass: 'Pesado', specializationIds: ['mesh_shield'] }, f), false);
  assert.equal(compatible({ ...profile, score: 0 }, f), false);
  assert.equal(compatible({ ...profile, score: 0 }, { ...f, mode: 'Chill' }), true);
  for (const playerClasses of [[], ['Admin'], 'Mediano']) assert.throws(() => validateSearch({ ...input, playerClasses }), UserError);
  assert.throws(() => validateSearch({ ...input, playerClasses: ['Ligero'] }), UserError);
  assert.equal(compatible(profile, { ...f, playerClasses: undefined, playerClass: 'Ligero' }), true);
  assert.equal(compatible(profile, { ...f, playerClasses: undefined, playerClass: 'Pesado' }), false);
  const { store } = await fixture();
  try { store.saveProfile('g', 'u', profile); const s = store.createSearch('g', 'u', 'c', f, 60000, 0);
    assert.deepEqual(store.search(s.id).filters.playerClasses, ['Ligero', 'Mediano']);
    assert.equal(store.search(s.id).filters.schemaVersion, 3);
  } finally { store.close(); }
});
test('asistente multiselección filtra grupos y retira habilidades de clases desmarcadas', async () => {
  const { bot, store, guild } = await fixture();
  try {
    store.saveProfile('g', 'u', profile); await bot.interaction(interaction(guild, 'search:create'));
    const d = [...bot.workflows.drafts.items.values()][0]; assert.deepEqual(d.data.playerClasses, classes);
    d.data.specializationIds = ['evasive_dash', 'healing_beam', 'mesh_shield'];
    const select = interaction(guild, draftId(d, 'class'), { isButton: () => false, isStringSelectMenu: () => true, values: ['Ligero', 'Mediano'] });
    await bot.interaction(select);
    assert.deepEqual(d.data.specializationIds, ['evasive_dash', 'healing_beam']); assert.match(d.notice, /retiraron/);
    const groups = skillsModal(d).toJSON().components; assert.deepEqual(groups.map(g => g.label), ['Ligero', 'Mediano']);
    const payload = searchDraftPayload(d), menu = payload.components[0].toJSON().components.find(c => c.components?.[0]?.type === 3).components[0];
    assert.equal(menu.min_values, 1); assert.equal(menu.max_values, 3); assert.equal(menu.options.length, 3);
    assert.deepEqual(menu.options.filter(o => o.default).map(o => o.value), ['Ligero', 'Mediano']);
    const submit = interaction(guild, draftId(d, 'skills-submit'), { isButton: () => false, isModalSubmit: () => true,
      fields: { getCheckboxGroup: id => id === 'skills-Ligero' ? ['grappling_hook'] : ['guardian_turret'] } });
    await bot.interaction(submit); assert.deepEqual(d.data.specializationIds, ['grappling_hook', 'guardian_turret']);
    await bot.interaction(interaction(guild, draftId(d, 'class'), { isButton: () => false, isStringSelectMenu: () => true, values: ['Mediano'] }));
    assert.deepEqual(d.data.specializationIds, ['guardian_turret']); assert.equal(skillsModal(d).toJSON().components.length, 1);
  } finally { store.close(); }
});
test('top 10 ordena RS y empates, conserva pausados, ignora RS inválidos y no inventa Ruby', () => {
  const people = Array.from({ length: 12 }, (_, n) => ({ ...profile, user: String(n), embarkId: `Jugador${n}#1234`, score: 50000 - n * 1000, searchable: false }));
  const ranked = topPlayers([...people, { ...profile, user: 'bad', score: null }, { ...profile, score: 1000000 }]);
  assert.equal(ranked.length, 10); assert.equal(ranked[0].score, 50000); assert.equal(ranked[9].score, 41000);
  assert.equal(ranked[0].rank, 'Diamante 1');
  assert.equal(topPlayers([{ ...people[0], rankSource: 'manual', leaderboardPosition: 1 }])[0].rank, 'Diamante 1');
  assert.equal(topPlayers([{ ...people[0], rankSource: 'finalstracker', leaderboardPosition: 500 }])[0].rank, 'Ruby');
  assert.deepEqual(topPlayers([{ ...profile, user: 'b', embarkId: 'Zeta#1234' }, { ...profile, user: 'a', embarkId: 'Alfa#1234' }]).map(p => p.user), ['a', 'b']);
  assert.deepEqual(leaderboardPayload(ranked).allowedMentions.roles, []);
});
test('leaderboard conserva un único mensaje, actualiza por RS/foto/eliminación y omite ediciones sin cambios', async () => {
  const { bot, store, guild } = await fixture(); let sends = 0, edits = 0, creations = 0;
  const me = { id: 'bot', permissions: { has: () => true }, roles: {} };
  const message = { id: 'm', pinned: false, async pin() { this.pinned = true; } };
  const channel = { id: 'c', name: 'leaderboard', type: ChannelType.GuildText, permissionsFor: () => ({ has: () => true }),
    permissionOverwrites: { cache: new Collection(), async edit() {} },
    async send(p) { sends++; assert.deepEqual(p.allowedMentions.roles, []); return message; },
    messages: { async edit(id, p) { edits++; assert.equal(id, 'm'); assert.deepEqual(p.allowedMentions.roles, []); return message; } } };
  guild.members = { fetchMe: async () => me };
  guild.channels = { cache: new Collection(), fetch: async id => id === 'c' ? channel : null,
    async create() { creations++; this.cache.set('c', channel); return channel; } };
  try {
    store.saveProfile('g', 'u', profile);
    await Promise.all([bot.leaderboard.refresh(guild, { setup: true }), bot.leaderboard.refresh(guild, { setup: true })]);
    assert.equal(sends, 1); assert.equal(creations, 1); assert.equal(message.pinned, true);
    const previousEdits = edits; await bot.leaderboard.refresh(guild); assert.equal(edits, previousEdits);
    store.saveProfile('g', 'u', { score: 40000 }); await bot.refreshMemberTeams('g', 'u'); assert.equal(edits, previousEdits + 1);
    store.saveProfile('g', 'u', { cardImage: { key: 'abc', width: 100, height: 200 } }); await bot.refreshMemberTeams('g', 'u'); assert.equal(edits, previousEdits + 2);
    store.deleteProfile('g', 'u'); await bot.refreshLeaderboard('g'); assert.equal(bot.leaderboard.players('g').length, 0);
    // A replacement instance reuses the persisted message ID.
    const restarted = new VexBot(bot.client, store, {}); restarted.guilds.add('g');
    await restarted.leaderboard.refresh(guild, { setup: true }); assert.equal(sends, 1);
    const i = interaction(guild, 'leaderboard:view'); await restarted.interaction(i);
    assert.ok(i.replies.at(-1).flags & MessageFlags.IsComponentsV2);
  } finally { store.close(); }
});
test('habilidades de la imagen solo tienen marco e ilustración, con etiquetas accesibles; leaderboard vacío y diez tarjetas', () => {
  const html = template('profile', { ...profile, rank: 'Platino 3' });
  assert.ok(html.includes('alt="Impulso evasivo"')); assert.ok(!html.includes('>Impulso evasivo<'));
  assert.ok(html.includes('font-family:FinalsDisplay')); assert.ok(html.includes('data:font/woff2;base64,'));
  const empty = template('leaderboard', { players: [] }); assert.ok(empty.includes('Todavía no hay jugadores'));
  const people = topPlayers(Array.from({ length: 10 }, (_, n) => ({ ...profile, user: String(n), embarkId: `Nombre#100${n}`, score: 50000 - n * 1000 })));
  const board = template('leaderboard', { players: people });
  assert.equal((board.match(/class="standing-identity"/g) ?? []).length, 10);
  assert.equal((board.match(/class="standing-small"/g) ?? []).length, 7);
  assert.ok(board.includes('class="champion"')); assert.ok(board.includes('class="podium-card third"'));
  assert.ok(!board.includes('Ruby'));
});
