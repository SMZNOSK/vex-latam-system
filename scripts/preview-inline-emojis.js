// Ejemplos reales, únicamente en el servidor de pruebas y su canal privado.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REST, Routes, PermissionFlagsBits as P } from 'discord.js';
import { Store } from '../src/store.js';
import { config, dataDir } from '../src/config.js';
import { nativePayload, welcomePayload, validateEmbed } from '../src/community-ui.js';
import { resolveEmbedEmojis } from '../src/inline-emojis.js';
import { noMentions } from '../src/ui.js';
import { CardRenderer } from '../src/renderer.js';

const guildId = process.env.DISCORD_GUILD_ID?.trim();
if (guildId !== config.testGuildId) throw new Error('Este script solo puede usar el servidor de pruebas.');
const api = new REST({timeout:15000}).setToken(process.env.DISCORD_TOKEN.trim());
const [guild, me, emojis, roles] = await Promise.all([
  api.get(Routes.guild(guildId)), api.get(Routes.user()), api.get(Routes.guildEmojis(guildId)), api.get(Routes.guildRoles(guildId)),
]);
const local = { emojis: { fetch: async () => new Map(emojis.map(e => [e.id,e])) } };
for (const name of ['emoji_1','emoji_2','emoji_3','emoji_4']) if (!emojis.some(e => e.name === name && e.available !== false)) throw new Error(`Falta el emoji de muestra ${name}.`);
if (!process.argv.includes('--apply-test')) { console.log('Usa --apply-test para configurar la bienvenida de pruebas y publicar los ejemplos privados.'); process.exit(0); }
const store = new Store(path.join(dataDir,'vex.sqlite'));
const renderer = new CardRenderer();
try {
  const initial = store.settings(guildId), channelId = initial.mailboxes?.channels?.testing;
  const [channel, category] = await Promise.all([api.get(Routes.channel(channelId)), api.get(Routes.channel(initial.mailboxes.channels.adminCategory))]);
  if (channel.guild_id !== guildId || channel.parent_id !== category.id) throw new Error('Canal de pruebas no válido.');
  for (const c of [channel,category]) {
    if (!c.permission_overwrites.some(o => o.id === guildId && BigInt(o.deny) & P.ViewChannel)
      || c.permission_overwrites.some(o => BigInt(o.allow) & P.ViewChannel && o.id !== me.id
        && !(o.type === 0 && roles.some(r => r.id === o.id && BigInt(r.permissions) & P.Administrator)))) throw new Error('El canal de pruebas debe ser privado para administradores.');
  }
  const input = validateEmbed(await resolveEmbedEmojis({ title: ':emoji_1: ¡Bienvenido, hermanito!', color:'#ed243b', image:'',
    description:'¡Qué onda, {usuario}! Nos da gusto tenerte por aquí. :emoji_2:\n\nYa eres parte de **{servidor}**. Arma tu equipo, comparte buenas partidas y disfruta la comunidad. :emoji_3:',
    fields:[
      {name:'🎮 Tu próxima partida empieza aquí',value:'THE FINALS · HELLDIVERS 2 · ARC RAIDERS'},
      {name:':emoji_4: Primero lo primero, hermanito',value:'📜 Revisa las reglas: {reglas}\n🎭 Elige tus juegos: {roles}\n🔎 Encuentra tu squad: {buscar}'},
      {name:'Nos vemos en la partida',value:':emoji_1: **Buenas partidas. Mejor compañía.** :emoji_3:'},
    ] },local));
  const settings = store.settings(guildId); settings.community ??= {};
  settings.community.welcome = input;
  settings.community.welcomeVersion = (settings.community.welcomeVersion ?? 0) + 1;
  store.saveSettings(guildId,settings);
  const sample = JSON.parse(readFileSync(path.join(dataDir,'preview-members/sample.json'),'utf8'));
  const member = {id:guild.owner_id,displayName:sample.displayName,guild:{id:guildId,name:guild.name}};
  const welcome = welcomePayload(member,settings);
  const fileName = 'bienvenida-emojis.png';
  const avatarData = `data:image/png;base64,${readFileSync(path.join(dataDir,'preview-members/avatar.png')).toString('base64')}`;
  const picture = await renderer.render('welcome',{displayName:sample.displayName,serverName:guild.name,avatarData},1080);
  welcome.embeds[0].setImage(`attachment://${fileName}`);
  const demo = validateEmbed(await resolveEmbedEmojis({title:':emoji_1: Vista previa · Embed con emojis',color:'#ed243b',
    description:'Los emojis del servidor aparecen **dentro de las frases**. :emoji_2:\n\nPuedes escribir sus nombres como `:emoji_1:` o pegar el código completo. :emoji_3:',
    fields:[{name:':emoji_4: Personaliza tus publicaciones',value:'Funciona en descripciones y secciones del editor. Consulta **/embed emojis** en #admin-bot para ver los códigos.'}],image:''},local));
  const stateFile = path.join(dataDir,'preview-inline-emojis.json');
  let state = {}; try { state=JSON.parse(readFileSync(stateFile,'utf8')); } catch { /* Primera publicación. */ }
  const result={guild:guildId,channel:channelId,messages:{}};
  for (const [kind,payload] of [['welcome',welcome],['embed',nativePayload(demo)]]) {
    const previous = kind === 'embed' ? store.embed(guildId,'demo-emojis') : state.guild === guildId ? state.messages?.welcome : null;
    let old;
    if (previous?.channel === channelId && (previous.message || previous.id)) {
      try { old=await api.get(Routes.channelMessage(channelId,previous.message ?? previous.id)); } catch(error) {if(error.code!==10008)throw error;}
    }
    if(old && old.author.id!==me.id)throw new Error('El ejemplo anterior no pertenece al bot.');
    const body={content:`**Vista previa · ${kind === 'welcome' ? 'Bienvenida' : 'Embed'} con emojis**\nEjemplo visual; no representa una entrada real.`,
      embeds:payload.embeds.map(e=>e.toJSON()),components:[],attachments:[],allowed_mentions:noMentions};
    const request={body};
    if(kind==='welcome') {body.attachments=[{id:0,filename:fileName}];request.files=[{name:fileName,data:picture,contentType:'image/png'}];}
    const message=old ? await api.patch(Routes.channelMessage(channelId,old.id),request) : await api.post(Routes.channelMessages(channelId),request);
    if(kind==='embed')store.saveEmbed(guildId,{name:'demo-emojis',channel:channelId,message:message.id,embed:demo,version:(previous?.version??0)+1});
    result.messages[kind]={id:message.id,channel:channelId,url:`https://discord.com/channels/${guildId}/${channelId}/${message.id}`};
    writeFileSync(stateFile,JSON.stringify(result,null,2));
  }
  console.log(JSON.stringify(result,null,2));
} finally {store.close();await renderer.close();}
