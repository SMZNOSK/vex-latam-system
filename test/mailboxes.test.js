import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, Collection, MessageFlags, PermissionsBitField, PermissionFlagsBits as P } from 'discord.js';
import { Store } from '../src/store.js';
import { VexBot } from '../src/bot.js';
import { Mailboxes, isAdministrativeCommand } from '../src/mailboxes.js';
import { mailboxModal } from '../src/mailbox-ui.js';
import { commands } from '../src/commands.js';
import { originalPermissions } from '../src/access-gate.js';
import { config } from '../src/config.js';

const missing = code => Object.assign(new Error('missing'), { code });
async function fixture(guildId = config.testGuildId) {
  const store = new Store(':memory:'); await store.migrate();
  const roles = new Collection(), channels = new Collection(), members = new Collection(); let serial = 0;
  const guild = { id: guildId };
  for (const [id, permissions] of [[guildId, P.ViewChannel | P.SendMessages | P.ReadMessageHistory], ['manager', P.ManageGuild], ['administrator', P.Administrator]]) {
    roles.set(id, { id, permissions: new PermissionsBitField(permissions) });
  }
  const me = { id: 'bot', permissions: new PermissionsBitField(PermissionsBitField.All) };
  guild.roles = { cache: roles, fetch: async () => roles };
  guild.members = { fetchMe: async () => me, fetch: async arg => {
    const id = typeof arg === 'string' ? arg : arg.user;
    if (!members.has(id)) throw missing(10007); return members.get(id);
  } };
  const member = (id, roleIds = []) => {
    const item = { id, user: { id, username: 'same-name' }, roles: { cache: new Collection(roleIds.map(r => [r, roles.get(r)])) } };
    members.set(id, item); return item;
  };
  member('sender-secret'); member('target-a'); member('target-b');
  function overwrites(data) {
    return new Collection(data.map(o => [o.id, { ...o, allow: new PermissionsBitField(o.allow), deny: new PermissionsBitField(o.deny) }]));
  }
  guild.channels = { cache: channels, fetch: async id => {
    if (!id) return channels; if (!channels.has(id)) throw missing(10003); return channels.get(id);
  }, create: async data => {
    const messages = new Collection();
    const c = { id: `channel-${++serial}`, guild, name: data.name, type: data.type, parentId: data.parent ?? null, sent: 0, edits: 0,
      canSend: true, permissionsFor: () => new PermissionsBitField(c.canSend ? PermissionsBitField.All : P.ViewChannel),
      permissionOverwrites: { cache: overwrites(data.permissionOverwrites), set: async values => { c.permissionOverwrites.cache = overwrites(values); } },
      edit: async values => { c.name = values.name; c.parentId = values.parent; return c; },
      messages: { cache: messages, fetch: async arg => {
        if (typeof arg === 'object') return messages;
        if (!messages.has(arg)) throw missing(10008); return messages.get(arg);
      } },
      send: async payload => {
        if (c.failSend) throw missing(50013);
        const wire = JSON.parse(JSON.stringify(payload));
        const m = { id: `message-${++serial}`, author: { id: 'bot' }, payload: wire, components: wire.components,
          pinned: false, pin: async () => { m.pinned = true; },
          edit: async next => { m.payload = JSON.parse(JSON.stringify(next)); m.components = m.payload.components; c.edits++; return m; } };
        messages.set(m.id, m); c.sent++; return m;
      } };
    channels.set(c.id, c); return c;
  } };
  const bot = new VexBot({ user: { id: 'bot' }, ws: { ping: 1 }, guilds: { fetch: async () => guild } }, store, {});
  bot.guilds.add(guildId); bot.log = () => {};
  await bot.mailboxes.setup(guild);
  const settings = () => store.settings(guildId).mailboxes;
  const channel = key => channels.get(settings().channels[key]);
  function interaction(extra = {}) {
    const i = { guild, guildId, channelId: channel('feedbackPublic').id, user: { id: 'sender-secret', username: 'secret-name' },
      memberPermissions: new PermissionsBitField(), replies: [], modals: [],
      inGuild: () => true, isButton: () => true, isModalSubmit: () => false, isChatInputCommand: () => false,
      isStringSelectMenu: () => false, showModal: async m => { i.modals.push(m.toJSON()); },
      deferReply: async p => { i.deferred = true; i.replies.push(p); },
      reply: async p => { i.replied = true; i.replies.push(p); }, editReply: async p => { i.replies.push(p); },
      followUp: async p => { i.replies.push(p); }, ...extra };
    return i;
  }
  async function open(kind, extra = {}) {
    const panel = settings().panels[kind];
    const i = interaction({ customId: `mailbox:open:${kind}`, channelId: panel.channel,
      message: { id: panel.message, author: { id: 'bot' } }, ...extra });
    await bot.interaction(i); return i;
  }
  function submit(opened, values = {}, extra = {}) {
    return interaction({ customId: opened.modals[0].custom_id, channelId: opened.channelId,
      isButton: () => false, isModalSubmit: () => true,
      fields: { getTextInputValue: key => ({ subject: 'Idea', body: 'Mi mensaje', evidence: '', ...values })[key],
        getCheckbox: () => values.anonymous ?? false,
        getSelectedUsers: () => new Collection((values.targets ?? ['target-b']).map(id => [id, members.get(id)?.user ?? { id, username: 'gone' }])) }, ...extra });
  }
  return { store, bot, guild, settings, channel, channels, roles, member, members, interaction, open, submit };
}

test('crea la estructura, preserva privacidad de admins y mantiene una copia de cada cartel tras reiniciar', async () => {
  const f = await fixture();
  try {
    assert.equal(f.channels.size, 8);
    const normal = f.member('ordinary'), manager = f.member('manage-guild', ['manager']), admin = f.member('admin', ['administrator']);
    for (const key of ['adminCategory', 'adminCommands', 'feedbackInbox', 'reportInbox', 'testing']) {
      const c = f.channel(key), list = [...c.permissionOverwrites.cache.values()].map(o => ({ ...o, allow: o.allow.bitfield, deny: o.deny.bitfield }));
      assert.equal(originalPermissions(f.guild, normal, list).has(P.ViewChannel), false);
      assert.equal(originalPermissions(f.guild, manager, list).has(P.ViewChannel), false);
      assert.equal(originalPermissions(f.guild, admin, list).has(P.ViewChannel), true);
    }
    for (const key of ['feedbackPublic', 'reportPublic']) {
      const c = f.channel(key), list = [...c.permissionOverwrites.cache.values()].map(o => ({ ...o, allow: o.allow.bitfield, deny: o.deny.bitfield }));
      const permissions = originalPermissions(f.guild, normal, list);
      assert.equal(permissions.has(P.ViewChannel), true); assert.equal(permissions.has(P.SendMessages), false);
      assert.equal(permissions.has(P.CreatePublicThreads), false); assert.equal(c.sent, 1);
    }
    const previous = JSON.stringify(f.settings());
    f.bot.mailboxes = new Mailboxes(f.bot); await f.bot.mailboxes.setup(f.guild);
    assert.equal(JSON.stringify(f.settings()), previous); assert.equal(f.channels.size, 8);
    for (const key of ['feedbackPublic', 'reportPublic']) {
      assert.equal(f.channel(key).sent, 1); assert.equal(f.channel(key).edits, 1);
      assert.equal(f.channel(key).messages.cache.first().pinned, true);
    }
    const settings = f.store.settings(f.guild.id); delete settings.mailboxes.panels.feedback; f.store.saveSettings(f.guild.id, settings);
    await f.bot.mailboxes.setup(f.guild); assert.equal(f.channel('feedbackPublic').sent, 1);
    const panel = f.settings().panels.report; f.channel('reportPublic').messages.cache.delete(panel.message);
    await f.bot.mailboxes.setup(f.guild); assert.equal(f.channel('reportPublic').messages.cache.size, 1);
  } finally { f.store.close(); }
});

test('el servidor oficial recibe referencias propias sin canal de pruebas', async () => {
  const f = await fixture('official');
  try {
    assert.equal(f.channels.size, 7); assert.equal(f.settings().channels.testing, undefined);
    assert.ok(![...f.channels.values()].some(c => c.name === 'pruebas-bot'));
    assert.equal(f.store.settings(config.testGuildId).mailboxes, undefined);
  } finally { f.store.close(); }
});

test('los formularios usan checkbox opcional y selector nativo de un usuario', () => {
  const feedback = mailboxModal({ id: 'draft', kind: 'feedback' }).toJSON();
  const report = mailboxModal({ id: 'draft', kind: 'report' }).toJSON();
  assert.equal(feedback.components[2].component.type, 23); assert.equal(feedback.components[2].component.default, false);
  assert.equal(report.components[0].component.type, 5); assert.equal(report.components[0].component.max_values, 1);
  assert.equal(report.components[2].component.required, false);
});

for (const anonymous of [true, false]) test(`feedback ${anonymous ? 'anónimo' : 'identificado'} solo llega al buzón con confirmación privada`, async () => {
  const f = await fixture();
  try {
    const opened = await f.open('feedback'), submit = f.submit(opened, { anonymous, body: '@everyone ' + '*'.repeat(2900) });
    await f.bot.interaction(submit);
    const inbox = f.channel('feedbackInbox'); assert.equal(inbox.sent, 1);
    const payload = JSON.stringify(inbox.messages.cache.first().payload);
    assert.equal(payload.includes('sender-secret'), !anonymous); assert.ok(payload.includes(anonymous ? 'Anónimo' : 'Enviado por'));
    assert.deepEqual(inbox.messages.cache.first().payload.allowedMentions.parse, []);
    assert.equal(submit.replies[0].flags, MessageFlags.Ephemeral); assert.match(submit.replies.at(-1).content, /entregado/);
    assert.equal(f.channel('feedbackPublic').sent, 1); assert.equal(f.channel('feedbackPublic').edits, 0);
    assert.equal(f.bot.mailboxes.drafts.items.size, 0); assert.ok(!JSON.stringify(f.settings()).includes('sender-secret'));
    await f.bot.interaction(submit); assert.equal(inbox.sent, 1);
  } finally { f.store.close(); }
});

test('reporte entrega el ID seleccionado entre nombres iguales, autor y evidencia solo en privado', async () => {
  const f = await fixture();
  try {
    const opened = await f.open('report'), submit = f.submit(opened, { evidence: 'https://discord.com/channels/g/c/m' });
    await f.bot.interaction(submit);
    const inbox = f.channel('reportInbox'); assert.equal(inbox.sent, 1);
    const payload = JSON.stringify(inbox.messages.cache.first().payload);
    assert.ok(payload.includes('target-b')); assert.ok(!payload.includes('target-a')); assert.ok(payload.includes('sender-secret'));
    assert.ok(payload.includes('https://discord.com/channels/g/c/m'));
    assert.equal(submit.replies[0].flags, MessageFlags.Ephemeral); assert.equal(f.channel('reportPublic').sent, 1);
    assert.equal(f.channel('feedbackInbox').sent, 0);
  } finally { f.store.close(); }
});

test('destinos expuestos se bloquean antes de publicar y se reparan sin duplicados', async () => {
  const f = await fixture();
  try {
    for (const key of ['feedbackInbox', 'adminCategory']) {
      const opened = await f.open('feedback'), submit = f.submit(opened);
      f.channel(key).permissionOverwrites.cache.get(f.guild.id).deny.remove(P.ViewChannel);
      await f.bot.interaction(submit); assert.equal(f.channel('feedbackInbox').sent, 0);
      assert.match(submit.replies.at(-1).content, /permisos privados/); assert.ok(f.bot.mailboxes.pending.has(f.guild.id));
      await f.bot.mailboxes.tick(f.guild); assert.equal(f.channels.size, 8);
    }
    const opened = await f.open('report'), submit = f.submit(opened);
    f.channel('reportInbox').permissionOverwrites.cache.set('manager', { id: 'manager', type: 0, allow: new PermissionsBitField(P.ViewChannel), deny: new PermissionsBitField() });
    await f.bot.interaction(submit); assert.equal(f.channel('reportInbox').sent, 0);
    await f.bot.mailboxes.tick(f.guild); await f.bot.interaction(submit); assert.equal(f.channel('reportInbox').sent, 1);
  } finally { f.store.close(); }
});

test('formularios ajenos, caducados y botones fuera del cartel registrado no entregan datos', async () => {
  const f = await fixture();
  try {
    const forged = await f.open('feedback', { message: { id: 'forged', author: { id: 'bot' } } }); assert.equal(forged.modals.length, 0);
    const opened = await f.open('feedback');
    for (const extra of [{ user: { id: 'other' } }, { channelId: f.channel('testing').id }]) {
      const submit = f.submit(opened, {}, extra); await f.bot.interaction(submit); assert.equal(f.channel('feedbackInbox').sent, 0);
      assert.equal(submit.replies[0].flags, MessageFlags.Ephemeral);
    }
    const submit = f.submit(opened); f.bot.mailboxes.drafts.items.values().next().value.expires = 0;
    await f.bot.interaction(submit); assert.match(submit.replies[0].content, /caducó/);
    const elsewhere = f.submit(opened, {}, { guildId: 'elsewhere' }); await f.bot.interaction(elsewhere); assert.equal(elsewhere.replies.length, 0);
  } finally { f.store.close(); }
});

test('rechaza evidencia inválida y usuario que salió; errores de entrega nunca confirman éxito', async () => {
  const f = await fixture();
  try {
    for (const values of [{ evidence: 'javascript:alert(1)' }, { targets: [] }, { targets: ['target-a', 'target-b'] }, { body: '  ' }]) {
      const submit = f.submit(await f.open('report'), values); await f.bot.interaction(submit); assert.equal(f.channel('reportInbox').sent, 0);
    }
    const gone = f.submit(await f.open('report'), { targets: ['gone'] }); await f.bot.interaction(gone);
    assert.match(gone.replies.at(-1).content, /ya no pertenece/);
    const blocked = f.submit(await f.open('feedback')); f.channel('feedbackInbox').canSend = false;
    await f.bot.interaction(blocked); assert.match(blocked.replies.at(-1).content, /no puede entregar/);
    f.channel('feedbackInbox').canSend = true; f.channel('feedbackInbox').failSend = true;
    await f.bot.interaction(blocked); assert.ok(!blocked.replies.some(p => /entregado/.test(p.content)));
    f.channel('feedbackInbox').failSend = false; await f.bot.interaction(blocked); assert.equal(f.channel('feedbackInbox').sent, 1);
  } finally { f.store.close(); }
});

test('doble envío concurrente entrega una vez; comandos administrativos solo en admin-bot y para Administrador', async () => {
  const f = await fixture();
  try {
    const opened = await f.open('feedback'); await Promise.all([f.bot.interaction(f.submit(opened)), f.bot.interaction(f.submit(opened))]);
    assert.equal(f.channel('feedbackInbox').sent, 1);
    for (const c of commands.filter(c => isAdministrativeCommand(c.name))) {
      assert.equal(c.default_member_permissions, String(P.Administrator));
      for (const channelId of [f.channel('testing').id, f.channel('feedbackPublic').id]) {
        const i = f.interaction({ commandName: c.name, channelId, memberPermissions: new PermissionsBitField(P.Administrator), isButton: () => false, isChatInputCommand: () => true });
        await f.bot.interaction(i); assert.match(i.replies[0].content, /#admin-bot/); assert.equal(i.modals.length, 0);
      }
    }
    const denied = f.interaction({ commandName: 'avisos', channelId: f.channel('adminCommands').id,
      memberPermissions: new PermissionsBitField(P.ManageGuild), isButton: () => false, isChatInputCommand: () => true });
    await f.bot.interaction(denied); assert.match(denied.replies[0].content, /Administrador/);
    const admin = f.interaction({ commandName: 'avisos', channelId: f.channel('adminCommands').id, memberPermissions: new PermissionsBitField(P.Administrator),
      isButton: () => false, isChatInputCommand: () => true });
    await f.bot.interaction(admin); assert.match(admin.replies.at(-1).content, /Rol de equipos/);
    const ping = f.interaction({ commandName: 'ping', isButton: () => false, isChatInputCommand: () => true });
    await f.bot.interaction(ping); assert.match(ping.replies[0].content, /Administrador/);
    const complete = f.interaction({ commandName: 'torneo', isAutocomplete: () => true, respond: async values => { complete.values = values; } });
    await f.bot.interaction(complete); assert.deepEqual(complete.values, []);
  } finally { f.store.close(); }
});

test('feedback identificado y anónimo comparten tres cupos, cuarto se bloquea y reportes siguen disponibles', async () => {
  const f = await fixture();
  try {
    for (let n = 0; n < 3; n++) {
      const i = f.submit(await f.open('feedback'), { anonymous: n % 2 === 0 });
      await f.bot.interaction(i); assert.match(i.replies.at(-1).content, new RegExp(`Te quedan ${2 - n} feedbacks`));
    }
    assert.equal(f.channel('feedbackInbox').sent, 3);
    const fourth = await f.open('feedback'); assert.equal(fourth.modals.length, 0);
    assert.match(fourth.replies[0].content, /3 feedbacks.*00:00.*CDMX/);
    const report = f.submit(await f.open('report')); await f.bot.interaction(report); assert.equal(f.channel('reportInbox').sent, 1);
    const other = await f.open('feedback', { user: { id: 'another-user' } }); assert.equal(other.modals.length, 1);
    assert.equal(f.bot.mailboxes.quota.status(f.guild.id, 'another-user').remaining, 3);
    assert.ok(!JSON.stringify(f.settings()).includes('sender-secret'));
  } finally { f.store.close(); }
});

test('revisa cuota al enviar un formulario abierto antes de agotarla; fallos de Discord no consumen cupo', async () => {
  const f = await fixture();
  try {
    const opened = await f.open('feedback');
    for (let n = 0; n < 3; n++) f.bot.mailboxes.quota.reserve(f.guild.id, 'sender-secret');
    const stale = f.submit(opened); await f.bot.interaction(stale); assert.match(stale.replies.at(-1).content, /3 feedbacks/);
    assert.equal(f.channel('feedbackInbox').sent, 0);
    const other = await f.open('feedback', { user: { id: 'another-user' } });
    const failed = f.submit(other, { anonymous: true }, { user: { id: 'another-user' } });
    f.channel('feedbackInbox').failSend = true; await f.bot.interaction(failed);
    assert.equal(f.bot.mailboxes.quota.status(f.guild.id, 'another-user').remaining, 3);
    f.channel('feedbackInbox').failSend = false; await f.bot.interaction(failed);
    assert.equal(f.bot.mailboxes.quota.status(f.guild.id, 'another-user').remaining, 2);
  } finally { f.store.close(); }
});

test('dos formularios concurrentes con un cupo restante solo entregan un feedback adicional', async () => {
  const f = await fixture();
  try {
    f.bot.mailboxes.quota.reserve(f.guild.id, 'sender-secret'); f.bot.mailboxes.quota.reserve(f.guild.id, 'sender-secret');
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const first = f.submit(await f.open('feedback'), {}, { deferReply: async p => {
      first.deferred = true; first.replies.push(p); await gate;
    } });
    const pending = f.bot.interaction(first);
    const second = f.submit(await f.open('feedback'), { anonymous: true }); await f.bot.interaction(second);
    release(); await pending;
    assert.equal(f.channel('feedbackInbox').sent, 1); assert.equal(f.bot.mailboxes.quota.status(f.guild.id, 'sender-secret').remaining, 0);
    assert.match(first.replies.at(-1).content, /3 feedbacks/);
  } finally { f.store.close(); }
});
