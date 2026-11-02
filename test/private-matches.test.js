import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType } from 'discord.js';
import { PrivateMatches } from '../src/private-matches.js';
import { template } from '../src/card-template.js';
import { commands } from '../src/commands.js';

function fixture() {
  const sent = [];
  const channel = { id:'222222222222222222', type:ChannelType.GuildText, permissionsFor:()=>({has:()=>true}), send:async p=>{sent.push(p);return {id:'333333333333333333'};} };
  const guild = { channels:{fetch:async()=>channel}, members:{fetchMe:async()=>({})} };
  let settings={};
  const bot = { client:{user:{id:'bot'}}, store:{settings:()=>settings,saveSettings:(_,s)=>{settings=s;}}, queue:(_key, fn)=>fn(), mailboxes:{assertAdminCommand:()=>{}}, renderer:{render:async()=>Buffer.from('image')} };
  const mod = new PrivateMatches(bot);
  const base = { guild, guildId:'111111111111111111', user:{id:'user'}, options:{getChannel:()=>channel} };
  return { mod, base, sent, channel, bot };
}
async function ready(f) {
  let modal;
  await f.mod.command({ ...f.base, showModal:async m=>{ modal=m; } });
  const id = modal.toJSON().custom_id.split(':')[2];
  let preview;
  await f.mod.handle({ ...f.base, customId:`privada:submit:${id}`, isModalSubmit:()=>true, fields:{getTextInputValue:k=>({name:'Partida',theme:'Equipos',date:'2099-05-01',time:'23:30'})[k]}, deferReply:async()=>{}, editReply:async p=>{preview=p;} });
  return { id, preview };
}
test('comando y tarjeta incluyen horarios regionales y escapan texto', () => {
  assert.ok(commands.find(c=>c.name==='privadas'));
  const html = template('private-match',{name:'<script>',theme:'A & B',startsAt:Date.parse('2099-05-02T05:30:00Z')},1100);
  assert.match(html, /&lt;script&gt;/); assert.match(html, /A &amp; B/);
  assert.match(html, /Argentina/); assert.match(html, /02 may 2099/);
});
test('vista privada publica solo una vez y sin menciones', async () => {
  const f=fixture(), {id,preview}=await ready(f);
  assert.equal(preview.files.length,1);
  const interaction={...f.base, customId:`privada:publish:${id}`, isButton:()=>true, deferUpdate:async()=>{}, editReply:async()=>{}};
  await f.mod.handle(interaction);
  assert.equal(f.sent.length,1); assert.deepEqual(f.sent[0].allowedMentions.parse,[]);
  await assert.rejects(()=>f.mod.handle(interaction)); assert.equal(f.sent.length,1);
});
test('cancelar no publica y otro usuario no puede confirmar', async () => {
  const f=fixture(), {id}=await ready(f);
  await assert.rejects(()=>f.mod.handle({...f.base,user:{id:'other'},customId:`privada:publish:${id}`}));
  await f.mod.handle({...f.base,customId:`privada:cancel:${id}`,isButton:()=>true,update:async()=>{}});
  assert.equal(f.sent.length,0);
});
test('rechaza canal sin permisos y fechas imposibles', async () => {
  const f=fixture(); f.channel.permissionsFor=()=>({has:()=>false});
  await assert.rejects(()=>f.mod.command({...f.base,showModal:async()=>{}}), /permisos/);
  f.channel.permissionsFor=()=>({has:()=>true});
  let modal; await f.mod.command({...f.base,showModal:async m=>{modal=m;}});
  const id=modal.toJSON().custom_id.split(':')[2];
  await assert.rejects(()=>f.mod.handle({...f.base,customId:`privada:submit:${id}`,isModalSubmit:()=>true,fields:{getTextInputValue:k=>({name:'P',theme:'T',date:'2099-02-30',time:'12:00'})[k]}}), /fecha/i);
});
test('editar reutiliza los datos y actualiza el mensaje original tras confirmar', async () => {
  const f=fixture(), first=await ready(f);
  await f.mod.handle({...f.base,customId:`privada:publish:${first.id}`,isButton:()=>true,deferUpdate:async()=>{},editReply:async()=>{}});
  let edits=[];
  const msg={id:'333333333333333333',author:{id:'bot'},attachments:new Map([['old',{id:'old',name:'privada.png'}]]),edit:async p=>{edits.push(p);return msg;}};
  f.channel.messages={fetch:async()=>msg};
  let modal;
  const editing={...f.base,commandName:'privadas-editar',options:{getString:()=>`https://discord.com/channels/${f.base.guildId}/${f.channel.id}/${msg.id}`},showModal:async m=>{modal=m;}};
  await f.mod.command(editing);
  assert.match(JSON.stringify(modal.toJSON()), /Partida/);
  const id=modal.toJSON().custom_id.split(':')[2];
  await f.mod.handle({...f.base,customId:`privada:submit:${id}`,isModalSubmit:()=>true,fields:{getTextInputValue:k=>({name:'Corregido',theme:'Equipos',date:'2099-05-01',time:'23:30'})[k]},deferReply:async()=>{},editReply:async()=>{}});
  assert.equal(edits.length,0);
  await f.mod.handle({...f.base,customId:`privada:publish:${id}`,isButton:()=>true,deferUpdate:async()=>{},editReply:async()=>{}});
  assert.equal(edits.length,1); assert.deepEqual(edits[0].attachments,[]);
  assert.equal(f.bot.store.settings().privateMatches[msg.id].name,'Corregido');
});
test('tarjetas anteriores se pueden editar y rechaza mensajes ajenos', async () => {
  const f=fixture();
  let msg={id:'333333333333333333',author:{id:'bot'},attachments:new Map([['a',{id:'a',name:'privada.png'}]])};
  f.channel.messages={fetch:async()=>msg}; let modal;
  const i={...f.base,commandName:'privadas-editar',options:{getString:()=>`https://discord.com/channels/${f.base.guildId}/${f.channel.id}/${msg.id}`},showModal:async m=>{modal=m;}};
  await f.mod.command(i); assert.equal(modal.toJSON().title,'Editar partida privada');
  msg.author.id='other'; await assert.rejects(()=>f.mod.command(i),/publicada por este bot/);
});
test('rechaza un borrador si otra persona ya cambió el archivo', async () => {
  const f=fixture(), {id}=await ready(f);
  const d=f.mod.drafts.get(id,f.base.guildId,f.base.user.id);
  d.data.message='333333333333333333'; d.data.attachment='original';
  f.channel.messages={fetch:async()=>({author:{id:'bot'},attachments:new Map([['new',{id:'new',name:'privada.png'}]])})};
  let response;
  await assert.rejects(()=>f.mod.handle({...f.base,customId:`privada:publish:${id}`,isButton:()=>true,deferUpdate:async()=>{},editReply:async p=>{response=p;}}), /cambió/);
  assert.match(response.content,/cambió/); assert.equal(f.sent.length,0);
});
