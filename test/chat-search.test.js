import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Collection, MessageType, PermissionsBitField, PermissionFlagsBits as P } from 'discord.js';
import { Store } from '../src/store.js';
import { VexBot } from '../src/bot.js';
import { ChatSearch, lookingForTeam, hasRegion, chatSearchPayload, parseChatSearchTerms } from '../src/chat-search.js';
import { contentIntent, config } from '../src/config.js';
config.roleCreationApprovedGuilds.g=['THE FINALS RANKS','THE FINALS RÁPIDAS'];
import { commands } from '../src/commands.js';

async function fixture() {
  const store = new Store(':memory:'); await store.migrate();
  const bot = new VexBot({}, store, {}); bot.guilds.add('g');
  const roles = new Collection(), sent = [];
  const me = { permissions: new PermissionsBitField(PermissionsBitField.All), roles: { highest: { position: 100 } } };
  const guild = { id: 'g', members: { fetchMe: async () => me } };
  function role(id, name, mentionable = true) {
    const value = { id, name, guild, managed: false, position: 1, permissions: new PermissionsBitField(), mentionable,
      setMentionable: async enabled => { value.mentionable = enabled; return value; } };
    roles.set(id, value); return value;
  }
  role('finals', 'THE FINALS'); role('ranks', 'THE FINALS RANKS'); role('quick', 'THE FINALS RÁPIDAS');
  guild.roles = { cache: roles, fetch: async () => roles, create: async data => role(`r${roles.size}`, data.name, data.mentionable) };
  const channel = { id: 'teams', permissionsFor: () => me.permissions,
    send: async payload => { sent.push(payload); return { id: `sent-${sent.length}`, delete: async () => {} }; } };
  const settings = store.settings('g'); settings.finalsRole = 'finals'; settings.teamsChannel = channel.id;
  settings.chatSearch = { enabled: true, channel: channel.id, cooldownSeconds: 300, rankedRole: 'ranks', quickRole: 'quick' };
  store.saveSettings('g', settings);
  const message = (content = 'quién para jugar soy platino', extra = {}) => ({ id: 'message', guild, guildId: 'g',
    channel, channelId: channel.id, type: MessageType.Default, content, author: { id: 'player', bot: false },
    mentions: { roles: new Collection() }, ...extra });
  return { bot, store, guild, channel, roles, role, message, sent };
}

test('reconoce búsquedas habituales; omite conversación, cuentas, citas y otros juegos', () => {
  for (const text of ['¿Quién juega?', 'quien para jugar soy platino', 'ALGUIEN PARA JUGAR', 'Busco equipo para ranks',
    '¿A quién le falta uno?', 'nos faltan dos', '+1', '+2 ranks SA', 'Busco +1', 'alguien?',
    '¿Alguien disponible?', '¿quien para unas partidas?', 'alguien para rápidas', 'buscamos un compañero']) {
    assert.equal(lookingForTeam(text), true, text);
  }
  for (const text of ['alguien sabe cómo cambiar mi foto', 'hola', 'tengo +10 puntos', '1+1=2', '+1 = 2',
    'no busco equipo', 'ya no busco equipo, ya estamos completos', 'equipo completo, no busco +1',
    'quien juega helldivers', 'busco equipo para Rocket League', '> quien para jugar',
    '>>> ejemplo:\nquien para jugar', '```quién juega```', '`+1`', 'https://example.com/quien-juega']) {
    assert.equal(lookingForTeam(text), false, text);
  }
});

test('región en texto o rol; na coloquial y mensajes sin región mantienen el recordatorio', () => {
  for (const text of ['+1 NA', 'juego en SA', 'región na', 'soy de México', 'servidor Europa', 'LATAM', 'Sudamérica']) {
    assert.equal(hasRegion(text), true, text);
  }
  for (const text of ['quien para jugar soy platino', 'na quien juega', 'platino', '<@&123>']) assert.equal(hasRegion(text), false, text);
  assert.equal(hasRegion('quien juega', [{ name: 'Región NA' }]), true);
});

test('palabras personalizadas reemplazan las automáticas y respetan frases, acentos, signos + y límites de palabra', () => {
  assert.equal(lookingForTeam('QUIÉN    JUEGA soy platino', ['quien juega']), true);
  assert.equal(lookingForTeam('necesito DÚO', ['duo']), true);
  assert.equal(lookingForTeam('duolingo', ['duo']), false);
  assert.equal(lookingForTeam('+ 3 para jugar', ['+3']), true);
  assert.equal(lookingForTeam('+30', ['+3']), false);
  assert.equal(lookingForTeam('1+ ranks', ['1+']), true);
  assert.equal(lookingForTeam('21+ ranks', ['1+']), false);
  assert.equal(lookingForTeam('+1', ['formar squad']), false);
  assert.equal(lookingForTeam('quién juega', ['formar squad']), false);
  assert.equal(lookingForTeam('formar squad', ['formar squad']), true);
  assert.equal(lookingForTeam('quién juega', []), false);
  assert.equal(lookingForTeam('> formar squad', ['formar squad']), false);
  assert.equal(lookingForTeam('`formar squad`', ['formar squad']), false);
  assert.equal(lookingForTeam('https://example.com/formar-squad', ['formar squad']), false);
  assert.equal(lookingForTeam('jugar', ['juga(r|mos)']), false);
});

test('lista limpia duplicados normalizados, acepta - para vaciar y rechaza entradas inválidas', () => {
  assert.deepEqual(parseChatSearchTerms('quién juega, QUIEN   JUEGA, +1, + 1, , 1+'), ['quién juega', '+1', '1+']);
  assert.deepEqual(parseChatSearchTerms(' - '), []);
  assert.deepEqual(parseChatSearchTerms(' , , '), []);
  for (const input of ['.*', '⚡', 'a'.repeat(81), Array.from({ length: 101 }, (_, n) => `p${n}`).join(','), 'a'.repeat(1001)]) {
    assert.throws(() => parseChatSearchTerms(input));
  }
});

test('respuesta genérica contiene solo el rol del juego, sin notificaciones ni datos del perfil', async () => {
  const f = await fixture();
  try {
    const settings = f.store.settings('g'), message = f.message();
    const payload = chatSearchPayload(message, settings);
    assert.equal(payload.content, '<@&finals>');
    assert.deepEqual(payload.allowedMentions, { parse: [], roles: [], users: [], repliedUser: false });
    assert.equal(payload.reply.messageReference, 'message'); assert.equal(payload.reply.failIfNotExists, false);
    message.mentions.roles.set('finals', f.roles.get('finals')).set('ranks', f.roles.get('ranks'));
    message.content += ' NA'; assert.equal(chatSearchPayload(message, settings).content, '<@&finals>');
    f.roles.delete('quick'); assert.equal(chatSearchPayload(message, settings).content, '<@&finals>');
    f.roles.delete('finals'); assert.equal(chatSearchPayload(message, settings), null);
  } finally { f.store.close(); }
});

test('crea roles seguros y reacciones una sola vez; conserva la configuración al reiniciar', async () => {
  const f = await fixture();
  try {
    f.roles.delete('ranks'); f.roles.delete('quick');
    await f.bot.chatSearch.setup(f.guild);
    let settings = f.store.settings('g');
    assert.equal(f.roles.size, 3); assert.equal(settings.roles.length, 2);
    assert.deepEqual(settings.roles.map(r => r.emoji), ['🏆', '⚡']);
    settings.chatSearch.enabled = false; settings.chatSearch.channel = 'other'; f.store.saveSettings('g', settings);
    f.bot.chatSearch = new ChatSearch(f.bot); await f.bot.chatSearch.setup(f.guild);
    settings = f.store.settings('g');
    assert.equal(settings.chatSearch.enabled, false); assert.equal(settings.chatSearch.channel, 'other');
    assert.equal(f.roles.size, 3); assert.equal(settings.roles.length, 2);
  } finally { f.store.close(); }
});

test('canal, servidor y bots filtran respuestas; tener modo y región no impide la tarjeta', async () => {
  const f = await fixture();
  try {
    for (const extra of [{ guildId: null }, { guildId: 'other' }, { channelId: 'general' }, { author: { id: 'bot', bot: true } },
      { webhookId: 'hook' }, { messageSnapshots: new Collection([['forwarded', {}]]) },
      { type: MessageType.ChannelPinnedMessage }]) await f.bot.chatSearch.handle(f.message(undefined, extra));
    assert.equal(f.sent.length, 0);
    const settings = f.store.settings('g'); settings.chatSearch.enabled = false; f.store.saveSettings('g', settings);
    await f.bot.chatSearch.handle(f.message()); assert.equal(f.sent.length, 0);
    settings.chatSearch.enabled = true; f.store.saveSettings('g', settings);
    await f.bot.chatSearch.handle(f.message('quien juega NA', { mentions: { roles: new Collection([
      ['finals', f.roles.get('finals')], ['quick', f.roles.get('quick')],
    ]) } }));
    assert.equal(f.sent.length, contentIntent ? 1 : 0);
  } finally { f.store.close(); }
});

test('lectura apagada evita respuestas', { skip: contentIntent }, async () => {
  const f = await fixture();
  try { await f.bot.chatSearch.handle(f.message()); assert.equal(f.sent.length, 0); }
  finally { f.store.close(); }
});

test('mensajes simultáneos y reinicios conservan una sola búsqueda; espera limita recordatorios y fallo permite reintento', { skip: !contentIntent }, async () => {
  const f = await fixture();
  try {
    await Promise.all([f.bot.handleMessage(f.message()), f.bot.handleMessage(f.message('+2'))]);
    assert.equal(f.sent.length, 1);
    f.bot.chatSearch = new ChatSearch(f.bot);
    await f.bot.handleMessage(f.message()); assert.equal(f.sent.length, 1);
    let settings = f.store.settings('g'); settings.chatSearch.lastReplies.player -= 301000; f.store.saveSettings('g', settings);
    await f.bot.handleMessage(f.message()); assert.equal(f.sent.length, 2);
    const other = f.message('+1', { author: { id: 'other', bot: false } });
    const send = f.channel.send; f.channel.send = async () => { throw new Error('network'); };
    await assert.rejects(f.bot.chatSearch.handle(other));
    assert.equal(f.store.settings('g').chatSearch.lastReplies.other, undefined);
    f.channel.send = send; await f.bot.chatSearch.handle(other); assert.equal(f.sent.length, 3);
  } finally { f.store.close(); }
});

test('la moderación tiene prioridad sobre las sugerencias', { skip: !contentIntent }, async () => {
  const f = await fixture();
  try {
    const settings = f.store.settings('g'); settings.moderation = { enabled: true, terms: ['prohibida'] }; f.store.saveSettings('g', settings);
    let deleted = false;
    await f.bot.handleMessage(f.message('quien juega prohibida', { deletable: true, delete: async () => { deleted = true; } }));
    assert.equal(deleted, true); assert.equal(f.sent.length, 1);
    assert.match(f.sent[0].content, /retiré/); assert.equal(f.store.settings('g').chatSearch.lastReplies, undefined);
  } finally { f.store.close(); }
});

test('comando registrado para Administrador y espera entre 30 y 3600 segundos', () => {
  const command = commands.find(c => c.name === 'busqueda-chat');
  assert.equal(command.default_member_permissions, P.Administrator.toString());
  assert.deepEqual(command.options.map(o => o.name), ['estado', 'activar', 'desactivar', 'palabras', 'restablecer', 'configurar']);
  const options = command.options.find(o => o.name === 'configurar').options;
  assert.equal(options.find(o => o.name === 'espera').min_value, 30);
  const words = command.options.find(o => o.name === 'palabras');
  assert.equal(words.options?.length ?? 0, 0);
});

test('palabras y estado muestran la lista completa, conservan ajustes y cambios inválidos no se guardan', async () => {
  const f = await fixture();
  try {
    f.bot.sendPrivate = async (i, text, extra) => { i.output = text; i.extra = extra; };
    let sub = 'palabras', input = 'quién juega, +1, +2';
    const i = { guild: f.guild, guildId: 'g', options: { getSubcommand: () => sub, getString: () => input } };
    await f.bot.chatSearch.configure(i);
    const cfg = f.store.settings('g').chatSearch;
    assert.deepEqual(cfg.terms, ['quién juega', '+1', '+2']);
    assert.equal(cfg.enabled, true); assert.equal(cfg.channel, 'teams'); assert.equal(cfg.cooldownSeconds, 300);
    assert.match(i.extra.embeds[0].toJSON().description, /quién juega/);
    input = 'a'.repeat(81);
    await assert.rejects(f.bot.chatSearch.configure(i));
    assert.deepEqual(f.store.settings('g').chatSearch.terms, cfg.terms);
    f.bot.chatSearch = new ChatSearch(f.bot); await f.bot.chatSearch.setup(f.guild);
    sub = 'estado'; await f.bot.chatSearch.configure(i);
    assert.deepEqual(f.store.settings('g').chatSearch.terms, cfg.terms);
    assert.match(i.extra.embeds[0].toJSON().description, /quién juega/);
    sub = 'desactivar'; await f.bot.chatSearch.configure(i);
    sub = 'palabras'; input = 'formar squad'; await f.bot.chatSearch.configure(i);
    assert.equal(f.store.settings('g').chatSearch.enabled, false);
    sub = 'restablecer'; await f.bot.chatSearch.configure(i);
    assert.equal(f.store.settings('g').chatSearch.terms, undefined);
    assert.equal(f.store.settings('g').chatSearch.enabled, false);
    assert.match(i.extra.embeds[0].toJSON().footer.text, /predeterminadas/);
  } finally { f.store.close(); }
});

test('el administrador cambia palabras y activar/desactivar afecta los mensajes sin reiniciar', { skip: !contentIntent }, async () => {
  const f = await fixture();
  try {
    f.bot.sendPrivate = async () => {};
    let sub = 'palabras', input = 'formar squad, 1+';
    const i = { guild: f.guild, guildId: 'g', options: { getSubcommand: () => sub, getString: () => input } };
    await f.bot.chatSearch.configure(i);
    await f.bot.handleMessage(f.message('+1')); assert.equal(f.sent.length, 0);
    await f.bot.handleMessage(f.message('formar squad')); assert.equal(f.sent.length, 1);
    sub = 'desactivar'; await f.bot.chatSearch.configure(i);
    const other = f.message('1+', { author: { id: 'other', bot: false } });
    await f.bot.handleMessage(other); assert.equal(f.sent.length, 1);
    sub = 'activar'; await f.bot.chatSearch.configure(i);
    await f.bot.handleMessage(other); assert.equal(f.sent.length, 2);
    sub = 'palabras'; input = '-'; await f.bot.chatSearch.configure(i);
    assert.equal(f.store.settings('g').chatSearch.enabled, false);
    assert.deepEqual(f.store.settings('g').chatSearch.terms, []);
    sub = 'activar'; await assert.rejects(f.bot.chatSearch.configure(i), /Primero configura/);
    assert.equal(f.store.settings('g').chatSearch.enabled, false);
    sub = 'restablecer'; await f.bot.chatSearch.configure(i);
    sub = 'activar'; await f.bot.chatSearch.configure(i);
    await f.bot.handleMessage(f.message('+2', { author: { id: 'third', bot: false } }));
    assert.equal(f.sent.length, 3);
  } finally { f.store.close(); }
});

test('desactivar mientras se consultan permisos impide una respuesta que aún no se ha enviado', { skip: !contentIntent }, async () => {
  const f = await fixture();
  try {
    f.bot.sendPrivate = async () => {};
    const me = await f.guild.members.fetchMe();
    let release, entered;
    const started = new Promise(resolve => { entered = resolve; });
    f.guild.members.fetchMe = async () => { entered(); return new Promise(resolve => { release = resolve; }); };
    const pending = f.bot.chatSearch.handle(f.message());
    await started;
    await f.bot.chatSearch.configure({ guild: f.guild, guildId: 'g', options: { getSubcommand: () => 'desactivar' } });
    release(me); await pending;
    assert.equal(f.sent.length, 0);
  } finally { f.store.close(); }
});

test('administración guarda cambios, conserva otros ajustes y rechaza roles repetidos o con permisos', async () => {
  const f = await fixture();
  try {
    f.bot.channel = async () => f.channel;
    f.bot.sendPrivate = async (i, text) => { i.output = text; };
    const i = { guild: f.guild, guildId: 'g', options: { getSubcommand: () => 'configurar', getChannel: () => f.channel,
      getInteger: () => 120, getRole: () => null } };
    await f.bot.chatSearch.configure(i);
    assert.equal(f.store.settings('g').chatSearch.cooldownSeconds, 120);
    assert.equal(f.store.settings('g').finalsRole, 'finals');
    i.options.getRole = option => option === 'ranks' ? f.roles.get('finals') : null;
    await assert.rejects(f.bot.chatSearch.configure(i), /roles distintos/);
    const dangerous = f.role('admin', 'Admin'); dangerous.permissions.add(P.Administrator);
    i.options.getRole = () => dangerous;
    await assert.rejects(f.bot.chatSearch.configure(i), /no es apto/);
    assert.equal(f.store.settings('g').chatSearch.rankedRole, 'ranks');
    await assert.rejects(f.bot.command({ commandName: 'busqueda-chat', memberPermissions: new PermissionsBitField() }), /Administrador/);
  } finally { f.store.close(); }
});
