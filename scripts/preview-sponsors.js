import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { CardRenderer, template } from '../src/renderer.js';
import { PlayerCards } from '../src/player-cards.js';
import { sponsors, sponsorBackground } from '../src/sponsors.js';
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
const previewSponsors = process.argv[2] ? sponsors.filter(s => s.id === process.argv[2]) : sponsors;
if (!previewSponsors.length) throw new Error('Selecciona un patrocinador conocido.');
const tiles = [], checks = [];
try {
  const browser = await renderer.browser();
  for (const [n, sponsor] of previewSponsors.entries()) {
    const profile = { ...base, sponsorId: sponsor.id };
    const team = { host: 'u', members: ['u', 'b', 'c', 'd', 'e'], sponsorId: sponsor.id, status: 'open', expires: Date.now() + 3600000,
      filters: { mode: n % 2 ? 'Chill' : 'Ranked', minScore: 29000, maxScore: 39000, teammates: 4,
        playerClass: 'Todas las clases', playerClasses: classes, specializationIds: specializations.map(s => s.id) },
      membersDisplay: Array.from({ length: 5 }, (_, i) => ({ embarkId: i ? 'NombreMuyLargoParaRevisar#1234' : base.embarkId,
        cardImageData: i % 2 ? null : cardImageData, sponsorId: sponsors[(n + i) % sponsors.length].id })) };
    for (const kind of ['profile', 'team']) for (const width of [720, 390, 320]) {
      const data = kind === 'profile' ? profile : team;
      const png = await renderer.render(kind, data, width);
      const name = `${sponsor.id}-${kind}-${width}.png`; writeFileSync(path.join(destination, name), png);
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      try {
        await page.route('**/*', route => route.abort());
        await page.setContent(template(kind, data, width));
        await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(img => img.decode())); });
        const result = await page.evaluate(async () => {
          const canvas = document.querySelector('.canvas');
          const background = getComputedStyle(canvas, '::before').backgroundImage;
          const uri = background.match(/url\(["']?(data:image\/webp;base64,[A-Za-z0-9+/=]+)["']?\)/)?.[1];
          let backgroundLoaded = false;
          if (uri) { const image = new Image(); image.src = uri; await image.decode(); backgroundLoaded = image.naturalWidth > 0; }
          return {
            backgroundLoaded,
            backgroundAnchored: ['::before', '::after'].every(pseudo => {
              const style = getComputedStyle(canvas, pseudo);
              return style.backgroundSize === '100% auto' && parseFloat(style.height) <= canvas.clientHeight / 2 + 1;
            }),
            flatSurfaces: [...document.querySelectorAll('header,.canvas>.eyebrow,.canvas>h1,.canvas>.subtitle,.sponsor-banner,.rank,.stat,.class,.portrait,.skill-frame,.note,footer')].every(el => {
              const style = getComputedStyle(el);
              return style.backgroundImage === 'none' && style.boxShadow === 'none' && style.filter === 'none';
            }),
            brokenImages: [...document.images].filter(img => !img.complete || !img.naturalWidth).length,
            overflow: [...document.querySelectorAll('.canvas,header,.sponsor-banner,.sponsor-sign,.profile-layout,.profile-details,.rank,.class,.skill-frames,.stats,.roster,.slot,.tile-identity')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.className),
            pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
          };
        });
        checks.push({ sponsor: sponsor.id, kind, width, ...result });
      } finally { await page.close(); }
      if (width === 720) {
        const thumb = await sharp(png).resize({ width: 300, height: 650, fit: 'contain', background: '#101217' }).png().toBuffer();
        tiles.push({ input: thumb, left: (n % 4) * 620 + (kind === 'team' ? 310 : 0), top: Math.floor(n / 4) * 660 });
      }
    }
  }
  await sharp({ create: { width: 2480, height: Math.ceil(previewSponsors.length / 4) * 660, channels: 3, background: '#292b32' } }).composite(tiles).png()
    .toFile(path.join(destination, 'todos-los-sponsors.png'));
  const backgrounds = [];
  for (const [n, sponsor] of previewSponsors.entries()) {
    const left = (n % 4) * 252 + 12, top = Math.floor(n / 4) * 404 + 12;
    const art = Buffer.from(sponsorBackground(sponsor.id).split(',')[1], 'base64');
    const thumbnail = await sharp(art).resize(240, 360, { fit: 'contain', background: '#0c1016' }).png().toBuffer();
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="32"><rect width="240" height="32" fill="#171e29"/><text x="12" y="22" fill="white" font-family="Arial,sans-serif" font-size="15" font-weight="bold">${sponsor.label}</text></svg>`);
    backgrounds.push({ input: label, left, top }, { input: thumbnail, left, top: top + 32 });
  }
  await sharp({ create: { width: 1020, height: Math.ceil(previewSponsors.length / 4) * 404 + 12, channels: 3, background: '#292b32' } })
    .composite(backgrounds).png().toFile(path.join(destination, 'fondos-mate.png'));
  const failed = checks.filter(c => !c.backgroundLoaded || !c.backgroundAnchored || !c.flatSurfaces || c.brokenImages || c.pageOverflow || c.overflow.length);
  writeFileSync(path.join(destination, 'verification.json'), JSON.stringify({ checks, failed }, null, 2));
  console.log(JSON.stringify({ cards: checks.length, destination, failed }, null, 2));
  if (failed.length) process.exitCode = 1;
} finally { await renderer.close(); }
