import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { config, dataDir } from './config.js';
import { operatorIds } from './admin-access.js';
import { UserError } from './domain.js';

const resourceNames = {
  adminCategory: 'ADMIN PANEL', systemCategory: 'SISTEMA DEL BOT', clanCategory: 'CLANES',
  adminCommands: '🤖・admin-bot', feedbackInbox: 'buzon-feedback', reportInbox: 'buzon-reportes',
  reportPublic: 'reportes', clanInbox: 'solicitudes-clanes', clanEditor: 'rankings-clanes',
  profile: 'configurar-perfil', search: 'buscar-equipo', teams: 'equipos-del-bot', guide: 'comandos-del-bot',
  leaderboard: 'leaderboard', farewell: 'despedidas',
  'clanJoin.vxtg': 'unete-a-vxtg', 'clanRanking.vxtg': 'ranking-vxtg',
  'clanJoin.vxltm': 'unete-a-vxltm', 'clanRanking.vxltm': 'ranking-vxltm',
};

function bindChannel(ref, channel) {
  return ref?.channel === channel ? ref : { channel };
}

export async function prepareProduction(bot, guild) {
  if (guild.id !== config.productionGuildId) return;
  await guild.roles.fetch();
  const me = await guild.members.fetchMe();
  if (!me.permissions.has([P.ManageChannels, P.ManageRoles])) throw new UserError('La V1 necesita Administrar canales y Administrar roles.');
  const mapping = config.productionChannels;
  const resources = config.productionResources;
  for (const [key, id] of [...Object.entries(mapping), ...Object.keys(resourceNames).map(key => [key, resources?.[key]])]) {
    const channel = guild.channels.cache.get(id);
    const type = key.endsWith('Category') ? ChannelType.GuildCategory : ChannelType.GuildText;
    const name = resourceNames[key] ?? key;
    if (channel?.type !== type) throw new UserError(`Revisa el ID de ${name} en bot.config.json. Se necesita su canal o categoría existente${id ? ` (${id})` : ''}.`);
  }
  for (const key of ['feedbackInbox', 'reportInbox', 'clanInbox', 'clanEditor']) {
    if (guild.channels.cache.get(resources[key]).parentId !== resources.adminCategory) {
      throw new UserError(`El canal ${resourceNames[key]} debe estar en la categoría administrativa configurada.`);
    }
  }
  for (const id of Object.values(config.roleBindings[guild.id])) if (!guild.roles.cache.has(id)) throw new UserError(`Falta el rol existente ${id}.`);
  for (const id of operatorIds(guild)) await guild.members.fetch(id);
  let s = bot.store.settings(guild.id);
  s.integration ??= {};
  if (!s.integration.baseline) {
    const folder = path.join(dataDir, 'production-backups'); mkdirSync(folder, { recursive: true });
    const file = path.join(folder, `${guild.id}-before-v1-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify({ guild: guild.id, capturedAt: new Date().toISOString(),
      channels: [...guild.channels.cache.values()].map(c => ({ id:c.id, name:c.name, parent:c.parentId, type:c.type,
        overwrites:[...c.permissionOverwrites.cache.values()].map(o=>({id:o.id,type:o.type,allow:String(o.allow.bitfield),deny:String(o.deny.bitfield)})) })),
      roles:[...guild.roles.cache.values()].map(r=>({id:r.id,name:r.name,position:r.position,permissions:String(r.permissions.bitfield)})), settings:s }, null, 2));
    s.integration.baseline = file; bot.store.saveSettings(guild.id, s);
  }
  const channels = {
    adminCategory: resources.adminCategory, publicCategory: mapping.socialCategory,
    adminCommands: resources.adminCommands, feedbackInbox: resources.feedbackInbox,
    reportInbox: resources.reportInbox, feedbackPublic: mapping.suggestions, reportPublic: resources.reportPublic,
  };
  const previousTeams = s.teamsChannel;
  s.panels ??= {};
  for (const [key, id] of [['registro', resources.profile], ['buscar', resources.search], ['reglas', mapping.rules], ['roles', mapping.roleSelection]]) {
    s.panels[key] = bindChannel(s.panels[key], id);
  }
  s.mailboxes ??= {}; s.mailboxes.channels={...s.mailboxes.channels,...channels};
  s.teamsChannel=resources.teams; s.tournamentsChannel=mapping.tournamentAnnouncements;
  s.searchPublicationChannels=[mapping.rankedChat,mapping.quickChat,mapping.cashoutChat];
  s.finalsRole=config.roleBindings[guild.id].finals; s.tournamentClanRole=config.roleBindings[guild.id]['clan.vxtg'];
  s.leaderboard=bindChannel(s.leaderboard,resources.leaderboard); s.memberGuide=bindChannel(s.memberGuide,resources.guide);
  s.community ??= {};
  s.community.welcomeEnabled ??= false;
  s.community.farewellEnabled ??= false;
  Object.assign(s.community,{welcomeChannel:mapping.welcome,farewellChannel:resources.farewell,externalPanels:['reglas','roles'],gamesSeeded:true});
  s.community.welcome ??= {title:'<:vls:1561934704221884416> ¡Llegaste al squad!',color:'#ed243b',image:'',
    description:'<:minecraftheart:1545529090935619595> ¡Bienvenido, {usuario}! Tu próxima partida empieza aquí. Encuentra compañeros y disfruta THE FINALS con nuestra comunidad.',
    fields:[{name:'Tu primera partida empieza aquí',value:'01 · Lee las reglas: {reglas}\n02 · Elige tus roles: {roles}\n03 · Arma tu equipo: {buscar}\n04 · Crea o completa tu perfil: {perfil}'},
      {name:'Encuentra tu clan',value:'VXTG · Competitivo: {clan_vxtg}\nVXLTM · Comunidad: {clan_vxltm}\nCompleta tu perfil y adjunta una captura para solicitar ingreso.'}]};
  s.chatSearch ??= {enabled:true,cooldownSeconds:300};
  s.chatSearch.channel ??= mapping.rankedChat;
  s.chatSearch.channels ??= [mapping.rankedChat,mapping.quickChat];
  if (previousTeams && previousTeams !== resources.teams) {
    if (s.chatSearch.channel === previousTeams) s.chatSearch.channel = resources.teams;
    s.chatSearch.channels = [...new Set(s.chatSearch.channels.map(id => id === previousTeams ? resources.teams : id))];
  }
  Object.assign(s.chatSearch,{rolesSeeded:true,
    rankedRole:config.roleBindings[guild.id]['chatSearch.rankedRole'],quickRole:config.roleBindings[guild.id]['chatSearch.quickRole'],gameRole:s.finalsRole});
  s.clans ??= {};
  s.clans.channels ??= {};
  if (s.clans.channels.inbox !== resources.clanInbox) delete s.clans.channels.inboxMessage;
  if (s.clans.channels.rankingAdmin !== resources.clanEditor) delete s.clans.channels.rankingAdminMessage;
  Object.assign(s.clans.channels,{category:resources.clanCategory,inbox:resources.clanInbox,rankingAdmin:resources.clanEditor});
  for(const id of ['vxtg','vxltm']) {
    const clan = s.clans[id] ??= {};
    const joinChannel = resources[`clanJoin.${id}`], rankingChannel = resources[`clanRanking.${id}`];
    if (clan.joinChannel !== joinChannel) delete clan.panel;
    if (clan.rankingChannel !== rankingChannel) { delete clan.ranking; delete clan.rankingHash; }
    Object.assign(clan,{role:config.roleBindings[guild.id][`clan.${id}`],joinChannel,rankingChannel});
  }
  Object.assign(s.integration,{version:'1.0.0',preserveExternalGrants:true,publicMailboxParent:mapping.socialCategory,
    resources:{...resources},
    preservedChannels:Object.values(mapping),readOnlyExisting:[mapping.suggestions],updatesChannel:mapping.updates,clanInformationChannel:mapping.clanInformation});
  bot.store.saveSettings(guild.id,s);
}
