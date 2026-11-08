import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Collection,ChannelType,PermissionsBitField,PermissionFlagsBits as P} from 'discord.js';
import {Promotions} from '../src/promotions.js';
import {promotionURL,youtubeVideoId,promotionPlatform} from '../src/promotion-domain.js';
import {commands} from '../src/commands.js';
import {isAdministrativeCommand} from '../src/mailboxes.js';
import {template} from '../src/renderer.js';
import {PromotionMedia} from '../src/promotion-media.js';
import {config} from '../src/config.js';
import sharp from 'sharp';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

function fixture({clan=false,authorized=true,choice=clan?'creator':'promo'}={}) {
  let settings={promotions:{channel:'promo',roles:{promo:'promo-role',creator:'creator-role'}},clans:{vxtg:{role:'clan-role'}}};
  const sent=[],messages=new Collection(),renders=[],added=[],removed=[];
  const me={id:'bot',permissions:new PermissionsBitField(PermissionsBitField.All),roles:{highest:{position:100}}};
  const guild={id:'g'},roleCache=new Collection();
  for(const [id,name] of [['promo-role','Promo VEX'],['creator-role','Creador VEX']])roleCache.set(id,{id,name,guild,managed:false,position:1,permissions:new PermissionsBitField()});
  guild.roles={cache:roleCache,fetch:async()=>roleCache};
  const member={id:'user',displayName:'Nombre Discord',user:{username:'nombre',bot:false},roles:{cache:new Collection(authorized?[[clan?'creator-role':'promo-role',roleCache.get(clan?'creator-role':'promo-role')]]:[]),
    add:async role=>{added.push(role.id);member.roles.cache.set(role.id,role);},remove:async role=>{removed.push(role.id);member.roles.cache.delete(role.id);}}};
  if(clan)member.roles.cache.set('clan-role',{id:'clan-role'});
  const channel={id:'promo',guildId:'g',type:ChannelType.GuildText,permissionsFor:()=>me.permissions,
    messages:{fetch:async()=>new Collection([...messages].reverse())},send:async payload=>{
      sent.push(payload);const message={id:`message-${sent.length}`,author:{id:'bot'},embeds:payload.embeds.map(e=>e.toJSON()),createdTimestamp:Date.now()};messages.set(message.id,message);return message;
    }};
  guild.channels={cache:new Collection([['promo',channel]]),fetch:async id=>id?channel:guild.channels.cache};
  guild.members={fetchMe:async()=>me,fetch:async args=>{assert.equal(args.force,true);return member;}};
  const bot={client:{user:{id:'bot'}},store:{settings:()=>structuredClone(settings),saveSettings:(_,s)=>{settings=structuredClone(s);}},
    queue:async(_key,fn)=>fn(),mailboxes:{assertAdminCommand:()=>{}},sendPrivate:async()=>{},memberCards:{avatar:async()=>null},
    renderer:{render:async(kind,data)=>{renders.push({kind,data});return Buffer.from('png');}}};
  const service=new Promotions(bot);service.media.videoCover=async()=>null;
  const base={guild,guildId:'g',channelId:'promo',user:{id:'user'},commandName:'agregar',options:{getSubcommand:()=> 'promocion',getUser:()=>({id:'user',bot:false}),getString:()=>choice}};
  return {service,bot,base,member,channel,roleCache,sent,messages,renders,added,removed,settings:()=>settings};
}
async function ready(f) {
  let modal,preview;
  await f.service.command({...f.base,showModal:async m=>{modal=m.toJSON();}});
  assert.equal(modal.components.length,4);
  const id=modal.custom_id.split(':')[2];
  await f.service.handle({...f.base,customId:`promotion:submit:${id}`,isModalSubmit:()=>true,
    fields:{getTextInputValue:key=>({title:'Un video <script> @everyone',url:'https://example.com/video',description:'Descripción @here'})[key],getUploadedFiles:()=>new Collection()},
    deferReply:async payload=>{assert.equal(payload.flags,64);},editReply:async p=>{preview=p;}});
  return {id,preview,interaction:{...f.base,customId:`promotion:publish:${id}`,isButton:()=>true,deferUpdate:async()=>{},editReply:async()=>{}}};
}

test('rollpromocion es administrativo y agregar promocion conserva autorización por rol',()=>{
  const grant=commands.find(c=>c.name==='rollpromocion'),add=commands.find(c=>c.name==='agregar');
  assert.equal(grant.default_member_permissions,String(P.Administrator));assert.equal(grant.options[0].required,true);
  assert.deepEqual(grant.options[1].choices.map(({name,value})=>({name,value})),[{name:'Promo VEX',value:'promo'},{name:'Creador VEX',value:'creator'}]);assert.equal(grant.options[1].required,true);
  assert.equal(add.options[0].name,'promocion');assert.equal(add.default_member_permissions,undefined);
  assert.equal(isAdministrativeCommand('rollpromocion'),true);assert.equal(isAdministrativeCommand('agregar'),false);
});

test('URLs y proveedores: solo HTTPS y miniatura automática para IDs de YouTube válidos',()=>{
  for(const url of ['https://youtu.be/vVK4jOC2qOY?t=8','https://www.youtube.com/watch?v=vVK4jOC2qOY','https://youtube.com/shorts/vVK4jOC2qOY'])assert.equal(youtubeVideoId(url),'vVK4jOC2qOY');
  assert.equal(youtubeVideoId('https://youtube.com.evil.test/watch?v=vVK4jOC2qOY'),null);
  assert.equal(youtubeVideoId('https://youtube.com/watch?v=../../etc'),null);
  assert.equal(promotionPlatform('https://www.twitch.tv/video'),'Twitch');
  assert.equal(promotionURL(' https://example.com/video '),'https://example.com/video');
  for(const url of ['javascript:alert(1)','http://example.com/video','https://user:pass@example.com/video','https://localhost/video','https://127.0.0.1/video','https://example.local/video','https://example.com:444/video','https://example.com/'+ 'a'.repeat(512)])assert.throws(()=>promotionURL(url));
});

test('alta administrativa respeta la elección manual independientemente del clan',async()=>{
  for(const clan of [false,true])for(const choice of ['promo','creator']){
    const f=fixture({clan,authorized:false,choice});
    await f.service.grant({...f.base,commandName:'rollpromocion',deferReply:async()=>{}});
    assert.deepEqual(f.added,[choice==='creator'?'creator-role':'promo-role']);
    assert.equal(f.settings().promotions.grants.user.type,choice);
    assert.equal(f.service.memberType('g',f.member),choice);
  }
});

test('reclasificar retira el otro rol y el alta respeta la restricción administrativa',async()=>{
  const f=fixture({clan:true});f.member.roles.cache.delete('creator-role');f.member.roles.cache.set('promo-role',f.roleCache.get('promo-role'));
  await f.service.grant({...f.base,deferReply:async()=>{}});assert.deepEqual(f.added,['creator-role']);assert.deepEqual(f.removed,['promo-role']);
  f.bot.mailboxes.assertAdminCommand=()=>{throw Error('admin-bot');};
  await assert.rejects(f.service.grant(f.base),/admin-bot/);
});

test('sin autorización no abre el formulario; perder el rol antes de publicar bloquea el envío',async()=>{
  const denied=fixture({authorized:false});await assert.rejects(denied.service.command(denied.base),/Necesitas Promo VEX/);
  const f=fixture(),{interaction}=await ready(f);f.member.roles.cache.clear();
  await assert.rejects(f.service.handle(interaction),/Necesitas Promo VEX/);assert.equal(f.sent.length,0);
});

test('vista privada con avatar y categoría; publica solo en Promo con @here fijo y enlace al destino',async()=>{
  const f=fixture(),{preview,interaction}=await ready(f);
  assert.deepEqual(preview.allowedMentions.parse,[]);assert.equal(f.renders[0].data.creatorType,'promo');assert.equal(f.renders[0].data.displayName,'Nombre Discord');
  await f.service.handle(interaction);
  assert.equal(f.sent.length,1);const p=f.sent[0];assert.equal(p.content,'@here');assert.deepEqual(p.allowedMentions.parse,['everyone']);assert.deepEqual(p.allowedMentions.users,[]);assert.deepEqual(p.allowedMentions.roles,[]);
  assert.equal(p.components[0].toJSON().components[0].url,'https://example.com/video');assert.equal(p.enforceNonce,true);
  assert.equal(Object.values(f.settings().promotions.publications)[0].status,'sent');
  await assert.rejects(f.service.handle(interaction));assert.equal(f.sent.length,1);
});

test('doble clic, otro usuario y cambio de canal no duplican ni desvían publicaciones',async()=>{
  const f=fixture(),{interaction}=await ready(f);
  await assert.rejects(f.service.handle({...interaction,user:{id:'other'}}),/otra persona/);
  await assert.rejects(f.service.handle({...interaction,channelId:'other'}),/únicamente en <#promo>/);
  const results=await Promise.allSettled([f.service.handle(interaction),f.service.handle(interaction)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.sent.length,1);
});

test('cancelar no publica y la revocación del permiso @here detiene el envío',async()=>{
  const f=fixture(),{id}=await ready(f);
  await f.service.handle({...f.base,customId:`promotion:cancel:${id}`,isButton:()=>true,update:async()=>{}});assert.equal(f.sent.length,0);
  const second=await ready(f);f.channel.permissionsFor=()=>new PermissionsBitField(P.ViewChannel);
  await assert.rejects(f.service.handle(second.interaction),/Mencionar @here/);assert.equal(f.sent.length,0);
});

test('un envío con respuesta perdida se recupera por recibo sin repetir @here, incluso tras reiniciar',async()=>{
  const f=fixture(),{interaction}=await ready(f),send=f.channel.send;
  f.channel.send=async p=>{await send(p);throw Error('respuesta perdida');};
  await assert.rejects(f.service.handle(interaction),/respuesta perdida/);assert.equal(f.sent.length,1);
  const service=new Promotions(f.bot);service.media.videoCover=async()=>null;let preview;
  await service.command({...f.base,deferReply:async()=>{},editReply:async p=>{preview=p;}});
  const customId=preview.components[0].toJSON().components[0].custom_id;
  await service.handle({...interaction,customId});assert.equal(f.sent.length,1);
  assert.equal(Object.values(f.settings().promotions.publications)[0].status,'sent');
});

test('cambiar de clan conserva el rótulo elegido y no bloquea la publicación',async()=>{
  const f=fixture(),{interaction}=await ready(f);f.member.roles.cache.set('clan-role',{id:'clan-role'});
  await f.service.handle(interaction);assert.equal(f.sent.length,1);
  await ready(f);assert.equal(f.renders.at(-1).data.creatorType,'promo');
});

test('agregar promocion fuera de Promo no abre formulario ni crea un borrador',async()=>{
  const f=fixture();let opened=0;
  for(const channelId of ['general','admin-bot','hilo-de-promo'])await assert.rejects(f.service.command({...f.base,channelId,showModal:async()=>{opened++;}}),/únicamente en <#promo>/);
  assert.equal(opened,0);assert.equal(f.service.drafts.items.size,0);assert.equal(f.sent.length,0);
  await ready(f);
});

test('cambiar el rol manual obliga a actualizar la vista previa y aplica el nuevo rótulo',async()=>{
  const f=fixture(),{interaction}=await ready(f);
  await f.service.grant({...f.base,commandName:'rollpromocion',options:{...f.base.options,getString:()=> 'creator'},deferReply:async()=>{}});
  await assert.rejects(f.service.handle(interaction),/Cambió tu rol de promoción/);assert.equal(f.sent.length,0);
  await ready(f);assert.equal(f.renders.at(-1).data.creatorType,'creator');
});

test('un tipo vacío o desconocido no crea ni asigna roles',async()=>{
  const f=fixture({authorized:false});
  for(const choice of [null,'otro','__proto__'])await assert.rejects(f.service.grant({...f.base,options:{...f.base.options,getString:()=>choice}}),/Elige Promo VEX/);
  assert.equal(f.added.length,0);assert.equal(f.removed.length,0);assert.equal(f.settings().promotions.grants,undefined);
});

test('datos de usuario se escapan y la tarjeta editorial conserva el nombre real y su categoría',()=>{
  for(const creatorType of ['promo','creator']){
    const html=template('promotion',{url:'https://example.com/video',title:'<script>',displayName:'<img>',description:'A & B',creatorType},390);
    assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('&lt;img&gt;'));assert.ok(html.includes('A &amp; B'));assert.ok(!html.includes('<script>'));
    assert.ok(html.includes(creatorType==='creator'?'CREADOR VEX':'PROMO VEX'));
  }
});

test('el primer alta crea solo el rol elegido, sin permisos globales',async()=>{
  const f=fixture({authorized:false}),old=config.roleCreationApprovedGuilds.g;
  delete f.settings().promotions.roles;f.roleCache.clear();config.roleCreationApprovedGuilds.g=['Promo VEX','Creador VEX'];
  const created=[];
  f.base.guild.roles.create=async input=>{
    created.push(input);const role={id:'new-role',name:input.name,guild:f.base.guild,managed:false,position:1,permissions:new PermissionsBitField(input.permissions)};f.roleCache.set(role.id,role);return role;
  };
  try{await f.service.grant({...f.base,deferReply:async()=>{}});assert.equal(created.length,1);assert.equal(created[0].name,'Promo VEX');assert.deepEqual(created[0].permissions,[]);assert.deepEqual(f.added,['new-role']);}
  finally{if(old===undefined)delete config.roleCreationApprovedGuilds.g;else config.roleCreationApprovedGuilds.g=old;}
});

test('no asigna un rol existente que conceda permisos globales adicionales',async()=>{
  const f=fixture({authorized:false});f.roleCache.get('promo-role').permissions=new PermissionsBitField(P.SendMessages);
  await assert.rejects(f.service.grant({...f.base,deferReply:async()=>{}}),/sin permisos globales/);
  assert.equal(f.added.length,0);
});

test('miniaturas: descarga solo de YouTube, normaliza PNG y reutiliza la portada',async()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'vex-promo-test-'));
  try{
    const png=await sharp({create:{width:640,height:360,channels:3,background:'#333'}}).png().toBuffer(),calls=[];
    const media=new PromotionMedia(directory,async(url,options)=>{calls.push(url);assert.equal(options.redirect,'error');return new Response(png);});
    assert.equal(await media.videoCover('https://arbitrary.example/video'),null);assert.equal(calls.length,0);
    const cover=await media.videoCover('https://youtu.be/vVK4jOC2qOY');assert.match(cover.data,/^data:image\/png;base64,/);assert.equal(cover.ref.width,640);
    await media.videoCover('https://www.youtube.com/watch?v=vVK4jOC2qOY');assert.equal(calls.length,1);assert.equal(calls[0],'https://i.ytimg.com/vi/vVK4jOC2qOY/maxresdefault.jpg');
  }finally{assert.ok(path.resolve(directory).startsWith(path.join(tmpdir(),'vex-promo-test-')));rmSync(directory,{recursive:true,force:true});}
});

test('miniaturas excesivas no se leen y una caída permite usar la tarjeta sin portada',async()=>{
  let reads=0;
  const media=new PromotionMedia(path.join(tmpdir(),'vex-promo-no-files'),async()=>({ok:true,headers:new Headers({'content-length':String(9*1024*1024)}),body:{getReader:()=>{reads++;throw Error('no leer');}}}));
  assert.equal(await media.videoCover('https://youtu.be/vVK4jOC2qOY'),null);assert.equal(reads,0);
  media.fetcher=async()=>{throw Error('Sin conexión');};assert.equal(await media.videoCover('https://youtu.be/vVK4jOC2qOY'),null);
});
