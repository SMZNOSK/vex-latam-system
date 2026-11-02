import { readFileSync } from 'node:fs';
import { sponsorLogo, getSponsor } from './sponsors.js';
import { vexLogo, finalsLogo } from './branding.js';
import { finalsFontCSS } from './finals-fonts.js';
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fonts={Fashion:'Italiana-Regular',Sans:'InstrumentSans-Regular',Sport:'BigShoulders-Bold',Serif:'Lora-Regular',Mono:'DMMono-Regular',Security:'Jura-Medium',Round:'Outfit-Bold',Power:'Tektur-Medium',Organic:'BricolageGrotesque-Bold',Orbit:'CrimsonPro-Regular',Code:'GeistMono-Bold'};
let cachedFonts;
function fontCSS(){return cachedFonts ??= Object.entries(fonts).map(([name,file])=>{try{return `@font-face{font-family:${name};src:url(data:font/ttf;base64,${readFileSync(new URL('../assets/fonts/sponsor-cards/'+file+'.ttf',import.meta.url)).toString('base64')})}`}catch{return ''}}).join('')}
const limits={'ospuze':400,'iseul-t':420,'volpe':580,'holtow':600,'vaiiya':900,'engimo':510,'dissun':570,'alfa-acta':580,'ivada':450,'trentila':500,'cometa':520,'cns':495};
export function guestSearchHTML(data, width=720) {
 const displayName = String(data.displayName || 'Jugador').slice(0,100);
 const initials=escapeHTML([...displayName].filter(c=>/[\p{L}\p{N}]/u.test(c)).slice(0,2).join('').toUpperCase() || 'V');
 const avatar=typeof data.avatarData === 'string' && data.avatarData.length < 3*1024*1024 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(data.avatarData) ? data.avatarData : null;
const svg=(content)=>`<svg class="art" viewBox="0 0 1100 620" xmlns="http://www.w3.org/2000/svg">${content}</svg>`;
const photo=(style='',cls='')=>`<div class="portrait ${cls}" style="${style}">${avatar ? `<img src="${avatar}" alt="Avatar">` : `<span class="avatar-fallback">${initials}</span>`}</div>`;
const logo=(id,style='',dark=false)=>`<img class="sponsor ${dark?'ink':''}" style="${style}" src="${sponsorLogo(id)}" alt="${id}">`;
const brands=(style='',dark=false)=>`<div class="brands ${dark?'dark':''}" style="${style}"><div class="vex"><img src="${vexLogo()}" alt=""><b>VEX LATAM</b></div><i></i><div class="finals"><img src="${finalsLogo()}" alt=""><b>THE<br>FINALS</b></div></div>`;
const label=(style='',text='BUSCANDO EQUIPO')=>`<div class="label" style="${style}">${text}</div>`;
const name=(style='',text='SMZ-NOSK')=>`<h1 class="fit-name" style="${style};max-width:${limits[data.sponsorId] || 500}px">${text.includes('<br>') && displayName.includes('-') ? escapeHTML(displayName).replace('-', '-<br>') : escapeHTML(displayName)}</h1>`;
const base=`*{box-sizing:border-box}body{margin:0} .card{width:1100px;height:620px;position:relative;overflow:hidden;isolation:isolate;font-family:FinalsBody;color:#f5f4ee;background:#15161a}.art{position:absolute;inset:0;width:100%;height:100%;z-index:-1}h1{position:absolute;margin:0;font-weight:400;line-height:1;white-space:nowrap}.label{position:absolute;font:600 24px/1 FinalsBody;letter-spacing:2.5px;white-space:nowrap}.portrait{position:absolute;overflow:hidden}.avatar-fallback{display:flex;width:100%;height:100%;align-items:center;justify-content:center;background:#505561;color:white;font:700 100px/1 Sport,sans-serif}.fit-name{overflow:hidden}.portrait img{width:100%;height:100%;object-fit:cover;display:block}.sponsor{position:absolute;width:160px;height:64px;object-fit:contain;object-position:left center}.ink{filter:brightness(0)}.brands{position:absolute;display:flex;align-items:center;gap:20px;height:56px;color:#fff}.brands i{height:32px;width:1px;background:currentColor;opacity:.35}.vex{position:relative;padding-left:55px;height:52px;display:flex;align-items:center;overflow:hidden}.vex img{position:absolute;left:-22px;top:-29px;width:105px;height:105px;mix-blend-mode:screen}.vex b{font:700 23px/1 FinalsDisplay;letter-spacing:.7px}.finals{display:flex;align-items:center;gap:8px}.finals img{width:36px;height:35px}.finals b{font:700 22px/.85 FinalsDisplay;letter-spacing:1px}.brands.dark{color:#191b1d}.dark .vex img{filter:invert(1);mix-blend-mode:multiply}.dark .finals img{filter:brightness(0)}.micro{position:absolute;font:13px/1.5 Mono;letter-spacing:2px}.rule{position:absolute;height:1px;background:currentColor;opacity:.3}`;

const designs={
ospuze:{bg:'#f7d900',color:'#171714',css:'.portrait img{filter:saturate(.8) contrast(1.08)}',html:
svg(`<path d="M790 65 817 140 899 91 882 181 988 174 925 245 1038 291 933 324 998 418 895 409 914 507 829 464 783 520 750 456 652 509 670 409 567 424 629 344 525 300 639 263 577 173 683 183 667 85 750 140Z" fill="#171714"/>${[[76,157,16],[495,111,19],[544,488,31],[1018,72,17],[1025,548,28],[66,489,14]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#171714" stroke-width="3"/>`).join('')}<path d="M44 549H505" stroke="#171714" stroke-width="3"/>`)
+logo('ospuze','left:48px;top:34px;width:178px;height:86px',true)
+label('left:50px;top:189px;letter-spacing:3px;font-size:28px')
+name('left:48px;top:239px;font:700 130px/.9 Sport;letter-spacing:-2px;transform:skew(-5deg)','SMZ-<br>NOSK')
+photo('left:642px;top:164px;width:283px;height:283px;border-radius:50%;border:8px solid #f7d900')
+`<div class="micro" style="left:50px;top:512px">FIND YOUR SQUAD ↗</div>`+brands('left:694px;bottom:26px',true)},

'iseul-t':{bg:'#efede6',color:'#17232d',css:'.portrait img{filter:grayscale(1) contrast(.92)}',html:
svg(`<rect x="40" y="35" width="444" height="550" fill="#009cdf"/><path d="M969 0H1100V620H969Z" fill="#009cdf"/><path d="M984 43v534" stroke="#17232d"/><path d="M527 500H930" stroke="#17232d" stroke-width="1"/>`)
+photo('left:67px;top:62px;width:388px;height:496px')
+logo('iseul-t','left:526px;top:52px;width:350px;height:100px',true)
+`<div class="micro" style="left:529px;top:180px;letter-spacing:5px">PLAY / TOGETHER</div>`
+name('left:520px;top:239px;font:400 91px/.95 Fashion;letter-spacing:-3px','SMZ-<br>NOSK')
+label('left:530px;top:459px;font-family:Sans;font-size:20px;letter-spacing:1px')
+brands('left:539px;bottom:39px',true)
+`<div class="micro" style="left:1000px;top:140px;writing-mode:vertical-rl;font-size:19px;letter-spacing:6px">VEX LATAM — FIND SQUAD</div>`},

volpe:{bg:'#dd173b',color:'#f5f3eb',css:'.portrait img{filter:grayscale(1) contrast(1.15)}',html:
svg(`<path d="M0 0H501L273 620H0Z" fill="#161719"/>${[0,1,2,3,4].map(i=>`<path d="M${650+i*37} -90C${1120+i*37} 130 ${350+i*37} 270 ${620+i*37} 710" fill="none" stroke="#f5f3eb" stroke-opacity=".23" stroke-width="3"/>`).join('')}<path d="M455 500H1026M455 508H1026" stroke="#f5f3eb"/>`)
+photo('left:42px;top:136px;width:365px;height:421px;clip-path:polygon(9% 0,100% 0,91% 100%,0 100%)')
+brands('left:48px;top:30px')
+logo('volpe','left:825px;top:38px;width:216px;height:80px;filter:brightness(0) invert(1)')
+label('left:470px;top:220px;font-family:Sans;font-size:24px;letter-spacing:1px')
+name('left:456px;top:270px;font:700 120px/1 Sport;letter-spacing:-2px;transform:skew(-7deg)')
+`<div class="micro" style="left:472px;top:534px">FIND SQUAD <span style="margin-left:278px">↗ ↗ ↗</span></div>`},

holtow:{bg:'#ee7325',color:'#26221d',css:'.portrait img{filter:grayscale(1) sepia(.2)}',html:
svg(`<rect x="39" y="34" width="1022" height="552" rx="3" fill="#f2ead8"/><path d="M39 34H1061V133H39Z" fill="#ee7325"/><path d="M71 151H1028M71 489H1028M705 175V466" stroke="#26221d" stroke-width="2"/>${[0,1,2,3].map(i=>`<circle cx="55" cy="${197+i*94}" r="6" fill="#ee7325"/>`).join('')}<path d="M78 461H661" stroke="#26221d" stroke-dasharray="3 6"/>`)
+logo('holtow','left:71px;top:53px;width:256px;height:60px',true)
+`<div class="micro" style="right:75px;top:77px;letter-spacing:2px">VEX / FIND SQUAD</div>`
+label('left:84px;top:197px;font-family:Mono;font-size:23px;letter-spacing:0')
+name('left:77px;top:274px;font:400 78px/1 Serif;letter-spacing:-5px')
+`<div class="micro" style="left:84px;top:422px">COMUNIDAD VEX LATAM</div>`
+photo('left:755px;top:182px;width:244px;height:270px;border:8px solid #fffaf0;outline:1px solid #26221d;transform:rotate(3deg)')
+brands('left:82px;top:510px',true)
+`<div style="position:absolute;left:796px;top:516px;border:2px solid #9a4b25;border-radius:50%;padding:11px 32px;font:19px Mono;color:#9a4b25;transform:rotate(-8deg)">HOLTOW</div>`},

vaiiya:{bg:'#e9ecec',color:'#252c32',css:'.portrait img{filter:grayscale(1)}.fit-name{margin:auto}',html:
svg(`<defs><pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M44 0H0V44" fill="none" stroke="#252c32" stroke-opacity=".055"/></pattern></defs><rect width="1100" height="620" fill="url(#grid)"/><circle cx="550" cy="253" r="154" fill="none" stroke="#bac1c4"/><circle cx="550" cy="253" r="140" fill="none" stroke="#252c32" stroke-width="2" stroke-dasharray="3 6"/><path d="M356 253H414M686 253H744M550 59V116M550 390V419" stroke="#ed244b" stroke-width="3"/><path d="M55 156V106H105M995 106H1045V156M55 420V470H105M995 470H1045V420" fill="none" stroke="#252c32" stroke-width="2"/><circle cx="550" cy="253" r="163" fill="none" stroke="#ed244b" stroke-width="4" stroke-dasharray="80 945" transform="rotate(-90 550 253)"/>`)
+logo('vaiiya','left:54px;top:30px;width:223px;height:54px',true)
+photo('left:430px;top:133px;width:240px;height:240px;border-radius:50%;border:5px solid #fff')
+label('left:69px;top:278px;font:24px/1 Mono;letter-spacing:0','BUSCANDO<br><br>EQUIPO')
+`<div class="micro" style="right:70px;top:278px;text-align:right">VEX LATAM<br>FIND SQUAD</div>`
+name('left:0;right:0;text-align:center;top:423px;font:500 78px/1 Security;letter-spacing:1px')
+brands('left:400px;bottom:28px',true)},

engimo:{bg:'#123d40',color:'#e4f1d5',css:'.portrait img{filter:saturate(.55)}',html:
svg(`${[0,1,2,3,4,5].map(i=>`<path d="M-80 ${110+i*19} C270 ${-120+i*25},510 ${720-i*21},1190 ${180+i*25}" fill="none" stroke="#86c3bd" stroke-opacity="${.17+i*.055}" stroke-width="2"/>`).join('')}<circle cx="260" cy="291" r="175" fill="#86c3bd" fill-opacity=".09"/><circle cx="260" cy="291" r="155" stroke="#86c3bd" fill="none"/><path d="M438 291H496V239H532" fill="none" stroke="#b3d9bd" stroke-width="3"/><circle cx="496" cy="291" r="7" fill="#e4f1d5"/><circle cx="930" cy="181" r="9" fill="#86c3bd"/><circle cx="970" cy="463" r="6" fill="#e4f1d5"/>`)
+logo('engimo','left:58px;top:32px;width:223px;height:71px;filter:brightness(0) saturate(100%) invert(88%) sepia(13%) saturate(491%) hue-rotate(49deg)')
+photo('left:125px;top:156px;width:270px;height:270px;border-radius:50%;border:7px solid #123d40')
+label('left:540px;top:214px;font-size:25px;letter-spacing:3px')
+name('left:532px;top:269px;font:700 76px/1 Round;letter-spacing:-4px')
+`<div style="position:absolute;left:541px;top:377px;height:4px;width:76px;background:#b3d9bd"></div>`
+brands('left:56px;bottom:33px')
+`<div class="micro" style="right:60px;bottom:50px">FIND SQUAD / CONNECT</div>`},

dissun:{bg:'#141416',color:'#d3d4ce',css:'.portrait img{filter:grayscale(1) contrast(1.15)}',html:
svg(`<defs><pattern id="slat" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M0 20 20 0" stroke="#424246" stroke-width="2"/></pattern></defs><path d="M700 0H1100V620H700Z" fill="#ed233c"/><rect x="35" y="126" width="623" height="341" fill="url(#slat)"/><path d="M45 151H633V442H45Z" fill="#141416"/><path d="M735 136H1042V449H735Z" fill="#252529" stroke="#8c8c8d" stroke-width="2"/><path d="M39 505H660" stroke="#ed233c" stroke-width="3"/><path d="M761 516H798L811 491 832 547 850 486 870 528 883 516H1036" fill="none" stroke="#141416" stroke-width="4"/>${[[722,123],[1055,123],[722,462],[1055,462]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="6" fill="#141416"/>`).join('')}`)
+logo('dissun','left:41px;top:20px;width:158px;height:91px;object-position:left center;filter:brightness(0) invert(1)')
+label('left:66px;top:182px;font:22px/1 Mono;letter-spacing:0;color:#ed233c')
+name('left:61px;top:268px;font:500 80px/1 Power;letter-spacing:-4px')
+photo('left:754px;top:155px;width:269px;height:275px')
+brands('left:43px;bottom:32px')
+`<div class="micro" style="left:950px;top:57px;color:#141416">POWER<br>TO PLAY</div>`},

'alfa-acta':{bg:'#d7d1b8',color:'#414a3b',css:'.portrait img{filter:grayscale(1) sepia(.45) contrast(.95)}',html:
svg(`<defs><pattern id="mapgrid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" stroke="#414a3b" stroke-opacity=".1" fill="none"/></pattern></defs><rect width="1100" height="620" fill="url(#mapgrid)"/>${[0,1,2,3,4].map(i=>`<path d="M${750+i*27} -50C${570+i*34} 160 ${1120-i*10} 244 ${859-i*20} 700" fill="none" stroke="#414a3b" stroke-opacity=".2" stroke-width="2"/>`).join('')}<path d="M34 34H1066V586H34Z" fill="none" stroke="#414a3b"/><path d="M678 143H1028V489H678Z" fill="#414a3b"/><path d="M657 141H630V173M1027 508H1051V482" fill="none" stroke="#b83130" stroke-width="4"/><path d="M68 472H594" stroke="#414a3b" stroke-width="2"/><path d="M78 450V493M583 450V493" stroke="#414a3b"/>`)
+logo('alfa-acta','left:67px;top:61px;width:168px;height:79px',true)
+label('left:74px;top:216px;font-family:Mono;font-size:20px;letter-spacing:1px')
+name('left:67px;top:275px;font:700 111px/1 Sport;letter-spacing:2px')
+photo('left:691px;top:157px;width:324px;height:318px')
+`<div class="micro" style="left:76px;top:417px;color:#b83130">[ FIND SQUAD ]</div>`
+brands('left:70px;bottom:43px',true)},

ivada:{bg:'#e8e5df',color:'#414244',css:'.portrait img{filter:grayscale(1) contrast(.85)}',html:
svg(`<defs><linearGradient id="metal"><stop stop-color="#faf9f5"/><stop offset=".3" stop-color="#dddcd7"/><stop offset=".52" stop-color="#fffefb"/><stop offset=".74" stop-color="#c9c9c4"/><stop offset="1" stop-color="#f2f1eb"/></linearGradient></defs><path d="M0 0H461V620H0Z" fill="#fefdf9"/><path d="M1025 -100C806 134 836 420 1120 595" fill="none" stroke="url(#metal)" stroke-width="127"/><path d="M524 431H953" stroke="#414244" stroke-width="1"/>`)
+photo('left:37px;top:37px;width:385px;height:546px;border-radius:195px 195px 0 0')
+logo('ivada','left:528px;top:59px;width:225px;height:68px',true)
+name('left:520px;top:216px;font:400 74px/1.2 Fashion;letter-spacing:-1px')
+label('left:531px;top:340px;font-family:Sans;font-size:20px;letter-spacing:3px')
+brands('left:530px;bottom:51px',true)},

trentila:{bg:'#eef0d5',color:'#294323',css:'.portrait img{filter:saturate(.65)}',html:
svg(`<path d="M700 -66C440 75 611 165 754 170C911 176 812 374 949 393C1103 414 1240 200 1154 -48Z" fill="#a9d62b"/><path d="M-52 508C97 330 322 523 393 672H-52Z" fill="#a9d62b"/>${[0,1,2,3].map(i=>`<ellipse cx="873" cy="292" rx="${173+i*24}" ry="${212+i*23}" fill="none" stroke="#294323" stroke-opacity=".19" transform="rotate(21 873 292)"/>`).join('')}<path d="M469 457C489 410 527 381 578 366M506 407C475 395 476 370 482 350C509 360 525 376 506 407M535 388C541 351 574 343 595 347C583 372 563 387 535 388" fill="none" stroke="#294323" stroke-width="3"/>`)
+logo('trentila','left:52px;top:38px;width:215px;height:83px',true)
+label('left:57px;top:204px;font-size:26px;letter-spacing:1px')
+name('left:50px;top:260px;font:700 83px/.98 Organic;letter-spacing:-4px','SMZ-<br>NOSK')
+photo('left:710px;top:146px;width:325px;height:354px;border-radius:43% 57% 59% 41% / 41% 43% 57% 59%;border:8px solid #eef0d5')
+brands('left:55px;bottom:35px',true)},

cometa:{bg:'#071a2c',color:'#e4e9ef',css:'.portrait img{filter:saturate(.45) brightness(.95)}',html:
svg(`<defs><radialGradient id="planet" cx=".35" cy="0" r="1"><stop stop-color="#7592a5"/><stop offset=".14" stop-color="#234662"/><stop offset=".6" stop-color="#0a2038"/></radialGradient></defs><ellipse cx="1030" cy="928" rx="850" ry="555" fill="url(#planet)" stroke="#a8bcc9" stroke-width="2"/><ellipse cx="770" cy="393" rx="570" ry="210" fill="none" stroke="#dab87d" stroke-opacity=".35" transform="rotate(-25 770 393)"/>${Array.from({length:48},(_,i)=>`<circle cx="${(i*139+59)%1090}" cy="${(i*67+31)%610}" r="${i%4===0?1.7:.8}" fill="#e4e9ef" opacity="${.2+(i%5)*.12}"/>`).join('')}<circle cx="262" cy="286" r="172" fill="#091625" stroke="#dab87d" stroke-width="2"/><circle cx="262" cy="286" r="155" fill="none" stroke="#748997" stroke-width="12"/>`)
+photo('left:118px;top:142px;width:288px;height:288px;border-radius:50%;border:5px solid #0a1725')
+logo('cometa','left:507px;top:35px;width:145px;height:105px')
+label('left:511px;top:201px;font:20px/1 Mono;letter-spacing:1px;color:#dab87d')
+name('left:502px;top:252px;font:400 92px/1 Orbit;letter-spacing:-1px')
+`<div style="position:absolute;left:513px;top:375px;width:80px;height:1px;background:#dab87d"></div>`
+brands('left:96px;bottom:30px')
+`<div class="micro" style="right:58px;bottom:48px;color:#dab87d">FIND SQUAD ↗</div>`},

cns:{bg:'#111220',color:'#58efe2',css:'.portrait img{filter:grayscale(1) contrast(1.2)}',html:
svg(`<defs><pattern id="scan" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 0H6" stroke="#58efe2" stroke-opacity=".06"/></pattern></defs><rect width="1100" height="620" fill="url(#scan)"/><path d="M50 140H607V451H50Z" fill="#111220" stroke="#58efe2" stroke-width="2"/><path d="M50 140H607V180H50Z" fill="#58efe2"/><path d="M697 90H1027V463H697Z" fill="#af8cec"/><path d="M665 123H995V496H665Z" fill="#111220" stroke="#58efe2" stroke-width="2"/><path d="M665 123H995V157H665Z" fill="#58efe2"/><path d="M17 218H38V272H17M1023 397H1092V406H1023M1021 421H1070V434H1021M410 485H564V496H410M445 505H533V510H445" fill="#af8cec"/><path d="M691 451H789V459H691M898 418H1020V427H898" fill="#58efe2"/>`)
+logo('cns','left:48px;top:26px;width:195px;height:75px;filter:brightness(2) drop-shadow(0 0 1px #58efe2)')
+`<div class="micro" style="left:67px;top:151px;color:#111220;font-size:14px">VEX://FIND_SQUAD <span style="margin-left:228px">— □ ×</span></div>`
+label('left:75px;top:224px;font:20px/1 Mono;letter-spacing:0')
+name('left:70px;top:286px;font:700 65px/1 Code;letter-spacing:-3px')
+`<div class="micro" style="left:76px;top:396px;color:#af8cec">&gt; FIND SQUAD<span style="background:#58efe2;display:inline-block;width:12px;height:18px;margin-left:13px;vertical-align:middle"></span></div>`
+photo('left:682px;top:174px;width:296px;height:297px')
+brands('left:50px;bottom:31px')
+`<div class="micro" style="right:75px;bottom:48px;color:#af8cec">[ CNS // SIGNAL ]</div>`}
};

const selected=designs[getSponsor(data.sponsorId)?.id] ?? designs.ospuze;
return `<!doctype html><html lang="es"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:"><style>${finalsFontCSS()}${fontCSS()}${base}.canvas{width:${width}px;height:${width*620/1100}px;overflow:hidden}.card{transform:scale(${width/1100});transform-origin:top left;background:${selected.bg};color:${selected.color}}${selected.css}</style><main class="canvas"><div class="card">${selected.html}</div></main></html>`;
}
