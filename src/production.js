import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { config, dataDir } from './config.js';
import { operatorIds } from './admin-access.js';
import { UserError } from './domain.js';
import { channelDisplayName } from './channel-names.js';

export async function prepareProduction(bot, guild) {
  if (guild.id !== config.productionGuildId) return;
  await guild.roles.fetch();
  const me = await guild.members.fetchMe();
  if (!me.permissions.has([P.ManageChannels, P.ManageRoles])) throw new UserError('La V1 necesita Administrar canales y Administrar roles.');
  const mapping = config.productionChannels;
  for (const id of Object.values(mapping)) if (!guild.channels.cache.has(id)) throw new UserError(`Falta el canal existente ${id}. Revisa el mapa de producción.`);
  for (const id of Object.values(config.roleBindings[guild.id])) if (!guild.roles.cache.has(id)) throw new UserError(`Falta el rol existente ${id}.`);
  for (const id of operatorIds(guild)) await guild.members.fetch(id);
  let s = bot.store.settings(guild.id);
  s.integration ??= {};
  s.integration.resources ??= {};
  if (!s.integration.baseline) {
    const folder = path.join(dataDir, 'production-backups'); mkdirSync(folder, { recursive: true });
    const file = path.join(folder, `${guild.id}-before-v1-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify({ guild: guild.id, capturedAt: new Date().toISOString(),
      channels: [...guild.channels.cache.values()].map(c => ({ id:c.id, name:c.name, parent:c.parentId, type:c.type,
        overwrites:[...c.permissionOverwrites.cache.values()].map(o=>({id:o.id,type:o.type,allow:String(o.allow.bitfield),deny:String(o.deny.bitfield)})) })),
      roles:[...guild.roles.cache.values()].map(r=>({id:r.id,name:r.name,position:r.position,permissions:String(r.permissions.bitfield)})), settings:s }, null, 2));
    s.integration.baseline = file; bot.store.saveSettings(guild.id, s);
  }
  const pub = bot.mailboxes.permissions(guild, me, false), priv = bot.mailboxes.permissions(guild, me, true);
  async function ensure(key, name, type, parent, hidden = false) {
    const originalName = name;
    name = channelDisplayName(guild.id, name);
    const ids = s.integration.resources;
    let c = ids[key] ? guild.channels.cache.get(ids[key]) : null;
    const marker = `VEX LATAM SYSTEM V1:${key}`;
    if (!c) {
      const matches = guild.channels.cache.filter(c => c.type === type && (c.topic === marker || [originalName, name].includes(c.name) && (c.parentId ?? null) === (parent ?? null)));
      if (matches.size > 1) throw new UserError(`Hay varios canales para ${name}; selecciona el correcto antes de instalar.`);
      c = matches.first();
    }
    if (!c) c = await guild.channels.create({ name, type, ...(parent ? { parent } : {}),
      ...(type === ChannelType.GuildText ? {topic:marker} : {}), permissionOverwrites:hidden ? priv : pub, reason:'Integración VEX LATAM SYSTEM V1' });
    if (c.type !== type) throw new UserError(`Tipo incorrecto en ${name}.`);
    if (c.name !== name) await c.setName(name, 'Estilo de canales VEX LATAM SYSTEM');
    ids[key] = c.id; bot.store.saveSettings(guild.id, s); return c.id;
  }
  const admin = await ensure('adminCategory','ADMIN PANEL',ChannelType.GuildCategory,null,true);
  const system = await ensure('systemCategory','SISTEMA DEL BOT',ChannelType.GuildCategory,null);
  const clan = await ensure('clanCategory','CLANES',ChannelType.GuildCategory,null);
  const channels = {adminCategory:admin,publicCategory:mapping.socialCategory};
  for (const [key,name] of [['adminCommands','admin-bot'],['feedbackInbox','buzon-feedback'],['reportInbox','buzon-reportes']]) channels[key]=await ensure(key,name,ChannelType.GuildText,admin,true);
  channels.feedbackPublic=mapping.suggestions;
  channels.reportPublic=await ensure('reportPublic','reportes',ChannelType.GuildText,mapping.socialCategory);
  const inbox=await ensure('clanInbox','solicitudes-clanes',ChannelType.GuildText,admin,true);
  const rankingAdmin=await ensure('clanEditor','rankings-clanes',ChannelType.GuildText,admin,true);
  const profile=await ensure('profile','configurar-perfil',ChannelType.GuildText,system);
  const search=await ensure('search','buscar-equipo',ChannelType.GuildText,system);
  const teams=await ensure('teams','equipos-del-bot',ChannelType.GuildText,system);
  const guide=await ensure('guide','comandos-del-bot',ChannelType.GuildText,system);
  const leaderboard=await ensure('leaderboard','leaderboard',ChannelType.GuildText,system);
  const farewell=await ensure('farewell','despedidas',ChannelType.GuildText,mapping.startCategory);
  s.panels ??= {};
  for(const [key,id] of [['registro',profile],['buscar',search],['reglas',mapping.rules],['roles',mapping.roleSelection]]) s.panels[key] = {...s.panels[key], channel:id};
  s.mailboxes ??= {}; s.mailboxes.channels={...s.mailboxes.channels,...channels};
  s.teamsChannel=teams; s.tournamentsChannel=mapping.tournamentAnnouncements;
  s.searchPublicationChannels=[mapping.rankedChat,mapping.quickChat,mapping.cashoutChat];
  s.finalsRole=config.roleBindings[guild.id].finals; s.tournamentClanRole=config.roleBindings[guild.id]['clan.vxtg'];
  s.leaderboard={...s.leaderboard,channel:leaderboard}; s.memberGuide={...s.memberGuide,channel:guide};
  s.community ??= {};
  s.community.welcomeEnabled ??= false;
  s.community.farewellEnabled ??= false;
  Object.assign(s.community,{welcomeChannel:mapping.welcome,farewellChannel:farewell,externalPanels:['reglas','roles'],gamesSeeded:true});
  s.community.welcome ??= {title:'<:vls:1561934704221884416> ¡Llegaste al squad!',color:'#ed243b',image:'',
    description:'<:minecraftheart:1545529090935619595> ¡Bienvenido, {usuario}! Tu próxima partida empieza aquí. Encuentra compañeros y disfruta THE FINALS con nuestra comunidad.',
    fields:[{name:'Tu primera partida empieza aquí',value:'01 · Lee las reglas: {reglas}\n02 · Elige tus roles: {roles}\n03 · Arma tu equipo: {buscar}\n04 · Crea o completa tu perfil: {perfil}'},
      {name:'Encuentra tu clan',value:'VXTG · Competitivo: {clan_vxtg}\nVXLTM · Comunidad: {clan_vxltm}\nCompleta tu perfil y adjunta una captura para solicitar ingreso.'}]};
  s.chatSearch ??= {enabled:true,cooldownSeconds:300};
  s.chatSearch.channel ??= mapping.rankedChat;
  s.chatSearch.channels ??= [mapping.rankedChat,mapping.quickChat];
  Object.assign(s.chatSearch,{rolesSeeded:true,
    rankedRole:config.roleBindings[guild.id]['chatSearch.rankedRole'],quickRole:config.roleBindings[guild.id]['chatSearch.quickRole'],gameRole:s.finalsRole});
  s.clans ??= {}; s.clans.channels={...s.clans.channels,category:clan,inbox,rankingAdmin};
  for(const id of ['vxtg','vxltm']) {
    const join=await ensure(`clanJoin.${id}`,`unete-a-${id}`,ChannelType.GuildText,clan);
    const ranking=await ensure(`clanRanking.${id}`,`ranking-${id}`,ChannelType.GuildText,clan);
    s.clans[id]={...s.clans[id],role:config.roleBindings[guild.id][`clan.${id}`],joinChannel:join,rankingChannel:ranking};
  }
  Object.assign(s.integration,{version:'1.0.0',preserveExternalGrants:true,publicMailboxParent:mapping.socialCategory,
    preservedChannels:Object.values(mapping),readOnlyExisting:[mapping.suggestions],updatesChannel:mapping.updates,clanInformationChannel:mapping.clanInformation});
  bot.store.saveSettings(guild.id,s);
}
