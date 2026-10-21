// Mockups locales: no inicia el bot ni publica mensajes en Discord.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { CardRenderer, template } from '../src/renderer.js';
import { finalsFontCSS } from '../src/finals-fonts.js';

const dir = path.resolve('design/welcome-emojis');
mkdirSync(dir, { recursive: true });
const reference = `data:image/jpeg;base64,${readFileSync('C:/Users/twisy/Downloads/WhatsApp Image 2026-10-19 at 7.56.19 PM.jpeg').toString('base64')}`;
const avatar = `data:image/png;base64,${readFileSync('data/preview-members/avatar.png').toString('base64')}`;
// Ventanas CSS sobre la referencia: solo muestras sin candados del selector.
// Se sustituirán por los originales del CDN cuando el bot tenga acceso al servidor.
const cells = [
  [0,0],[0,1],[0,4],[0,7],
  [1,0],[1,1],[1,2],[1,3],[1,4],[1,5],[1,8],
  [2,0],[2,1],[2,5],[2,6],[2,7],[2,8],
  [3,0],[3,1],[3,2],[3,3],[3,5],[3,6],[3,7],[3,8],
  [4,0],[4,1],[4,2],[4,4],[4,5],[4,6],[4,7],[4,8],
  [5,0],[5,1],[5,2],[5,4],[5,5],
];
const centers = [76,190,305,420,535,650,766,881,997];
const emoji = ([row,col], size = 51) => {
  const scale = size / 87, x = (centers[col] - 43.5) * scale, y = (143 + row * 109 - 43.5) * scale;
  return `<span class="emoji" role="img" aria-label="Emoji de muestra de la comunidad" style="width:${size}px;height:${size}px"><img alt="" src="${reference}" style="width:${1080*scale}px;left:-${x}px;top:-${y}px"></span>`;
};
const grid = (list = cells, size = 51) => `<div class="emoji-grid">${list.map(c => emoji(c,size)).join('')}</div>`;
const actions = '<div class="actions" aria-label="Accesos de ejemplo"><span>📜 Leer las reglas</span><span>🎭 Elegir mis roles</span><span>🔎 Buscar equipo</span></div>';
const renderer = new CardRenderer();
try {
  const browser = await renderer.browser();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1600 }, deviceScaleFactor: 1.5 });
  await page.route('**/*', route => route.abort());
  await page.setContent(template('welcome', { displayName: 'SMZ-NOSK', avatarData: avatar, serverName: 'VEX LATAM SQUAD' }, 870));
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode())); });
  const hero = `data:image/png;base64,${(await page.locator('.canvas').screenshot()).toString('base64')}`;
  const css = `${finalsFontCSS()}
    *{box-sizing:border-box}body{margin:0;background:#1e1f22;color:#f2f3f5;font-family:'Segoe UI',Arial,sans-serif}button,a{font:inherit}.mockup{width:1080px;margin:auto;background:#313338;overflow:hidden}
    .concept{background:#17181b;padding:23px 35px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #46474d}.concept strong{font-size:15px;letter-spacing:2px}.concept span{color:#a9abb2;font-size:12px;letter-spacing:1.5px}.red{color:#f1455b}
    .channel{height:63px;display:flex;align-items:center;padding:0 35px;border-bottom:1px solid #242529;font-size:17px;font-weight:600;gap:14px}.channel b{font-size:26px;color:#92949d}.channel small{margin-left:15px;padding-left:20px;border-left:1px solid #55565e;color:#a8aab3;font-size:13px;font-weight:400}
    .message{padding:30px 38px 34px;display:grid;grid-template-columns:44px minmax(0,1fr);gap:18px}.bot-icon{width:44px;height:44px;background:#e3273e;border-radius:50%;display:grid;place-items:center;font-family:FinalsDisplay,Arial,sans-serif;font-size:28px;color:#fff}.author{font-size:16px;font-weight:600;margin-bottom:12px}.bot-tag{background:#5865f2;border-radius:4px;padding:1px 5px;font-size:10px;vertical-align:2px;margin:0 8px;color:white}.time{font-size:12px;font-weight:400;color:#9497a1}.mention{color:#c9cdfb;background:#454b77;border-radius:3px;padding:1px 3px}.hello{margin:0 0 16px;font-size:15px;color:#e2e3e6;line-height:1.6}
    .welcome-image{display:block;width:100%;height:auto}.integrated{overflow:hidden;border-radius:8px;border:1px solid #4a4b50}.integrated .plate{padding:24px 26px 28px;background:#383940;border-top:4px solid #ed243b}.plate-head{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:17px}.plate-head h2{font:28px FinalsDisplay,Arial,sans-serif;letter-spacing:1px;margin:0}.plate-head small{font-size:11px;letter-spacing:1.6px;color:#b0b2ba}.emoji-grid{display:flex;flex-wrap:wrap;gap:12px 17px}.emoji{display:inline-block;overflow:hidden;position:relative;flex-shrink:0;vertical-align:middle;border-radius:4px;background:#383940}.emoji img{position:absolute;max-width:none;height:auto;display:block}.plate p{font-size:13px;color:#afb1ba;margin:17px 0 0;line-height:1.5}
    .native{margin-top:16px;background:#2b2d31;border:1px solid #25262a;border-left:4px solid #ed243b;border-radius:5px;padding:21px 24px 23px;max-width:870px}.native h2{font-size:18px;margin:0 0 8px}.native p{font-size:14px;color:#c2c4cc;line-height:1.55;margin:0 0 18px}.native .emoji-grid{gap:11px 14px}.actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:16px}.actions span{background:#4e5058;border:1px solid #53555e;border-radius:5px;padding:10px 14px;font-size:13px;font-weight:600}.actions span:first-child{background:#5865f2;border-color:#5865f2}.note{padding:0 38px 22px 100px;color:#989ba6;font-size:12px;line-height:1.5}
    .compact{border-radius:8px;overflow:hidden;background:#f3f0e8;color:#17181b}.compact-top{background:#17181b;color:#f3f0e8;padding:18px 25px;display:flex;justify-content:space-between;align-items:center;font:24px FinalsDisplay,Arial,sans-serif}.compact-top small{font:11px 'Segoe UI',Arial,sans-serif;letter-spacing:2px;color:#bbbcc2}.compact-main{display:flex;align-items:center;gap:25px;padding:27px}.compact-main img{width:111px;height:111px;border-radius:50%;border:5px solid #e3273e;object-fit:cover}.compact-main h1{font:55px/.95 FinalsDisplay,Arial,sans-serif;margin:0 0 9px}.compact-main h1 em{color:#e3273e;font-style:normal}.compact-main p{font-size:15px;margin:0;color:#615e5a}.compact-name{font-weight:700;margin-bottom:8px!important;color:#17181b!important}.compact-stripe{height:5px;background:#e3273e}.group{padding-top:18px;margin-top:17px;border-top:1px solid #45474e}.group h3{font-size:12px;text-transform:uppercase;letter-spacing:1.3px;color:#afb1bc;margin:0 0 13px}.group:first-of-type{border-top:0;padding-top:0;margin-top:0}.native .fine{color:#979ba7;font-size:12px;margin:18px 0 0}.foot{padding:17px 35px;background:#232428;border-top:1px solid #42444b;display:flex;justify-content:space-between;color:#a7a9b2;font-size:12px}.foot strong{color:#ed6676;font-weight:500}
    .screen-wrap{container-type:inline-size}@container(max-width:700px){.actions{gap:6px}.plate-head{align-items:flex-start;flex-direction:column}}
  `;
  const options = [
    { id:'01-integrada', title:'01 · GALERÍA EN LA TARJETA', caption:'Una sola imagen para compartir', body:`<div class="integrated"><img class="welcome-image" src="${hero}" alt="Tarjeta de bienvenida personalizada"><section class="plate"><div class="plate-head"><h2>EL SQUAD TIENE SUS EMOJIS.</h2><small>VEX LATAM SQUAD</small></div>${grid(cells,51)}<p>Un emoji para cada partida. Encuéntralos en el selector de emojis del servidor.</p></section></div>${actions}` },
    { id:'02-lista-debajo', title:'02 · TARJETA + LISTA DE EMOJIS', caption:'La bienvenida conserva su diseño', body:`<div class="integrated"><img class="welcome-image" src="${hero}" alt="Tarjeta de bienvenida personalizada"></div><section class="native"><h2>Estos son los emojis de tu nuevo squad</h2><p>Bienvenido a VEX LATAM SQUAD. Dale tu toque al chat con los emojis de la comunidad.</p>${grid(cells,47)}<p class="fine">Los encontrarás en el selector de emojis de Discord, dentro de VEX LATAM SQUAD.</p></section>${actions}` },
    { id:'03-compacta', title:'03 · BIENVENIDA COMPACTA', caption:'Emojis organizados por tipo', body:`<section class="compact"><header class="compact-top">VEX LATAM SQUAD<small>NUEVO INTEGRANTE</small></header><div class="compact-main"><img src="${avatar}" alt="Avatar de ejemplo"><div><h1>BIENVENIDO AL <em>SQUAD.</em></h1><p class="compact-name">SMZ-NOSK</p><p>Buenas partidas. Mejor compañía.</p></div></div><div class="compact-stripe"></div></section><section class="native"><h2>Tu nueva comunidad, en emojis</h2><p>Para celebrar la victoria, armar equipo o simplemente pasarla bien.</p><div class="group"><h3>Juegos y clan</h3>${grid([cells[2],cells[5],cells[6],cells[8],cells[9],cells[27],cells[33],cells[34],cells[37]],52)}</div><div class="group"><h3>Insignias y rangos</h3>${grid([cells[1],cells[12],cells[14],cells[15],cells[16],cells[17],cells[18],cells[19],cells[29]],52)}</div><div class="group"><h3>Reacciones de la comunidad</h3>${grid([cells[0],cells[3],cells[4],cells[7],cells[10],cells[11],cells[13],cells[20],cells[21],cells[22],cells[23],cells[24],cells[25],cells[26],cells[28],cells[30],cells[31],cells[32],cells[35],cells[36]],52)}</div><p class="fine">Abre el selector de emojis y busca VEX LATAM SQUAD.</p></section>${actions}` },
  ];
  for (const option of options) {
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${option.title}</title><style>${css}</style></head><body><main class="mockup"><header class="concept"><strong><span class="red">VEX /</span> ${option.title}</strong><span>PROPUESTA VISUAL</span></header><div class="channel"><b>#</b> 📢・bienvenidos <small>VEX LATAM SQUAD</small></div><article class="message"><div class="bot-icon">V</div><div class="screen-wrap"><div class="author">VEX LATAM SYSTEM <span class="bot-tag">APP</span><span class="time">hoy a las 20:00</span></div><p class="hello">¡Bienvenido, <span class="mention">@SMZ-NOSK</span>! Ya eres parte del squad. 👋</p>${option.body}</div></article><div class="note">Ejemplo visual con emojis de la captura. El avatar y el nombre cambian con cada nuevo integrante.</div><footer class="foot"><strong>${option.caption}</strong><span>VEX LATAM · BIENVENIDA</span></footer></main></body></html>`;
    writeFileSync(path.join(dir,`${option.id}.html`),html);
    await page.setContent(html,{waitUntil:'load'});
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
    await page.locator('.mockup').screenshot({path:path.join(dir,`${option.id}.png`)});
    console.log(path.join(dir,`${option.id}.png`));
  }
  const index = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bienvenida con emojis · VEX</title><style>body{margin:0;background:#151619;color:#f3f0e8;font:16px 'Segoe UI',Arial,sans-serif}main{max-width:1400px;padding:35px;margin:auto}h1{font-size:32px}p{color:#b5b6bf;line-height:1.6}nav{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}nav a{color:white;background:#e3273e;padding:12px 18px;text-decoration:none;border-radius:6px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}article{background:#23252a;border:1px solid #45474e;padding:15px;border-radius:8px}img{width:100%;height:auto;display:block}h2{font-size:16px}article a{color:#f3f0e8}</style><main><h1>Tu próxima bienvenida, con los emojis del squad.</h1><p>Tres propuestas para comparar. La segunda conserva la tarjeta actual y muestra los emojis debajo. Son mockups: los botones y menciones representan cómo se vería el mensaje en Discord.</p><nav>${options.map(o=>`<a href="${o.id}.html">${o.title}</a>`).join('')}</nav><div class="grid">${options.map(o=>`<article><h2><a href="${o.id}.html">${o.title}</a></h2><p>${o.caption}</p><a href="${o.id}.png"><img src="${o.id}.png" alt="${o.title}"></a></article>`).join('')}</div><p>Los ejemplos usan 38 emojis visibles sin candado en la captura. Para la versión final hacen falta los archivos originales o el acceso del bot al servidor.</p></main></html>`;
  writeFileSync(path.join(dir,'index.html'), index);
  console.log(path.join(dir,'index.html'));
  let comparison = index;
  for (const option of options) comparison = comparison.replace(`src="${option.id}.png"`, `src="data:image/png;base64,${readFileSync(path.join(dir,`${option.id}.png`)).toString('base64')}"`);
  await page.setViewportSize({width:1600,height:1400});
  await page.setContent(comparison,{waitUntil:'load'});
  await page.evaluate(async()=>Promise.all([...document.images].map(i=>i.decode())));
  await page.locator('main').screenshot({path:path.join(dir,'comparacion.png')});
  await page.close();
} finally { await renderer.close(); }
