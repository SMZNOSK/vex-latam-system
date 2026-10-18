import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageFlags, ChannelType } from 'discord.js';
import { Store } from '../src/store.js';
import { VexBot } from '../src/bot.js';
import { UserError, validateSearch } from '../src/domain.js';

const profile = { embarkId: 'Privado#1234', playerClass: 'Mediano', specializationIds: ['healing_beam'], rank: 'Oro 2', score: 25000 };
const filters = validateSearch({ mode: 'Ranked', description: '', teammates: 2, playerClass: 'Todas las clases', specializationIds: [], minScore: 0, maxScore: 999999 });
function interaction(user, extra = {}) {
  const replies = [];
  const i = { guildId: 'g', user: { id: user }, replies,
    memberPermissions: { has: () => false },
    inGuild: () => true, isChatInputCommand: () => false, isButton: () => true,
    async reply(payload) { replies.push(payload); i.replied = true; },
    async deferReply(payload) { i.deferred = true; replies.push(payload); },
    async editReply(payload) { replies.push(payload); },
    async followUp(payload) { replies.push(payload); }, ...extra };
  return i;
}
function setup(tracker = {}) {
  const store = new Store(':memory:');
  const bot = new VexBot({}, store, tracker);
  bot.guilds.add('g');
  bot.log = () => {};
  return { store, bot };
}

test('comandos administrativos no abren formularios a miembros sin permiso', async () => {
  const { bot, store } = setup();
  try {
    const i = interaction('u', { isChatInputCommand: () => true, commandName: 'anuncio',
      showModal: () => assert.fail('No debe abrir un formulario administrativo') });
    await bot.interaction(i);
    assert.match(i.replies[0].content, /Administrador/);
    assert.equal(i.replies[0].flags, MessageFlags.Ephemeral);
  } finally { store.close(); }
});

test('formulario ajeno al servidor configurado se ignora', async () => {
  const { bot, store } = setup();
  try {
    const i = interaction('u', { guildId: 'otro', customId: 'profile:view' });
    await bot.interaction(i);
    assert.equal(i.replies.length, 0);
  } finally { store.close(); }
});

test('solo participantes pueden consultar Embark ID y solo organizador puede consultar sugerencias', async () => {
  const { bot, store } = setup();
  try {
    store.saveProfile('g', 'host', profile);
    const s = store.createSearch('g', 'host', 'canal', filters, 600000, 0);
    s.status = 'open'; store.updateSearch(s);
    const outsider = interaction('u', { customId: `search:team:${s.id}` });
    await bot.interaction(outsider);
    assert.ok(outsider.replies.every(x => !JSON.stringify(x).includes(profile.embarkId)));
    assert.match(outsider.replies.at(-1).content, /Solo los integrantes/);
    const suggestions = interaction('u', { customId: `search:candidates:${s.id}` });
    await bot.interaction(suggestions);
    assert.match(suggestions.replies.at(-1).content, /Solo el organizador/);
    const host = interaction('host', { customId: `search:team:${s.id}` });
    await bot.interaction(host);
    assert.ok(JSON.stringify(host.replies.at(-1)).includes(profile.embarkId));
    assert.deepEqual(host.replies.at(-1).allowedMentions.parse, []);
  } finally { store.close(); }
});

test('borrar un perfil durante una consulta API no lo recrea al llegar la respuesta', async () => {
  let resolve;
  const pending = new Promise(r => { resolve = r; });
  const { bot, store } = setup({ lookup: () => pending });
  try {
    store.saveProfile('g', 'u', profile);
    const running = bot.syncProfile(interaction('u'));
    store.deleteProfile('g', 'u');
    resolve({ score: 50000, rank: 'Diamond', season: 's11' });
    await assert.rejects(running, UserError);
    assert.equal(store.profile('g', 'u'), null);
  } finally { store.close(); }
});

test('salir del equipo durante la espera de una interacción retira acceso a datos privados', async () => {
  const { bot, store } = setup();
  try {
    store.saveProfile('g', 'host', profile);
    store.saveProfile('g', 'u', { ...profile, embarkId: 'Compañero#4321' });
    const s = store.createSearch('g', 'host', 'c', filters, 600000, 0);
    s.status = 'open'; store.updateSearch(s); store.join(s.id, 'u');
    const i = interaction('u', { customId: `search:team:${s.id}`,
      async deferReply(payload) { i.deferred = true; i.replies.push(payload); store.leave(s.id, 'u'); } });
    await bot.interaction(i);
    assert.match(i.replies.at(-1).content, /Solo los integrantes/);
    assert.ok(i.replies.every(payload => !JSON.stringify(payload).includes(profile.embarkId)));
  } finally { store.close(); }
});

test('reiniciar actualiza la tarjeta guardada sin leer historial ni publicar un duplicado', async () => {
  const { bot, store } = setup();
  try {
    const settings = store.settings('g');
    settings.panels.registro = { channel: 'c', message: 'm' };
    store.saveSettings('g', settings);
    let edits = 0;
    const channel = { id: 'c', type: ChannelType.GuildText,
      permissionsFor: () => ({ has: () => true }),
      permissionOverwrites: { cache: new Map(), edit: async () => {} },
      messages: {
        fetch: () => assert.fail('No necesita leer historial'),
        async edit(id, payload) { assert.equal(id, 'm'); payload.components[0].toJSON(); edits++; return { id: 'm', pinned: true }; },
      }, send: () => assert.fail('No debe duplicar la tarjeta') };
    const guild = { id: 'g', channels: { fetch: async () => channel }, members: { fetchMe: async () => ({ id: 'bot', roles: {} }) } };
    await bot.postPanel(guild, 'registro', channel);
    assert.equal(edits, 1);
    assert.equal(store.settings('g').panels.registro.message, 'm');
  } finally { store.close(); }
});
