// Read-only visual checks against the generated examples. No Discord connection.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CardRenderer } from '../src/renderer.js';

const dir = fileURLToPath(new URL('../plantillas/Plantilla V1 mejorada/preview/', import.meta.url));
const renderer = new CardRenderer(), checks = [];
try {
  const browser = await renderer.browser();
  for (const file of readdirSync(dir).filter(f => f.endsWith('.html'))) {
    const source = readFileSync(path.join(dir, file), 'utf8');
    const originalWidth = file.endsWith('-390.html') ? 390 : 720;
    for (const width of originalWidth === 390 ? [320, 390] : [720]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      try {
        await page.route('**/*', route => route.abort());
        await page.setContent(source.replace(`width:${originalWidth}px`, `width:${width}px`), { waitUntil: 'load' });
        await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(img => img.decode())); });
        const result = await page.evaluate(() => ({
          brokenImages: [...document.images].filter(i => !i.complete || !i.naturalWidth).length,
          overflow: [...document.querySelectorAll('.canvas,header,.profile-layout,.profile-details,.rank,.class,.skill-frames,.stats,.roster,.slot,.tile-identity,.champion,.podium-card,.standing-small,.standing-info,.steps')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.className),
          pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        }));
        checks.push({ file, width, ...result });
      } finally { await page.close(); }
    }
  }
} finally { await renderer.close(); }
const luminance = hex => hex.match(/[a-f\d]{2}/gi).map(c => parseInt(c, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
const contrast = (a, b) => { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return Number(((values[0] + .05) / (values[1] + .05)).toFixed(2)); };
const pairs = [
  ['Main content', '#f7f8fb', '#111218'], ['Secondary content', '#b7b9c6', '#111218'],
  ['Gold podium', '#e9cd85', '#322820'], ['Silver podium', '#c9d1e2', '#1e202b'], ['Bronze podium', '#e2ac8a', '#1e202b'],
].map(([role, text, surface]) => ({ role, text, surface, ratio: contrast(text, surface) }));
const failed = checks.filter(c => c.brokenImages || c.pageOverflow || c.overflow.length);
writeFileSync(path.join(dir, 'verification.json'), JSON.stringify({ checks, contrasts: pairs, failed }, null, 2));
console.log(JSON.stringify({ examplesChecked: checks.length, failed, contrasts: pairs }, null, 2));
if (failed.length || pairs.some(p => p.ratio < 4.5)) process.exitCode = 1;
