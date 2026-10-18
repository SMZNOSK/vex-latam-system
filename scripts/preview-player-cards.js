import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PlayerCards } from '../src/player-cards.js';
import { CardRenderer } from '../src/renderer.js';
import { dataDir } from '../src/config.js';
import { specializations, ALL_CLASSES } from '../src/catalog.js';
const source = process.argv[2];
if (!source) throw new Error('Indica la ruta de una tarjeta PNG, JPG o WebP.');
const dir = path.join(dataDir, 'preview'), cards = new PlayerCards(path.join(dir, 'card-assets')), renderer = new CardRenderer();
mkdirSync(dir, { recursive: true });
try {
  const cardImage = await cards.import(readFileSync(source)), cardImageData = await cards.dataURI(cardImage);
  const profile = { embarkId: 'SMZ-NOSK#0224', score: 34000, rank: 'Platino 3', playerClass: 'Ligero',
    specializationIds: ['evasive_dash'], searchable: true, cardImageData };
  const team = { host: '1', members: ['1', '2'], status: 'open', expires: Date.now() + 3600000,
    membersDisplay: [{ embarkId: 'Ejemplo#1001', cardImageData: null }, { embarkId: 'SMZ-NOSK#0224', cardImageData }],
    filters: { mode: 'Ranked', minScore: 30000, maxScore: 40000, teammates: 2, playerClass: ALL_CLASSES, specializationIds: [] } };
  const fullTeam = { ...team, members: ['1', '2', '3', '4', '5'], filters: { ...team.filters, teammates: 4, specializationIds: specializations.map(s => s.id) },
    membersDisplay: Array.from({ length: 5 }, (_, n) => ({ embarkId: `Ejemplo#100${n}`, cardImageData: n % 2 ? null : cardImageData })) };
  for (const [kind, data, label] of [['profile', profile, 'profile-photo'], ['team', team, 'team-photo'], ['team', fullTeam, 'team-photo-full']]) {
    for (const width of [720, 390]) {
      const file = path.join(dir, `${label}-${width}.png`);
      writeFileSync(file, await renderer.render(kind, data, width)); console.log(file);
    }
  }
} finally { await renderer.close(); }
