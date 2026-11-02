import { finalsFontCSS } from './finals-fonts.js';
import { localDate } from './tournament-domain.js';
import { regionalTimes, tournamentCSS } from './tournament-design.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export function privateMatchHTML(data, width) {
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:"><style>
  ${finalsFontCSS()} ${tournamentCSS}
  *{box-sizing:border-box}html,body{margin:0;width:${width}px;background:#111;color:#f7f5ee;font-family:FinalsBody,Arial,sans-serif}
  .canvas{position:relative;overflow:hidden;background:#121214;border:1px solid #3a3334;padding:clamp(24px,5vw,54px)}
  .canvas:before{content:'';position:absolute;right:-80px;top:-140px;width:370px;height:550px;background:#dc253b;transform:rotate(24deg);opacity:.88}
  .top,.hero,.content,.footer{position:relative}.top{display:flex;align-items:center;justify-content:space-between;gap:15px;border-bottom:1px solid #766b6b;padding-bottom:18px;font-weight:800;letter-spacing:.16em;font-size:clamp(11px,1.5vw,15px)}
  .brand{font-family:FinalsDisplay,Arial,sans-serif;font-size:clamp(24px,3vw,38px);letter-spacing:.02em}.brand span{color:#fb3949}.edition{background:#f5f1e8;color:#181516;padding:9px 12px}
  .hero{padding:42px 0 36px;max-width:90%}.kicker{color:#ff5362;font-weight:800;letter-spacing:.19em;font-size:14px}.hero h1{font:900 clamp(38px,7vw,84px)/.97 FinalsDisplay,Arial,sans-serif;text-transform:uppercase;overflow-wrap:anywhere;margin:16px 0 25px}.theme{font-size:clamp(19px,2.7vw,29px);line-height:1.35;overflow-wrap:anywhere;margin:0;color:#e5ded6}.theme small{display:block;color:#a9a0a0;letter-spacing:.15em;font-size:12px;font-weight:800;margin-bottom:8px}
  .reference{background:#e73043;color:#fff;padding:22px 25px;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px}.reference small{font-size:13px;font-weight:800;letter-spacing:.12em}.reference strong{font-size:clamp(21px,3vw,32px);line-height:1.2;overflow-wrap:anywhere}
  .tournament-times{margin-top:34px}.tournament-times h2{color:#f5f1e8;font-size:20px;letter-spacing:.12em;margin-bottom:14px}.tournament-times-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.tournament-time{background:#222124;padding:12px;grid-template-columns:70px minmax(0,1fr)}.tournament-time strong{color:#f7f5ee;font-size:23px}.tournament-time em{color:#ffabb2}.tournament-places{color:#e2ddda;font-size:15px}.tournament-places small{font-size:13px}.tournament-times-note{font-size:13px;color:#bbb1ad}.footer{margin-top:35px;border-top:1px solid #766b6b;padding-top:15px;display:flex;justify-content:space-between;color:#a9a0a0;font-weight:800;font-size:11px;letter-spacing:.13em}
  @media(max-width:600px){.canvas:before{opacity:.38}.hero{max-width:100%;padding-top:32px}.tournament-times-grid{grid-template-columns:1fr}.reference strong{font-size:22px}}
  </style><div class="canvas"><header class="top"><div class="brand">VEX<span> /</span> LATAM</div><div class="edition">PARTIDA PRIVADA</div></header><main class="content"><section class="hero"><div class="kicker">THE FINALS · COMUNIDAD</div><h1>${esc(data.name)}</h1><p class="theme"><small>TEMÁTICA</small>${esc(data.theme)}</p></section><section class="reference"><small>FECHA Y HORA · CDMX</small><strong>${esc(localDate(data.startsAt))}</strong></section>${regionalTimes(data).replace('fecha del torneo', 'fecha de la partida')}</main><footer class="footer"><span>VEX LATAM SYSTEM</span><span>NOS VEMOS EN LA ARENA /</span></footer></div></html>`;
}
