import { specializations, classLabel } from './catalog.js';
import { rankIcon, finalsLogo, vexLogo } from './branding.js';
import { specializationIcon } from './specialization-assets.js';
import { finalsFontCSS } from './finals-fonts.js';
import { sponsorBanner, sponsorBadge, sponsorCSS } from './sponsor-design.js';
import { getSponsor } from './sponsors.js';
import { tournamentDesign, tournamentCSS } from './tournament-design.js';
import { memberCardHTML } from './member-card-design.js';
import { clanHTML } from './clan-design.js';
import { currentRS, recordRS } from './profile-rs.js';
import { profileCSS } from './profile-design.js';
import { privateMatchHTML } from './private-match-design.js';

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
    : '<span class="brand">VEX<b> /</b></span>'}${finals ? `<div class="finals-lockup"><img class="finals-logo" src="${finals}" alt="" decoding="sync"><span>THE<br>FINALS</span></div>` : '<span class="game">THE FINALS</span>'}</header>`;
}
const classIcon = value => `<span class="class-icon">${value === 'Ligero' ? '↯' : value === 'Mediano' ? '✚' : value === 'Pesado' ? '⬢' : '◈'}</span>`;
const chip = value => `<span class="chip">${escapeHTML(value)}</span>`;
function illustratedSkills(ids, fallback) {
  const selected = specializations.filter(s => (ids ?? []).includes(s.id));
  return selected.length ? `<div class="skill-frames">${selected.map(s => {
    const uri = specializationIcon(s.id);
    return `<span class="skill-frame" title="${escapeHTML(s.label)}">${uri ? `<img src="${uri}" alt="${escapeHTML(s.label)}" decoding="sync">` : `<span class="skill-fallback" role="img" aria-label="${escapeHTML(s.label)}">◎</span>`}</span>`;
  }).join('')}</div>` : `<div class="chips">${chip(fallback)}</div>`;
}
const stat = (label, value) => `<div class="stat"><span class="eyebrow">${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>`;
const cardURI = value => typeof value === 'string' && value.length <= 4 * 1024 * 1024 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : null;
function roster(data) {
  const hasCards = data.membersDisplay?.some(member => cardURI(member.cardImageData));
  const slots = Array.from({ length: data.filters.teammates + 1 }, (_, n) => {
    const member = data.members[n], profile = data.membersDisplay?.[n], uri = cardURI(profile?.cardImageData);
    const identity = profile?.embarkId || 'Perfil no disponible';
    const label = member === data.host ? '<small>ORGANIZA</small>' : '';
    const badge = sponsorBadge(profile?.sponsorId);
    if (hasCards) return `<div class="slot card-slot ${member ? 'filled' : ''}"><div class="tile-media">${uri
      ? `<img src="${uri}" alt="Tarjeta de ${escapeHTML(identity)}" loading="eager" decoding="sync">`
      : `<span class="tile-identity ${member ? '' : 'available'}">${member ? escapeHTML(identity) : '<b aria-hidden="true">+</b>Lugar disponible'}</span>`}</div>${badge}${label || (member ? '<small>INTEGRANTE</small>' : '<small aria-hidden="true">&nbsp;</small>')}</div>`;
    return `<div class="slot ${member ? 'filled' : ''}"><span class="identity">${member ? escapeHTML(identity) : 'Lugar disponible'}</span>${badge}${label}</div>`;
  }).join('');
  return `<div class="roster ${hasCards ? 'has-cards' : ''}">${slots}</div>`;
}
export function template(kind, data, width = 720, font = '') {
  if (!Number.isInteger(width) || width < 300 || width > 1440) throw new RangeError('Ancho de tarjeta inválido');
  if (kind === 'private-match') return privateMatchHTML(data, width);
  if (['welcome', 'farewell'].includes(kind)) return memberCardHTML(kind, data, width, font);
  if (['clan-poster', 'clan-ranking', 'clan-admission'].includes(kind)) return clanHTML(kind, data, width);
  const sponsor = ['profile', 'team'].includes(kind) ? getSponsor(data.sponsorId) : null;
  let title, subtitle, body, category;
  if (kind === 'profile') {
    title = data.embarkId; subtitle = data.needsCompletion
      ? getSponsor(data.sponsorId) ? 'Completa tus especializaciones para encontrar equipo' : 'Elige tu patrocinador para completar el registro'
      : ''; category = 'PERFIL DE JUGADOR';
    body = `<div class="profile-heading"><h1>${escapeHTML(title)}</h1>${subtitle?`<p class="subtitle">${escapeHTML(subtitle)}</p>`:''}</div>
      <div class="rank">${rankBadge(data.rank)}<h2>${escapeHTML(data.rank)}</h2></div>
      <dl class="rs-metrics"><div><dt>RS ACTUAL</dt><dd>${fmt(currentRS(data))}</dd></div><div><dt>RÉCORD RS</dt><dd>${fmt(recordRS(data))}</dd></div></dl>
      <div class="loadout"><div class="class">${classIcon(data.playerClass)}<div><span class="eyebrow">CLASE</span><h3>${escapeHTML(data.playerClass)}</h3></div></div>
      <section><span class="eyebrow">ESPECIALIZACIONES</span>${illustratedSkills(data.specializationIds, 'Selección pendiente')}</section></div>`;
    const uri = cardURI(data.cardImageData);
    body = `<div class="profile-layout${uri?' has-portrait':''}">${uri?`<aside class="portrait"><img src="${uri}" alt="Tarjeta del juego de ${escapeHTML(data.embarkId)}" loading="eager" decoding="sync"></aside>`:''}<div class="profile-details">${body}</div></div>`;
  } else if (kind === 'team') {
    const f = data.filters, open = data.status === 'open' && data.expires > Date.now(), full = data.members.length >= f.teammates + 1;
    const hot = f.mode === 'HOT';
    title = open ? full ? hot ? 'HOT · EQUIPO COMPLETO' : 'EQUIPO COMPLETO' : hot ? 'BÚSQUEDA HOT' : 'BUSCANDO EQUIPO' : data.status === 'expired' ? 'BÚSQUEDA CADUCADA' : 'BÚSQUEDA CERRADA';
    category = hot ? 'VLS FIND SQUAD · EN CALIENTE' : 'VLS FIND SQUAD';
    subtitle = f.description || (hot ? 'Arma tu equipo en caliente. Listos para jugar.' : f.mode === 'Chill' ? 'Juega a tu ritmo. Encuentra buena compañía.' : 'Un objetivo. Un equipo. La siguiente victoria.');
    body = hot ? `<div class="stats">${stat('BÚSQUEDA', 'HOT')}${stat('JUGADORES', `${data.members.length} / ${f.teammates + 1}`)}${stat('RS DEL ORGANIZADOR', Number.isInteger(data.hostScore) ? fmt(data.hostScore) : 'Sin registrar')}</div>${roster(data)}`
      : `<div class="stats">${stat('MODO', f.mode)}${stat('JUGADORES', `${data.members.length} / ${f.teammates + 1}`)}${f.mode !== 'Chill' ? stat('INTERVALO RS', `${fmt(f.minScore)} – ${fmt(f.maxScore)}`) : stat('RS', 'Sin filtro')}</div>
      <div class="class">${classIcon(f.playerClass)}<div><span class="eyebrow">CLASES BUSCADAS</span><h3>${escapeHTML(classLabel(f))}</h3></div></div>
      <section><span class="eyebrow">ESPECIALIZACIONES · COINCIDIR CON CUALQUIERA</span>${illustratedSkills(f.specializationIds, f.legacySpecialization || 'Cualquiera')}</section>
      ${roster(data)}`;
  } else if (['tournament', 'tournament-poster', 'tournament-team'].includes(kind)) {
    ({ title, category, subtitle, body } = tournamentDesign(kind, data));
  } else if (kind === 'leaderboard') {
    title = 'TOP 10 · RS'; category = 'VEX LATAM · CLASIFICACIÓN DE LA COMUNIDAD';
    subtitle = 'Los jugadores con más RS registrados en sus perfiles.';
    body = leaderboardBody(data.players ?? []);
  } else {
    const profile = kind === 'registro'; category = profile ? 'VEX LATAM SYSTEM' : 'VLS FIND SQUAD'; title = profile ? 'TU PERFIL.\nTU EQUIPO.' : 'JUEGA EN\nBUENA COMPAÑÍA.';
    subtitle = profile ? 'Regístrate, elige tu clase y encuentra compañeros.' : 'Ranked para competir. Chill para disfrutar.';
    body = `<div class="steps">${(profile ? ['EMBARK ID + RS + PATROCINADOR', 'CLASE + ESPECIALIZACIONES', 'LISTO PARA JUGAR'] : ['ELIGE TU MODO', 'DEFINE TU EQUIPO', 'ENCUENTRA COMPAÑEROS']).map((label, n) => `<div><span>0${n + 1}</span><strong>${label}</strong></div>`).join('')}</div>`;
  }
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:"><style>
    ${finalsFontCSS()}
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
    html,body{font-family:FinalsBody,'Arial',sans-serif}.canvas{background:radial-gradient(ellipse at top right,#42121c 0,transparent 60%),#111218;border-top:5px solid #ed243b}
    h1,h2,h3,.brand-name,.stat strong,.rank p,.steps strong,.identity,.tile-identity,.standing-name,.standing-score{font-family:FinalsDisplay,'Arial Narrow',sans-serif;font-weight:800}
    h1{text-transform:uppercase;font-size:${kind === 'profile' ? 42 : 50}px;letter-spacing:.1px;line-height:1.05}h2{font-size:34px}h3{font-size:29px}.subtitle{font-size:20px}.eyebrow{font-size:14px;letter-spacing:1px}.brand-name{font-size:29px}.rank p{font-size:31px}.stat strong{font-size:27px}.identity{font-size:22px}.tile-identity{font-size:22px}.note{font-size:15px}.status{font-size:13px}.slot small,.card-slot small{font-size:12px}.rank,.slot,.portrait{border-radius:9px}.class-icon{border-radius:7px}.profile-details h2{font-size:31px}.profile-details h3{font-size:28px}.profile-details .rank p{font-size:28px}
    .skill-frames{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0 22px}.skill-frame{width:86px;height:86px;display:grid;place-items:center;padding:5px;background:#1c1f28;border:1px solid #555867;border-bottom:3px solid #ed243b;border-radius:7px}.skill-frame img{display:block;width:100%;height:100%;object-fit:contain;border-radius:3px}.skill-fallback{font-family:Arial,sans-serif;font-size:36px;color:#c4c8d4}.profile-details .skill-frame{width:76px;height:76px}.tile-identity.available{font-family:FinalsBody,Arial,sans-serif;font-size:18px}.roster.has-cards{margin-top:20px}
    .champion{display:grid;grid-template-columns:172px minmax(0,1fr);gap:24px;align-items:center;padding:18px;background:linear-gradient(135deg,#322820,#1d1e26 68%);border:1px solid #d8bc77;border-top:4px solid #e9cd85;border-radius:10px}.standing-photo{display:block;width:100%;height:auto;object-fit:contain;border-radius:6px}.standing-identity{display:grid;place-items:center;width:100%;aspect-ratio:2/3;padding:12px;background:#171922;border:1px solid #404351;text-align:center;overflow-wrap:anywhere;font-family:FinalsDisplay,Arial,sans-serif;font-size:22px}.standing-info{min-width:0}.standing-place{font-family:FinalsDisplay,Arial,sans-serif;font-size:34px;line-height:1;color:#e9cd85}.champion .standing-place{font-size:70px}.standing-name{font-size:28px;line-height:1.2;overflow-wrap:anywhere;margin:10px 0}.standing-score{font-size:32px;line-height:1.2;color:#f4f5f7}.champion .standing-score{font-size:46px}.standing-score small{font-family:FinalsBody,Arial,sans-serif;font-weight:500;color:#bec3d2;font-size:16px}.standing-rank{display:flex;align-items:center;gap:8px;font-size:17px;color:#c4c8d4;margin-top:12px}.standing-rank .rank-badge{width:42px;height:42px}.podium{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}.podium-card{display:grid;grid-template-columns:95px minmax(0,1fr);align-items:center;gap:12px;padding:12px;background:#1e202b;border:1px solid #747b91;border-top:3px solid #b9c2d8;border-radius:9px}.podium-card.third{border-color:#7b5744;border-top-color:#cc9574}.podium-card .standing-place{color:#c9d1e2}.podium-card.third .standing-place{color:#e2ac8a}.podium-card .standing-name{font-size:24px}.podium-card .standing-score{font-size:26px}.standing-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:20px}.standing-small{padding:9px;background:#181b24;border:1px solid #383c49;border-radius:8px;min-width:0}.standing-small .standing-place{color:#aab1c2;font-size:22px;margin-bottom:7px}.standing-small .standing-name{font-size:20px;margin:9px 0 5px}.standing-small .standing-score{font-size:24px}.standing-small .standing-score small{font-size:14px}.leaderboard-note{margin-top:20px;color:#b9bdcb;font-size:16px;line-height:1.45}
    .standing-photo{aspect-ratio:2/3;background:#15171f}
    ${width < 500 ? 'h1{font-size:38px}.brand-name{font-size:24px}.brand-name small{font-size:9px}.finals-logo{width:115px}.eyebrow{font-size:13px}.subtitle{font-size:18px}.skill-frame,.profile-details .skill-frame{width:75px;height:75px}.identity{font-size:21px}.tile-identity{font-size:20px}.champion{grid-template-columns:116px minmax(0,1fr);gap:14px;padding:12px}.champion .standing-place{font-size:50px}.champion .standing-name{font-size:27px}.champion .standing-score{font-size:34px}.standing-rank{font-size:15px}.podium-card{grid-template-columns:1fr;gap:8px;padding:10px}.podium-card .standing-photo,.podium-card .standing-identity{width:100%;max-width:105px;margin:auto}.podium-card .standing-name{font-size:22px}.standing-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.standing-small .standing-photo,.standing-small .standing-identity{max-width:110px;margin:auto}' : ''}
    ${sponsorCSS(sponsor?.id, width)}
    .rs-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0 0 22px}.rs-metrics>div{background:#11151ddd;border:1px solid #ffffff3b;border-bottom:3px solid #ffffff8c;padding:13px 15px;min-width:0}.rs-metrics dt{font:12px/1.4 FinalsBody,Arial,sans-serif;letter-spacing:1px;color:#cbd0da}.rs-metrics dd{font:34px/1.15 FinalsDisplay,Arial,sans-serif;margin:5px 0 0;color:#fff}.rs-metrics>div+div{border-bottom-color:#ffffff38}.rs-metrics>div+div dd{color:#b7bdc8}.profile-details .rs-metrics dd{font-size:30px}.profile-details .rs-metrics dt{font-size:11px}.rank p>span{font:11px/1.3 FinalsBody,Arial,sans-serif;color:#bfc1cd}
    ${tournamentCSS}
    .finals-lockup{display:flex;align-items:center;gap:8px;flex:none;color:#fff}.finals-lockup .finals-logo{width:54px;height:54px;object-fit:contain}.finals-lockup>span{font:25px/.9 FinalsDisplay,Arial,sans-serif;letter-spacing:1px}.profile-card .finals-lockup .finals-logo{width:42px;height:42px}.profile-card .finals-lockup>span{font-size:23px}
    @media(max-width:500px){.finals-lockup .finals-logo,.profile-card .finals-lockup .finals-logo{width:33px;height:33px}.finals-lockup>span,.profile-card .finals-lockup>span{font-size:20px;letter-spacing:.3px}.finals-lockup{gap:5px}}
    ${kind==='profile'?profileCSS:''}
    </style><main class="canvas${kind==='profile'?' profile-card':''}${kind === 'tournament-poster' ? ' poster-wide' : ''}${sponsor ? ` theme-${sponsor.id}` : ''}">${header()}${kind==='profile'?'':`${sponsorBanner(sponsor?.id)}<span class="eyebrow">${category}</span><h1>${escapeHTML(title)}</h1><p class="subtitle">${escapeHTML(subtitle)}</p>`}${body}${kind==='profile'?sponsorBanner(sponsor?.id,{compact:true}):''}<footer><span>VEX LATAM${kind==='profile'?'':' SYSTEM'}${sponsor ? ` · ${sponsor.label}` : ''}</span><span>${kind === 'profile' ? 'THE FINALS' : 'COMUNIDAD · EQUIPO'}</span></footer></main></html>`;
}

function leaderboardBody(players) {
  const list = players.slice(0, 10);
  const visual = p => cardURI(p.cardImageData) ? `<img class="standing-photo" src="${cardURI(p.cardImageData)}" alt="Tarjeta de ${escapeHTML(p.embarkId)}" decoding="sync">`
    : `<div class="standing-identity">${escapeHTML(p.embarkId)}</div>`;
  const info = (p, n, rank = false) => `<div class="standing-info"><span class="standing-place">${String(n + 1).padStart(2, '0')}</span><div class="standing-name">${escapeHTML(p.embarkId)}</div><div class="standing-score">${fmt(p.score)} <small>RS</small></div>${rank ? `<div class="standing-rank">${rankBadge(p.rank)}<span>${escapeHTML(p.rank)}</span></div>` : ''}</div>`;
  if (!list.length) return '<div class="slot">Todavía no hay jugadores con RS registrados. Crea tu perfil para aparecer aquí.</div>';
  return `<div class="champion">${visual(list[0])}${info(list[0], 0, true)}</div>${list.length > 1 ? `<div class="podium">${list.slice(1, 3).map((p, i) => `<div class="podium-card ${i === 1 ? 'third' : ''}">${visual(p)}${info(p, i + 1)}</div>`).join('')}</div>` : ''}${list.length > 3 ? `<div class="standing-grid">${list.slice(3).map((p, i) => `<div class="standing-small"><span class="standing-place">${String(i + 4).padStart(2, '0')}</span>${visual(p)}<div class="standing-name">${escapeHTML(p.embarkId)}</div><div class="standing-score">${fmt(p.score)} <small>RS</small></div></div>`).join('')}</div>` : ''}<p class="leaderboard-note">RS registrados por los jugadores · Clasificación local, no oficial.<br>Los empates se ordenan por Embark ID. ${list.length < 10 ? `Hay ${list.length} jugadores registrados en este top.` : ''}</p>`;
}
