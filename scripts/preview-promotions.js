import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {CardRenderer,template} from '../src/renderer.js';
import {PromotionMedia} from '../src/promotion-media.js';
import {PROMOTION_DESIGNS} from '../src/promotion-design.js';

const root=fileURLToPath(new URL('../',import.meta.url)),dir=path.join(root,'design','promociones');mkdirSync(dir,{recursive:true});
const media=new PromotionMedia(path.join(root,'data','preview-promo-assets'));
const url='https://www.youtube.com/watch?v=vVK4jOC2qOY';
const cover=await media.videoCover(url);
const avatarFile=path.join(root,'data','preview-promo-assets','avatar-demo.png');
const avatar=existsSync(avatarFile)?readFileSync(avatarFile):await sharp(readFileSync(path.join(root,'rangos','logos','VEX LATAM','WhatsApp Image 2026-10-13 at 3.49.43 PM.jpeg'))).resize(256,256).png().toBuffer();
const sample={url,title:'¿Vuelven las automáticas? | THE FINALS 12.2.0',description:'Un nuevo video para la comunidad. Descubre los cambios y comparte tu opinión.',displayName:existsSync(avatarFile)?'MARTISBEL':'Jugador Demo',creatorType:'promo',avatarData:`data:image/png;base64,${avatar.toString('base64')}`,coverData:cover?.data,demo:true};
const renderer=new CardRenderer(),tiles=[];
try{
  for(const design of PROMOTION_DESIGNS)for(const width of [1100,390]){
    const data={...sample,design},name=`${design}-${width}`;
    const buffer=await renderer.render('promotion',data,width);writeFileSync(path.join(dir,`${name}.png`),buffer);
    if(width===1100)tiles.push({design,buffer});
    const page=await(await renderer.browser()).newPage({viewport:{width,height:1500}});
    try{await page.setContent(template('promotion',data,width));await page.evaluate(()=>document.fonts.ready);
      const overflow=await page.evaluate(()=>[...document.querySelectorAll('header,h1,.creator,.creator-name,.description,.footer')].filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>e.className||e.tagName));
      if(overflow.length)throw Error(`${name}: ${overflow.join(', ')}`);
      console.log(`${name}: sin desbordamientos`);
    }finally{await page.close();}
  }
  for(const creatorType of ['promo','creator'])for(const width of [1100,390])writeFileSync(path.join(dir,`final-${creatorType}-${width}.png`),await renderer.render('promotion',{...sample,creatorType,design:'editorial'},width));
  const boardPage=await(await renderer.browser()).newPage({viewport:{width:2400,height:1800},deviceScaleFactor:1});
  try{
    const fonts=readFileSync(path.join(root,'assets','fonts','SairaExtraCondensed-ExtraBold.ttf')).toString('base64');
    await boardPage.setContent(`<style>@font-face{font-family:Saira;src:url(data:font/ttf;base64,${fonts})}*{box-sizing:border-box}body{margin:0;background:#e6e6df;color:#111;font:22px Arial,sans-serif}.canvas{padding:65px 65px 55px}h1{font:70px Saira;margin:0 0 8px}header p{font-size:22px;color:#555;margin:0 0 48px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:32px}.proposal{min-width:0}.proposal h2{font:40px Saira;margin:0 0 8px}.caption{font-size:20px;color:#555;margin:0 0 25px}.discord{background:#313338;padding:22px;border-radius:5px}.ping{background:#555646;color:#fff4a3;font-size:19px;padding:5px 9px;display:inline-block;margin-bottom:17px}.discord img{width:100%;height:auto;display:block}.button{display:inline-block;border-radius:4px;background:#4e5058;color:#fff;font-size:20px;padding:14px 22px;margin-top:16px}.note{font-size:21px;color:#555;margin:35px 0 0;line-height:1.5}</style><article class="canvas"><header><h1>PROMOCIONES / VEX LATAM SQUAD</h1><p>Tres propuestas · Avatar circular · Carátula del video · Blanco, negro y rojo</p></header><div class="grid">${tiles.map(({design,buffer},i)=>`<section class="proposal"><h2>0${i+1} / ${['PANTALLA','EDITORIAL','ESTRENO'][i]}</h2><p class="caption">${['La carátula y el creador al frente.','Negativo blanco, lectura en columnas.','Imagen protagonista y avatar integrado.'][i]}</p><div class="discord"><span class="ping">@here</span><img src="data:image/png;base64,${buffer.toString('base64')}"><div class="button">Ver video ↗</div></div></section>`).join('')}</div><p class="note">El aviso y el botón son parte del mensaje de Discord. La portada se obtiene automáticamente para YouTube o se adjunta para otras plataformas.<br>Vista de propuesta con datos de ejemplo. El avatar final será el del usuario que publique.</p></article>`);
    await boardPage.evaluate(()=>document.fonts.ready);
    writeFileSync(path.join(dir,'propuestas.png'),await boardPage.locator('.canvas').screenshot());
  }finally{await boardPage.close();}
}finally{await renderer.close();}
