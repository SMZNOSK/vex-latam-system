import { DatabaseSync, backup } from 'node:sqlite';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { UserError, compatible, migrateProfile, migrateFilters } from './domain.js';
import { tournamentSchema } from './tournament-store.js';
import { clanSchema } from './clan-store.js';
import { applyProfileRS, recordRS, rsIdentity } from './profile-rs.js';

export class Store {
  constructor(filename) {
    this.filename = filename;
    this.db = new DatabaseSync(filename);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS profiles (
        guild TEXT NOT NULL, user TEXT NOT NULL, data TEXT NOT NULL,
        PRIMARY KEY (guild, user)
      );
      CREATE TABLE IF NOT EXISTS settings (guild TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS searches (
        id TEXT PRIMARY KEY, guild TEXT NOT NULL, host TEXT NOT NULL,
        channel TEXT NOT NULL, message TEXT, status TEXT NOT NULL,
        expires INTEGER NOT NULL, created INTEGER NOT NULL, data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS searches_guild ON searches(guild, status);
      CREATE TABLE IF NOT EXISTS voice_rooms (
        search_id TEXT PRIMARY KEY, guild TEXT NOT NULL, channel TEXT NOT NULL UNIQUE, data TEXT NOT NULL
      );
    `);
    this.schemaVersion = this.db.prepare('PRAGMA user_version').get().user_version;
  }
  close() { this.db.close(); }
  async migrate() {
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version >= 9) return null;
    let snapshot = null;
    if (this.filename !== ':memory:') {
      const dir = path.join(path.dirname(this.filename), 'backups');
      mkdirSync(dir, { recursive: true });
      snapshot = path.join(dir, `vex-before-v9-${Date.now()}.sqlite`);
      await backup(this.db, snapshot);
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec(`CREATE TABLE IF NOT EXISTS role_jobs (guild TEXT NOT NULL, user TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, next INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(guild,user));`);
      if (version < 4) for (const row of this.db.prepare('SELECT guild,user,data FROM profiles').all()) {
        this.db.prepare('UPDATE profiles SET data=? WHERE guild=? AND user=?')
          .run(JSON.stringify(migrateProfile(JSON.parse(row.data))), row.guild, row.user);
        this.queueRole(row.guild, row.user);
      }
      if (version < 2) for (const row of this.db.prepare('SELECT id,data FROM searches').all()) {
        const data = JSON.parse(row.data);
        data.schemaVersion = 2;
        data.filters = migrateFilters(data.filters);
        this.db.prepare('UPDATE searches SET data=? WHERE id=?').run(JSON.stringify(data), row.id);
      }
      if(version<9)for(const row of this.db.prepare('SELECT guild,user,data FROM profiles').all()){
        const p=JSON.parse(row.data);
        p.peakScore=recordRS(p);p.peakRecordedAt??=p.rankUpdatedAt??p.updatedAt??Date.now();p.peakEmbarkKey=rsIdentity(p.embarkId);
        this.db.prepare('UPDATE profiles SET data=? WHERE guild=? AND user=?').run(JSON.stringify(p),row.guild,row.user);
      }
      this.db.exec(`CREATE TABLE IF NOT EXISTS managed_embeds (
        guild TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(guild,name));
        CREATE TABLE IF NOT EXISTS reaction_choices (
        guild TEXT NOT NULL, user TEXT NOT NULL, role TEXT NOT NULL, PRIMARY KEY(guild,user,role));
        CREATE TABLE IF NOT EXISTS reaction_role_jobs (
        guild TEXT NOT NULL, user TEXT NOT NULL, role TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
        next INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(guild,user,role));
        CREATE TABLE IF NOT EXISTS welcome_events (
        guild TEXT NOT NULL, user TEXT NOT NULL, joined INTEGER NOT NULL, message TEXT NOT NULL,
        PRIMARY KEY(guild,user,joined));
        CREATE TABLE IF NOT EXISTS farewell_events (
        guild TEXT NOT NULL, user TEXT NOT NULL, joined INTEGER, departed INTEGER NOT NULL, message TEXT NOT NULL,
        PRIMARY KEY(guild,user,message));
        CREATE INDEX IF NOT EXISTS farewell_membership ON farewell_events(guild,user,joined);
        ${tournamentSchema}
        ${clanSchema}
        PRAGMA user_version=9; COMMIT`);
      this.schemaVersion = 9;
      return snapshot;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  queueRole(guild, user) {
    this.db.prepare('INSERT INTO role_jobs (guild,user) VALUES (?,?) ON CONFLICT(guild,user) DO UPDATE SET next=0')
      .run(guild, user);
  }
  roleJobs(guild, now = Date.now()) {
    return this.db.prepare('SELECT * FROM role_jobs WHERE guild=? AND next<=? ORDER BY next LIMIT 50').all(guild, now);
  }
  finishRole(guild, user) { this.db.prepare('DELETE FROM role_jobs WHERE guild=? AND user=?').run(guild, user); }
  retryRole(guild, user, now = Date.now()) {
    this.db.prepare('UPDATE role_jobs SET attempts=attempts+1,next=? WHERE guild=? AND user=?').run(now + 60000, guild, user);
  }
  reservePing(guild, now = Date.now(), interval = 600000) {
    const settings = this.settings(guild);
    if (settings.lastFinalsPing != null && now - settings.lastFinalsPing < interval) return false;
    settings.lastFinalsPing = now;
    this.saveSettings(guild, settings);
    return true;
  }
  settings(guild) {
    const row = this.db.prepare('SELECT data FROM settings WHERE guild=?').get(guild);
    return row ? JSON.parse(row.data) : { panels: {}, roles: [], moderation: { enabled: false, terms: [] } };
  }
  saveSettings(guild, value) {
    this.db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(guild) DO UPDATE SET data=excluded.data')
      .run(guild, JSON.stringify(value));
  }
  embed(guild, name) {
    const row = this.db.prepare('SELECT data FROM managed_embeds WHERE guild=? AND name=?').get(guild, name);
    return row ? JSON.parse(row.data) : null;
  }
  embeds(guild) {
    return this.db.prepare('SELECT data FROM managed_embeds WHERE guild=? ORDER BY name').all(guild).map(row => JSON.parse(row.data));
  }
  saveEmbed(guild, value) {
    this.db.prepare('INSERT INTO managed_embeds VALUES (?,?,?) ON CONFLICT(guild,name) DO UPDATE SET data=excluded.data')
      .run(guild, value.name, JSON.stringify(value));
  }
  removeEmbed(guild, name) { this.db.prepare('DELETE FROM managed_embeds WHERE guild=? AND name=?').run(guild, name); }
  welcomed(guild, user, joined) {
    return Boolean(this.db.prepare('SELECT 1 FROM welcome_events WHERE guild=? AND user=? AND joined=?').get(guild, user, joined));
  }
  saveWelcome(guild, user, joined, message) {
    this.db.prepare('INSERT OR IGNORE INTO welcome_events VALUES (?,?,?,?)').run(guild, user, joined, message);
  }
  farewelled(guild, user, joined, now = Date.now()) {
    return Boolean(Number.isInteger(joined)
      ? this.db.prepare('SELECT 1 FROM farewell_events WHERE guild=? AND user=? AND joined=?').get(guild, user, joined)
      : this.db.prepare('SELECT 1 FROM farewell_events WHERE guild=? AND user=? AND departed>=?').get(guild, user, now - 60000));
  }
  saveFarewell(guild, user, joined, message, now = Date.now()) {
    this.db.prepare('INSERT OR IGNORE INTO farewell_events VALUES (?,?,?,?,?)')
      .run(guild, user, Number.isInteger(joined) ? joined : null, now, message);
  }
  reactionChoice(guild, user, role) {
    if (this.schemaVersion < 3) return false;
    return Boolean(this.db.prepare('SELECT 1 FROM reaction_choices WHERE guild=? AND user=? AND role=?').get(guild, user, role));
  }
  reactionUsers(guild, role) {
    return this.db.prepare('SELECT user FROM reaction_choices WHERE guild=? AND role=?').all(guild, role).map(row => row.user);
  }
  forgetReactionRole(guild, role) {
    this.db.prepare('DELETE FROM reaction_choices WHERE guild=? AND role=?').run(guild, role);
    this.db.prepare('DELETE FROM reaction_role_jobs WHERE guild=? AND role=?').run(guild, role);
  }
  chooseReaction(guild, user, role, selected) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (selected) this.db.prepare('INSERT OR IGNORE INTO reaction_choices VALUES (?,?,?)').run(guild, user, role);
      else this.db.prepare('DELETE FROM reaction_choices WHERE guild=? AND user=? AND role=?').run(guild, user, role);
      this.db.prepare('INSERT INTO reaction_role_jobs(guild,user,role) VALUES (?,?,?) ON CONFLICT(guild,user,role) DO UPDATE SET next=0')
        .run(guild, user, role);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  reactionJobs(guild, now = Date.now()) {
    return this.db.prepare('SELECT * FROM reaction_role_jobs WHERE guild=? AND next<=? ORDER BY next LIMIT 50').all(guild, now);
  }
  finishReactionJob(guild, user, role) { this.db.prepare('DELETE FROM reaction_role_jobs WHERE guild=? AND user=? AND role=?').run(guild, user, role); }
  retryReactionJob(guild, user, role, now = Date.now()) {
    this.db.prepare('UPDATE reaction_role_jobs SET attempts=attempts+1,next=? WHERE guild=? AND user=? AND role=?')
      .run(now + 60000, guild, user, role);
  }
  profile(guild, user) {
    const row = this.db.prepare('SELECT data FROM profiles WHERE guild=? AND user=?').get(guild, user);
    return row ? { user, ...JSON.parse(row.data) } : null;
  }
  profiles(guild) {
    return this.db.prepare('SELECT user,data FROM profiles WHERE guild=?').all(guild)
      .map(row => ({ user: row.user, ...JSON.parse(row.data) }));
  }
  imageKeys() {
    return this.db.prepare('SELECT data FROM profiles').all().map(row => JSON.parse(row.data).cardImage?.key).filter(Boolean);
  }
  saveProfile(guild, user, input) {
    const old = this.profile(guild, user);
    const value = { searchable: true, ...applyProfileRS(old,input), updatedAt: Math.max(Date.now(), (old?.updatedAt ?? 0) + 1) };
    delete value.user;
    if (this.schemaVersion >= 2) this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO profiles VALUES (?,?,?) ON CONFLICT(guild,user) DO UPDATE SET data=excluded.data')
        .run(guild, user, JSON.stringify(value));
      if (this.schemaVersion >= 2) { this.queueRole(guild, user); this.db.exec('COMMIT'); }
    } catch (error) { if (this.schemaVersion >= 2) this.db.exec('ROLLBACK'); throw error; }
    return this.profile(guild, user);
  }
  search(id) {
    const row = this.db.prepare('SELECT * FROM searches WHERE id=?').get(id);
    if (!row) return null;
    const value = { ...row, ...JSON.parse(row.data) }, room = this.voiceRoom(id);
    if (room) value.voiceChannel = room.channel;
    return value;
  }
  voiceRoom(searchId) {
    const row = this.db.prepare('SELECT data FROM voice_rooms WHERE search_id=?').get(searchId);
    return row ? JSON.parse(row.data) : null;
  }
  voiceRooms(guild) {
    return this.db.prepare('SELECT data FROM voice_rooms WHERE guild=?').all(guild).map(row => JSON.parse(row.data));
  }
  saveVoiceRoom(room) {
    this.db.prepare(`INSERT INTO voice_rooms VALUES (?,?,?,?) ON CONFLICT(search_id)
      DO UPDATE SET guild=excluded.guild,channel=excluded.channel,data=excluded.data`)
      .run(room.searchId, room.guild, room.channel, JSON.stringify(room));
  }
  removeVoiceRoom(searchId) { this.db.prepare('DELETE FROM voice_rooms WHERE search_id=?').run(searchId); }
  searches(guild) {
    return this.db.prepare("SELECT id FROM searches WHERE guild=? AND status IN ('open','pending')").all(guild)
      .map(row => this.search(row.id));
  }
  pendingSearchMirrors(guild) {
    return this.db.prepare("SELECT id FROM searches WHERE guild=? AND json_extract(data, '$.mirrorPending')=1").all(guild)
      .map(row => this.search(row.id));
  }
  activeSearch(guild, host, now = Date.now()) {
    const row = this.db.prepare("SELECT id FROM searches WHERE guild=? AND host=? AND status IN ('open','pending') AND expires>? ORDER BY created LIMIT 1")
      .get(guild, host, now);
    return row ? this.search(row.id) : null;
  }
  createSearch(guild, host, channel, filters, lifetime, _cooldown, now = Date.now()) {
    if (this.activeSearch(guild, host, now)) {
      throw new UserError('Ya tienes una búsqueda activa, normal o HOT. Ciérrala desde Mis equipos o espera a que caduque antes de crear otra.');
    }
    const profile = this.profile(guild, host);
    if (filters.mode !== 'HOT' && (!profile || !profile.searchable || profile.needsCompletion)) throw new UserError('Primero completa y activa tu perfil en registro-de-datos.');
    const value = { id: randomUUID(), guild, host, channel, message: null, status: 'pending',
      created: now, expires: now + lifetime, filters, members: [host] };
    this.insertSearch(value);
    return value;
  }
  insertSearch(value) {
    this.db.prepare('INSERT INTO searches VALUES (?,?,?,?,?,?,?,?,?)').run(value.id, value.guild, value.host,
      value.channel, value.message ?? null, value.status, value.expires, value.created,
      JSON.stringify({ schemaVersion: 2, filters: value.filters, members: value.members, relocations: value.relocations ?? [], mirrors: value.mirrors ?? [], mirrorPending: value.mirrorPending ?? false }));
  }
  updateSearch(value) {
    this.db.prepare('UPDATE searches SET channel=?,message=?,status=?,data=? WHERE id=?').run(value.channel, value.message ?? null,
      value.status, JSON.stringify({ schemaVersion: 2, filters: value.filters, members: value.members, relocations: value.relocations ?? [], mirrors: value.mirrors ?? [], mirrorPending: value.mirrorPending ?? false }), value.id);
  }
  removeSearch(id) { this.db.prepare('DELETE FROM searches WHERE id=?').run(id); }
  join(id, user, now = Date.now()) {
    const s = this.search(id);
    if (!s || s.status !== 'open' || s.expires <= now) throw new UserError('La búsqueda ya terminó.');
    if (s.members.includes(user)) throw new UserError('Ya estás en este equipo.');
    if (s.members.length >= s.filters.teammates + 1) throw new UserError('El equipo está completo.');
    if (s.filters.mode !== 'HOT' && !compatible(this.profile(s.guild, user), s.filters)) throw new UserError('Tu perfil no coincide con los filtros o está pausado. Puedes editarlo desde el registro.');
    s.members.push(user);
    this.updateSearch(s);
    return s;
  }
  leave(id, user) {
    const s = this.search(id);
    if (!s || s.status !== 'open' || s.expires <= Date.now()) throw new UserError('La búsqueda ya terminó.');
    if (s.host === user) throw new UserError('Como organizador, usa Cerrar búsqueda.');
    if (!s.members.includes(user)) throw new UserError('No estás en este equipo.');
    s.members = s.members.filter(x => x !== user);
    this.updateSearch(s);
    return s;
  }
  expire(now = Date.now()) {
    const rows = this.db.prepare("SELECT id FROM searches WHERE status IN ('open','pending') AND expires<=?").all(now);
    this.db.prepare("UPDATE searches SET status='expired' WHERE status IN ('open','pending') AND expires<=?").run(now);
    return rows.map(row => row.id);
  }
  deleteProfile(guild, user) {
    const affected = [];
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM profiles WHERE guild=? AND user=?').run(guild, user);
      if (this.schemaVersion >= 2) this.queueRole(guild, user);
      for (const s of this.searches(guild)) {
        if (!s.members.includes(user)) continue;
        if (s.host === user) s.status = 'closed';
        s.members = s.members.filter(x => x !== user);
        this.updateSearch(s);
        affected.push(s.id);
      }
      this.db.exec('COMMIT');
      return affected;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
}
