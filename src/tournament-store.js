import { UserError } from './domain.js';
import { tournamentId, embarkKey, validateEntrant, validateSignupMode, shortName, balanceTeams, uniqueTeamName, tournamentPlayable, TOURNAMENT_RETENTION_MS } from './tournament-domain.js';

export const tournamentSchema = `
CREATE TABLE IF NOT EXISTS tournaments(id TEXT PRIMARY KEY, guild TEXT NOT NULL, data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS tournaments_guild ON tournaments(guild);
CREATE TABLE IF NOT EXISTS tournament_teams(id TEXT PRIMARY KEY, tournament TEXT NOT NULL REFERENCES tournaments(id), name_key TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(tournament,name_key));
CREATE TABLE IF NOT EXISTS tournament_entries(id TEXT PRIMARY KEY, tournament TEXT NOT NULL REFERENCES tournaments(id), embark_key TEXT NOT NULL, discord_user TEXT, team TEXT REFERENCES tournament_teams(id), data TEXT NOT NULL, UNIQUE(tournament,embark_key));
CREATE UNIQUE INDEX IF NOT EXISTS tournament_player ON tournament_entries(tournament,discord_user) WHERE discord_user IS NOT NULL;
`;
export class TournamentStore {
  constructor(store) { this.db = store.db; }
  get(id) { const row = this.db.prepare('SELECT data FROM tournaments WHERE id=?').get(id); return row ? JSON.parse(row.data) : null; }
  list(guild) { return this.db.prepare('SELECT data FROM tournaments WHERE guild=? ORDER BY rowid DESC').all(guild).map(r => JSON.parse(r.data)); }
  save(t) { this.db.prepare('INSERT INTO tournaments VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(t.id, t.guild, JSON.stringify(t)); return t; }
  entries(id) { return this.db.prepare('SELECT data,team FROM tournament_entries WHERE tournament=? ORDER BY rowid').all(id).map(r => ({ ...JSON.parse(r.data), team: r.team })); }
  teams(id) { return this.db.prepare('SELECT data FROM tournament_teams WHERE tournament=? ORDER BY rowid').all(id).map(r => JSON.parse(r.data)); }
  saveTeam(team) { this.db.prepare('INSERT INTO tournament_teams VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name_key=excluded.name_key,data=excluded.data').run(team.id, team.tournament, embarkKey(team.name), JSON.stringify(team)); return team; }
  transaction(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const result = fn(); this.db.exec('COMMIT'); return result; } catch (e) { this.db.exec('ROLLBACK'); throw e; } }
  closeRegistration(id, now = Date.now()) {
    const t = this.get(id);
    if (!t || !tournamentPlayable(t)) throw new UserError('Solo puedes cerrar la convocatoria de un torneo publicado que no haya terminado.');
    t.status = 'closed'; t.closedAt ??= now; t.dirty = true;
    return this.save(t);
  }
  finish(id, now = Date.now()) {
    const t = this.get(id);
    if (t?.status === 'finished') return t; // Repeated confirmations never extend retention.
    if (!t || !tournamentPlayable(t)) throw new UserError('Publica el torneo antes de darlo por terminado.');
    t.status = 'finished'; t.closedAt ??= now; t.finishedAt = now;
    t.deleteAt = now + TOURNAMENT_RETENTION_MS; t.dirty = true;
    return this.save(t);
  }
  register(id, people, teamName = null, now = Date.now(), captainUser = null) {
    return this.transaction(() => {
      const t = this.get(id);
      if (!t || t.status !== 'open') throw new UserError('Las inscripciones de este torneo están cerradas.');
      validateSignupMode(t, teamName || people.length > 1 ? 'team' : 'solo');
      if (people.length !== (teamName ? 3 : 1)) throw new UserError('Los equipos deben tener exactamente tres integrantes.');
      const existing = this.entries(id), seen = new Set(existing.map(p => embarkKey(p.embarkId))), users = new Set(existing.map(p => p.user).filter(Boolean));
      if (t.capacity != null && existing.length + people.length > t.capacity * 3) throw new UserError('No quedan suficientes cupos disponibles.');
      const checked = people.map(p => {
        const value = validateEntrant(p, t), key = embarkKey(value.embarkId);
        if (seen.has(key) || (p.user && users.has(p.user))) throw new UserError(`${value.embarkId} ya está inscrito o aparece más de una vez.`);
        if (t.access === 'clan' && (!p.user || !p.clanVerified)) throw new UserError('Todos los jugadores necesitan rol VXTG.');
        seen.add(key); if (p.user) users.add(p.user);
        return { ...value, id: tournamentId(), created: now };
      });
      let team = null;
      if (teamName) {
        const name = shortName(teamName, 'Equipo');
        if (this.teams(id).some(x => embarkKey(x.name) === embarkKey(name))) throw new UserError('Ya existe un equipo con ese nombre.');
        if (captainUser && !checked.some(p => p.user === captainUser)) throw new UserError('El líder debe estar inscrito en su equipo.');
        team = this.saveTeam({ id: tournamentId(), tournament: id, name, created: now, source: 'premade', leader: captainUser ?? checked[0]?.user ?? null });
      }
      for (const p of checked) this.db.prepare('INSERT INTO tournament_entries VALUES (?,?,?,?,?,?)').run(p.id, id, embarkKey(p.embarkId), p.user ?? null, team?.id ?? null, JSON.stringify(p));
      t.dirty = true; this.save(t);
      return { team, entries: checked };
    });
  }
  form(id, random = Math.random, currentProfiles = new Map()) {
    return this.transaction(() => {
      const t = this.get(id);
      if (!t || !tournamentPlayable(t)) throw new UserError('El torneo terminó o todavía no fue publicado.');
      const people = this.entries(id).filter(p => !p.team).map(p => {
        const profile = currentProfiles.get(p.user);
        if (profile && embarkKey(profile.embarkId) === embarkKey(p.embarkId) && Number.isInteger(profile.score) && profile.score >= 0 && profile.score <= 999999) {
          const latest = { ...p, score: profile.score, playerClass: profile.playerClass ?? null,
            specializationIds: profile.specializationIds ?? [], approximate: false };
          this.db.prepare('UPDATE tournament_entries SET data=? WHERE id=?').run(JSON.stringify(latest), p.id);
          return latest;
        }
        return p;
      });
      const result = balanceTeams(people, random), used = this.teams(id).map(t => t.name), created = [];
      for (const members of result.teams) {
        const leader = [...members].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.created - b.created || a.id.localeCompare(b.id))[0];
        const team = this.saveTeam({ id: tournamentId(), tournament: id, name: uniqueTeamName(used), created: Date.now(), source: 'balanced', leader: leader.user ?? null });
        used.push(team.name); created.push(team);
        for (const p of members) this.db.prepare('UPDATE tournament_entries SET team=? WHERE id=? AND team IS NULL').run(team.id, p.id);
      }
      t.dirty = true; this.save(t);
      return { teams: created, pending: result.pending.length };
    });
  }
  renameTeam(id, user, name) {
    return this.transaction(() => {
      const team = this.teams(id).find(x => x.id === name.team);
      if (!team || team.leader !== user) throw new UserError('Solo el líder puede cambiar el nombre de este equipo.');
      const t = this.get(id);
      if (!t || t.status === 'finished') throw new UserError('El torneo ya terminó.');
      const clean = shortName(name.value, 'Equipo');
      if (this.teams(id).some(x => x.id !== team.id && embarkKey(x.name) === embarkKey(clean))) throw new UserError('Ya existe un equipo con ese nombre.');
      team.name = clean; team.cardVersion = 0;
      this.saveTeam(team);
      return team;
    });
  }
  withdraw(id, user) {
    return this.transaction(() => {
      const t = this.get(id);
      if (!t || t.status === 'finished') throw new UserError('El torneo ya terminó.');
      const entry = this.entries(id).find(p => p.user === user);
      if (!entry) throw new UserError('No tienes inscripción en este torneo.');
      const team = entry.team ? this.teams(id).find(x => x.id === entry.team) : null;
      if (team?.source === 'premade' && team.leader !== user) throw new UserError('Solo el líder puede cancelar un equipo inscrito. Pídele que lo gestione.');
      const removedUsers = team?.source === 'premade' ? this.entries(id).filter(p => p.team === team.id).map(p => p.user).filter(Boolean) : [user];
      if (team) {
        if (team.source === 'premade') this.db.prepare('DELETE FROM tournament_entries WHERE tournament=? AND team=?').run(id, team.id);
        else this.db.prepare('UPDATE tournament_entries SET team=NULL WHERE tournament=? AND team=?').run(id, team.id);
        this.db.prepare('DELETE FROM tournament_teams WHERE id=?').run(team.id);
      }
      if (!team || team.source === 'balanced') this.db.prepare('DELETE FROM tournament_entries WHERE id=?').run(entry.id);
      t.dirty = true; this.save(t);
      return { entry, team, removedUsers };
    });
  }
  updateDetails(id, revision, next) {
    return this.transaction(() => {
      const t = this.get(id);
      if (!t || !tournamentPlayable(t)) throw new UserError('Solo se pueden editar torneos publicados y no terminados.');
      if ((t.editRevision ?? 0) !== revision) throw new UserError('Otro administrador modificó el torneo. Abre /torneo editar de nuevo.');
      const entries = this.entries(id), teams = this.teams(id);
      if (next.capacity != null && entries.length > next.capacity * 3) throw new UserError('Los cupos nuevos son menores que las inscripciones actuales.');
      if (next.registrationMode === 'solo' && teams.some(x => x.source === 'premade')) throw new UserError('Ya hay equipos inscritos; conserva la modalidad mixta.');
      if (next.access === 'clan' && entries.some(p => !p.clanVerified)) throw new UserError('Hay inscritos sin rol VXTG. Mantén el acceso público.');
      for (const entry of entries) if (entry.score != null) validateEntrant(entry, next);
      Object.assign(t, next, { dirty: true, editRevision: revision + 1 });
      return this.save(t);
    });
  }
}
