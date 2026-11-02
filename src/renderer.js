import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { template } from './card-template.js';
export { template, escapeHTML } from './card-template.js';
export class CardRenderer {
  constructor() { this.cache = new Map(); this.tail = Promise.resolve(); this.browserPromise = null; this.retryAt = 0; }
  async browser() {
    if (this.retryAt > Date.now()) throw new Error('Renderer en espera');
    if (!this.browserPromise) this.browserPromise = (async () => {
      const candidates = process.env.VEX_BROWSER_PATH ? [{ executablePath: process.env.VEX_BROWSER_PATH }] : [{ channel: 'chrome' }, { channel: 'msedge' }, {}];
      for (const options of candidates) {
        try {
          const browser = await chromium.launch({ ...options, headless: true, timeout: 10000 });
          browser.on('disconnected', () => { this.browserPromise = null; }); return browser;
        } catch { /* Probar el siguiente navegador disponible. */ }
      }
      this.browserPromise = null; this.retryAt = Date.now() + 60000;
      throw new Error('Instala Chrome, Edge o Chromium para las fichas');
    })();
    return this.browserPromise;
  }
  render(kind, data, width = 720) {
    const key = createHash('sha256').update(JSON.stringify([kind, data, width])).digest('hex');
    if (this.cache.has(key)) return Promise.resolve(this.cache.get(key));
    const run = this.tail.catch(() => {}).then(async () => {
      if (this.cache.has(key)) return this.cache.get(key);
      const browser = await this.browser();
      const page = await browser.newPage({ viewport: { width, height: 1000 }, deviceScaleFactor: 1.5, reducedMotion: 'reduce' });
      try {
        await page.route('**/*', route => route.abort());
        const fontPath = 'C:/Windows/Fonts/segoeui.ttf';
        this.font ??= existsSync(fontPath) ? readFileSync(fontPath).toString('base64') : '';
        await page.setContent(template(kind, data, width, this.font), { waitUntil: 'load', timeout: 10000 });
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all([...document.images].map(img => img.decode()));
          const name = document.querySelector('.fit-name');
          if (name) {
            let size = parseFloat(getComputedStyle(name).fontSize);
            while (name.scrollWidth > name.clientWidth && size > 18) name.style.fontSize = `${--size}px`;
            if (name.scrollWidth > name.clientWidth) name.style.textOverflow = 'ellipsis';
          }
        });
        const buffer = await page.locator('.canvas').screenshot({ type: 'png', timeout: 10000 });
        this.cache.set(key, buffer);
        if (this.cache.size > 48) this.cache.delete(this.cache.keys().next().value);
        return buffer;
      } finally { await page.close(); }
    });
    this.tail = run; return run;
  }
  async close() { await this.tail.catch(() => {}); if (this.browserPromise) await (await this.browserPromise).close(); this.cache.clear(); }
}
