import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CardRenderer } from '../src/renderer.js';
import { dataDir } from '../src/config.js';
import { specializations, ALL_CLASSES } from '../src/catalog.js';
const renderer = new CardRenderer(), dir = path.join(dataDir, 'preview'); mkdirSync(dir, { recursive: true });
try {
  const profile = { embarkId: 'NombreLargoParaProbarQueLaFichaSeAdaptaAlTextoSinCortarlo#1234', score: 999999,
    rank: 'Diamante 1', playerClass: ALL_CLASSES, specializationIds: specializations.map(s => s.id), searchable: true };
  const team = { host: 'a', status: 'open', expires: Date.now() + 3600000, members: ['a', 'b', 'c', 'd', 'e'],
    membersDisplay: ['OrganizadorConUnNombreMuyLargoParaComprobarElDiseño#1234', 'Mediano#1234', 'Jugador con espacios#1234', 'Ligero#1234', 'Compañero#1234'].map(embarkId => ({ embarkId, cardImageData: null })),
    filters: { mode: 'Ranked', teammates: 4, minScore: 0, maxScore: 999999, playerClass: ALL_CLASSES,
      specializationIds: specializations.map(s => s.id), description: 'Un equipo completo con todas las especializaciones y nombres largos.' } };
  for (const [kind, data] of [['profile', profile], ['team', team], ['registro', {}], ['buscar', {}]]) {
    for (const width of [720, 390]) {
      const file = path.join(dir, `${kind}-${width}.png`);
      writeFileSync(file, await renderer.render(kind, data, width)); console.log(file);
    }
  }
} finally { await renderer.close(); }
