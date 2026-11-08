import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { CardRenderer, template } from '../src/renderer.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const dir=path.join(root,'design','vex-squad','final');mkdirSync(dir,{recursive:true});
const renderer=new CardRenderer();
const avatar=await sharp(readFileSync(path.join(root,'rangos','logos','VEX LATAM','WhatsApp Image 2026-10-13 at 3.49.43 PM.jpeg'))).resize(512,512).png().toBuffer();
const player={clan:'vxtg',status:'approved',displayName:'VEXINK',embarkId:'Vexink#1234',score:33400,rank:'Platino 3',avatarData:`data:image/png;base64,${avatar.toString('base64')}`,demo:true};
const cases=[['registro',{},720],['registro',{},390],['buscar',{},720],['buscar',{},390],['clan-admission',player,1080],['clan-admission',player,390],['clan-decision',player,1080],['clan-decision',player,390],['clan-admission',{...player,displayName:'JugadorConUnNombreMuyLargoParaRevisar',score:null,rank:'Sin registrar',avatarData:null},390]];
const lightPlayer={...player,clan:'vxltm',people:[{embarkId:'Vexink#1234',displayName:'VEXINK',score:33400,rank:'Platino 3'},{embarkId:'Jugador#5678',displayName:'Jugador Demo',score:25000,rank:'Oro 2'}],gameCount:24,total:2};
for(const kind of ['clan-poster','clan-ranking','clan-admission','clan-decision'])for(const width of [1080,390])cases.push([kind,lightPlayer,width]);
try{
  for(const [kind,data,width] of cases){
    const name=`${data.clan==='vxltm'?'vxltm-':''}${kind}-${width}${data.score===null?'-sin-datos':''}`;
    writeFileSync(path.join(dir,`${name}.png`),await renderer.render(kind,data,width));
    const page=await (await renderer.browser()).newPage({viewport:{width,height:1500}});
    try{
      await page.setContent(template(kind,data,width));await page.evaluate(()=>document.fonts.ready);
      const overflow=await page.evaluate(()=>{
        const box=document.querySelector('.canvas').getBoundingClientRect();
        return [...document.querySelectorAll('h1,h2,p,footer,header,td,th,.brand,.admit-score,.rank-seal,.notice')].filter(el=>{
          const rect=el.getBoundingClientRect();
          return rect.right>box.right+1||rect.left<box.left-1||el.scrollWidth>el.clientWidth+2;
        }).map(el=>({element:el.className||el.tagName,text:el.textContent.slice(0,70)}));
      });
      if(overflow.length)throw new Error(`${name}: ${JSON.stringify(overflow)}`);
      console.log(`${name}: sin desbordamientos`);
    }finally{await page.close();}
  }
}finally{await renderer.close();}
