import { finalsFontCSS } from './finals-fonts.js';
import { vexLogo, finalsLogo } from './branding.js';

// Carteles de acceso: la información y los botones interactivos siguen en el mensaje nativo.
export function squadPanelHTML(kind, width = 720) {
  const profile = kind === 'registro';
  const title = profile ? ['TU PERFIL.', 'TU EQUIPO.'] : ['TU SQUAD.', 'TE ESPERA.'];
  const steps = profile ? ['EMBARK ID + RS + PATROCINADOR', 'CLASE + ESPECIALIZACIONES', 'GUARDAR PERFIL']
    : ['ELIGE RANKED O CHILL', 'DEFINE TU EQUIPO', 'ENCUENTRA COMPAÑEROS'];
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"><title>${title.join(' ')} · VEX LATAM SQUAD</title><style>
${finalsFontCSS()}
*{box-sizing:border-box}body{margin:0;width:${width}px;background:#0b0b0b;color:#f5f5f0;font-family:FinalsBody,Arial,sans-serif}
.canvas{padding:32px 38px 25px;background:#0b0b0b;border:1px solid #373735}
header{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-bottom:25px;border-bottom:1px solid #373735}
.brand{display:flex;align-items:center;gap:12px;min-width:0}.mark{width:50px;height:50px;overflow:hidden;position:relative;flex:none}.mark img{position:absolute;width:92px;height:92px;left:-21px;top:-24px}
.brand-name{font:800 25px/1.05 FinalsDisplay,Arial,sans-serif}.brand-name small{display:block;font:500 10px/1.4 FinalsBody,Arial,sans-serif;letter-spacing:2px;color:#a9a9a3;margin-top:5px}
.finals{display:flex;align-items:center;gap:7px;flex:none;font:800 21px/.9 FinalsDisplay,Arial,sans-serif}.finals img{width:42px;height:42px;object-fit:contain}
.hero{display:grid;grid-template-columns:minmax(0,1fr) 22%;gap:22px;align-items:center;margin:35px 0 24px}.hero>div{min-width:0}
.eyebrow{font-size:11px;letter-spacing:2px;color:#a9a9a3;margin:0 0 18px}
h1{font:800 clamp(3.8rem,12vw,7rem)/.98 FinalsDisplay,Arial,sans-serif;letter-spacing:-.3px;margin:0}h1 span{display:block}
.cuts{height:210px;display:flex;gap:10px;overflow:hidden}.cuts i{display:block;flex:1;background:#f5f5f0;transform:skew(-21deg);margin:0 5px}.cuts i+ i{background:#73736f;flex:.5}
.subtitle{color:#a9a9a3;font-size:18px;line-height:1.5;margin:0 0 25px;max-width:46ch}
.steps{border-top:4px solid #f5f5f0}.step{display:flex;align-items:center;gap:17px;padding:20px 0;border-bottom:1px solid #373735}.number{font:800 25px/1 FinalsDisplay,Arial,sans-serif;color:#a9a9a3}.step b{font:800 23px/1.2 FinalsDisplay,Arial,sans-serif;letter-spacing:.2px}
footer{display:flex;justify-content:space-between;align-items:center;gap:22px;margin-top:30px;font-size:12px;line-height:1.5}.edition{color:#a9a9a3;font-size:10px;letter-spacing:1px;white-space:nowrap}
@media(max-width:500px){.canvas{padding:24px 23px 20px}header{gap:12px}.brand-name{font-size:21px}.brand-name small{font-size:9px;letter-spacing:1px}.mark{width:39px;height:42px}.mark img{width:76px;height:76px;left:-18px;top:-20px}.finals{font-size:18px;gap:5px}.finals img{width:29px;height:29px}.hero{gap:14px;margin:30px 0 22px;grid-template-columns:minmax(0,1fr) 18%}.eyebrow{font-size:10px;letter-spacing:1px}.cuts{height:170px;gap:5px}.cuts i{margin:0 3px}.subtitle{font-size:16px}.step{padding:18px 0;gap:13px}.step b{font-size:20px}footer{display:block;font-size:12px}.edition{display:block;margin-top:13px}}
</style></head><body><article class="canvas"><header><div class="brand"><span class="mark"><img src="${vexLogo()}" alt="VEX"></span><div class="brand-name">VEX LATAM SQUAD<small>COMUNIDAD THE FINALS</small></div></div><div class="finals"><img src="${finalsLogo()}" alt=""><span>THE<br>FINALS</span></div></header><div class="hero"><div><p class="eyebrow">${profile ? 'IDENTIDAD DE JUGADOR' : 'BÚSQUEDA DE EQUIPO'}</p><h1>${title.map(line=>`<span>${line}</span>`).join('')}</h1></div><div class="cuts" aria-hidden="true"><i></i><i></i></div></div><p class="subtitle">${profile ? 'Regístrate, elige tu clase y encuentra compañeros.' : 'Ranked para competir. Chill para disfrutar.'}</p><div class="steps">${steps.map((step,n)=>`<div class="step"><span class="number">0${n+1}</span><b>${step}</b></div>`).join('')}</div><footer><span>No somos solo jugadores, somos VEX.</span><span class="edition">VEX / LATAM</span></footer></article></body></html>`;
}
