import { randomBytes } from 'node:crypto';
import { UserError, score, validateIdentity } from './domain.js';
import { classes, specializations } from './catalog.js';

export const tournamentId = () => randomBytes(8).toString('hex');
export const embarkKey = value => String(value).normalize('NFKC').trim().toLowerCase();
export const rsLabel = p => p.score == null ? 'RS sin registrar' : `${p.approximate ? '≈ ' : ''}${p.score.toLocaleString('es-MX')} RS`;
export function tournamentEmbarkId(value) {
  const id = String(value ?? '').normalize('NFKC').trim();
  if (!/^[^#\r\n<>@`]{2,64}#\d{4}$/.test(id)) throw new UserError('Escribe el Embark ID completo, por ejemplo Jugador#1234.');
  return id;
}
export const localDate = ms => new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'long', timeStyle: 'short' }).format(ms);
export const TOURNAMENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const tournamentPlayable = t => ['open', 'closed'].includes(t.status);
export const tournamentRegistrationModes = [
  { value: 'mixed', label: 'Individual o equipo de tres' },
  { value: 'solo', label: 'Solo individual · equipos después' },
];
export function validateRegistrationMode(value) {
  const mode = value ?? 'mixed'; // Existing tournaments retain both registration options.
  if (!tournamentRegistrationModes.some(option => option.value === mode)) throw new UserError('Selecciona una modalidad de inscripción válida.');
  return mode;
}
export function validateSignupMode(t, mode) {
  if (!['solo', 'team'].includes(mode)) throw new UserError('Tipo de inscripción inválido.');
  if (validateRegistrationMode(t.registrationMode) === 'solo' && mode === 'team') {
    throw new UserError('Este torneo solo admite inscripciones individuales. Los equipos se forman después.');
  }
}
export const tournamentStatus = t => t.channelsDeletedAt ? 'TERMINADO · CANALES ELIMINADOS'
  : ({ open: 'INSCRIPCIONES ABIERTAS', publishing: 'PREPARANDO TORNEO', closed: 'CONVOCATORIA CERRADA', finished: 'TORNEO TERMINADO' }[t.status] ?? t.status);
const tournamentZones = [
  ['México', 'CDMX · referencia', 'America/Mexico_City'],
  ['Guatemala', 'Ciudad de Guatemala', 'America/Guatemala'],
  ['Costa Rica', 'San José', 'America/Costa_Rica'],
  ['Colombia', 'Bogotá', 'America/Bogota'],
  ['Perú', 'Lima', 'America/Lima'],
  ['Ecuador', 'Quito', 'America/Guayaquil'],
  ['Venezuela', 'Caracas', 'America/Caracas'],
  ['Bolivia', 'La Paz', 'America/La_Paz'],
  ['Chile', 'Santiago', 'America/Santiago'],
  ['Argentina', 'Buenos Aires', 'America/Argentina/Buenos_Aires'],
  ['Uruguay', 'Montevideo', 'America/Montevideo'],
  ['Paraguay', 'Asunción', 'America/Asuncion'],
  ['Brasil', 'São Paulo / Brasília', 'America/Sao_Paulo'],
  ['US · Pacífico', 'Los Ángeles', 'America/Los_Angeles'],
  ['US · Centro', 'Chicago', 'America/Chicago'],
  ['US · Este', 'Nueva York', 'America/New_York'],
];
export function tournamentTimes(startsAt) {
  const dateKey = timeZone => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(startsAt);
  const referenceDate = dateKey('America/Mexico_City');
  return tournamentZones.map(([country, city, timeZone]) => ({ country, city, timeZone,
    time: new Intl.DateTimeFormat('es-MX', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(startsAt),
    // Show the local date whenever the conversion crosses midnight in either direction.
    date: dateKey(timeZone) === referenceDate ? '' : new Intl.DateTimeFormat('es-MX', { timeZone, day: '2-digit', month: 'short', year: 'numeric' }).format(startsAt),
  }));
}
export function mexicoDate(date, time, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new UserError('Usa fecha AAAA-MM-DD y hora HH:MM (24 horas), Ciudad de México.');
  // Mexico City has UTC-6 year-round for future tournaments. Round-trip rejects impossible dates.
  const stamp = Date.parse(`${date}T${time}:00-06:00`);
  if (!Number.isFinite(stamp)) throw new UserError('La fecha u hora no es válida.');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(stamp).map(p => [p.type, p.value]));
  if (`${parts.year}-${parts.month}-${parts.day}` !== date || `${parts.hour}:${parts.minute}` !== time || stamp <= now) throw new UserError('Selecciona una fecha y hora futura válida en Ciudad de México.');
  return stamp;
}
export function shortName(value, label = 'Nombre') {
  const name = String(value ?? '').trim();
  if (!name || name.length > 70 || /[\r\n<>@]/.test(name)) throw new UserError(`${label}: usa de 1 a 70 caracteres, sin menciones ni saltos de línea.`);
  return name;
}
export function validateBasics(value, now = Date.now()) {
  const name = shortName(value.name), startsAt = mexicoDate(value.date, value.time, now);
  const capacity = String(value.capacity ?? '').trim();
  if (capacity && (!/^\d{1,4}$/.test(capacity) || Number(capacity) < 1 || Number(capacity) > 1000)) throw new UserError('Cupos: indica de 1 a 1000 equipos o deja vacío para inscripción abierta.');
  if (!['public', 'clan'].includes(value.access)) throw new UserError('Selecciona acceso público o VXTG.');
  return { ...value, name, startsAt, capacity: capacity ? Number(capacity) : null };
}
export function allowedSkills(rules) {
  return specializations.filter(s => (!rules.allowedClasses.length || rules.allowedClasses.includes(s.playerClass)) && !rules.bannedClasses.includes(s.playerClass)
    && (!rules.allowedSkills.length || rules.allowedSkills.includes(s.id)) && !rules.bannedSkills.includes(s.id));
}
export function validateRules(value) {
  const r = { minRS: score(value.minRS, true), maxRS: score(value.maxRS, true) };
  if (r.minRS != null && r.maxRS != null && r.minRS > r.maxRS) throw new UserError('El piso de RS no puede superar el techo.');
  for (const [allow, ban, catalog] of [['allowedClasses', 'bannedClasses', classes], ['allowedSkills', 'bannedSkills', specializations.map(s => s.id)]]) {
    r[allow] = [...new Set(value[allow] ?? [])]; r[ban] = [...new Set(value[ban] ?? [])];
    if ([...r[allow], ...r[ban]].some(x => !catalog.includes(x))) throw new UserError('Hay una clase o especialización desconocida.');
    if (r[allow].some(x => r[ban].includes(x))) throw new UserError('No puedes permitir y banear la misma opción.');
  }
  const skills = allowedSkills(r);
  if (!skills.length) throw new UserError('Las restricciones deben dejar al menos una clase y especialización utilizables.');
  if (r.allowedSkills.some(id => !skills.some(s => s.id === id))) throw new UserError('Una especialización permitida pertenece a una clase excluida.');
  const explicitClasses = r.allowedClasses.filter(c => !r.bannedClasses.includes(c));
  if (explicitClasses.some(c => !skills.some(s => s.playerClass === c))) throw new UserError('Cada clase permitida debe tener al menos una especialización utilizable.');
  return r;
}
export function validateEntrant(p, tournament) {
  const identity = p.score == null ? { embarkId: tournamentEmbarkId(p.embarkId), score: null } : validateIdentity(p);
  if (identity.score == null) return { ...p, ...identity, playerClass: null, specializationIds: [], approximate: false };
  if (p.playerClass != null && !classes.includes(p.playerClass) && p.playerClass !== 'Todas las clases') throw new UserError('Actualiza la clase en Configurar perfil para este torneo.');
  const ids = [...new Set(p.specializationIds ?? [])];
  const usable = allowedSkills(tournament.rules).filter(s => p.playerClass == null || p.playerClass === 'Todas las clases' || s.playerClass === p.playerClass);
  if (ids.some(id => !usable.some(s => s.id === id))) throw new UserError('La clase o alguna especialización está excluida por las reglas del torneo.');
  if ((tournament.rules.minRS != null && identity.score < tournament.rules.minRS) || (tournament.rules.maxRS != null && identity.score > tournament.rules.maxRS)) throw new UserError(`${identity.embarkId}: RS fuera del intervalo permitido, también para valores aproximados.`);
  return { ...p, ...identity, approximate: Boolean(p.approximate), specializationIds: ids };
}
export function balanceTeams(players, random = Math.random) {
  const shuffled = [...players];
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  // Leave the newest registrations pending, so repeated runs don't starve early arrivals.
  const eligible = new Set([...players].sort((a, b) => a.created - b.created).slice(0, Math.floor(players.length / 3) * 3).map(p => p.id));
  const chosen = shuffled.filter(p => eligible.has(p.id)).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const teams = Array.from({ length: chosen.length / 3 }, () => []);
  const sum = team => team.reduce((n, p) => n + (p.score ?? 0), 0);
  for (const p of chosen) { const available = teams.filter(t => t.length < 3).sort((a, b) => sum(a) - sum(b)); available[0].push(p); }
  // Pairwise exchanges strictly reduce squared deviation of team totals.
  for (let pass = 0; pass < 30; pass++) {
    let improved = false;
    for (let a = 0; a < teams.length; a++) for (let b = a + 1; b < teams.length; b++) {
      let delta = sum(teams[a]) - sum(teams[b]), best = 0, swap;
      for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) {
        const change = 2 * ((teams[a][x].score ?? 0) - (teams[b][y].score ?? 0)), gain = delta * delta - (delta - change) ** 2;
        if (gain > best) { best = gain; swap = [x, y]; }
      }
      if (swap) { const [x, y] = swap; [teams[a][x], teams[b][y]] = [teams[b][y], teams[a][x]]; improved = true; }
    }
    if (!improved) break;
  }
  return { teams, pending: players.filter(p => !eligible.has(p.id)) };
}
export function uniqueTeamName(used) {
  const names = ['The Steamrollers', 'The Live Wires', 'The Retros', 'The Overdogs', 'The Kingfish', 'The Shock & Awe', 'The Powerhouses', 'The Socialites', 'VEX Cóndores', 'VEX Eclipse', 'VEX Centellas', 'VEX Jaguares'];
  const keys = new Set(used.map(embarkKey));
  for (const name of names) if (!keys.has(embarkKey(name))) return name;
  let n = 1; while (keys.has(embarkKey(`VEX Escuadrón ${n}`))) n++;
  return `VEX Escuadrón ${n}`;
}
