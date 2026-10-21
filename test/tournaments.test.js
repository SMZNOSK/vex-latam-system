import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Collection, PermissionFlagsBits as P, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { Store } from '../src/store.js';
import { TournamentStore } from '../src/tournament-store.js';
import { Tournaments, requireTournamentAdmin, tournamentCommands } from '../src/tournaments.js';
import { VexBot } from '../src/bot.js';
import { commands } from '../src/commands.js';
import { validateBasics, validateRules, validateRegistrationMode, mexicoDate, validateEntrant, balanceTeams, uniqueTeamName, tournamentTimes, TOURNAMENT_RETENTION_MS } from '../src/tournament-domain.js';
import { tournamentModal, draftPanel, draftControl, teamPayload, registrationPayload } from '../src/tournament-ui.js';
import { template } from '../src/card-template.js';
import { config } from '../src/config.js';
config.roleCreationApprovedGuilds.g=['VXTG'];

const basics = () => validateBasics({ name: 'Copa VEX', date: '2099-05-20', time: '20:30', capacity: '', access: 'public' });
const event = (extra = {}) => ({ ...basics(), rules: validateRules({}), id: '0123456789abcdef', guild: 'g', status: 'open', dirty: true, ...extra });
const player = (n, extra = {}) => ({ id: `p${n}`, embarkId: `Jugador${n}#1234`, score: n * 1000, playerClass: 'Mediano', specializationIds: ['healing_beam'], user: `u${n}`, approximate: false, created: n, ...extra });
async function fixture(filename = ':memory:') {
  const store = new Store(filename); await store.migrate();
  const channels = new Collection(), roles = new Collection(), members = new Collection(); let serial = 0;
  const guild = { id: 'g' }, created = [], sent = [], logs = [];
  function member(id, connected = false) {
    const m = { id, user:{id,username:id,bot:false}, displayName:id, roles: { cache: new Collection(), async add(role) { m.roles.cache.set(role, roles.get(role)); },async remove(role){m.roles.cache.delete(role);} }, voice: { channelId: connected ? 'lobby' : null, async setChannel(channel) { if (m.voice.channelId) channels.get(m.voice.channelId)?.members.delete(id); m.voice.channelId = channel.id; channel.members.set(id, m); } } };
    members.set(id, m); return m;
  }
  guild.members = { fetchMe: async () => ({ id: 'bot' }), fetch: async arg => { const id = typeof arg === 'string' ? arg : arg.user; if (!members.has(id)) throw Object.assign(new Error('unknown member'), { code: 10007 }); return members.get(id); } };
  guild.roles = { cache: roles, fetch: async id => id ? roles.get(id) ?? null : roles, create: async data => {
    const r = { ...data, id: `r${++serial}`, managed: false, permissions: new PermissionsBitField(data.permissions), async delete() { roles.delete(r.id); } }; roles.set(r.id, r); return r;
  } };
  guild.channels = { cache: channels, fetch: async id => id ? channels.get(id) ?? null : channels, create: async data => {
    const messages = new Collection();
    const c = { ...data, id: `c${++serial}`,parentId:data.parent??null,rawPosition:created.length,
      async setParent(parent){c.parentId=typeof parent==='string'?parent:parent.id;return c;},async setName(name){c.name=name;return c;},
      members: new Collection(), permissionsFor: () => new PermissionsBitField(P.Administrator), async delete() { channels.delete(c.id); },
      messages: { fetch: async arg => {
        if (typeof arg === 'string') { if (!messages.has(arg)) throw Object.assign(new Error('unknown message'), { code: 10008 }); return messages.get(arg); }
        let batch = [...messages.values()].reverse(); if (arg?.before) batch = batch.slice(batch.findIndex(m => m.id === arg.before) + 1);
        return new Collection(batch.slice(0, arg?.limit ?? 100).map(m => [m.id, m]));
      } }, async send(payload) {
        JSON.stringify(payload);
        const m = { id: `m${++serial}`, author: { id: 'bot' }, payload, embeds: payload.embeds.map(e => e.toJSON()), async edit(p) { m.payload = p; m.embeds = p.embeds.map(e => e.toJSON()); return m; } };
        messages.set(m.id, m); sent.push(m); return m;
      } };
    channels.set(c.id, c); created.push(c); return c;
  } };
  guild.channels.setPositions=async positions=>{for(const p of positions) channels.get(typeof p.channel==='string'?p.channel:p.channel.id).rawPosition=p.position;};
  const bot = new VexBot({ user: { id: 'bot' }, guilds: { fetch: async () => guild } }, store, {}); bot.log = (...args) => logs.push(args); bot.guilds.add('g');
  return { bot, service: bot.tournaments, store, guild, channels, roles, member, created, sent, logs };
}
function interaction(guild, data = {}) {
  const i = { guild, guildId: guild.id, user: { id: 'u1' }, memberPermissions: new PermissionsBitField(P.Administrator), replies: [], modals: [],
    inGuild: () => true, isModalSubmit: () => false, isChatInputCommand: () => false, isButton: () => true, isStringSelectMenu: () => false,
    async reply(p) { i.replied = true; i.replies.push(p); }, async editReply(p) { i.replies.push(p); }, async followUp(p) { i.replies.push(p); },
    async deferReply(p) { i.deferred = true; i.replies.push(p); }, async showModal(m) { i.modals.push(m.toJSON()); }, ...data };
  return i;
}
async function submit(f, d, step, fields) {
  const i = interaction(f.guild, { customId: draftControl(d, `save-${step}`), isModalSubmit: () => true, fields: { getTextInputValue: k => fields[k] ?? '', getStringSelectValues: k => fields[k] ?? [],getSelectedUsers:k=>new Collection((fields[k]??[]).map(id=>[id,{id}])) } });
  await f.service.handle(i); return i;
}

test('fecha CDMX, cupos, RS y restricciones incompatibles', () => {
  assert.equal(mexicoDate('2099-05-20', '20:30'), Date.parse('2099-05-21T02:30:00Z'));
  for (const [d, h] of [['2099-02-29', '20:30'], ['2099-05-20', '24:00'], ['2000-01-01', '12:00'], ['2099-13-01', '10:00']]) assert.throws(() => mexicoDate(d, h));
  for (const capacity of ['0', '-1', '1.5', '1001', 'abierto']) assert.throws(() => validateBasics({ ...basics(), capacity }));
  assert.equal(basics().capacity, null);
  for (const rules of [{ minRS: 200, maxRS: 100 }, { allowedClasses: ['Ligero'], bannedClasses: ['Ligero'] }, { bannedClasses: ['Ligero', 'Mediano', 'Pesado'] }, { allowedClasses: ['Pesado'], allowedSkills: ['healing_beam'] }, { allowedSkills: ['healing_beam'], bannedSkills: ['healing_beam'] }]) assert.throws(() => validateRules(rules));
  const t = event({ rules: validateRules({ minRS: 1000, maxRS: 2000, bannedSkills: ['guardian_turret'] }) });
  assert.equal(validateEntrant(player(1, { approximate: true }), t).approximate, true);
  assert.throws(() => validateEntrant(player(3, { approximate: true }), t));
  assert.throws(() => validateEntrant(player(1, { specializationIds: ['guardian_turret'] }), t));
});

test('permisos registrados y comprobación runtime: Administrar servidor no basta', async () => {
  const command = commands.find(c => c.name === 'torneo');
  assert.ok(command.options.find(o => o.name === 'cerrar').options.some(o => o.name === 'convocatoria'));
  assert.ok(command.options.some(o => o.name === 'terminar'));
  for (const name of [...tournamentCommands, 'anuncio']) assert.equal(commands.find(c => c.name === name).default_member_permissions, String(P.Administrator));
  assert.throws(() => requireTournamentAdmin({ memberPermissions: new PermissionsBitField(P.ManageGuild) }));
  requireTournamentAdmin({ memberPermissions: new PermissionsBitField(P.Administrator) });
  const f = await fixture();
  try {
    for (const commandName of [...tournamentCommands, 'anuncio']) {
      const i = interaction(f.guild, { commandName, isChatInputCommand: () => true, memberPermissions: new PermissionsBitField(P.ManageGuild) });
      await f.bot.interaction(i); assert.match(i.replies[0].content, /Administrador/); assert.equal(i.modals.length, 0);
    }
    const modal = interaction(f.guild, { customId: 'publish:anuncio:c1', isModalSubmit: () => true, isButton: () => false, memberPermissions: new PermissionsBitField(P.ManageGuild) });
    await f.bot.interaction(modal); assert.match(modal.replies[0].content, /Administrador/);
    let response; await f.service.autocomplete({ guildId: 'g', memberPermissions: new PermissionsBitField(0n), respond: async value => { response = value; } }); assert.deepEqual(response, []);
  } finally { f.store.close(); }
});

test('horarios por ciudad: verano/invierno y cambio de fecha al convertir desde México centro', () => {
  const times = (date, time = '20:00') => tournamentTimes(mexicoDate(date, time, 0));
  const zone = (hours, name) => hours.find(h => h.timeZone === name);
  const winter = times('2027-01-15'), summer = times('2027-07-15');
  assert.equal(zone(winter, 'America/Mexico_City').time, '20:00');
  assert.equal(zone(winter, 'America/Los_Angeles').time, '18:00');
  assert.equal(zone(summer, 'America/Los_Angeles').time, '19:00');
  assert.equal(zone(winter, 'America/Chicago').time, '20:00');
  assert.equal(zone(summer, 'America/Chicago').time, '21:00');
  assert.equal(zone(winter, 'America/New_York').time, '21:00');
  assert.equal(zone(summer, 'America/New_York').time, '22:00');
  assert.equal(zone(winter, 'America/Santiago').time, '23:00');
  assert.equal(zone(summer, 'America/Santiago').time, '22:00');
  assert.equal(zone(summer, 'America/Sao_Paulo').time, '23:00');
  assert.match(zone(times('2027-01-15', '23:30'), 'America/Sao_Paulo').date, /^16 /);
  assert.match(zone(times('2027-01-15', '00:30'), 'America/Los_Angeles').date, /^14 /);
  assert.equal(winter.length, 16);
  const poster = template('tournament-poster', { ...event(), startsAt: mexicoDate('2027-01-15', '23:30', 0) }, 1100);
  for (const label of ['MÉXICO CENTRO', 'Brasil', 'São Paulo', 'US · Pacífico', 'Los Ángeles', 'US · Centro', 'Chicago', 'US · Este', 'Nueva York', '16 ene']) assert.ok(poster.includes(label), label);
});

test('comandos y confirmaciones separan convocatoria del fin y los botones antiguos no revierten un torneo terminado', async () => {
  const f = await fixture(), s = f.service.store;
  try {
    await f.service.setup(f.guild); s.save(event()); await f.service.sync(f.guild, event().id);
    const command = sub => interaction(f.guild, { commandName: 'torneo', options: { getSubcommand: () => sub, getString: () => event().id } });
    const closing = command('convocatoria'); await f.service.command(closing);
    assert.ok(JSON.stringify(closing.replies).includes('Cerrar convocatoria')); assert.equal(s.get(event().id).status, 'open', 'confirmation is required');
    await f.service.handle(interaction(f.guild, { customId: `tour:close:${event().id}` }));
    assert.equal(s.get(event().id).status, 'closed'); assert.equal(s.get(event().id).deleteAt, undefined);
    const finishing = command('terminar'); await f.service.command(finishing);
    assert.ok(JSON.stringify(finishing.replies).includes('Confirmar fin del torneo')); assert.equal(s.get(event().id).deleteAt, undefined);
    await f.service.handle(interaction(f.guild, { customId: `tour:finish:${event().id}` }));
    const finished = s.get(event().id); assert.equal(finished.status, 'finished'); assert.equal(finished.deleteAt - finished.finishedAt, TOURNAMENT_RETENTION_MS);
    await assert.rejects(f.service.handle(interaction(f.guild, { customId: `tour:close:${event().id}` })), /terminado/);
    await f.service.handle(interaction(f.guild, { customId: `tour:finish:${event().id}` }));
    assert.equal(s.get(event().id).deleteAt, finished.deleteAt);
    const panel = f.sent.find(m => m.id === finished.registrationMessage).payload;
    assert.ok(JSON.stringify(panel).includes(`<t:${Math.floor(finished.deleteAt / 1000)}:R>`));
  } finally { f.store.close(); }
});

test('fin persistente: 7 días desde confirmar, sin extender al repetir ni al reiniciar', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vex-retention-')), filename = path.join(dir, 'vex.sqlite');
  let f = await fixture(filename), s = f.service.store;
  try {
    await f.service.setup(f.guild); s.save(event()); await f.service.sync(f.guild, event().id);
    const initial = s.get(event().id), now = Date.now();
    s.closeRegistration(initial.id, now - 100000);
    assert.equal(s.get(initial.id).deleteAt, undefined);
    await f.service.sync(f.guild, initial.id, now + 2 * TOURNAMENT_RETENTION_MS);
    assert.ok(f.channels.has(initial.registrationChannel), 'old closed tournaments never expire without terminar');
    const finished = s.finish(initial.id, now);
    assert.equal(finished.deleteAt, now + TOURNAMENT_RETENTION_MS);
    assert.equal(s.finish(initial.id, now + 1000).deleteAt, finished.deleteAt);
    assert.throws(() => s.closeRegistration(initial.id), /terminado/);
    for (const kind of ['close', 'finish']) await assert.rejects(f.service.handle(interaction(f.guild, { customId: `tour:${kind}:${initial.id}`, memberPermissions: new PermissionsBitField(P.ManageGuild) })), /Administrador/);
    f.store.close(); f.store = new Store(filename); await f.store.migrate();
    f.bot.store = f.store; const restarted = new Tournaments(f.bot); s = restarted.store;
    assert.equal(s.get(initial.id).deleteAt, finished.deleteAt);
    await restarted.sync(f.guild, initial.id, finished.deleteAt - 1);
    assert.ok(f.channels.has(initial.registrationChannel));
    await restarted.sync(f.guild, initial.id, finished.deleteAt + 60000);
    assert.ok(!f.channels.has(initial.registrationChannel)); assert.ok(!f.channels.has(initial.teamsChannel));
    assert.ok(s.get(initial.id).channelsDeletedAt);
  } finally { f.store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('limpieza reintenta tras fallo parcial, conserva canales compartidos y otros torneos y no depende del cartel', async () => {
  const f = await fixture(), s = f.service.store;
  try {
    await f.service.setup(f.guild); s.save(event()); await f.service.sync(f.guild, event().id);
    const unrelated = s.save(event({ id: 'other-event' })); await f.service.sync(f.guild, unrelated.id);
    const shared = await f.guild.channels.create({ name: 'equipos', type: ChannelType.GuildText });
    f.store.saveSettings('g', { ...f.store.settings('g'), teamsChannel: shared.id });
    const t = s.finish(event().id), registration = f.channels.get(t.registrationChannel), teams = f.channels.get(t.teamsChannel);
    const deleteTeams = teams.delete; let attempts = 0;
    teams.delete = async () => { if (++attempts === 1) throw new Error('Discord temporalmente no disponible'); await deleteTeams(); };
    await assert.rejects(f.service.sync(f.guild, t.id, t.deleteAt), /temporalmente/);
    assert.ok(!f.channels.has(registration.id)); assert.ok(f.channels.has(teams.id)); assert.equal(s.get(t.id).channelsDeletedAt, undefined);
    // A missing shared announcement must not block deleting the remaining expired channel.
    f.channels.delete(t.announcementChannel);
    await assert.rejects(new Tournaments(f.bot).sync(f.guild, t.id, t.deleteAt + 60000), /anuncios/);
    assert.ok(!f.channels.has(teams.id)); assert.ok(s.get(t.id).channelsDeletedAt);
    assert.ok(f.channels.has(shared.id));
    const other = s.get(unrelated.id); assert.ok(f.channels.has(other.registrationChannel)); assert.ok(f.channels.has(other.teamsChannel));
  } finally { f.store.close(); }
});

test('transacciones: solo, equipo, duplicados, capacidad, cierre y rollback', async () => {
  const f = await fixture(), s = f.service.store; s.save(event({ capacity: 2 }));
  try {
    s.register(event().id, [player(1)]); s.register(event().id, [player(2), player(3), player(4)], 'The VEX');
    assert.throws(() => s.register(event().id, [player(5), player(6), player(7)], 'Sin cupos'));
    assert.equal(s.entries(event().id).length, 4); assert.equal(s.teams(event().id).length, 1);
    assert.throws(() => s.register(event().id, [player(9, { embarkId: 'JUGADOR1#1234' })]));
    assert.throws(() => s.register(event().id, [player(9, { user: 'u1' })]));
    s.register(event().id, [player(5)]); s.register(event().id, [player(6)]);
    assert.throws(() => s.register(event().id, [player(7)]));
    s.closeRegistration(event().id); assert.throws(() => s.register(event().id, [player(7)]));
    assert.equal(s.form(event().id).teams.length, 1, 'closing registration still permits forming teams');
    s.finish(event().id); assert.throws(() => s.form(event().id));
  } finally { f.store.close(); }
});

test('balance RS, sobrantes y equipos únicos: repetir no reasigna ni duplica', async () => {
  const people = [1000, 1000, 1000, 2000, 2000, 2000, 3000, 3000, 3000, 9000].map((score, n) => player(n + 1, { score }));
  const result = balanceTeams(people, () => .42);
  assert.equal(result.pending.length, 1); assert.equal(result.pending[0].id, 'p10');
  assert.deepEqual(result.teams.map(t => t.reduce((n, p) => n + p.score, 0)), [6000, 6000, 6000]);
  assert.equal(new Set(result.teams.flat().map(p => p.id)).size, 9);
  const f = await fixture(), s = f.service.store; s.save(event());
  try {
    for (const p of people) s.register(event().id, [p]);
    assert.equal(s.form(event().id).teams.length, 3); assert.equal(s.form(event().id).teams.length, 0);
    assert.equal(s.entries(event().id).filter(p => !p.team).length, 1);
    assert.equal(new Set(s.teams(event().id).map(t => t.name)).size, 3);
    const names = []; for (let n = 0; n < 30; n++) names.push(uniqueTeamName(names)); assert.equal(new Set(names).size, 30);
  } finally { f.store.close(); }
});

test('perfil coincide sin API, solo no suplanta y clan exige rol para todos con o sin perfil', async () => {
  const f = await fixture(); await f.service.setup(f.guild); f.member('u1'); f.member('u2');
  f.store.saveProfile('g', 'u1', player(1)); f.store.saveProfile('g', 'u2', player(2));
  try {
    const t = event({ access: 'clan' });
    await assert.rejects(f.service.verifyPlayers(f.guild, t, [player(1)], 'u1'), /VXTG/);
    f.guild.members && await (await f.guild.members.fetch('u1')).roles.add(f.store.settings('g').tournamentClanRole);
    const [p] = await f.service.verifyPlayers(f.guild, t, [player(1)], 'u1'); assert.equal(p.clanVerified, true);
    await assert.rejects(f.service.verifyPlayers(f.guild, t, [player(1), player(2)]), /VXTG/);
    await assert.rejects(f.service.verifyPlayers(f.guild, t, [player(9)], 'u1'), /Discord/);
    await assert.rejects(f.service.verifyPlayers(f.guild, event(), [player(2)], 'u1'), /Discord/);
    f.member('u9');
    const [unknown] = await f.service.verifyPlayers(f.guild, event(), [player(9)]); assert.equal(unknown.user, 'u9'); assert.equal(unknown.profileMatched, false); assert.equal(unknown.score,null);
  } finally { f.store.close(); }
});

test('crear, vista previa e inscripción individual inmediata con perfil sin cuestionario', async () => {
  const f = await fixture(); f.member('u1'); f.store.saveProfile('g', 'u1', player(1));
  try {
    const d = f.service.drafts.create('tournament-create', 'g', 'u1', { rules: validateRules({}) });
    await submit(f, d, 'basics', { ...basics(), capacity: '', access: ['public'] });
    await submit(f, d, 'rules', { minRS: '0', maxRS: '10000' });
    const preview = await submit(f, d, 'skills', {}); assert.ok(preview.replies.some(p => p.embeds));
    for (const step of ['basics', 'rules', 'skills']) assert.ok(tournamentModal(d, step).toJSON().components.length <= 5);
    assert.ok(JSON.stringify(draftPanel(d)).includes('Publicar torneo'));
    await f.service.handle(interaction(f.guild, { customId: draftControl(d, 'publish') }));
    const t = f.service.store.list('g')[0]; assert.equal(t.status, 'open');
    const join=interaction(f.guild, { customId: `tour:join:${t.id}:solo` });
    await f.service.handle(join);
    const [registered]=f.service.store.entries(t.id);
    assert.equal(registered.score,1000); assert.equal(registered.user,'u1'); assert.equal(join.modals.length,0);
    assert.equal(f.service.drafts.items.size,0); assert.match(JSON.stringify(join.replies),/Cancelar registro/);
    await f.service.handle(interaction(f.guild,{customId:`tour:withdraw:${t.id}`}));
    assert.equal(f.service.store.entries(t.id).length,0);
  } finally { f.store.close(); }
});

test('equipo usa selección Discord e importa perfiles; solo solicita el Embark ID pendiente y el organizador lidera', async () => {
  const f = await fixture(); const t = event(); f.service.store.save(t); await f.service.setup(f.guild);
  for(const id of ['u1','u2','u3'])f.member(id);
  f.store.saveProfile('g','u1',player(1)); f.store.saveProfile('g','u2',player(2));
  try {
    const d = f.service.drafts.create(`tournament-signup-${t.id}`, 'g', 'u1', { tournament: t.id, mode: 'team', index: 0, people: [] });
    const modal=tournamentModal(d,'identity').toJSON();assert.equal(modal.components[1].component.type,5);
    await submit(f, d, 'identity', { teamName: 'Equipo nuevo',teammates:['u2','u3'] });
    assert.equal(d.data.people.filter(p=>!p.embarkId).length,1);
    assert.equal(tournamentModal(d,'missing').toJSON().components.length,1);
    await submit(f,d,'missing',{embarkId:'Jugador3#1234'});
    const people = f.service.store.entries(t.id); assert.equal(people.length, 3); assert.deepEqual(people.map(p=>p.user),['u1','u2','u3']);
    assert.equal(people[2].score,null);
    const team = f.service.store.teams(t.id)[0], payload = teamPayload(t, team, people); assert.equal(team.leader,'u1');assert.deepEqual(payload.allowedMentions.users, ['u1','u2','u3']);
    assert.throws(()=>f.service.store.renameTeam(t.id,'u2',{team:team.id,value:'Otro nombre'}),/líder/);
    assert.equal(f.service.store.renameTeam(t.id,'u1',{team:team.id,value:'Nombre del líder'}).name,'Nombre del líder');
    assert.ok(JSON.stringify(registrationPayload(t, people, [team])).includes('Registrar equipo'));
  } finally { f.store.close(); }
});

test('crear torneo individual: selecciona modalidad, publica un solo boton y deja jugadores pendientes', async () => {
  const f = await fixture(); f.member('u1');
  try {
    await f.service.command(interaction(f.guild, { commandName: 'torneo', options: { getSubcommand: () => 'crear' } }));
    const d = [...f.service.drafts.items.values()][0];
    assert.equal(d.data.registrationMode, 'mixed');
    await submit(f, d, 'basics', { ...basics(), capacity: '2', access: ['public'] });
    const modal = tournamentModal(d, 'rules').toJSON();
    assert.equal(modal.components.length, 5);
    const choice = modal.components.find(c => c.component.custom_id === 'registrationMode').component;
    assert.equal(choice.required, true);
    assert.equal(choice.options.find(o => o.default).value, 'mixed');
    await submit(f, d, 'rules', { registrationMode: ['solo'] });
    assert.equal(tournamentModal(d, 'rules').toJSON().components[0].component.options.find(o => o.default).value, 'solo');
    // Editing the calendar must not silently switch back to mixed registration.
    await submit(f, d, 'basics', { ...basics(), capacity: '2', access: ['public'] });
    assert.equal(d.data.registrationMode, 'solo');
    const preview = await submit(f, d, 'skills', {});
    assert.match(JSON.stringify(preview.replies), /Solo individuales/);
    await f.service.handle(interaction(f.guild, { customId: draftControl(d, 'publish') }));
    const t = f.service.store.list('g')[0];
    assert.equal(t.registrationMode, 'solo'); assert.equal(t.status, 'open');
    const panel = f.sent.find(m => m.id === t.registrationMessage).payload;
    const controls = panel.components[0].toJSON().components;
    assert.equal(controls.length, 1); assert.equal(controls[0].custom_id, `tour:join:${t.id}:solo`);
    assert.doesNotMatch(JSON.stringify(panel), /Registrar equipo/);
    assert.match(JSON.stringify(panel), /Solo individuales/i);
    await f.service.handle(interaction(f.guild, { customId: `tour:join:${t.id}:solo` }));
    const signup = [...f.service.drafts.items.values()][0];
    await submit(f, signup, 'solo-id', { embarkId: 'Jugador1#1234' });
    f.service.store.register(t.id, [player(2)]); f.service.store.register(t.id, [player(3)]);
    assert.equal(f.service.store.entries(t.id).length, 3);
    assert.ok(f.service.store.entries(t.id).every(p => p.team === null));
    assert.equal(f.service.store.teams(t.id).length, 0, 'registration never automatically forms a team');
    f.service.store.closeRegistration(t.id);
    await f.service.command(interaction(f.guild, { commandName: 'torneo-formar-equipo', options: { getString: () => t.id } }));
    assert.equal(f.service.store.teams(t.id).length, 1);
    assert.ok(f.service.store.entries(t.id).every(p => p.team));
  } finally { f.store.close(); }
});

test('modalidad individual bloquea botones y borradores de equipo antiguos, y registros directos', async () => {
  const f = await fixture(), s = f.service.store, t = event({ registrationMode: 'solo' }); s.save(t);
  try {
    await assert.rejects(f.service.handle(interaction(f.guild, { customId: `tour:join:${t.id}:team` })), /solo admite inscripciones individuales/);
    assert.equal(f.service.drafts.items.size, 0);
    const d = f.service.drafts.create(`tournament-signup-${t.id}`, 'g', 'u1', { tournament: t.id, mode: 'team', people: [player(1, { confirmed: true }), player(2, { confirmed: true }), player(3, { confirmed: true })], teamName: 'Equipo antiguo', index: 0 });
    await assert.rejects(f.service.handle(interaction(f.guild, { customId: draftControl(d, 'identity') })), /solo admite inscripciones individuales/);
    await assert.rejects(submit(f, d, 'identity', { teamName: 'Equipo antiguo', id0: 'Uno#1234', id1: 'Dos#1234', id2: 'Tres#1234' }), /solo admite inscripciones individuales/);
    await assert.rejects(f.service.handle(interaction(f.guild, { customId: draftControl(d, 'register') })), /solo admite inscripciones individuales/);
    assert.equal(d.busy, false);
    assert.throws(() => s.register(t.id, [player(1), player(2), player(3)], 'Equipo antiguo'), /solo admite inscripciones individuales/);
    assert.throws(() => s.register(t.id, [player(1), player(2), player(3)]), /solo admite inscripciones individuales/);
    assert.equal(s.entries(t.id).length, 0); assert.equal(s.teams(t.id).length, 0);
    s.register(t.id, [player(1)]);
    assert.equal(s.entries(t.id).length, 1, 'rejected writes roll back without affecting a valid signup');
    const closed = registrationPayload({ ...t, status: 'closed' }, s.entries(t.id), []);
    assert.equal(closed.components[0].toJSON().components.length, 1);
    assert.ok(closed.components[0].toJSON().components[0].disabled);
  } finally { f.store.close(); }
});

test('modalidad individual persiste al reiniciar, respeta cupos y duplicados, y permite formar despues del cierre', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vex-solo-tournament-')), filename = path.join(dir, 'vex.sqlite');
  let f = await fixture(filename), s = f.service.store;
  const t = event({ registrationMode: 'solo', capacity: 1 });
  try {
    s.save(t); s.register(t.id, [player(1)]);
    assert.throws(() => s.register(t.id, [player(9, { embarkId: 'JUGADOR1#1234' })]), /ya está inscrito/);
    assert.throws(() => s.register(t.id, [player(9, { user: 'u1' })]), /ya está inscrito/);
    s.register(t.id, [player(2)]); s.register(t.id, [player(3)]);
    assert.throws(() => s.register(t.id, [player(4)]), /cupos/);
    f.store.close(); f = await fixture(filename); s = f.service.store;
    assert.equal(s.get(t.id).registrationMode, 'solo');
    assert.equal(s.entries(t.id).length, 3); assert.equal(s.teams(t.id).length, 0);
    assert.throws(() => s.register(t.id, [player(4), player(5), player(6)], 'Equipo'), /solo admite inscripciones individuales/);
    s.closeRegistration(t.id);
    assert.equal(s.form(t.id).teams.length, 1);
    assert.equal(s.form(t.id).teams.length, 0);
  } finally { f.store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('modalidad mixta predeterminada conserva equipos y la individual coincide en texto y carteles', async () => {
  assert.equal(validateRegistrationMode(undefined), 'mixed');
  for (const invalid of ['', 'team', 'unknown']) assert.throws(() => validateRegistrationMode(invalid), /modalidad/);
  const f = await fixture(), s = f.service.store;
  try {
    for (const [id, registrationMode] of [['legacy', undefined], ['mixed', 'mixed']]) {
      const t = event({ id, registrationMode }); s.save(t);
      s.register(t.id, [player(1), player(2), player(3)], 'Equipo completo');
      assert.equal(s.teams(t.id).length, 1);
      assert.equal(registrationPayload(t, [], []).components[0].toJSON().components.length, 2);
      assert.match(template('tournament-poster', t, 1100), /individualmente o con tu equipo/);
    }
    for (const kind of ['tournament', 'tournament-poster']) {
      const html = template(kind, event({ registrationMode: 'solo' }), kind === 'tournament-poster' ? 1100 : 390);
      assert.match(html, /[Ss]olo individual/); assert.match(html, /[Ee]quipos después/);
      assert.doesNotMatch(html, /individualmente o con tu equipo|Individual o equipo de tres/);
    }
    const d = f.service.drafts.create('tournament-create', 'g', 'u1', { rules: validateRules({}) });
    await submit(f, d, 'basics', { ...basics(), access: ['public'] });
    await assert.rejects(submit(f, d, 'rules', { registrationMode: ['unknown'] }), /modalidad/);
    assert.equal(d.data.rulesDone, undefined);
    assert.equal(d.busy, false);
  } finally { f.store.close(); }
});

test('borradores: propietario, revisión, cambio de permisos y torneo de otro servidor', async () => {
  const f = await fixture();
  try {
    const d = f.service.drafts.create('tournament-create', 'g', 'u1', { rules: validateRules({}) });
    await assert.rejects(f.service.handle(interaction(f.guild, { customId: draftControl(d, 'basics'), user: { id: 'u2' } })), /otra persona/);
    const old = draftControl(d, 'basics'); d.revision++;
    await assert.rejects(f.service.handle(interaction(f.guild, { customId: old })), /reciente/);
    await assert.rejects(f.service.handle(interaction(f.guild, { customId: draftControl(d, 'basics'), memberPermissions: new PermissionsBitField(P.ManageGuild) })), /Administrador/);
    f.service.store.save(event({ guild: 'other' })); assert.throws(() => f.service.event(event().id, 'g'), /servidor/);
  } finally { f.store.close(); }
});

test('publicación y recuperación de fallos no duplican canales ni tarjetas, incluso sin referencias', async () => {
  const f = await fixture(); await f.service.setup(f.guild); const s = f.service.store; s.save(event({ status: 'publishing' }));
  try {
    await f.service.sync(f.guild, event().id); const t = s.get(event().id), count = f.created.length, posts = f.sent.length;
    delete t.registrationMessage; delete t.announcementMessage; delete t.registrationChannel; delete t.teamsChannel; t.dirty = true; s.save(t);
    const restarted = new Tournaments(f.bot); await restarted.sync(f.guild, t.id);
    assert.equal(f.created.length, count); assert.equal(f.sent.length, posts);
    s.register(t.id, [player(1), player(2), player(3)], 'The Retros'); await restarted.sync(f.guild, t.id);
    const team = s.teams(t.id)[0]; delete team.message; s.saveTeam(team); const posted = f.sent.length;
    await restarted.sync(f.guild, t.id); assert.equal(f.sent.length, posted);
    const saved = s.get(t.id); f.channels.delete(saved.registrationChannel); f.channels.delete(saved.teamsChannel);
    await restarted.sync(f.guild, t.id); assert.equal(f.created.length, count + 2); assert.notEqual(s.get(t.id).registrationChannel, saved.registrationChannel); assert.ok(s.teams(t.id)[0].message);
  } finally { f.store.close(); }
});

test('convocatoria cerrada conserva la voz; terminar conserva todo hasta los 7 días, incluso con salas ocupadas', async () => {
  const f = await fixture(); await f.service.setup(f.guild); const s = f.service.store; s.save(event());
  const a = f.member('u1', true), b = f.member('u2'), c = f.member('u3', true);
  try {
    s.register(event().id, [player(1), player(2), player(3)], 'Trío VEX'); await f.service.sync(f.guild, event().id);
    const general = await f.service.createVoices(f.guild, event().id, false); assert.match(general, /Traslados: 2/); assert.match(general, /Desconectados: 1/);
    const t = s.get(event().id); assert.ok(a.roles.cache.has(t.voiceRole)); assert.ok(b.roles.cache.has(t.voiceRole)); assert.equal(f.roles.get(t.voiceRole).permissions.bitfield, 0n);
    const report = await f.service.createVoices(f.guild, t.id, true); assert.match(report, /Traslados: 2/);
    const team = s.teams(t.id)[0], voice = f.channels.get(team.voiceChannel); assert.equal(voice.userLimit, 3);
    assert.deepEqual(voice.permissionOverwrites.filter(o => /^u/.test(o.id)).map(o => o.id), ['u1', 'u2', 'u3']);
    const count = f.created.length, messages = f.sent.length; await f.service.createVoices(f.guild, t.id, true); assert.equal(f.created.length, count); assert.equal(f.sent.length, messages);
    await f.service.sync(f.guild, t.id); assert.ok(f.channels.has(t.voiceChannel), 'empty general survives while open');
    s.closeRegistration(t.id); await f.service.sync(f.guild, t.id);
    assert.ok(f.channels.has(team.voiceChannel)); assert.ok(f.channels.has(t.voiceChannel), 'empty general survives registration closure');
    await f.service.createVoices(f.guild, t.id, true);
    const panel = f.sent.find(m => m.id === t.registrationMessage).payload; assert.ok(panel.components[0].toJSON().components.every(b => b.disabled));
    const finished = s.finish(t.id); await f.service.sync(f.guild, t.id, finished.deleteAt - 1);
    assert.ok(f.channels.has(t.registrationChannel)); assert.ok(f.channels.has(t.teamsChannel)); assert.ok(f.channels.has(team.voiceChannel));
    await assert.rejects(f.service.createVoices(f.guild, t.id, false), /terminó/);
    await f.service.sync(f.guild, t.id, finished.deleteAt);
    assert.ok(!f.channels.has(team.voiceChannel)); assert.ok(!f.channels.has(t.voiceChannel)); assert.ok(!f.roles.has(t.voiceRole));
    assert.ok(!f.channels.has(t.registrationChannel)); assert.ok(!f.channels.has(t.teamsChannel));
    assert.ok(f.channels.has(t.announcementChannel), 'shared announcements survive');
    assert.equal(s.entries(t.id).length, 3); assert.equal(s.teams(t.id).length, 1, 'history is retained');
    const deleted = s.get(t.id), countAfter = f.created.length, postsAfter = f.sent.length;
    assert.equal(deleted.channelsDeletedAt, finished.deleteAt);
    const announcement = f.sent.find(m => m.id === t.announcementMessage).payload;
    assert.match(JSON.stringify(announcement), /CANALES ELIMINADOS/); assert.doesNotMatch(JSON.stringify(announcement), new RegExp(`<#${t.registrationChannel}>`));
    await new Tournaments(f.bot).sync(f.guild, t.id, finished.deleteAt + 1000);
    assert.equal(f.created.length, countAfter); assert.equal(f.sent.length, postsAfter, 'cleanup never recreates channels or messages');
  } finally { f.store.close(); }
});

test('migración v4 respalda y conserva perfiles, inscripciones y equipos al reiniciar', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vex-tournaments-')), filename = path.join(dir, 'vex.sqlite'); let store = new Store(filename);
  try {
    await store.migrate(); const p = { ...player(1), schemaVersion: 3 }; store.saveProfile('g', 'u1', p);
    const before = store.profile('g', 'u1'); store.db.exec('PRAGMA user_version=4');
    const snapshot = await store.migrate(); assert.ok(existsSync(snapshot)); assert.equal(store.schemaVersion, 9); assert.deepEqual(store.profile('g', 'u1'), before);
    const backup = new DatabaseSync(snapshot); assert.equal(backup.prepare('PRAGMA user_version').get().user_version, 4); backup.close();
    const s = new TournamentStore(store); s.save(event()); s.register(event().id, [player(1)]); s.register(event().id, [player(2)]); s.register(event().id, [player(3)]); s.form(event().id);
    store.close(); store = new Store(filename); assert.equal(await store.migrate(), null);
    const reopened = new TournamentStore(store); assert.equal(reopened.entries(event().id).length, 3); assert.equal(reopened.teams(event().id).length, 1); assert.equal(reopened.form(event().id).teams.length, 0);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('dos confirmaciones simultáneas respetan el último cupo y no duplican equipos', async () => {
  const f = await fixture(), s = f.service.store, t = event({ capacity: 1 }); s.save(t);
  try {
    s.register(t.id, [player(1)]); s.register(t.id, [player(2)]);
    const results = await Promise.allSettled([player(3), player(4)].map(p => f.bot.queue(`tournament:${t.id}`, async () => s.register(t.id, [p]))));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(s.entries(t.id).length, 3);
    await Promise.all([1, 2].map(() => f.bot.queue(`tournament:${t.id}`, async () => s.form(t.id))));
    assert.equal(s.teams(t.id).length, 1);
  } finally { f.store.close(); }
});

test('recuperación de voz no vuelve a mover miembros y rechaza roles con privilegios', async () => {
  const f = await fixture(); await f.service.setup(f.guild); const s = f.service.store, t = event(); s.save(t);
  const a = f.member('u1', true);
  try {
    s.register(t.id, [player(1)]); await f.service.sync(f.guild, t.id);
    await f.service.createVoices(f.guild, t.id, false); const saved = s.get(t.id), voice = f.channels.get(saved.voiceChannel);
    voice.members.clear(); a.voice.channelId = 'lobby';
    const restarted = new Tournaments(f.bot); await restarted.sync(f.guild, t.id); assert.equal(a.voice.channelId, 'lobby');
    f.roles.get(saved.voiceRole).permissions = new PermissionsBitField(P.Administrator);
    const b = f.member('u2'); s.register(t.id, [player(2)]);
    await assert.rejects(restarted.createVoices(f.guild, t.id, false), /permisos globales/); assert.equal(b.roles.cache.has(saved.voiceRole), false);
  } finally { f.store.close(); }
});

test('carteles públicos horizontales etiquetan solo THE FINALS y las actualizaciones no repiten el aviso', async () => {
  const f = await fixture(); await f.service.setup(f.guild);
  f.store.saveSettings('g', { ...f.store.settings('g'), finalsRole: 'finals' });
  const rendered = []; f.bot.renderer = { render: async (...args) => { rendered.push(args); return Buffer.from('poster'); } };
  const s = f.service.store, t = event(); s.save(t);
  try {
    await f.service.sync(f.guild, t.id);
    const saved = s.get(t.id), announcement = f.sent.find(m => m.id === saved.announcementMessage), registration = f.sent.find(m => m.id === saved.registrationMessage);
    for (const message of [announcement, registration]) {
      assert.equal(message.payload.content, '<@&finals>');
      assert.equal(message.payload.embeds[0].data.description, undefined);
      assert.match(message.payload.embeds[0].data.image.url, /tournament-poster/);
    }
    assert.deepEqual(announcement.payload.allowedMentions.roles, ['finals']);
    assert.deepEqual(announcement.payload.allowedMentions.parse, []);
    assert.deepEqual(registration.payload.allowedMentions.roles, []);
    assert.ok(rendered.every(([kind, , width]) => kind === 'tournament-poster' && width === 1100));
    s.save({ ...saved, dirty: true }); await f.service.sync(f.guild, t.id);
    assert.deepEqual(announcement.payload.allowedMentions.roles, []);
    assert.equal(announcement.payload.content, '<@&finals>');
    assert.equal(f.sent.length, 2);
  } finally { f.store.close(); }
});

test('tarjetas escapan HTML y muestran reglas y RS aproximado; renderizador falla a texto', async () => {
  const t = event({ name: '<img src=x onerror=alert(1)>' });
  const html = template('tournament', t); assert.ok(html.includes('&lt;img')); assert.ok(!html.includes('<img src=x')); assert.match(html, /ESPECIALIZACIONES BANEADAS/);
  const team = { id: 'team', name: 'The Retros', people: [player(1, { approximate: true }), player(2), player(3)], tournamentName: t.name };
  assert.match(template('tournament-team', team, 390), /≈/);
  const f = await fixture(); try { f.bot.renderer = { render: async () => { throw new Error('offline'); } }; const payload = teamPayload(t, team, team.people); assert.equal(await f.service.graphic(payload, 'tournament-team', team), payload); assert.equal(payload.files, undefined); } finally { f.store.close(); }
});
