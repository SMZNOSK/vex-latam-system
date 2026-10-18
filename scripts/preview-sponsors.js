import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { CardRenderer } from '../src/renderer.js';
import { PlayerCards } from '../src/player-cards.js';
import { sponsors } from '../src/sponsors.js';
import { specializations, classes } from '../src/catalog.js';
import { dataDir } from '../src/config.js';

const destination = path.join(dataDir, 'preview-sponsors'); mkdirSync(destination, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'vex.sqlite'), { readOnly: true });
const saved = db.prepare('SELECT data FROM profiles LIMIT 1').get(); db.close();
const p = saved ? JSON.parse(saved.data) : {};
const cards = new PlayerCards(path.join(dataDir, 'player-cards')), renderer = new CardRenderer();
const cardImageData = await cards.dataURI(p.cardImage);
const base = { ...p, embarkId: p.embarkId ?? 'Jugador#1234', rank: p.rank ?? 'Platino 3', score: p.score ?? 34000,
  playerClass: 'Todas las clases', specializationIds: specializations.map(s => s.id), needsCompletion: false, cardImageData };
const tiles = [];
try {
  for (const [n, sponsor] of sponsors.entries()) {
    const profile = { ...base, sponsorId: sponsor.id };
    const team = { host: 'u', members: ['u', 'b', 'c', 'd', 'e'], sponsorId: sponsor.id, status: 'open', expires: Date.now() + 3600000,
      filters: { mode: n % 2 ? 'Chill' : 'Ranked', minScore: 29000, maxScore: 39000, teammates: 4,
        playerClass: 'Todas las clases', playerClasses: classes, specializationIds: specializations.map(s => s.id) },
      membersDisplay: Array.from({ length: 5 }, (_, i) => ({ embarkId: i ? 'NombreMuyLargoParaRevisar#1234' : base.embarkId,
        cardImageData: i % 2 ? null : cardImageData, sponsorId: sponsors[(n + i) % sponsors.length].id })) };
    for (const kind of ['profile', 'team']) for (const width of [720, 390]) {
      const data = kind === 'profile' ? profile : team;
      const png = await renderer.render(kind, data, width);
      const name = `${sponsor.id}-${kind}-${width}.png`; writeFileSync(path.join(destination, name), png);
      if (width === 720) {
        const thumb = await sharp(png).resize({ width: 300, height: 650, fit: 'contain', background: '#101217' }).png().toBuffer();
        tiles.push({ input: thumb, left: (n % 4) * 620 + (kind === 'team' ? 310 : 0), top: Math.floor(n / 4) * 660 });
      }
    }
  }
  await sharp({ create: { width: 2480, height: 1980, channels: 3, background: '#292b32' } }).composite(tiles).png()
    .toFile(path.join(destination, 'todos-los-sponsors.png'));
  console.log(`44 tarjetas renderizadas en ${destination}`);
} finally { await renderer.close(); }
