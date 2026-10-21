// Diseños de clanes; las filas de muestra nunca se importan como miembros.
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {REST,Routes,PermissionFlagsBits as P} from 'discord.js';
import {DatabaseSync} from 'node:sqlite';
import {CardRenderer,template} from '../src/renderer.js';
import {rankFromRS} from '../src/domain.js';
import {config,dataDir} from '../src/config.js';
import {clanModal} from '../src/clan-ui.js';

const dir=path.join(dataDir,'preview-clans');mkdirSync(dir,{recursive:true});
const renderer=new CardRenderer(),samples=[];
let avatarData;try{avatarData=`data:image/png;base64,${readFileSync(path.join(dataDir,'preview-members','avatar.png')).toString('base64')}`;}catch{}
try{
  for(const clan of ['vxtg','vxltm']){
    writeFileSync(path.join(dir,`${clan}-formulario.json`),JSON.stringify(clanModal({id:`preview-${clan}`,data:{clan}},{embarkId:'JugadorDemo#1234',score:25000,rank:'Oro 2'}).toJSON(),null,2));
    for(const kind of ['clan-poster','clan-ranking','clan-admission']){
      const people=Array.from({length:12},(_,n)=>({user:`demo-${n}`,embarkId:`Jugador${String(n+1).padStart(2,'0')}#${1000+n}`,displayName:`Miembro de ejemplo ${n+1}`,score:Math.max(0,(clan==='vxtg'?47500:42000)-n*2500),rank:rankFromRS(Math.max(0,(clan==='vxtg'?47500:42000)-n*2500))}));
      const data={clan,people,total:12,gameCount:null,page:1,pages:1,demo:true,displayName:'Jugador Demo',embarkId:'JugadorDemo#1234',score:32000,rank:'Platino 4',avatarData};
      const name=`${clan}-${kind}`,file=path.join(dir,`${name}.png`);
      writeFileSync(path.join(dir,`${name}.html`),template(kind,data,1080));writeFileSync(file,await renderer.render(kind,data,1080));
      console.log(file);samples.push({name,file,clan,kind});
    }
  }
  if(process.argv.includes('--publish-test')){
    const guild=process.env.DISCORD_GUILD_ID?.trim();if(guild!==config.testGuildId)throw Error('Las muestras solo se publican en el servidor de pruebas.');
    const db=new DatabaseSync(path.join(dataDir,'vex.sqlite'),{readOnly:true});const settings=JSON.parse(db.prepare('SELECT data FROM settings WHERE guild=?').get(guild).data);db.close();
    const channelId=settings.mailboxes.channels.testing,api=new REST({timeout:15000}).setToken(process.env.DISCORD_TOKEN.trim());
    const [channel,category,roles,me]=await Promise.all([api.get(Routes.channel(channelId)),api.get(Routes.channel(settings.mailboxes.channels.adminCategory)),api.get(Routes.guildRoles(guild)),api.get(Routes.user())]);
    if(channel.guild_id!==guild||channel.parent_id!==category.id)throw Error('Canal de pruebas incorrecto.');
    for(const c of [channel,category])if(!c.permission_overwrites.some(o=>o.id===guild&&BigInt(o.deny)&P.ViewChannel)||c.permission_overwrites.some(o=>BigInt(o.allow)&P.ViewChannel&&o.id!==me.id&&!(o.type===0&&roles.some(r=>r.id===o.id&&BigInt(r.permissions)&P.Administrator))))throw Error('El canal de pruebas no es privado.');
    const refsFile=path.join(dir,'messages.json');let refs={};try{refs=JSON.parse(readFileSync(refsFile,'utf8'));}catch{}
    const output={guild,channel:channelId,messages:refs.guild===guild?{...refs.messages}:{}};
    for(const sample of samples){
      let old;if(refs.guild===guild&&refs.messages?.[sample.name]){try{old=await api.get(Routes.channelMessage(channelId,refs.messages[sample.name].id));}catch(e){if(e.code!==10008)throw e;}}
      if(old&&old.author.id!==me.id)throw Error('La muestra no pertenece al bot.');
      const filename=`${sample.name}.png`,body={content:`**Vista previa · ${sample.clan.toUpperCase()} · ${sample.kind==='clan-poster'?'Cartel de ingreso':sample.kind==='clan-admission'?'Tarjeta de nuevo integrante':'Ranking'}**\n${sample.kind==='clan-poster'?'Propuesta visual del cartel publicado en el canal del clan.':'Datos de ejemplo para mostrar el diseño; no constituye un ingreso ni modifica las listas reales.'}`,
        embeds:[{color:sample.clan==='vxtg'?0xf5f5f5:0xed243b,image:{url:`attachment://${filename}`}}],attachments:[{id:0,filename}],allowed_mentions:{parse:[]}};
      const request={body,files:[{name:filename,data:readFileSync(sample.file),contentType:'image/png'}]};
      const message=old?await api.patch(Routes.channelMessage(channelId,old.id),request):await api.post(Routes.channelMessages(channelId),request);
      output.messages[sample.name]={id:message.id,url:`https://discord.com/channels/${guild}/${channelId}/${message.id}`};writeFileSync(refsFile,JSON.stringify(output,null,2));
    }
    console.log(JSON.stringify(output,null,2));
  }
}finally{await renderer.close();}
