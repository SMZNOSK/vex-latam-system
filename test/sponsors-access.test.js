import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Collection, PermissionFlagsBits as P, PermissionsBitField, ChannelType } from 'discord.js';
import { Store } from '../src/store.js';
import { VexBot } from '../src/bot.js';
import { AccessGate, originalPermissions } from '../src/access-gate.js';
import { sponsors, sponsorLogo, completeProfile } from '../src/sponsors.js';
import { validateProfile } from '../src/domain.js';
import { processRoleJobs } from '../src/setup.js';
import { profileModal, searchPayload } from '../src/ui.js';
import { welcomePayload } from '../src/community-ui.js';
import { template } from '../src/renderer.js';

const profile = { embarkId: 'Jugador#1234', score: 34000, playerClass: 'Ligero', specializationIds: ['evasive_dash'], sponsorId: 'ospuze' };
async function fixture() {
  const store = new Store(':memory:'); await store.migrate();
  const bot = new VexBot({ user: { id: 'bot' } }, store, {}); bot.guilds.add('g'); bot.log = () => {};
  const roles = new Collection(), channels = new Collection(), members = new Collection();
  const guild = { id: 'g', ownerId: 'owner' };
  const role = (id, name, permissions = 0n) => {
    const r = { id, name, permissions: new PermissionsBitField(permissions), guild, position: 1, managed: false, mentionable: false };
    roles.set(id, r); return r;
  };
  role('g', '@everyone', P.ViewChannel | P.SendMessages | P.Connect | P.Speak);
  role('staff', 'Staff', P.ManageMessages); role('game', 'Juego privado'); role('finals', 'THE FINALS');
  guild.roles = { cache: roles, fetch: async id => id ? roles.get(id) : roles,
    create: async data => { const r = role(`r${roles.size}`, data.name); assert.deepEqual(data.permissions, []); assert.equal(data.mentionable, false); return r; } };
  function member(id, initial = []) {
    if (members.has(id)) return members.get(id);
    const cache = new Collection(initial.map(id => [id, roles.get(id)]));
    const m = { id, guild, user: { id, bot: id === 'bot' }, roles: { cache,
      add: async id => { cache.set(id, roles.get(id)); }, remove: async id => { cache.delete(id); } } };
    Object.defineProperty(m, 'permissions', { configurable: true, get: () => new PermissionsBitField([...cache.values()].reduce((n, r) => n | r.permissions.bitfield, 0n)) });
    members.set(id, m); return m;
  }
  const me = member('bot'); Object.defineProperty(me, 'permissions', { value: new PermissionsBitField(PermissionsBitField.All) });
  me.roles.highest = { position: 100 };
  guild.members = { cache: members, fetchMe: async () => me, fetch: async id => member(id) };
  function channel(id, initial = [], type = ChannelType.GuildText) {
    const cache = new Collection();
    for (const o of initial) cache.set(o.id, { ...o, allow: new PermissionsBitField(o.allow ?? 0n), deny: new PermissionsBitField(o.deny ?? 0n) });
    const c = { id, name: id, guild, type, isThread: () => false, permissionOverwrites: { cache,
      edit: async (id, values) => {
        const o = cache.get(id) ?? { id, type: roles.has(id) ? 0 : 1, allow: new PermissionsBitField(), deny: new PermissionsBitField() };
        for (const [key, val] of Object.entries(values)) { o.allow.remove(P[key]); o.deny.remove(P[key]); if (val === true) o.allow.add(P[key]); if (val === false) o.deny.add(P[key]); }
        cache.set(id, o);
      } }, permissionsFor: target => target.id === 'bot' ? me.permissions
        : originalPermissions(guild, target, [...cache.values()].map(o => ({ ...o, allow: String(o.allow.bitfield), deny: String(o.deny.bitfield) }))),
      messages: { fetch: async () => ({ author: { id: 'bot' }, components: [{ custom_id: 'profile:edit' }] }) } };
    channels.set(id, c); return c;
  }
  guild.channels = { cache: channels, fetch: async id => id ? channels.get(id) : channels };
  for (const id of ['welcome', 'rules', 'register', 'general', 'voice']) channel(id);
  const settings = store.settings('g');
  Object.assign(settings, { finalsRole: 'finals', community: { welcomeChannel: 'welcome' },
    panels: { reglas: { channel: 'rules', message: 'rules-panel' }, registro: { channel: 'register', message: 'register-panel' } } });
  store.saveSettings('g', settings);
  return { bot, store, guild, roles, channels, member, channel, me };
}

test('once opciones obligatorias en el modal; recursos locales válidos y patrocinador estricto', () => {
  const modal = profileModal(profile).toJSON(); assert.equal(modal.components.length, 4);
  const select = modal.components.find(l => l.component.custom_id === 'sponsor').component;
  assert.equal(select.required, true); assert.equal(select.max_values, 1); assert.equal(select.options.length, 11);
  assert.equal(select.options.filter(o => o.default).length, 1);
  assert.equal(sponsors.some(s => s.label === 'MultiCo'), false);
  for (const s of sponsors) {
    assert.ok(sponsorLogo(s.id).startsWith('data:image/')); assert.equal(validateProfile({ ...profile, sponsorId: s.id }).sponsorId, s.id);
  }
  for (const sponsorId of [undefined, 'multico', '../ospuze', 'OSPUZE']) assert.throws(() => validateProfile({ ...profile, sponsorId }));
  assert.equal(completeProfile({ ...profile, needsCompletion: true }), false);
});

test('cada tema se aplica al perfil/equipo; los integrantes conservan su sponsor y no hacen ping', () => {
  for (const s of sponsors) {
    const p = { ...validateProfile({ ...profile, sponsorId: s.id }), searchable: true };
    const team = { host: 'u', members: ['u', 'b'], sponsorId: s.id, expires: Date.now() + 60000, status: 'open',
      filters: { teammates: 2, mode: 'Chill', playerClass: 'Ligero', specializationIds: [] },
      membersDisplay: [{ embarkId: p.embarkId, sponsorId: s.id }, { embarkId: 'Otro#4321', sponsorId: 'engimo' }] };
    assert.ok(template('profile', p).includes(`theme-${s.id}`));
    const html = template('team', team); assert.ok(html.includes(`theme-${s.id}`)); assert.ok(html.includes('member-sponsor')); assert.ok(html.includes('ENGIMO'));
    assert.deepEqual(searchPayload(team).allowedMentions.roles, []);
  }
});

test('el perfil es opcional: canales públicos abiertos, canales privados según sus roles y canales nuevos sin bloqueo', async () => {
  const f = await fixture();
  try {
    const { bot, guild, member, channel, channels, roles } = f;
    const u = member('u', ['game']), mod = member('mod', ['staff']);
    const secret = channel('secret', [{ id: 'g', type: 0, deny: P.ViewChannel }, { id: 'game', type: 0, allow: P.ViewChannel }]);
    await bot.accessGate.setup(guild);
    assert.equal(roles.size, 16);
    for (const id of ['welcome', 'rules', 'register']) assert.equal(channels.get(id).permissionsFor(u).has(P.ViewChannel), true);
    assert.equal(channels.get('general').permissionsFor(u).has(P.ViewChannel), true);
    assert.equal(secret.permissionsFor(u).has(P.ViewChannel), true);
    assert.equal(channels.get('voice').permissionsFor(mod).has(P.ViewChannel), true);
    f.store.saveProfile('g', 'u', validateProfile(profile)); await processRoleJobs(bot, guild);
    const settings = f.store.settings('g'); assert.ok(u.roles.cache.has(settings.verifiedRole));
    assert.equal(channels.get('general').permissionsFor(u).has(P.ViewChannel), true);
    assert.equal(secret.permissionsFor(u).has(P.ViewChannel), true);
    const stranger = member('b'); f.store.saveProfile('g', 'b', validateProfile(profile)); await processRoleJobs(bot, guild);
    assert.equal(secret.permissionsFor(stranger).has(P.ViewChannel), false);
    u.roles.cache.delete('game'); f.store.queueRole('g', 'u'); await processRoleJobs(bot, guild);
    assert.equal(secret.permissionsFor(u).has(P.ViewChannel), false);
    await bot.accessGate.setup(guild);
    assert.equal(roles.size, 16); assert.equal(f.store.settings('g').accessGate.enabled, false);
    const next = channel('new');
    assert.equal(next.permissionsFor(member('new-user')).has(P.ViewChannel), true);
    assert.equal(next.permissionsFor(stranger).has(P.ViewChannel), true);
  } finally { f.store.close(); }
});

test('restaura el bloqueo anterior incluso con snapshots migrados; preserva escritura, conexión y canales privados', async () => {
  const f = await fixture();
  try {
    const { bot, guild, store, channels, channel, member } = f;
    await bot.accessGate.setup(guild);
    const s = store.settings('g'), verified = s.verifiedRole;
    const general = channels.get('general');
    const secret = channel('secret', [{ id: 'g', type: 0, deny: P.ViewChannel }, { id: 'game', type: 0, allow: P.ViewChannel }]);
    const room = channel('team', [{ id: 'g', type: 0, deny: P.ViewChannel | P.Connect }], ChannelType.GuildVoice);
    s.accessGate = { enabled: true, snapshots: {
      general: { publicView: true, overwrites: [{ id: 'g', type: 0, allow: '0', deny: String(P.ViewChannel) },
        { id: verified, type: 0, allow: String(P.ViewChannel), deny: '0' }] },
      secret: { publicView: false, overwrites: [{ id: 'g', type: 0, allow: '0', deny: String(P.ViewChannel) },
        { id: 'game', type: 0, allow: String(P.ViewChannel), deny: '0' }] },
      team: { publicView: true, overwrites: [{ id: 'g', type: 0, allow: '0', deny: String(P.ViewChannel | P.Connect) }] },
    } };
    store.saveSettings('g', s);
    await general.permissionOverwrites.edit('g', { ViewChannel: false, SendMessages: false });
    await general.permissionOverwrites.edit(verified, { ViewChannel: true });
    await secret.permissionOverwrites.edit('game', { ViewChannel: null });
    await secret.permissionOverwrites.edit('staff', { ViewChannel: true });
    await room.permissionOverwrites.edit(verified, { ViewChannel: true });
    await bot.accessGate.setup(guild);
    const stranger = member('stranger'), gamer = member('gamer', ['game']);
    assert.equal(general.permissionsFor(stranger).has(P.ViewChannel), true);
    assert.equal(general.permissionsFor(stranger).has(P.SendMessages), false);
    assert.equal(general.permissionOverwrites.cache.get(verified).allow.has(P.ViewChannel), false);
    assert.equal(secret.permissionsFor(stranger).has(P.ViewChannel), false);
    assert.equal(secret.permissionsFor(gamer).has(P.ViewChannel), true);
    assert.equal(secret.permissionOverwrites.cache.get('staff').allow.has(P.ViewChannel), false);
    assert.equal(room.permissionsFor(stranger).has(P.ViewChannel), true);
    assert.equal(room.permissionsFor(stranger).has(P.Connect), false);
    assert.equal(store.settings('g').accessGate.enabled, false);
    assert.equal(store.settings('g').accessGate.restorePending, false);
    await general.permissionOverwrites.edit('g', { ViewChannel: false });
    await bot.accessGate.setup(guild);
    assert.equal(general.permissionsFor(stranger).has(P.ViewChannel), false, 'reiniciar respeta cambios posteriores del administrador');
  } finally { f.store.close(); }
});

test('restauración interrumpida queda pendiente sin reactivar el bloqueo y se reintenta', async () => {
  const f = await fixture();
  try {
    const s = f.store.settings('g'); s.accessGate = { enabled: true, snapshots: { general: { publicView: true, overwrites: [] } } };
    f.store.saveSettings('g', s);
    const channel = f.channels.get('general'), edit = channel.permissionOverwrites.edit;
    channel.permissionOverwrites.edit = async () => { throw Object.assign(new Error('permissions'), { code: 50013 }); };
    await assert.rejects(f.bot.accessGate.setup(f.guild));
    assert.equal(f.store.settings('g').accessGate.enabled, false);
    assert.equal(f.store.settings('g').accessGate.restorePending, true);
    channel.permissionOverwrites.edit = edit;
    await f.bot.accessGate.setup(f.guild);
    assert.equal(f.store.settings('g').accessGate.restorePending, false);
  } finally { f.store.close(); }
});

test('cambiar, pausar y eliminar: un sponsor, verificación independiente y roles pendientes reintentables', async () => {
  const f = await fixture();
  try {
    await f.bot.accessGate.setup(f.guild); const m = f.member('u');
    f.store.saveProfile('g', 'u', validateProfile(profile)); await processRoleJobs(f.bot, f.guild);
    let settings = f.store.settings('g'); assert.ok(m.roles.cache.has(settings.sponsorRoles.ospuze));
    f.store.saveProfile('g', 'u', { sponsorId: 'holtow', searchable: false }); await processRoleJobs(f.bot, f.guild);
    assert.equal(m.roles.cache.has(settings.sponsorRoles.ospuze), false); assert.ok(m.roles.cache.has(settings.sponsorRoles.holtow));
    assert.ok(m.roles.cache.has(settings.verifiedRole));
    f.store.deleteProfile('g', 'u'); await processRoleJobs(f.bot, f.guild);
    assert.equal(m.roles.cache.has(settings.verifiedRole), false); assert.equal(m.roles.cache.has(settings.sponsorRoles.holtow), false);
    f.store.saveProfile('g', 'u', validateProfile(profile));
    const add = m.roles.add; m.roles.add = async () => { throw Object.assign(new Error(), { code: 50013 }); };
    await processRoleJobs(f.bot, f.guild); assert.equal(f.store.roleJobs('g', Infinity).length, 1);
    assert.equal(m.roles.cache.has(settings.verifiedRole), false);
    m.roles.add = add; f.store.queueRole('g', 'u'); await processRoleJobs(f.bot, f.guild);
    assert.ok(m.roles.cache.has(settings.verifiedRole)); assert.equal(f.store.roleJobs('g', Infinity).length, 0);
  } finally { f.store.close(); }
});

test('sin panel de registro el acceso sigue abierto y la bienvenida ofrece un perfil opcional', async () => {
  const f = await fixture();
  try {
    const settings = f.store.settings('g'); settings.panels.registro.message = null; f.store.saveSettings('g', settings);
    await f.bot.accessGate.setup(f.guild);
    assert.equal(f.channels.get('general').permissionOverwrites.cache.size, 0);
    const welcome = welcomePayload({ id: 'u', guild: { name: 'Comunidad' } }, settings);
    assert.equal(welcome.components[0].toJSON().components[0].custom_id, 'profile:edit');
    assert.equal(welcome.components[0].toJSON().components[0].label, 'Crear / editar mi perfil');
    assert.doesNotMatch(welcome.content, /Completa|abrir los demás/);
    assert.deepEqual(welcome.allowedMentions.roles, []); assert.deepEqual(welcome.allowedMentions.users, ['u']);
  } finally { f.store.close(); }
});

test('la clasificación se puede consultar sin perfil incluso si quedan ajustes antiguos del bloqueo', async () => {
  const f = await fixture();
  try {
    const s = f.store.settings('g'); s.accessGate = { enabled: true }; f.store.saveSettings('g', s);
    let viewed = false; f.bot.leaderboard.view = async () => { viewed = true; };
    await f.bot.interaction({ guildId: 'g', guild: f.guild, user: { id: 'without-profile' },
      inGuild: () => true, isChatInputCommand: () => true, commandName: 'leaderboard',
      memberPermissions: new PermissionsBitField() });
    assert.equal(viewed, true); assert.equal(f.store.profile('g', 'without-profile'), null);
  } finally { f.store.close(); }
});

test('migración v3 respalda fotos, RS consultados y pausas; exige sponsor sin recalcular', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vex-sponsors-')), filename = path.join(dir, 'db.sqlite');
  let store = new Store(filename);
  try {
    await store.migrate(); const old = { ...profile, sponsorId: undefined, schemaVersion: 2, rank: 'Ruby', leaderboardPosition: 450,
      needsCompletion: false, cardImage: { key: 'kept' }, searchable: false };
    store.saveProfile('g', 'u', old); store.db.exec('PRAGMA user_version=3');
    const backup = await store.migrate(); assert.ok(existsSync(backup));
    let p = store.profile('g', 'u'); assert.equal(p.sponsorId, null); assert.equal(p.needsCompletion, true);
    assert.equal(p.rank, 'Ruby'); assert.equal(p.leaderboardPosition, 450); assert.equal(p.searchable, false); assert.equal(p.cardImage.key, 'kept');
    store.close(); store = new Store(filename); assert.equal(await store.migrate(), null); assert.equal(store.schemaVersion, 5);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
