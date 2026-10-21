// Render locally by default. --publish sends the reviewed guide to production.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {REST,Routes} from 'discord.js';
import {config,dataDir,root} from '../src/config.js';
import {Store} from '../src/store.js';
import {CardRenderer} from '../src/renderer.js';

const guild=config.productionGuildId,store=new Store(path.join(dataDir,'vex.sqlite'));
const s=store.settings(guild);
if(s.integration?.version!=='1.0.0'){store.close();throw new Error('Prepara la integración V1 antes de publicar su guía.');}
const url=id=>`https://discord.com/channels/${guild}/${id}`;
const links={profile:s.panels.registro.channel,search:s.panels.buscar.channel,teams:s.teamsChannel,leaderboard:s.leaderboard.channel,
  vxtg:s.clans.vxtg.joinChannel,vxltm:s.clans.vxltm.joinChannel,rankVxtg:s.clans.vxtg.rankingChannel,rankVxltm:s.clans.vxltm.rankingChannel,
  tournaments:s.tournamentsChannel,feedback:s.mailboxes.channels.feedbackPublic,reports:s.mailboxes.channels.reportPublic,
  commands:s.memberGuide.channel,rules:s.panels.reglas.channel,roles:s.panels.roles.channel};
const css=readFileSync(path.join(root,'docs/v1/guia.css'),'utf8');
const html=readFileSync(path.join(root,'docs/v1/guia.template.html'),'utf8').replace(/\{\{(\w+)\}\}/g,(_,key)=>{
  if(key==='lifecycleStatus')return s.community?.welcomeEnabled&&s.community?.farewellEnabled?'Ya activas.':'Se activarán al completar el cambio del sistema anterior.';
  if(!links[key])throw new Error(`Falta el destino ${key}`);return url(links[key]);
});
writeFileSync(path.join(root,'docs/v1/index.html'),html);
const out=path.join(dataDir,'release-v1');mkdirSync(out,{recursive:true});
const renderer=new CardRenderer();
const images=[];
try {
  const browser=await renderer.browser(),page=await browser.newPage({viewport:{width:1120,height:1000},deviceScaleFactor:1.5,reducedMotion:'reduce'});
  try{
    await page.route('**/*',r=>r.abort());
    await page.setContent(html.replace('<link rel="stylesheet" href="guia.css">',`<style>${css}</style>`));
    await page.evaluate(()=>document.fonts.ready);
    for(let n=0;n<3;n++){
      const file=`v1-guia-${n+1}.png`,data=await page.locator('.sheet').nth(n).screenshot();
      writeFileSync(path.join(out,file),data);images.push({name:file,data,contentType:'image/png'});
    }
    for(const width of [390,1120]){
      await page.setViewportSize({width,height:1000});
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
      if(overflow)throw new Error(`La guía desborda a ${width}px.`);
    }
  }finally{await page.close();}
}finally{await renderer.close();}
if(!process.argv.includes('--publish')){console.log(`Guía renderizada: ${out}`);store.close();process.exit(0);}

const rest=new REST({timeout:20000}).setToken(process.env.DISCORD_TOKEN);
const bot=await rest.get(Routes.user());
const noMentions={parse:[],users:[],roles:[],replied_user:false};
async function upsert(channel,key,body,files=[]){
  const marker=`VEX LATAM SYSTEM · V1 · ${key}`;
  const saved=store.settings(guild).integration?.releaseMessages?.[key];
  let old=saved?.channel===channel?await rest.get(Routes.channelMessage(channel,saved.message)).catch(e=>{if(e.code===10008)return null;throw e;}):null;
  if(!old){const recent=await rest.get(Routes.channelMessages(channel),{query:new URLSearchParams({limit:'100'})});old=recent.find(m=>m.author.id===bot.id&&m.embeds?.some(e=>e.footer?.text===marker));}
  if(old&&old.author.id!==bot.id)throw new Error('La referencia de publicación no pertenece al bot.');
  const payload={...body,allowed_mentions:noMentions,embeds:body.embeds.map(e=>({...e,footer:{text:marker}})),
    ...(files.length?{attachments:files.map((f,id)=>({id,filename:f.name,description:f.name.endsWith('.png')?'Guía visual V1 de VEX LATAM SYSTEM. Las instrucciones también están en el texto del mensaje.':undefined}))}:{})};
  const result=old?await rest.patch(Routes.channelMessage(channel,old.id),{body:payload,files})
    :await rest.post(Routes.channelMessages(channel),{body:{...payload,nonce:createHash('sha256').update(`${guild}:${key}:v1`).digest('hex').slice(0,25),enforce_nonce:true},files});
  store.db.exec('BEGIN IMMEDIATE');try{const latest=store.settings(guild);latest.integration.releaseMessages??={};latest.integration.releaseMessages[key]={channel,message:result.id};store.saveSettings(guild,latest);store.db.exec('COMMIT');}catch(e){store.db.exec('ROLLBACK');throw e;}
  return url(channel)+'/'+result.id;
}
try{
  const updates=await upsert(config.productionChannels.updates,'Guía de la comunidad',{
    content:'**VEX LATAM SYSTEM · V1**\nTu perfil, tu squad y tu comunidad, conectados. Consulta la guía visual y usa los botones para ir a cada apartado.',
    embeds:[
      {title:'01 · Tu próximo squad empieza aquí',color:0xec2340,description:`**Perfil:** <#${links.profile}> → crea tu ficha y guarda los cambios.\n**RS actual:** /perfil → Actualizar RS; el récord queda aparte.\n**Buscar:** <#${links.search}> → elige filtros, o escribe «busco equipo» en los chats de Ranked/Rápidas. Usa Unirme y los controles de voz de las tarjetas.\n**Comandos privados:** /ayuda · /perfil · /buscar · /leaderboard.`,image:{url:'attachment://v1-guia-1.png'}},
      {title:'02 · Clanes y torneos',color:0xec2340,description:`**VXTG:** <#${links.vxtg}> · **VXLTM:** <#${links.vxltm}>. Perfil y captura obligatorios; solo un clan. VXTG recomienda 20,000 RS actuales y admite solicitudes inferiores con advertencia.\n**Tablas manuales:** <#${links.rankVxtg}> y <#${links.rankVxltm}>.\n**Torneos:** <#${links.tournaments}> → abre sus inscripciones. Individual con un clic si tienes perfil; sin él, solo Embark ID. En equipo, selecciona a tus dos compañeros de Discord.`,image:{url:'attachment://v1-guia-2.png'}},
      {title:'03 · Tu comunidad, con privacidad',color:0xec2340,description:`**Feedback:** <#${links.feedback}> → Enviar feedback. Anonimato opcional y tres envíos diarios por persona; se renuevan a las 00:00 CDMX.\n**Reportes:** <#${links.reports}> → busca al usuario y explica la situación. El equipo autorizado recibe la identidad para seguimiento; el reportado no recibe aviso.\n**Guía de comandos:** <#${links.commands}>.`,image:{url:'attachment://v1-guia-3.png'}}],
    components:[{type:1,components:[['Crear perfil','profile'],['Buscar equipo','search'],['Torneos','tournaments'],['Sugerencias','feedback'],['Reportes','reports']].map(([label,key])=>({type:2,style:5,label,url:url(links[key])}))}]
  },images);
  if(process.argv.includes('--guide-only')){
    console.log(JSON.stringify({updates},null,2));
  }else{
  const admin=await upsert(s.mailboxes.channels.adminCommands,'Administración',{
    embeds:[{title:'V1 · Administración de VEX LATAM SYSTEM',color:0xec2340,description:'Controles reservados por ID al propietario y a la cuenta autorizada. Los demás administradores de Discord pueden ver canales privados, pero los controles del bot rechazan sus acciones.',fields:[
      {name:'Torneos',value:'`/torneo crear` · `/torneo editar` · `/torneo revisar` · `/torneo cerrar convocatoria` · `/torneo terminar`.\n`/torneo-formar-equipo` · `/torneo-chat-de-voz-general` · `/torneo-chat-de-voz-equipos`.'},
      {name:'Clanes y tablas',value:'Solicitudes y botones en <#'+s.clans.channels.inbox+'>. Editor manual en <#'+s.clans.channels.rankingAdmin+'>.\n`/clan miembros` · `/clan solicitudes` · `/clan quitar`.\n`/clan-vxtg-numero-miembros total:...` · `/clan-vxltm-numero-miembros total:...`.'},
      {name:'Mensajes y configuración',value:'`/embed` · `/anuncio` · `/panel` · `/bienvenida` · `/despedida` · `/busqueda-chat` · `/moderacion` · `/avisos` · `/ping`. Los carteles de reglas y roles existentes siguen bajo su sistema actual.'},
      {name:'Rankings manuales',value:'Una línea por jugador: `Jugador#1234 | 32000`. Hasta 50 jugadores por clan. No requiere perfil; al guardar se reemplaza la lista completa tras revisar el resumen.'}
    ]}]});
  const clans=await upsert(config.productionChannels.clanInformation,'Accesos a clanes',{
    embeds:[{title:'Solicitudes y rankings · VXTG / VXLTM',color:0xec2340,description:`**VXTG competitivo:** <#${links.vxtg}>\n**VXLTM comunidad:** <#${links.vxltm}>\n\nCompleta tu perfil en <#${links.profile}> y adjunta tu captura. Las solicitudes se revisan de forma privada. Solo puedes pertenecer a un clan.\n\n**Rankings:** <#${links.rankVxtg}> · <#${links.rankVxltm}>. Lista y RS cargados manualmente por los responsables.`}]
  });
  console.log(JSON.stringify({updates,admin,clans,html:path.join(root,'docs/v1/index.html')},null,2));
  }
}finally{store.close();}
