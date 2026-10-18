import { ALL_CLASSES, classes, classChoices, specializations, pruneSkills, selectedClasses, classLabel } from './catalog.js';
import { getSponsor } from './sponsors.js';
export { classes } from './catalog.js';
export class UserError extends Error {}
export const normalize = value => String(value).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();
const rankAliases = { bronce: 'bronze', plata: 'silver', oro: 'gold', platino: 'platinum', diamante: 'diamond', rubi: 'ruby' };
export function normalizeRank(value) {
  const parts = normalize(value).split(/\s+/); parts[0] = rankAliases[parts[0]] ?? parts[0]; return parts.join(' ');
}
function text(value, label, max, required = true) {
  const result = String(value ?? '').trim();
  if ((!result && required) || result.length > max || /[\r\n]/.test(result)) throw new UserError(`${label}: usa ${required ? 'entre 1 y' : 'hasta'} ${max} caracteres en una sola línea.`);
  return result;
}
export function score(value, optional = false) {
  const v = String(value ?? '').trim();
  if (!v && optional) return null;
  if (!/^\d{1,6}$/.test(v) || Number(v) > 999999) throw new UserError('Los puntos RS deben ser un número entero entre 0 y 999999.');
  return Number(v);
}
export function rankFromRS(rs, position = null) {
  const points = score(rs);
  if (Number.isInteger(position) && position >= 1 && position <= 500) return 'Ruby';
  if (points >= 47500) return 'Diamante 1';
  const tier = ['Bronce', 'Plata', 'Oro', 'Platino', 'Diamante'][Math.floor(points / 10000)];
  return `${tier} ${4 - Math.floor((points % 10000) / 2500)}`;
}
export function validateIdentity(input) {
  const embarkId = text(input.embarkId, 'Embark ID', 70);
  if (!/^[^#\r\n<>@`]{2,64}#\d{4}$/.test(embarkId)) throw new UserError('Escribe tu Embark ID completo, por ejemplo Jugador#1234.');
  return { embarkId, score: score(input.score) };
}
function skills(input, required) {
  if (required && !classChoices.includes(input.playerClass)) throw new UserError('Selecciona una clase o Todas las clases.');
  if (!Array.isArray(input.specializationIds)) throw new UserError('Selecciona tus especializaciones en las casillas.');
  const ids = pruneSkills(input.specializationIds, required ? input.playerClass : input);
  if (ids.length !== new Set(input.specializationIds).size) throw new UserError('Las especializaciones no corresponden a la clase seleccionada.');
  if (required && !ids.length) throw new UserError('Marca al menos una especialización.');
  return ids;
}
export function validateProfile(input) {
  const identity = validateIdentity(input);
  if (!getSponsor(input.sponsorId)) throw new UserError('Selecciona uno de los once patrocinadores.');
  return { ...identity, rank: rankFromRS(identity.score), playerClass: input.playerClass,
    sponsorId: input.sponsorId, specializationIds: skills(input, true), needsCompletion: false, schemaVersion: 3 };
}
export function parseRange(value) {
  const parts = String(value ?? '').trim().split('-').map(x => x.trim());
  if (parts.length !== 2) throw new UserError('Escribe el intervalo RS como 10000-30000.');
  const minScore = score(parts[0]), maxScore = score(parts[1]);
  if (minScore > maxScore) throw new UserError('El mínimo RS no puede ser mayor que el máximo.');
  return { minScore, maxScore };
}
export function validateSearch(input) {
  if (!['Ranked', 'Chill'].includes(input.mode)) throw new UserError('Elige Ranked o Chill.');
  const teammates = Number(input.teammates);
  if (!Number.isInteger(teammates) || teammates < 1 || teammates > 4) throw new UserError('Busca entre 1 y 4 compañeros.');
  const playerClasses = selectedClasses(input);
  if (!playerClasses.length || (input.playerClasses !== undefined && (!Array.isArray(input.playerClasses) || input.playerClasses.some(c => !classes.includes(c))))
    || (input.playerClasses === undefined && !classChoices.includes(input.playerClass))) throw new UserError('Selecciona al menos una clase: Ligero, Mediano o Pesado.');
  const specializationIds = skills(input, false);
  const minScore = input.mode === 'Ranked' ? score(input.minScore) : null;
  const maxScore = input.mode === 'Ranked' ? score(input.maxScore) : null;
  if (minScore > maxScore) throw new UserError('El mínimo RS no puede ser mayor que el máximo.');
  return { description: text(input.description, 'Mensaje', 200, false), mode: input.mode,
    playerClass: classLabel(playerClasses), ...(input.playerClasses !== undefined ? { playerClasses } : {}),
    specializationIds, teammates, minScore, maxScore, schemaVersion: input.playerClasses !== undefined ? 3 : 2 };
}
export function compatible(profile, filters) {
  if (!profile || !profile.searchable || profile.needsCompletion) return false;
  if (!selectedClasses(profile.playerClass).some(c => selectedClasses(filters).includes(c))) return false;
  if (filters.mode !== 'Chill') {
    if (filters.minScore != null && (profile.score == null || profile.score < filters.minScore)) return false;
    if (filters.maxScore != null && (profile.score == null || profile.score > filters.maxScore)) return false;
  }
  const wanted = filters.specializationIds ?? [];
  if (wanted.length && !wanted.some(id => (profile.specializationIds ?? []).includes(id))) return false;
  if (filters.legacySpecialization && !normalize(profile.legacySpecialization ?? profile.specialization ?? '')
    .includes(normalize(filters.legacySpecialization))) return false;
  if (filters.legacyRank && !normalizeRank(profile.rank).startsWith(normalizeRank(filters.legacyRank))) return false;
  return true;
}
export function migrateProfile(p) {
  if (p.schemaVersion >= 3) return p;
  if (p.schemaVersion === 2) return { ...p, schemaVersion: 3, sponsorId: null, needsCompletion: true };
  const playerClass = classChoices.includes(p.playerClass) ? p.playerClass : ALL_CLASSES;
  const match = specializations.find(s => [s.label, s.english, s.id].some(label => normalize(label) === normalize(p.specialization ?? '')));
  const specializationIds = pruneSkills(match ? [match.id] : [], playerClass);
  const validRS = Number.isInteger(p.score) && p.score >= 0 && p.score <= 999999;
  return { ...p, schemaVersion: 3, sponsorId: null, playerClass, specializationIds, legacySpecialization: p.specialization ?? '',
    rank: validRS ? rankFromRS(p.score) : 'RS pendientes', leaderboardPosition: null,
    needsCompletion: true };
}
export function migrateFilters(f) {
  if (f.schemaVersion === 2) return f;
  const match = specializations.find(s => [s.label, s.english, s.id].some(label => normalize(label) === normalize(f.specialization ?? '')));
  const playerClass = f.playerClass || ALL_CLASSES;
  const specializationIds = pruneSkills(match ? [match.id] : [], playerClass);
  const mode = /chill/i.test(f.description ?? '') ? 'Chill' : 'Ranked';
  return { ...f, schemaVersion: 2, playerClass, mode, specializationIds,
    legacySpecialization: specializationIds.length ? '' : f.specialization ?? '', legacyRank: f.rank ?? '',
    minScore: mode === 'Ranked' ? f.minScore ?? 0 : null,
    maxScore: mode === 'Ranked' ? f.maxScore ?? 999999 : null };
}
export function blockedTerm(content, terms) {
  const words = ` ${normalize(content).replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  return terms.find(term => { const needle = normalize(term).replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); return needle && words.includes(` ${needle} `); });
}
export function parseStanding(data, embarkId) {
  if (normalize(data?.player?.embarkId ?? '') !== normalize(embarkId)) return null;
  const standing = data.player.standing;
  if (standing?.state !== 'onBoard' || standing.estimated === true || data.player.estimated === true) return null;
  if (!Number.isInteger(standing.rankScore) || standing.rankScore < 0 || standing.rankScore > 999999) return null;
  const position = Number.isInteger(standing.rank) && standing.rank > 0 ? standing.rank : null;
  return { score: standing.rankScore, rank: rankFromRS(standing.rankScore, position), leaderboardPosition: position,
    season: String(data.meta?.season ?? 'actual').slice(0, 30) };
}
