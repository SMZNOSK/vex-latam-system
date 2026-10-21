import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Collection, PermissionsBitField, PermissionFlagsBits as P, MessageFlags, MessageFlagsBitField, ChannelType } from 'discord.js';
import { Store } from '../src/store.js';
import { VexBot } from '../src/bot.js';
import { Community } from '../src/community.js';
import { Drafts } from '../src/drafts.js';
import { defaultRules, defaultWelcome, defaultFarewell, legacyFarewell, embedModal, nativePayload, validateEmbed, parseFields, formatFields, welcomePayload } from '../src/community-ui.js';
import { parseEmoji, emojiKey } from '../src/reaction-roles.js';
import { hasMembersIntent } from '../src/gateway-config.js';
import { processRoleJobs } from '../src/setup.js';
import { UserError } from '../src/domain.js';
import { config } from '../src/config.js';
config.roleCreationApprovedGuilds.g=['HELLDIVERS 2','ARC RAIDERS'];

const missing = code => Object.assign(new Error('missing'), { code });
async function fixture() {
  const store = new Store(':memory:'); await store.migrate();
  const bot = new VexBot({ user: { id: 'bot', username: 'VEX LATAM SYSTEM' } }, store, {});
  bot.guilds.add('g'); bot.membersIntent = true;
  bot.log = () => {};
  bot.sendPrivate = async (i, text) => { i.output = text; };
  bot.ackCard = async i => { i.deferred = true; };
  bot.replyCard = async (i, payload) => { i.output = payload; };
  const channels = new Collection(), roles = new Collection(), members = new Collection();
  const guild = { id: 'g', name: 'Vexink’s server', emojis: { cache: new Collection() } };
  const me = { id: 'bot', permissions: new PermissionsBitField(PermissionsBitField.All), roles: { highest: { position: 100 } } };
  function member(id) {
    if (!members.has(id)) {
      const cache = new Collection();
      members.set(id, { id, guild, user: { id, bot: false }, joinedTimestamp: 1000, roles: { cache,
        add: async role => { cache.set(role, roles.get(role)); }, remove: async role => { cache.delete(role); } } });
    }
    return members.get(id);
  }
  function role(id, name, permissions = 0n) {
    const item = { id, name, guild, position: 1, managed: false, permissions: new PermissionsBitField(permissions) };
    roles.set(id, item); return item;
  }
  role('finals', 'THE FINALS'); role('staff', 'Staff', P.ManageMessages);
  guild.roles = { cache: roles, fetch: async id => id ? roles.get(id) : roles,
    create: async data => role(`r${roles.size}`, data.name) };
  guild.members = { fetchMe: async () => me, fetch: async id => member(id) };
  function channel(name) {
    const id = `c${channels.size}`, messages = new Collection(), overwrites = new Collection();
    const result = { id, name, type: ChannelType.GuildText, permissionsFor: () => new PermissionsBitField(PermissionsBitField.All),
      permissionOverwrites: { cache: overwrites, edit: async (target, edits) => {
        let ow = overwrites.get(target) ?? { id: target, type: target === 'bot' ? 1 : 0,
          allow: new PermissionsBitField(), deny: new PermissionsBitField() };
        for (const [key, value] of Object.entries(edits)) {
          ow.allow.remove(P[key]); ow.deny.remove(P[key]);
          if (value === true) ow.allow.add(P[key]); if (value === false) ow.deny.add(P[key]);
        }
        overwrites.set(target, ow); return ow;
      } },
      messages: { cache: messages, fetch: async message => { if (!messages.has(message)) throw missing(10008); return messages.get(message); } },
      send: async payload => {
        const mid = `m${++result.sent}`, reactions = new Collection();
        const message = { id: mid, guild, author: { id: 'bot' }, channelId: id, payload,
          url: `https://discord.com/channels/g/${id}/${mid}`, flags: new MessageFlagsBitField(payload.flags ?? 0), pinned: false,
          reactions: { cache: reactions }, edit: async data => { message.payload = data; return message; },
          pin: async () => { message.pinned = true; }, delete: async () => { messages.delete(mid); },
          react: async emoji => {
            const key = emojiKey(emoji), users = new Collection([['bot', { id: 'bot', bot: true }]]);
            const reaction = { message, emoji: { name: emoji }, me: true, users: { values: users,
              fetch: async () => users } };
            reactions.set(key, reaction); return reaction;
          } };
        messages.set(mid, message); return message;
      }, sent: 0 };
    channels.set(id, result); return result;
  }
  guild.channels = { cache: channels, fetch: async id => { if (!id) return channels; if (!channels.has(id)) throw missing(10003); return channels.get(id); },
    create: async data => channel(data.name) };
  const settings = store.settings('g'); settings.finalsRole = 'finals'; store.saveSettings('g', settings);
  return { bot, store, guild, channel, member, me, role, channels, roles };
}
function command(guild, sub, extra = {}) {
  const i = { guild, guildId: guild.id, user: { id: 'admin' }, commandName: 'embed', memberPermissions: new PermissionsBitField(P.Administrator),
    options: { getSubcommand: () => sub, getString: () => extra.name ?? 'evento', getChannel: () => extra.channel ?? null },
    showModal: async modal => { i.shown = modal.toJSON(); }, ...extra };
  return i;
}
const submitted = (guild, modal, values = {}, user = 'admin') => ({ guild, guildId: guild.id, user: { id: user },
  memberPermissions: new PermissionsBitField(P.Administrator), customId: modal.custom_id,
  fields: { getTextInputValue: id => values[id] ?? ({ title: 'Evento de la comunidad', description: 'Una invitación', fields: '', color: '#ed243b', image: '' })[id] } });

test('embeds nativos, formularios completos, secciones y límites; no habilitan menciones masivas', () => {
  for (const input of [defaultWelcome, defaultRules, { title: 'Vacío opcional', fields: [] }]) {
    const modal = embedModal(new Drafts().create('x', 'g', 'u', { embed: input })).toJSON();
    assert.equal(modal.components.length, 5);
    const p = nativePayload(input); assert.equal(p.flags, undefined); assert.equal(p.embeds.length, 1);
    assert.deepEqual(p.allowedMentions.parse, []); p.embeds[0].toJSON();
  }
  const fields = parseFields('Uno | Texto\\nOtra línea\n[] Dos | Columna');
  assert.equal(fields[0].value, 'Texto\nOtra línea'); assert.equal(fields[1].inline, true);
  assert.deepEqual(parseFields(formatFields(fields)), fields);
  assert.throws(() => parseFields('Sin separador'), UserError);
  for (const patch of [{ color: 'rojo' }, { image: 'file:///x.png' }, { image: 'https://user:pass@example.com/x.png' },
    { fields: Array.from({ length: 26 }, () => ({ name: 'a', value: 'b' })) }, { description: 'x'.repeat(4097) }]) {
    assert.throws(() => validateEmbed({ title: 'Prueba', ...patch }), UserError);
  }
  assert.equal(hasMembersIntent(0), false); assert.equal(hasMembersIntent(1 << 15), true); assert.equal(hasMembersIntent(1 << 14), true);
});

test('prepara cuatro canales públicos, staff, reacciones y dos paneles fijados; reiniciar no duplica', async () => {
  const { bot, guild, store, channels } = await fixture();
  try {
    await bot.community.setup(guild);
    assert.deepEqual([...channels.values()].map(c => c.name), ['bienvenidos', 'despedidas', 'reglas', 'seleccion-de-roles']);
    const initial = store.settings('g');
    assert.equal(initial.roles.length, 3);
    for (const channel of channels.values()) {
      assert.equal(channel.permissionOverwrites.cache.get('g').deny.has(P.SendMessages), true);
      assert.equal(channel.permissionOverwrites.cache.get('g').allow.has(P.ViewChannel), true);
      assert.equal(channel.permissionOverwrites.cache.get('staff').allow.has(P.SendMessages), true);
    }
    const roleChannel = channels.get(initial.panels.roles.channel);
    assert.equal(roleChannel.permissionOverwrites.cache.get('g').allow.has(P.AddReactions), true);
    assert.equal(roleChannel.messages.cache.first().reactions.cache.size, 3);
    assert.equal(roleChannel.messages.cache.first().pinned, true);
    assert.equal(roleChannel.messages.cache.first().payload.components.length, 0);
    bot.community = new Community(bot); await bot.community.setup(guild);
    assert.deepEqual(store.settings('g').panels, initial.panels);
    assert.equal(channels.size, 4); assert.equal([...channels.values()].reduce((n,c) => n+c.sent, 0), 2);
  } finally { store.close(); }
});

test('sustituye antiguos Components V2, conserva reglas y roles sin emoji, y retira la publicación anterior', async () => {
  const { bot, guild, store, channel } = await fixture();
  try {
    const c = channel('reglas'), old = await c.send({ flags: MessageFlags.IsComponentsV2 });
    const settings = store.settings('g'); settings.panels.reglas = { channel: c.id, message: old.id };
    settings.rulesRaw = 'Mis reglas anteriores'; settings.roles.push({ id: 'legacy', label: 'Anterior' }); store.saveSettings('g', settings);
    await bot.community.setup(guild);
    assert.equal(c.messages.cache.has(old.id), false);
    assert.equal(store.settings('g').community.rules.description, 'Mis reglas anteriores');
    assert.deepEqual(store.settings('g').roles.find(r => r.id === 'legacy'), { id: 'legacy', label: 'Anterior' });
  } finally { store.close(); }
});

test('roles múltiples: agrega y quita con eventos repetidos, ignora botones antiguos, emojis ajenos y bots', async () => {
  const { bot, guild, store, member, channels } = await fixture();
  try {
    await bot.community.setup(guild);
    const ref = store.settings('g').panels.roles, message = channels.get(ref.channel).messages.cache.get(ref.message);
    const maps = store.settings('g').roles, user = { id: 'u', bot: false };
    const reaction = index => ({ message, emoji: { name: maps[index].emoji } });
    await Promise.all([bot.community.reactions.handle(reaction(0), user, true), bot.community.reactions.handle(reaction(1), user, true)]);
    await bot.community.reactions.handle(reaction(1), user, true);
    assert.equal(member('u').roles.cache.size, 2);
    await bot.community.reactions.handle(reaction(1), user, false);
    assert.equal(member('u').roles.cache.has(maps[0].id), true); assert.equal(member('u').roles.cache.has(maps[1].id), false);
    await bot.community.reactions.handle({ message, emoji: { name: '💩' } }, user, true);
    await bot.community.reactions.handle(reaction(2), { id: 'robot', bot: true }, true);
    await bot.community.reactions.handle({ message: { ...message, id: 'old' }, emoji: { name: maps[2].emoji } }, user, true);
    assert.equal(store.reactionChoice('g', 'u', maps[2].id), false);
    assert.equal(store.reactionChoice('g', 'robot', maps[2].id), false);
    const custom = '123456789012345678'; guild.emojis.cache.set(custom, {});
    assert.equal(parseEmoji(`<:vex:${custom}>`, guild).emojiKey, custom);
    assert.equal(emojiKey('❤️'), emojiKey('❤'));
    assert.throws(() => parseEmoji('rojo', guild), UserError); assert.throws(() => parseEmoji('🎮🔥', guild), UserError);
  } finally { store.close(); }
});

test('THE FINALS combina perfil y reacción; eliminar una fuente no retira el rol de la otra', async () => {
  const { bot, guild, store, member } = await fixture();
  try {
    store.saveProfile('g', 'u', { embarkId: 'User#1234' }); await processRoleJobs(bot, guild);
    assert.equal(member('u').roles.cache.has('finals'), true);
    store.chooseReaction('g', 'u', 'finals', false); await bot.community.reactions.process(guild);
    assert.equal(member('u').roles.cache.has('finals'), true);
    store.chooseReaction('g', 'u', 'finals', true); store.deleteProfile('g', 'u'); await processRoleJobs(bot, guild);
    assert.equal(member('u').roles.cache.has('finals'), true);
    store.chooseReaction('g', 'u', 'finals', false); await bot.community.reactions.process(guild);
    assert.equal(member('u').roles.cache.has('finals'), false);
  } finally { store.close(); }
});

test('falta Administrar roles o el rol es peligroso: persiste pendiente y reintenta sin otorgar privilegios', async () => {
  const { bot, guild, store, member, me, roles } = await fixture();
  try {
    me.permissions.remove([P.Administrator, P.ManageRoles]); store.chooseReaction('g', 'u', 'finals', true);
    await bot.community.reactions.process(guild);
    assert.equal(member('u').roles.cache.has('finals'), false);
    assert.equal(store.reactionJobs('g', Date.now() + 61000).length, 1);
    roles.get('finals').permissions.add(P.Administrator); me.permissions.add(P.ManageRoles);
    store.db.exec('UPDATE reaction_role_jobs SET next=0'); await bot.community.reactions.process(guild);
    assert.equal(member('u').roles.cache.has('finals'), false);
    roles.get('finals').permissions.remove(P.Administrator); store.db.exec('UPDATE reaction_role_jobs SET next=0');
    await bot.community.reactions.process(guild); assert.equal(member('u').roles.cache.has('finals'), true);
    assert.equal(store.reactionJobs('g').length, 0);
  } finally { store.close(); }
});

test('reconcilia reacciones de mensajes antiguos tras reiniciar; una reacción en vivo prevalece sobre la foto anterior', async () => {
  const { bot, guild, store, channels, member } = await fixture();
  try {
    await bot.community.setup(guild);
    const ref = store.settings('g').panels.roles, message = channels.get(ref.channel).messages.cache.get(ref.message);
    const reaction = message.reactions.cache.first();
    reaction.users.values.set('offline', { id: 'offline', bot: false });
    store.chooseReaction('g', 'gone', 'finals', true); await bot.community.reactions.process(guild);
    await bot.community.reactions.reconcile(guild);
    assert.equal(member('offline').roles.cache.has('finals'), true); assert.equal(member('gone').roles.cache.has('finals'), false);
    reaction.users.fetch = async () => {
      const snapshot = new Collection([['race', { id: 'race', bot: false }]]);
      await bot.community.reactions.handle(reaction, { id: 'race', bot: false }, false);
      return snapshot;
    };
    await bot.community.reactions.reconcile(guild);
    assert.equal(store.reactionChoice('g', 'race', 'finals'), false);
  } finally { store.close(); }
});

test('bienvenida solo al nuevo miembro, enlaces, deduplicación por entrada, apagado y falta de intent', async () => {
  const { bot, guild, store, member, channels } = await fixture();
  try {
    await bot.community.setup(guild); const u = member('new');
    const c = channels.get(store.settings('g').community.welcomeChannel);
    bot.membersIntent = false; await bot.community.welcome(u); assert.equal(c.sent, 0);
    bot.membersIntent = true; await Promise.all([bot.community.welcome(u), bot.community.welcome(u)]); assert.equal(c.sent, 1);
    const payload = c.messages.cache.first().payload;
    assert.deepEqual(payload.allowedMentions.users, ['new']); assert.deepEqual(payload.allowedMentions.parse, []);
    assert.ok(payload.embeds[0].toJSON().fields[2].value.includes(`<#${store.settings('g').panels.roles.channel}>`));
    const settings = store.settings('g'); settings.community.welcomeEnabled = false; store.saveSettings('g', settings);
    await bot.community.welcome(member('other')); assert.equal(c.sent, 1);
    settings.community.welcomeEnabled = true; store.saveSettings('g', settings); u.joinedTimestamp++;
    await bot.community.welcome(u); assert.equal(c.sent, 2);
    assert.equal(welcomePayload(u, settings).content, '<@new>');
  } finally { store.close(); }
});

test('tarjetas de entrada y salida adjuntan PNG; despedida no menciona ni avisa al usuario', async () => {
  const { bot, guild, store, member, channels } = await fixture();
  try {
    await bot.community.setup(guild);
    const rendered = []; bot.memberCards = { render: async (kind, m) => { rendered.push([kind, m.id]); return Buffer.from('png'); } };
    const u = member('new'); await bot.community.welcome(u);
    const welcome = channels.get(store.settings('g').community.welcomeChannel).messages.cache.first().payload;
    assert.equal(welcome.files[0].name, 'vex-welcome.png'); assert.equal(welcome.embeds[0].toJSON().image.url, 'attachment://vex-welcome.png');
    assert.deepEqual(welcome.allowedMentions.users, ['new']);
    await Promise.all([bot.community.farewell(u), bot.community.farewell(u)]);
    const channel = channels.get(store.settings('g').community.farewellChannel), farewell = channel.messages.cache.first().payload;
    assert.equal(channel.sent, 1); assert.equal(farewell.files[0].name, 'vex-farewell.png');
    assert.deepEqual(farewell.allowedMentions.users, []); assert.deepEqual(farewell.allowedMentions.parse, []);
    assert.equal(farewell.components.length, 0); assert.deepEqual(rendered, [['welcome', 'new'], ['farewell', 'new']]);
    bot.community = new Community(bot); await bot.community.farewell(u); assert.equal(channel.sent, 1);
    u.joinedTimestamp++; await bot.community.farewell(u); assert.equal(channel.sent, 2);
  } finally { store.close(); }
});

test('salidas parciales, bots, otro servidor y despedidas desactivadas respetan controles', async () => {
  const { bot, guild, store, member, channels } = await fixture();
  try {
    await bot.community.setup(guild);
    const c = channels.get(store.settings('g').community.farewellChannel), u = member('gone');
    u.joinedTimestamp = null; await bot.community.farewell(u); await bot.community.farewell(u); assert.equal(c.sent, 1);
    bot.membersIntent = false; await bot.community.farewell(member('no-intent')); assert.equal(c.sent, 1); bot.membersIntent = true;
    const automatic = member('bot'); automatic.user.bot = true; await bot.community.farewell(automatic); assert.equal(c.sent, 1);
    await bot.community.farewell({ id: 'outside', guild: { id: 'other' }, user: {} }); assert.equal(c.sent, 1);
    const settings = store.settings('g'); settings.community.farewellEnabled = false; store.saveSettings('g', settings);
    await bot.community.farewell(member('disabled')); assert.equal(c.sent, 1);
  } finally { store.close(); }
});

test('fallo de renderizado o Adjuntar archivos mantiene el mensaje nativo y su deduplicación', async () => {
  const { bot, guild, store, member, channels } = await fixture();
  try {
    await bot.community.setup(guild);
    bot.memberCards = { render: async () => { throw new Error('browser unavailable'); } };
    await bot.community.welcome(member('fallback'));
    const c = channels.get(store.settings('g').community.welcomeChannel); assert.equal(c.messages.cache.first().payload.files, undefined);
    bot.memberCards = { render: async () => Buffer.from('png') };
    const farewell = channels.get(store.settings('g').community.farewellChannel), original = farewell.send;
    let rejected = 0;
    farewell.send = async p => { if (p.files) { rejected++; throw missing(50013); } return original(p); };
    const u = member('no-attachment'); await bot.community.farewell(u); await bot.community.farewell(u);
    assert.equal(rejected, 1); assert.equal(farewell.sent, 1);
    assert.equal(farewell.messages.cache.first().payload.embeds[0].toJSON().image, undefined);
    assert.ok(store.farewelled('g', u.id, u.joinedTimestamp));
  } finally { store.close(); }
});

test('probar despedida es privado y editar/activar/desactivar no publica salidas sintéticas', async () => {
  const { bot, guild, store, member, channels } = await fixture();
  try {
    await bot.community.setup(guild); member('admin');
    bot.memberCards = { render: async () => Buffer.from('png') };
    const i = command(guild, 'probar', { commandName: 'despedida', deferReply: async p => { i.deferredPayload = p; }, editReply: async p => { i.privatePayload = p; return { id: 'preview' }; } });
    await bot.community.command(i); assert.equal(i.deferredPayload.flags, MessageFlags.Ephemeral);
    assert.equal(i.privatePayload.files[0].name, 'vex-farewell.png');
    const c = channels.get(store.settings('g').community.farewellChannel); assert.equal(c.sent, 0);
    for (const sub of ['desactivar', 'activar']) {
      await bot.community.command(command(guild, sub, { commandName: 'despedida', deferReply: async () => {} }));
      assert.equal(store.settings('g').community.farewellEnabled, sub === 'activar');
    }
    const edit = command(guild, 'editar', { commandName: 'despedida' }); await bot.community.command(edit);
    await bot.community.handle(submitted(guild, edit.shown, { title: 'Nos vemos, {usuario}', description: 'GG en {servidor}.' }));
    assert.equal(store.settings('g').community.farewell.title, 'Nos vemos, {usuario}'); assert.equal(c.sent, 0);
  } finally { store.close(); }
});

test('actualiza la despedida predeterminada a carrilla y conserva textos personalizados', async () => {
  const f = await fixture();
  try {
    let settings = f.store.settings('g'); settings.community = { farewell: structuredClone(legacyFarewell) }; f.store.saveSettings('g', settings);
    await f.bot.community.setup(f.guild); assert.deepEqual(f.store.settings('g').community.farewell, defaultFarewell);
    settings = f.store.settings('g'); settings.community.farewell.description = 'Mi despedida personalizada'; f.store.saveSettings('g', settings);
    await f.bot.community.setup(f.guild); assert.equal(f.store.settings('g').community.farewell.description, 'Mi despedida personalizada');
  } finally { f.store.close(); }
});

test('editor crea, edita el mismo mensaje, rechaza ediciones concurrentes/ajenas y retira solo su tarjeta', async () => {
  const { bot, guild, store, channel } = await fixture();
  try {
    const c = channel('anuncios'), other = await c.send(nativePayload({ title: 'Otra tarjeta' }));
    const create = command(guild, 'crear', { channel: c }); await bot.community.command(create);
    await assert.rejects(() => bot.community.handle(submitted(guild, create.shown, {}, 'intruso')), UserError);
    await bot.community.handle(submitted(guild, create.shown));
    const initial = store.embed('g', 'evento'); assert.equal(c.sent, 2);
    const first = command(guild, 'editar'); await bot.community.command(first);
    const second = command(guild, 'editar', { user: { id: 'another-admin' } }); await bot.community.command(second);
    await bot.community.handle(submitted(guild, first.shown, { title: 'Actualizado' }));
    await assert.rejects(() => bot.community.handle(submitted(guild, second.shown, {}, 'another-admin')), UserError);
    assert.equal(store.embed('g', 'evento').message, initial.message); assert.equal(c.sent, 2);
    const retire = command(guild, 'retirar'); await bot.community.command(retire);
    const custom = retire.output.components[0].toJSON().components.find(x => x.type === 1).components[0].custom_id;
    await bot.community.handle({ ...submitted(guild, { custom_id: custom }), fields: null });
    assert.equal(store.embed('g', 'evento'), null); assert.equal(c.messages.cache.has(other.id), true);
    const denied = command(guild, 'crear', { channel: c, memberPermissions: new PermissionsBitField() });
    await assert.rejects(() => bot.community.command(denied), UserError);
  } finally { store.close(); }
});

test('editores de reglas y roles conservan sus mensajes; texto de bienvenida editable se valida y persiste', async () => {
  const { bot, guild, store, channels } = await fixture();
  try {
    await bot.community.setup(guild);
    const previous = structuredClone(store.settings('g').panels);
    for (const kind of ['roles', 'reglas']) {
      const i = command(guild, kind === 'roles' ? 'editar' : 'unused', { commandName: kind, channel: channels.get(previous[kind].channel) });
      await bot.community.command(i);
      await bot.community.handle(submitted(guild, i.shown, { title: `Personalizado ${kind}`, description: 'Texto propio', fields: 'Detalle | Información' }));
      const ref = store.settings('g').panels[kind]; assert.equal(ref.message, previous[kind].message);
      const embed = channels.get(ref.channel).messages.cache.get(ref.message).payload.embeds[0].toJSON();
      assert.equal(embed.title, `Personalizado ${kind}`);
      if (kind === 'roles') assert.ok(embed.description.includes('<@&finals>'));
    }
    const i = command(guild, 'editar', { commandName: 'bienvenida' }); await bot.community.command(i);
    await bot.community.handle(submitted(guild, i.shown, { description: 'Hola {usuario}, pasa a {reglas}.', fields: '' }));
    assert.ok(welcomePayload({ id: 'u', guild }, store.settings('g')).embeds[0].toJSON().description.includes('<@u>'));
  } finally { store.close(); }
});

test('migración desde v2 respalda sin recalcular perfiles y conserva embeds, elecciones y recibos al reabrir', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vex-community-')), file = path.join(dir, 'db.sqlite');
  let store = new Store(file);
  try {
    await store.migrate(); store.saveProfile('g', 'u', { score: 43000, rank: 'Diamante 3', schemaVersion: 2 });
    store.db.exec('PRAGMA user_version=2'); const snapshot = await store.migrate(); assert.equal(existsSync(snapshot), true);
    assert.equal(store.profile('g', 'u').rank, 'Diamante 3');
    store.saveEmbed('g', { name: 'evento', message: 'm', channel: 'c', embed: defaultRules, version: 1 });
    store.chooseReaction('g', 'u', 'r', true); store.saveWelcome('g', 'u', 1000, 'message');
    store.close(); store = new Store(file);
    assert.equal(await store.migrate(), null); assert.equal(store.embed('g', 'evento').message, 'm');
    assert.equal(store.reactionChoice('g', 'u', 'r'), true); assert.equal(store.welcomed('g', 'u', 1000), true);
    assert.equal(store.reactionJobs('g').length, 1);
  } finally { store.close(); rmSync(dir, { recursive: true }); }
});
