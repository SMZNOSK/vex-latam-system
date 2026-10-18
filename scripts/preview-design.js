import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { specializations, ALL_CLASSES } from '../src/catalog.js';

const v1 = process.argv.includes('--v1');
const v2 = process.argv.includes('--v2');
const module = await import(v1 ? '../plantillas/Plantilla V1/src/renderer.js' : v2 ? '../plantillas/Plantilla V2/src/renderer.js' : '../src/renderer.js');
const renderer = new module.CardRenderer();
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = path.join(root, 'plantillas', v1 ? 'Plantilla V1' : v2 ? 'Plantilla V2' : 'Plantilla V1 mejorada', 'preview');
mkdirSync(dir, { recursive: true });
const imagePath = process.argv.find((value, n) => n > 1 && !value.startsWith('--'));
const cardImageData = imagePath ? `data:image/png;base64,${readFileSync(imagePath).toString('base64')}` : null;
const profile = { embarkId: 'SMZ-NOSK#0224', score: 34000, rank: 'Platino 3', playerClass: 'Ligero',
  specializationIds: ['evasive_dash', 'grappling_hook'], searchable: true, cardImageData };
const team = { host: '1', members: ['1', '2'], status: 'open', expires: Date.now() + 3600000,
  membersDisplay: [{ embarkId: 'SMZ-NOSK#0224', cardImageData }, { embarkId: 'Vexink#1234', cardImageData: null }],
  filters: { mode: 'Ranked', minScore: 30000, maxScore: 40000, teammates: 2, playerClass: ALL_CLASSES,
    specializationIds: ['healing_beam', 'guardian_turret', 'mesh_shield'] } };
const all = specializations.map(s => s.id);
const cases = [
  ['profile', profile, 'perfil'], ['team', team, 'equipo'], ['registro', {}, 'registro'], ['buscar', {}, 'buscar'],
  ['profile', { ...profile, cardImageData: null, embarkId: 'JugadorConNombreMuyLargoParaComprobarLaLegibilidad#1234', playerClass: ALL_CLASSES, specializationIds: all }, 'perfil-completo'],
  ['team', { ...team, members: ['1', '2', '3', '4', '5'], membersDisplay: Array.from({ length: 5 }, (_, n) => ({ embarkId: `JugadorConNombreLargo#100${n}`, cardImageData: n % 2 ? null : cardImageData })), filters: { ...team.filters, teammates: 4, specializationIds: all } }, 'equipo-completo'],
  ['team', { ...team, filters: { ...team.filters, mode: 'Chill', specializationIds: [] }, membersDisplay: team.membersDisplay.map(m => ({ ...m, cardImageData: null })) }, 'equipo-chill'],
];
if (!v1 && !v2) {
  cases.push(['team', { ...team, filters: { ...team.filters, playerClasses: ['Ligero', 'Mediano'], specializationIds: ['evasive_dash', 'healing_beam'] } }, 'equipo-multiclase']);
  const players = Array.from({ length: 10 }, (_, n) => ({ user: String(n), embarkId: n === 0 ? profile.embarkId : `Jugador${n + 1}#100${n}`,
    score: 48000 - n * 2500, rank: n === 0 ? 'Diamante 1' : n < 4 ? 'Diamante 4' : 'Platino 3', cardImageData: n === 4 ? null : cardImageData }));
  cases.push(['leaderboard', { players }, 'leaderboard'], ['leaderboard', { players: [] }, 'leaderboard-vacio'],
    ['leaderboard', { players: [{ ...players[0], embarkId: 'JugadorConUnNombreMuyLargoParaComprobarLaClasificacion#1234' }] }, 'leaderboard-uno']);
}
try {
  for (const [kind, data, name] of cases) for (const width of [720, 390]) {
    const file = path.join(dir, `${name}-${width}`);
    writeFileSync(`${file}.html`, module.template(kind, data, width));
    writeFileSync(`${file}.png`, await renderer.render(kind, data, width));
    console.log(`${file}.png`);
  }
} finally { await renderer.close(); }
