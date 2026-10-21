import { getSponsor, sponsorLogo, sponsorBackground } from './sponsors.js';

export function sponsorBadge(id) {
  const s = getSponsor(id);
  if (!s) return '';
  const logo = sponsorLogo(id);
  return `<span class="member-sponsor" style="--member-accent:${s.color}">${logo ? `<img src="${logo}" alt="${s.label}" decoding="sync">` : s.label}</span>`;
}

export function sponsorBanner(id,{compact=false}={}) {
  const s = getSponsor(id);
  if (!s) return '';
  const logo = sponsorLogo(id);
  return `<div class="sponsor-banner"><div class="sponsor-sign">${logo ? `<img src="${logo}" alt="${s.label}" decoding="sync">` : s.label}</div><div class="sponsor-caption">${compact?'':'<span>PATROCINADOR ELEGIDO</span>'}<strong>${s.motto}</strong></div></div>`;
}

// Fondos mate y elementos geométricos distintos; los lemas son editoriales de la comunidad.
export function sponsorCSS(id, width) {
  const s = getSponsor(id);
  if (!s) return '';
  const art = sponsorBackground(id);
  const fragment = ['volpe', 'alfa-acta', 'cns'].includes(id) ? sponsorLogo(id) : null;
  return `
  .canvas{--accent:${s.color};border-top-color:var(--accent);background:#0c1016;isolation:isolate}
  .canvas::before,.canvas::after{display:none}
  ${art ? `
  /* Extremos independientes: conservan proporción y posición con cualquier altura. */
  .canvas::before,.canvas::after{content:"";display:block;position:absolute;left:0;right:0;height:50%;max-height:${Math.round(width*.72)}px;pointer-events:none;z-index:-1;background-image:url('${art}');background-size:100% auto;background-repeat:no-repeat}
  .canvas::before{top:0;background-position:center top;mask-image:linear-gradient(#000 calc(100% - 28px),transparent)}
  .canvas::after{bottom:0;background-position:center bottom;mask-image:linear-gradient(transparent,#000 28px)}
  ` : fragment ? `.canvas::after{content:"";display:block;position:absolute;inset:0;background:url('${fragment}') right -200px bottom 50px/430px 190px no-repeat;opacity:.09;pointer-events:none;z-index:-1}` : ''}
  .canvas header{background:#0c1016;border-radius:3px}
  .canvas>.eyebrow,.canvas>h1,.canvas>.subtitle{background:#0c1016;width:fit-content;max-width:100%;padding:2px 4px;border-radius:2px}
  .sponsor-banner{display:flex;align-items:center;gap:20px;padding:18px 20px;margin:-10px 0 28px;border-left:4px solid var(--accent);background:#1a2029;position:relative;overflow:hidden}
  .sponsor-sign{width:155px;height:54px;flex-shrink:0;display:flex;align-items:center;justify-content:center;overflow:hidden}
  .sponsor-sign img{width:100%;height:100%;min-width:0;min-height:0;object-fit:contain}
  .sponsor-caption{min-width:0}.sponsor-caption span{font-size:10px;color:#c2c6d0;letter-spacing:1.8px}
  .sponsor-caption strong{display:block;font-family:FinalsDisplay,Arial,sans-serif;font-size:23px;line-height:1.12;margin-top:6px}
  .canvas .class-icon{background:var(--accent);color:#101217}.canvas .stat{border-left-color:var(--accent)}.canvas .skill-frame{border-bottom-color:var(--accent)}
  .canvas .portrait{border-color:var(--accent)}.canvas .rank{border-left:4px solid var(--accent)}.canvas .brand b{color:var(--accent)}
  .canvas .rank,.canvas .stat,.canvas .slot.filled{background:#131a24}
  .canvas .class{background:#0c1016;padding:10px 12px;border-radius:7px}
  .canvas section>.eyebrow{background:#0c1016;padding:5px 8px;display:inline-block;max-width:100%;border-radius:3px}
  .canvas .portrait,.canvas .skill-frame,.canvas .chip{background:#171e29}
  .canvas .note{background:#0c1016;padding:8px 10px;border-left:2px solid var(--accent);border-radius:3px}
  .canvas footer{background:#0c1016}
  .member-sponsor{display:flex;align-items:center;justify-content:center;width:100%;padding:6px 10px;background:#111319;border-top:2px solid var(--member-accent);border-radius:3px;color:#fff;font-size:12px}
  .member-sponsor img{width:100%;height:24px;object-fit:contain}.slot:has(.member-sponsor){flex-wrap:wrap}.card-slot:has(.member-sponsor){gap:8px}.slot:not(.card-slot) .member-sponsor{width:100px;margin-left:auto}
  .theme-ospuze .sponsor-banner{background:#f8bc2c;color:#151410;border:0;border-radius:0 30px 0 0}.theme-ospuze .sponsor-sign{background:#151410;padding:8px;border-radius:22px}.theme-ospuze .sponsor-caption span{color:#3d3219}
  .theme-iseul-t .sponsor-banner{border:0;background:#122b40;border-bottom:3px solid #e53e9d}.theme-iseul-t .rank{border-left-color:#e53e9d;border-radius:0 18px 0 18px}
  .theme-volpe .sponsor-banner{border:0;border-bottom:3px solid #d90526;background:#25131b;border-radius:0 22px 0 22px}.theme-volpe .rank,.theme-volpe .stat{border-radius:0}
  .theme-holtow .sponsor-banner{border:1px solid #f36b00;border-left:6px solid #f36b00;background:#241b15;border-radius:0}.theme-holtow .sponsor-caption strong{letter-spacing:.8px}.theme-holtow .rank,.theme-holtow .stat,.theme-holtow .portrait{border-radius:0}
  .theme-vaiiya .sponsor-banner{border:1px solid #e8ebef;border-left:3px solid #ed0f35;border-right:3px solid #e8ebef;background:#20232a}.theme-vaiiya .sponsor-caption strong{letter-spacing:1.8px}.theme-vaiiya .rank{border-left-color:#e8ebef;border-radius:2px}
  .theme-engimo .sponsor-banner{border:1px solid #4d8e96;border-radius:28px 4px 28px 4px;background:#152a30}.theme-engimo .sponsor-caption strong{color:#a6d9df}.theme-engimo .rank{border-radius:22px}
  .theme-dissun .sponsor-banner{border:0;border-bottom:4px solid #d21f3c;background:#27141c;border-radius:24px 24px 0 0}.theme-dissun .rank{border-radius:18px 18px 0 0}
  .theme-alfa-acta .sponsor-banner{background:#271823;border:0;border-bottom:2px solid #e70f3d;border-radius:0 0 24px 0}.theme-alfa-acta .portrait{border-radius:0}
  .theme-ivada .sponsor-banner{border:1px solid #777f90;border-bottom-color:#f1f2f4;background:#131820}.theme-ivada .sponsor-caption strong{font-weight:500;letter-spacing:2px}.theme-ivada .rank{border:1px solid #777f90;border-radius:0}.theme-ivada .class-icon{border-radius:50%}
  .theme-trentila .sponsor-banner{background:#a7d825;color:#141d09;border:0;border-right:8px solid #779f13}.theme-trentila .sponsor-caption span{color:#37451c}.theme-trentila .sponsor-sign{background:#172012;padding:9px}.theme-trentila .rank,.theme-trentila .stat{border-radius:0}
  .theme-cometa .sponsor-banner{background:#2c2016;border:0;border-left:5px solid #ff8a00;border-radius:24px 6px 24px 6px}.theme-cometa .sponsor-sign{height:64px}.theme-cometa .rank{border-radius:18px 4px 18px 4px}
  .theme-cns .sponsor-banner{background:#081a2c;border:1px solid #009dff;border-left:4px solid #009dff;border-radius:0}.theme-cns .sponsor-caption strong{color:#80d3ff;letter-spacing:1px}.theme-cns .rank,.theme-cns .portrait{border-radius:2px}
  ${width < 500 ? '.sponsor-banner{gap:14px;padding:14px;margin-bottom:22px;flex-wrap:wrap}.sponsor-sign{width:120px;height:45px}.sponsor-caption strong{font-size:21px}.sponsor-caption span{font-size:9px}.member-sponsor img{height:20px}' : ''}
  `;
}
