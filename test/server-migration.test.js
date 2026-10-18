import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, Collection, PermissionsBitField } from 'discord.js';
import { Store } from '../src/store.js';
import { VexBot } from '../src/bot.js';
import { remapServerText, remapOverwrites, migratedSettings } from '../src/server-migration.js';

test('remapea solo menciones de canal y rol, conservando usuarios y texto ajeno', () => {
  assert.deepEqual(remapServerText({ description: '<#111> <@&222> <@111> 111 <#999>', fields: ['<#111>'] },
    { 111: '333' }, { 222: '444' }), { description: '<#333> <@&444> <@111> 111 <#999>', fields: ['<#333>'] });
});

test('permisos solo incluyen roles remapeados y miembros presentes', () => {
  const overwrites = [{ id: 'old', type: 0, allow: '1024', deny: '0' }, { id: 'staff', type: 0, allow: '8', deny: '0' },
    { id: 'member', type: 1, allow: '1024', deny: '0' }, { id: 'lost', type: 1, allow: '1024', deny: '0' }];
  assert.deepEqual(remapOverwrites(overwrites, { old: 'new' }, new Set(['member'])), [
    { id: 'new', type: 0, allow: '1024', deny: '0' }, { id: 'member', type: 1, allow: '1024', deny: '0' },
  ]);
});

test('configuración copiada no conserva mensajes, salas, enfriamientos ni excepciones del origen', () => {
  const source = { panels: { registro: { channel: '111', message: 'old-message' } },
    roles: [{ id: '222', emoji: '🔺', label: 'THE FINALS' }], moderation: { enabled: true, terms: ['caspita'] },
    finalsRole: '222', teamsChannel: '111', verifiedRole: '222', sponsorRoles: { ospuze: '222' },
    leaderboard: { channel: '111', message: 'old-top', hash: 'old-hash' }, lastFinalsPing: 500,
    community: { welcome: { description: '<#111>' }, welcomeChannel: '111', retired: [{ channel: 'old' }] },
    accessGate: { enabled: true, snapshots: { 111: { name: 'general', publicView: true, overwrites: [] } } },
    chatSearch: { enabled: true, channel: '111', rankedRole: '222', cooldownSeconds: 300, lastReplies: { old: 500 }, terms: ['quién juega', '+1'] } };
  const before = structuredClone(source);
  const target = migratedSettings(source, 'origin', { 111: '333' }, { 222: '444' }, new Set(), 1000);
  assert.deepEqual(source, before);
  assert.deepEqual(target.panels.registro, { channel: '333' });
  assert.deepEqual(target.leaderboard, { channel: '333' });
  assert.equal(target.community.retired, undefined); assert.equal(target.community.welcome.description, '<#333>');
  assert.equal(target.chatSearch.lastReplies, undefined); assert.equal(target.chatSearch.rankedRole, '444');
  assert.deepEqual(target.chatSearch.terms, source.chatSearch.terms);
  assert.notEqual(target.chatSearch.terms, source.chatSearch.terms);
  const empty = migratedSettings({ ...source, chatSearch: { ...source.chatSearch, terms: [] } }, 'origin', { 111: '333' }, { 222: '444' }, new Set(), 1000);
  assert.deepEqual(empty.chatSearch.terms, []);
  assert.equal(target.accessGate.enabled, false); assert.equal(target.accessGate.snapshots['333'].publicView, true);
  assert.deepEqual(target.moderation, source.moderation); assert.equal(target.lastFinalsPing, undefined);
  assert.deepEqual(target.migration, { sourceGuild: 'origin', createdAt: 1000 });
});

test('el primer inicio publica paneles migrados sin ID de mensaje y el siguiente los reutiliza', async () => {
  const store = new Store(':memory:'); await store.migrate();
  try {
    const bot = new VexBot({}, store, {});
    const calls = { sends: 0, edits: 0 };
    const message = { id: 'message', url: 'https://discord.com/channels/g/channel/message', pinned: false,
      pin: async () => { message.pinned = true; } };
    const me = { id: 'bot', roles: {}, permissions: new PermissionsBitField(PermissionsBitField.All) };
    const channel = { id: 'channel', name: 'configurar-perfil', type: ChannelType.GuildText,
      permissionsFor: () => me.permissions, permissionOverwrites: { cache: new Collection(), edit: async () => {} },
      messages: { edit: async id => { assert.equal(id, 'message'); calls.edits++; return message; } },
      send: async () => { calls.sends++; return message; } };
    const guild = { id: 'g', members: { fetchMe: async () => me } };
    bot.channel = async () => channel;
    store.saveSettings('g', { ...store.settings('g'), panels: { registro: { channel: channel.id } } });
    await bot.postPanel(guild, 'registro', channel);
    assert.deepEqual(calls, { sends: 1, edits: 0 });
    assert.equal(store.settings('g').panels.registro.message, 'message'); assert.equal(message.pinned, true);
    await bot.postPanel(guild, 'registro', channel);
    assert.deepEqual(calls, { sends: 1, edits: 1 });
  } finally { store.close(); }
});
