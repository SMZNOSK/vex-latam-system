import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CardRenderer, template } from '../src/renderer.js';
import { validateBasics, validateRules, TOURNAMENT_RETENTION_MS } from '../src/tournament-domain.js';

const dir = fileURLToPath(new URL('../data/preview-tournaments/', import.meta.url));
mkdirSync(dir, { recursive: true });
const t = { ...validateBasics({ name: 'VEX ARENA · COPA LATAM', date: '2099-10-24', time: '20:00', capacity: '16', access: 'public' }), rules: validateRules({ minRS: 15000, maxRS: 45000, bannedSkills: ['cloaking_device', 'mesh_shield'] }), status: 'open' };
const people = [
  { embarkId: 'VEX·Centella#1024', playerClass: 'Ligero', score: 32000, approximate: true, specializationIds: ['evasive_dash'] },
  { embarkId: 'VEX·Nebulosa#2048', playerClass: 'Mediano', score: 27500, specializationIds: ['healing_beam', 'guardian_turret'] },
  { embarkId: 'VEX·Coloso#4096', playerClass: 'Pesado', score: 31000, specializationIds: ['charge_n_slam', 'winch_claw'] },
];
const renderer = new CardRenderer(), checks = [];
try {
  const browser = await renderer.browser();
  for (const [kind, data, widths, label] of [
    ['tournament', t, [320, 390, 720], 'tournament'],
    ['tournament-team', { name: 'The Live Wires', tournamentName: t.name, source: 'balanced', people }, [320, 390, 720], 'tournament-team'],
    ['tournament-poster', t, [1100], 'poster-open'],
    ['tournament-poster', { ...t, status: 'closed' }, [1100], 'poster-closed'],
    ['tournament-poster', { ...t, status: 'finished', deleteAt: t.startsAt + TOURNAMENT_RETENTION_MS }, [1100], 'poster-finished'],
    ['tournament-poster', { ...t, status: 'finished', channelsDeletedAt: t.startsAt + TOURNAMENT_RETENTION_MS }, [1100], 'poster-deleted'],
  ]) {
    for (const width of widths) {
      const html = template(kind, data, width), file = path.join(dir, `${label}-${width}`);
      writeFileSync(`${file}.html`, html); writeFileSync(`${file}.png`, await renderer.render(kind, data, width));
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      try {
        await page.setContent(html); await page.evaluate(() => document.fonts.ready);
        const result = await page.evaluate(() => ({ brokenImages: [...document.images].filter(i => !i.complete || !i.naturalWidth).length,
          overflow: [...document.querySelectorAll('.canvas,header,.arena,.arena-grid,.arena-stat,.arena-kicker,.arena-player,.poster-layout,.poster-data,.poster-cell,.poster-banner,.tournament-times-grid,.tournament-time')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.className) }));
        checks.push({ kind, label, width, ...result });
      } finally { await page.close(); }
    }
  }
} finally { await renderer.close(); }
writeFileSync(path.join(dir, 'verification.json'), JSON.stringify(checks, null, 2));
console.log(JSON.stringify({ directory: dir, checks }, null, 2));
if (checks.some(c => c.brokenImages || c.overflow.length)) process.exitCode = 1;
