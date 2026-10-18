import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { skillLabels } from './catalog.js';
import { rankIcon, finalsLogo, vexLogo } from './branding.js';

export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const fmt = value => value == null ? 'Pendiente' : Number(value).toLocaleString('es-MX');
function rankBadge(rank) {
  const uri = rankIcon(rank);
  return uri ? `<img class="rank-badge" src="${uri}" alt="Insignia de ${escapeHTML(rank)}" decoding="sync">`
    : '<span class="rank-badge-placeholder" aria-hidden="true">—</span>';
}
function header() {
  const vex = vexLogo(), finals = finalsLogo();
  return `<header>${vex ? `<div class="brand-lockup"><span class="vex-mark"><img src="${vex}" alt="Logo de VEX LATAM" decoding="sync"></span><span class="brand-name">VEX LATAM<small>COMUNIDAD THE FINALS</small></span></div>`
    : '<span class="brand">VEX<b> /</b></span>'}${finals ? `<img class="finals-logo" src="${finals}" alt="THE FINALS" decoding="sync">` : '<span class="game">THE FINALS</span>'}</header>`;
}
const classIcon = value => `<span class="class-icon">${value === 'Ligero' ? '↯' : value === 'Mediano' ? '✚' : value === 'Pesado' ? '⬢' : '◈'}</span>`;
const chip = value => `<span class="chip">${escapeHTML(value)}</span>`;
const stat = (label, value) => `<div class="stat"><span class="eyebrow">${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>`;
const cardURI = value => typeof value === 'string' && value.length <= 4 * 1024 * 1024 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : null;
function roster(data) {
  const hasCards = data.membersDisplay?.some(member => cardURI(member.cardImageData));
  const slots = Array.from({ length: data.filters.teammates + 1 }, (_, n) => {
    const member = data.members[n], profile = data.membersDisplay?.[n], uri = cardURI(profile?.cardImageData);
    const identity = profile?.embarkId || 'Perfil no disponible';
    const label = member === data.host ? '<small>ORGANIZA</small>' : '';
    if (hasCards) return `<div class="slot card-slot ${member ? 'filled' : ''}"><div class="tile-media">${uri
      ? `<img src="${uri}" alt="Tarjeta de ${escapeHTML(identity)}" loading="eager" decoding="sync">`
      : `<span class="tile-identity ${member ? '' : 'available'}">${member ? escapeHTML(identity) : '<b aria-hidden="true">+</b>Lugar disponible'}</span>`}</div>${label || (member ? '<small>INTEGRANTE</small>' : '<small aria-hidden="true">&nbsp;</small>')}</div>`;
    return `<div class="slot ${member ? 'filled' : ''}"><span class="identity">${member ? escapeHTML(identity) : 'Lugar disponible'}</span>${label}</div>`;
  }).join('');
  return `<div class="roster ${hasCards ? 'has-cards' : ''}">${slots}</div>`;
}
export function template(kind, data, width = 720, font = '') {
  let title, subtitle, body, category;
  if (kind === 'profile') {
    title = data.embarkId; subtitle = data.needsCompletion ? 'Completa tus especializaciones para encontrar equipo' : 'Tu ficha de jugador'; category = 'PERFIL DE JUGADOR';
    body = `<div class="rank">${rankBadge(data.rank)}<div><span class="eyebrow">RANGO AUTOMÁTICO</span><h2>${escapeHTML(data.rank)}</h2><p>${fmt(data.score)} <span>RS</span></p></div><span class="status">${data.searchable === false ? 'PAUSADO' : 'ACTIVO'}</span></div>
      <div class="class">${classIcon(data.playerClass)}<div><span class="eyebrow">CLASE HABITUAL</span><h3>${escapeHTML(data.playerClass)}</h3></div></div>
      <section><span class="eyebrow">ESPECIALIZACIONES</span><div class="chips">${skillLabels(data.specializationIds).map(chip).join('') || chip('Selección pendiente')}</div></section>
      ${data.needsCompletion && data.legacySpecialization ? `<p class="note">Referencia anterior: ${escapeHTML(data.legacySpecialization)}</p>` : ''}
      <p class="note">${data.rankSource === 'finalstracker' ? `RS consultados en FINALSTRACKER · ${escapeHTML(data.season)}${data.leaderboardPosition ? ` · Puesto ${fmt(data.leaderboardPosition)}` : ''}` : 'RS declarados por el jugador · Rango calculado por puntos'}</p>`;
    const uri = cardURI(data.cardImageData);
    if (uri) body = `<div class="profile-layout"><aside class="portrait"><img src="${uri}" alt="Tarjeta del juego de ${escapeHTML(data.embarkId)}" loading="eager" decoding="sync"></aside><div class="profile-details">${body}</div></div>`;
  } else if (kind === 'team') {
    const f = data.filters, open = data.status === 'open' && data.expires > Date.now(), full = data.members.length >= f.teammates + 1;
    title = open ? full ? 'EQUIPO COMPLETO' : 'BUSCANDO EQUIPO' : data.status === 'expired' ? 'BÚSQUEDA CADUCADA' : 'BÚSQUEDA CERRADA';
    category = 'ENCUENTRA TU ESCUADRÓN'; subtitle = f.description || (f.mode === 'Chill' ? 'Juega a tu ritmo. Encuentra buena compañía.' : 'Un objetivo. Un equipo. La siguiente victoria.');
    body = `<div class="stats">${stat('MODO', f.mode)}${stat('JUGADORES', `${data.members.length} / ${f.teammates + 1}`)}${f.mode !== 'Chill' ? stat('INTERVALO RS', `${fmt(f.minScore)} – ${fmt(f.maxScore)}`) : stat('RS', 'Sin filtro')}</div>
      <div class="class">${classIcon(f.playerClass)}<div><span class="eyebrow">CLASE BUSCADA</span><h3>${escapeHTML(f.playerClass)}</h3></div></div>
      <section><span class="eyebrow">ESPECIALIZACIONES · COINCIDIR CON CUALQUIERA</span><div class="chips">${skillLabels(f.specializationIds).map(chip).join('') || chip(f.legacySpecialization || 'Cualquiera')}</div></section>
      ${roster(data)}`;
  } else {
    const profile = kind === 'registro'; category = 'VEX COMMUNITY'; title = profile ? 'TU PERFIL.\nTU EQUIPO.' : 'JUEGA EN\nBUENA COMPAÑÍA.';
    subtitle = profile ? 'Regístrate, elige tu clase y encuentra compañeros.' : 'Ranked para competir. Chill para disfrutar.';
    body = `<div class="steps">${(profile ? ['EMBARK ID + RS', 'CLASE + ESPECIALIZACIONES', 'LISTO PARA JUGAR'] : ['ELIGE TU MODO', 'DEFINE TU EQUIPO', 'ENCUENTRA COMPAÑEROS']).map((label, n) => `<div><span>0${n + 1}</span><strong>${label}</strong></div>`).join('')}</div>`;
  }
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:"><style>
    ${font ? `@font-face{font-family:Vex;src:url(data:font/ttf;base64,${font})}` : ''}
    *{box-sizing:border-box}html,body{margin:0;width:${width}px;background:#111218;color:#f7f8fb;font-family:Vex,'Arial',sans-serif}
    .canvas{position:relative;padding:28px 30px 22px;border:1px solid #353642;border-top:5px solid #ed243b;background:radial-gradient(ellipse at top right,#4c1522 0,transparent 58%),#111218;overflow:hidden}
    header{display:flex;align-items:center;justify-content:space-between;margin-bottom:35px}.brand{font-weight:900;font-size:26px;font-style:italic;letter-spacing:-1px}.brand b{color:#ff3d51}.game{font-size:14px;letter-spacing:3px;font-weight:900}
    header{gap:20px}.brand-lockup{display:flex;align-items:center;gap:12px;min-width:0}.vex-mark{width:64px;height:64px;position:relative;overflow:hidden;flex-shrink:0}.vex-mark img{position:absolute;width:112px;height:112px;left:-24px;top:-27px;object-fit:contain;mix-blend-mode:screen}.brand-name{font-size:24px;font-weight:900;letter-spacing:.3px;white-space:nowrap}.brand-name small{display:block;font-size:9px;letter-spacing:1.3px;color:#b7b9c6;margin-top:6px;font-weight:500}.finals-logo{width:180px;height:36px;object-fit:contain;flex-shrink:0}.rank-badge{width:80px;height:80px;object-fit:contain;flex-shrink:0}.rank-badge-placeholder{width:74px;text-align:center;color:#9ca3af;font-size:32px;flex-shrink:0}
    .eyebrow{color:#b7b9c6;font-size:12px;letter-spacing:1.3px;font-weight:700;display:block;line-height:1.4}
    h1{font-size:${kind === 'profile' ? 32 : 40}px;line-height:1.1;letter-spacing:-.6px;margin:12px 0;white-space:pre-line;overflow-wrap:anywhere} .subtitle{color:#bfc1cd;font-size:17px;line-height:1.5;margin:0 0 22px;overflow-wrap:anywhere}
    h2{font-size:30px;margin:5px 0}h3{font-size:23px;margin:5px 0 0}.rank{display:flex;align-items:center;gap:18px;padding:18px 20px;background:#1d1f29;border:1px solid #383b4a;border-radius:12px;margin-bottom:18px}.rank svg{width:74px;flex-shrink:0}.rank p{margin:6px 0 0;font-size:25px;font-weight:800}.rank p span{font-size:14px;color:#bfc1cd}.status{margin-left:auto;background:#2a303d;color:#dce1ee;border-radius:30px;padding:8px 10px;font-size:11px;font-weight:800;letter-spacing:1px}
    .class{display:flex;align-items:center;gap:12px;margin:24px 0}.class-icon{height:48px;width:48px;background:#ed243b;display:flex;align-items:center;justify-content:center;border-radius:9px;font-size:31px;font-weight:900}
    .chips{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 22px}.chip{background:#232530;border:1px solid #3b3e4f;border-radius:7px;padding:9px 12px;font-size:15px;line-height:1.3}.note{font-size:13px;color:#aeb2c1;line-height:1.5;margin:10px 0 0;overflow-wrap:anywhere}
    .stats{display:grid;grid-template-columns:1fr .9fr 1.8fr;gap:12px}.stat{border-left:3px solid #ff3d51;padding:8px 12px;background:#1c1e28}.stat strong{display:block;font-size:21px;margin-top:8px;line-height:1.3}.roster{display:grid;gap:8px;margin:22px 0}.slot{display:flex;align-items:center;gap:12px;border:1px dashed #3a3c4a;border-radius:7px;padding:12px;color:#9b9faf;font-size:16px}.slot.filled{background:#222430;border:1px solid #414457;color:#fff}.slot>span:nth-child(2){overflow-wrap:anywhere;min-width:0}.slot .number{color:#ff5b6d;font-weight:900}.slot small{margin-left:auto;color:#bdc1d0;font-size:10px;flex-shrink:0}.steps{border-top:1px solid #393342}.steps>div{display:flex;gap:15px;align-items:center;padding:18px 0;border-bottom:1px solid #393342}.steps span{color:#ff5267;font-size:24px;font-weight:900}.steps strong{font-size:16px;letter-spacing:.3px}
    footer{display:flex;justify-content:space-between;border-top:1px solid #353744;margin-top:24px;padding-top:16px;font-size:11px;color:#969bad;letter-spacing:1px}
    .profile-layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:22px;align-items:start}.portrait{margin:0;padding:8px;border:1px solid #3b3e4f;border-radius:12px;background:#181a23}.portrait img{display:block;width:100%;height:auto;object-fit:contain;border-radius:7px}.profile-details .rank{flex-wrap:wrap;padding:14px;gap:10px}.profile-details .rank svg{width:50px}.profile-details h2{font-size:24px}.profile-details .rank p{font-size:23px}.profile-details .status{margin-left:0}.profile-details .class{margin:18px 0}.profile-details h3{font-size:21px}.identity{overflow-wrap:anywhere;min-width:0;line-height:1.4}.roster.has-cards{grid-template-columns:repeat(3,minmax(0,1fr));align-items:stretch;gap:12px}.slot.card-slot{display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:flex-start;padding:8px;min-width:0}.tile-media{width:100%;aspect-ratio:2/3;display:grid;place-items:center;border-radius:7px;overflow:hidden;background:#15171f}.tile-media img{width:100%;height:100%;object-fit:contain}.tile-identity{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:15px;width:100%;height:100%;padding:12px;font-weight:800;font-size:17px;text-align:center;overflow-wrap:anywhere;line-height:1.45}.tile-identity.available{font-weight:400;color:#9b9faf}.tile-identity b{font-size:36px;font-weight:400;border:1px dashed #525565;border-radius:50%;width:48px;height:48px;line-height:48px}.card-slot small{margin:0;text-align:center}.profile-details .chip{font-size:14px;padding:8px 10px}
    ${width < 500 ? 'h1{font-size:30px}.canvas{padding:22px 18px}.game{font-size:11px;letter-spacing:1px}.rank{padding:12px;gap:10px}.rank svg{width:52px}h2{font-size:24px}.status{font-size:9px;padding:6px}.stats{grid-template-columns:1fr 1fr}.stat:last-child{grid-column:1/-1}.chip{font-size:14px}.slot small{font-size:9px}' : ''}
    .tile-media{flex-shrink:0}.tile-media img{display:block;min-width:0;min-height:0}
    .profile-details .rank-badge{width:62px;height:62px}
    ${width < 500 ? '.profile-layout{grid-template-columns:1fr}.portrait{width:250px;max-width:100%;margin:0 auto}.profile-details .rank{flex-wrap:wrap}.profile-details .status{margin-left:auto}.roster.has-cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.tile-identity{font-size:15px;padding:8px}' : ''}
    ${width < 500 ? 'header{gap:12px}.vex-mark{width:52px;height:52px}.vex-mark img{width:96px;height:96px;left:-22px;top:-25px}.brand-lockup{gap:8px}.brand-name{font-size:19px}.brand-name small{font-size:8px;letter-spacing:.5px}.finals-logo{width:130px;height:30px}.rank-badge{width:65px;height:65px}' : ''}
    </style><main class="canvas">${header()}<span class="eyebrow">${category}</span><h1>${escapeHTML(title)}</h1><p class="subtitle">${escapeHTML(subtitle)}</p>${body}<footer><span>VEX LATAM · VEX BOT</span><span>${kind === 'profile' ? 'PERFIL PRIVADO' : 'COMUNIDAD · EQUIPO'}</span></footer></main></html>`;
}
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
        const fontPath = 'C:/Windows/Fonts/bahnschrift.ttf';
        this.font ??= existsSync(fontPath) ? readFileSync(fontPath).toString('base64') : '';
        await page.setContent(template(kind, data, width, this.font), { waitUntil: 'load', timeout: 10000 });
        await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(img => img.decode())); });
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
