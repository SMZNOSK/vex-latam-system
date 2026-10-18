import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ChannelType, Collection, PermissionsBitField, PermissionFlagsBits as P, MessageFlags } from 'discord.js';
import { Store } from '../src/store.js';
import { VexBot } from '../src/bot.js';
import { UserError, validateSearch } from '../src/domain.js';
import { VoiceRooms, EMPTY_VOICE_GRACE, NEW_VOICE_GRACE } from '../src/voice-rooms.js';
import { teamPrivatePayload } from '../src/wizard-ui.js';

const profile = { embarkId: 'Jugador#1234', score: 34000, playerClass: 'Mediano', specializationIds: ['healing_beam'], searchable: true };
const filters = validateSearch({ mode: 'Chill', teammates: 2, playerClass: 'Todas las clases', specializationIds: [] });
async function setup(filename = ':memory:') {
  const store = new Store(filename); await store.migrate();
  const me = { id: 'bot', permissions: new PermissionsBitField([P.ViewChannel, P.ManageChannels, P.ManageRoles, P.Connect, P.Speak, P.MoveMembers]) };
  const channels = new Collection(), members = new Collection(), moves = [], errors = [];
  let creations = 0, permissionEdits = 0;
  const guild = { id: 'g', available: true, members: { fetchMe: async () => me, async fetch(user) {
    if (!members.has(user)) {
      const member = { id: user, voice: { channelId: null, async setChannel(channel) {
        moves.push([user, channel.id]); for (const c of channels.values()) c.members.delete(user);
        member.voice.channelId = channel.id; channel.members.set(user, member);
      } } };
      members.set(user, member);
    }
    return members.get(user);
  } }, channels: { async fetch(id) { return channels.get(id) ?? null; }, async create(options) {
    creations++;
    const channel = { id: `voice-${creations}`, type: options.type, options, members: new Collection(),
      permissionsFor: () => me.permissions,
      permissionOverwrites: { async set(overwrites) { channel.options.permissionOverwrites = overwrites; permissionEdits++; } },
      async delete() { assert.equal(channel.members.size, 0); channels.delete(channel.id); },
    };
    channels.set(channel.id, channel); return channel;
  } } };
  const client = { guilds: { fetch: async () => guild }, isReady: () => true };
  const bot = new VexBot(client, store, {}); bot.guilds.add('g'); bot.log = (e) => errors.push(e);
  store.saveProfile('g', 'host', profile); store.saveProfile('g', 'member', profile);
  const search = store.createSearch('g', 'host', 'text', filters, 600000, 0); search.status = 'open'; search.message = 'message'; store.updateSearch(search);
  store.join(search.id, 'member');
  const interaction = (user, guildOverride = guild) => ({ guild: guildOverride, guildId: guildOverride.id, user: { id: user },
    customId: `search:voice:${search.id}`, replies: [], inGuild: () => true, isButton: () => true,
    isChatInputCommand: () => false, isModalSubmit: () => false, isStringSelectMenu: () => false,
    async deferReply(payload) { this.deferred = true; this.replies.push(payload); },
    async editReply(payload) { this.replies.push(payload); }, async reply(payload) { this.replied = true; this.replies.push(payload); },
  });
  return { bot, store, guild, me, search, channels, members, moves, errors, interaction,
    creations: () => creations, permissionEdits: () => permissionEdits };
}
const payloadText = i => JSON.stringify(i.replies.at(-1));

test('el acceso a la sala depende de pertenecer al equipo y no de completar el perfil', async () => {
  const f = await setup();
  try {
    const settings = f.store.settings('g'); settings.accessGate = { enabled: true }; settings.verifiedRole = 'verified';
    f.store.saveSettings('g', settings);
    f.store.saveProfile('g', 'host', { needsCompletion: true });
    f.store.saveProfile('g', 'member', { needsCompletion: true });
    await f.bot.voiceRooms.access(f.interaction('host'), f.search.id);
    const channel = f.channels.get(f.store.voiceRoom(f.search.id).channel);
    const overwrites = channel.options.permissionOverwrites;
    assert.deepEqual(overwrites.map(o => o.id), ['g', 'bot', 'host', 'member']);
    assert.ok(overwrites.find(o => o.id === 'g').allow.includes(P.ViewChannel));
    assert.ok(overwrites.find(o => o.id === 'g').deny.includes(P.Connect));
    assert.ok(overwrites.find(o => o.id === 'member').allow.includes(P.Connect));
    const member = await f.guild.members.fetch('member'); member.voice.channelId = 'another-room';
    await f.bot.voiceRooms.access(f.interaction('member'), f.search.id);
    assert.deepEqual(f.moves, [['member', channel.id]]);
    await assert.rejects(f.bot.voiceRooms.access(f.interaction('outsider'), f.search.id), /integrantes/);
  } finally { f.store.close(); }
});

test('sala visible con conexión solo para el equipo; dos pulsaciones reutilizan su ID', async () => {
  const f = await setup();
  try {
    await assert.rejects(f.bot.voiceRooms.access(f.interaction('outsider'), f.search.id), UserError);
    await assert.rejects(f.bot.voiceRooms.access(f.interaction('member'), f.search.id), /organizador/);
    const a = f.interaction('host'), b = f.interaction('host');
    await Promise.all([f.bot.button(a), f.bot.button(b)]);
    assert.equal(f.creations(), 1); assert.equal(f.moves.length, 0);
    const channel = f.channels.get(f.store.voiceRoom(f.search.id).channel);
    assert.equal(channel.type, ChannelType.GuildVoice); assert.equal(channel.options.userLimit, 3);
    assert.deepEqual(channel.options.permissionOverwrites.map(o => o.id), ['g', 'bot', 'host', 'member']);
    assert.ok(channel.options.permissionOverwrites[0].deny.includes(P.Connect));
    assert.deepEqual(channel.options.permissionOverwrites[0].allow, [P.ViewChannel]);
    assert.ok(!channel.options.permissionOverwrites[0].deny.includes(P.ViewChannel));
    assert.match(payloadText(a), /Abrir sala de voz/); assert.match(payloadText(a), /https:\/\/discord.com\/channels\/g\/voice-1/);
    assert.equal(a.replies[0].flags, MessageFlags.Ephemeral);
    const member = f.interaction('member'); await f.bot.button(member); assert.equal(f.creations(), 1);
    assert.match(payloadText(member), /Acceder a sala de voz/);
    await assert.rejects(f.bot.voiceRooms.access(f.interaction('host', { id: 'other' }), f.search.id), /integrantes/);
  } finally { f.store.close(); }
});

test('traslada solo a quien lo solicita y está conectado; sin Mover miembros conserva enlace funcional', async () => {
  const f = await setup();
  try {
    const host = await f.guild.members.fetch('host'); host.voice.channelId = 'permanent';
    const i = f.interaction('host'); await f.bot.button(i);
    assert.deepEqual(f.moves, [['host', 'voice-1']]); assert.match(payloadText(i), /Te trasladé/);
    const member = await f.guild.members.fetch('member'); member.voice.channelId = 'permanent';
    f.me.permissions.remove(P.MoveMembers);
    const without = f.interaction('member'); await f.bot.button(without);
    assert.equal(f.moves.length, 1); assert.match(payloadText(without), /Mover miembros/); assert.match(payloadText(without), /Abrir sala de voz/);
  } finally { f.store.close(); }
});

test('faltan permisos: no crea canales; rechazo del traslado conserva la sala y el botón', async () => {
  const f = await setup();
  try {
    f.me.permissions.remove(P.ManageChannels);
    await assert.rejects(f.bot.voiceRooms.access(f.interaction('host'), f.search.id), /Administrar canales/);
    assert.equal(f.creations(), 0);
    f.me.permissions.add(P.ManageChannels);
    const host = await f.guild.members.fetch('host'); host.voice.channelId = 'permanent';
    host.voice.setChannel = async () => { throw Object.assign(new Error('Permiso'), { code: 50013 }); };
    const i = f.interaction('host'); await f.bot.button(i);
    assert.match(payloadText(i), /Abrir sala de voz/); assert.equal(f.store.voiceRooms('g').length, 1);
  } finally { f.store.close(); }
});

test('sala nueva espera dos minutos; usada espera treinta segundos y reconectarse cancela el borrado', async () => {
  const f = await setup();
  try {
    await f.bot.button(f.interaction('host'));
    const r = f.store.voiceRoom(f.search.id), c = f.channels.get(r.channel), t = r.created;
    await f.bot.voiceRooms.reconcile(f.guild, t + NEW_VOICE_GRACE - 1); assert.ok(f.channels.has(c.id));
    c.members.set('host', {});
    await f.bot.voiceRooms.reconcile(f.guild, t + NEW_VOICE_GRACE); assert.equal(f.store.voiceRoom(f.search.id).emptySince, null);
    c.members.clear(); await f.bot.voiceRooms.reconcile(f.guild, t + NEW_VOICE_GRACE + 1);
    await f.bot.voiceRooms.reconcile(f.guild, t + NEW_VOICE_GRACE + EMPTY_VOICE_GRACE); assert.ok(f.channels.has(c.id));
    c.members.set('host', {}); await f.bot.voiceRooms.reconcile(f.guild, t + NEW_VOICE_GRACE + EMPTY_VOICE_GRACE + 1);
    assert.equal(f.store.voiceRoom(f.search.id).emptySince, null);
    c.members.clear(); await f.bot.voiceRooms.reconcile(f.guild, t + 200000);
    await f.bot.voiceRooms.reconcile(f.guild, t + 200000 + EMPTY_VOICE_GRACE);
    assert.equal(f.store.voiceRoom(f.search.id), null); assert.equal(f.channels.size, 0);
    // Un botón antiguo del organizador puede volver a crear una sala para su búsqueda abierta.
    await f.bot.button(f.interaction('host')); assert.equal(f.creations(), 2);
  } finally { f.store.close(); }
});

test('salas nunca usadas también se eliminan y no tocan las permanentes', async () => {
  const f = await setup();
  try {
    f.channels.set('permanent', { id: 'permanent', type: ChannelType.GuildVoice, members: new Collection(), delete: () => assert.fail('Sala permanente') });
    await f.bot.button(f.interaction('host')); const r = f.store.voiceRoom(f.search.id);
    await f.bot.voiceRooms.reconcile(f.guild, r.emptySince + NEW_VOICE_GRACE);
    assert.equal(f.store.voiceRoom(f.search.id), null); assert.deepEqual([...f.channels.keys()], ['permanent']);
  } finally { f.store.close(); }
});

test('actualiza permisos al entrar/salir del equipo y rechaza los controles de exintegrantes', async () => {
  const f = await setup();
  try {
    await f.bot.button(f.interaction('host')); const c = f.channels.get('voice-1');
    f.store.leave(f.search.id, 'member'); await f.bot.voiceRooms.reconcile(f.guild);
    assert.ok(!c.options.permissionOverwrites.some(o => o.id === 'member'));
    await assert.rejects(f.bot.voiceRooms.access(f.interaction('member'), f.search.id), /integrantes/);
    f.store.join(f.search.id, 'member'); await f.bot.button(f.interaction('member'));
    assert.ok(c.options.permissionOverwrites.some(o => o.id === 'member')); assert.equal(f.permissionEdits(), 2);
    f.store.deleteProfile('g', 'member'); await f.bot.voiceRooms.reconcile(f.guild);
    assert.ok(!c.options.permissionOverwrites.some(o => o.id === 'member'));
  } finally { f.store.close(); }
});

test('reinicio recupera la sala, incluso cerrada: no corta una conversación y Mis equipos recupera controles', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vex-voice-')); const file = path.join(dir, 'vex.sqlite');
  const f = await setup(file);
  try {
    await f.bot.button(f.interaction('host')); const c = f.channels.get('voice-1'); c.members.set('host', {});
    const s = f.store.search(f.search.id); s.status = 'closed'; f.store.updateSearch(s);
    f.store.close(); f.store = new Store(file); await f.store.migrate(); f.bot.store = f.store;
    f.bot.voiceRooms = new VoiceRooms(f.bot);
    await f.bot.voiceRooms.reconcile(f.guild, Date.now() + 500000);
    assert.equal(f.channels.has('voice-1'), true); assert.equal(f.creations(), 1);
    const i = f.interaction('host'); await f.bot.workflows.myTeams(i); assert.match(payloadText(i), /Acceder a sala de voz/);
    await f.bot.button(f.interaction('member')); assert.equal(f.creations(), 1);
    c.members.clear(); const now = Date.now() + 500001;
    await f.bot.voiceRooms.reconcile(f.guild, now); await f.bot.voiceRooms.reconcile(f.guild, now + EMPTY_VOICE_GRACE);
    assert.equal(f.store.voiceRoom(f.search.id), null);
    await assert.rejects(f.bot.voiceRooms.access(f.interaction('host'), f.search.id), /terminó/);
  } finally { f.store.close(); assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep)); rmSync(dir, { recursive: true }); }
});

test('errores de red, servidor no disponible o Gateway desconectado no borran ni olvidan salas', async () => {
  const f = await setup();
  try {
    await f.bot.button(f.interaction('host')); const r = f.store.voiceRoom(f.search.id);
    f.guild.channels.fetch = async () => { throw Object.assign(new Error('Red'), { code: 500 }); };
    await f.bot.voiceRooms.reconcile(f.guild, r.created + NEW_VOICE_GRACE);
    assert.equal(f.store.voiceRooms('g').length, 1); assert.equal(f.errors.length, 1);
    f.guild.available = false; await f.bot.voiceRooms.reconcile(f.guild, r.created + 500000);
    f.guild.available = true; f.bot.client.isReady = () => false;
    await f.bot.voiceRooms.reconcile(f.guild, r.created + 500000); assert.equal(f.errors.length, 1);
    assert.equal(f.store.voiceRooms('g').length, 1);
  } finally { f.store.close(); }
});

test('borrado manual se recupera y un canal de otro tipo nunca se elimina', async () => {
  const f = await setup();
  try {
    await f.bot.button(f.interaction('host')); f.channels.delete('voice-1');
    await f.bot.voiceRooms.reconcile(f.guild); assert.equal(f.store.voiceRoom(f.search.id), null);
    await f.bot.button(f.interaction('host')); f.channels.get('voice-2').type = ChannelType.GuildText;
    await f.bot.voiceRooms.reconcile(f.guild, Date.now() + 500000);
    assert.equal(f.store.voiceRoom(f.search.id), null); assert.equal(f.channels.has('voice-2'), true);
  } finally { f.store.close(); }
});

test('controles privados: organizador crea, integrante espera y ambos acceden a la sala existente', async () => {
  const f = await setup();
  const voiceButton = p => p.components[0].toJSON().components.at(-1).components[0];
  try {
    const s = f.store.search(f.search.id);
    assert.equal(voiceButton(teamPrivatePayload(s, 'host')).disabled, false);
    assert.equal(voiceButton(teamPrivatePayload(s, 'member')).disabled, true);
    await f.bot.button(f.interaction('host')); const current = f.store.search(s.id);
    assert.equal(voiceButton(teamPrivatePayload(current, 'member')).disabled, false);
  } finally { f.store.close(); }
});
test('migra salas privadas existentes a visibles sin expulsar a sus integrantes', async () => {
  const f = await setup();
  try {
    await f.bot.button(f.interaction('host'));
    const record = f.store.voiceRoom(f.search.id), c = f.channels.get(record.channel);
    delete record.accessVersion; f.store.saveVoiceRoom(record);
    c.options.permissionOverwrites[0] = { id: 'g', deny: [P.ViewChannel, P.Connect] };
    c.members.set('host', {});
    await f.bot.voiceRooms.reconcile(f.guild);
    assert.equal(c.members.size, 1); assert.equal(f.channels.size, 1);
    assert.deepEqual(c.options.permissionOverwrites[0], { id: 'g', allow: [P.ViewChannel], deny: [P.Connect] });
    assert.equal(f.store.voiceRoom(f.search.id).accessVersion, 2);
    await f.bot.voiceRooms.reconcile(f.guild); assert.equal(f.permissionEdits(), 1);
  } finally { f.store.close(); }
});
