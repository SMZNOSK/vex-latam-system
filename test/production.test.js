import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ChannelType, Collection, PermissionsBitField, PermissionFlagsBits as P} from 'discord.js';
import {config} from '../src/config.js';
import {canOperate,requireOperator,securePrivateChannel} from '../src/admin-access.js';
import {prepareProduction} from '../src/production.js';
import {processRoleJobs} from '../src/setup.js';
import {chatSourceMatches} from '../src/chat-search.js';
import {Store} from '../src/store.js';
import {VexBot} from '../src/bot.js';

test('producción limita controles a la cuenta autorizada y al propietario actual, incluso frente a otro administrador',()=>{
  const guild={id:config.productionGuildId,ownerId:'current-owner'};
  const interaction=id=>({guild,user:{id},memberPermissions:new PermissionsBitField(P.Administrator)});
  assert.equal(canOperate(interaction(config.operatorUserIds[guild.id][0])),true);
  assert.equal(canOperate(interaction('current-owner')),true);
  assert.equal(canOperate(interaction('another-administrator')),false);
  assert.throws(()=>requireOperator(interaction('another-administrator')));
  const allowed=new Set(['bot',...config.operatorUserIds[guild.id],'current-owner']);
  const perms=[{id:guild.id,type:0,allow:0n,deny:P.ViewChannel},...[...allowed].map(id=>({id,type:1,allow:P.ViewChannel,deny:0n}))];
  const channel={permissionOverwrites:{cache:new Collection(perms.map(o=>[o.id,{...o,allow:new PermissionsBitField(o.allow),deny:new PermissionsBitField(o.deny)}]))}};
  assert.equal(securePrivateChannel(channel,guild,'bot'),true);
  channel.permissionOverwrites.cache.set('stranger',{id:'stranger',type:1,allow:new PermissionsBitField(P.ViewChannel),deny:new PermissionsBitField()});
  assert.equal(securePrivateChannel(channel,guild,'bot'),false);
});

function productionGuild() {
  const guild = {id:config.productionGuildId, ownerId:'current-owner'};
  const resources = config.productionResources;
  const channels = new Collection();
  for (const [key, id] of Object.entries({...config.productionChannels, ...resources})) {
    channels.set(id, {id, name:key, type:key.endsWith('Category') ? ChannelType.GuildCategory : ChannelType.GuildText,
      parentId:['adminCommands','feedbackInbox','reportInbox','clanInbox','clanEditor'].includes(key) ? resources.adminCategory : null,
      permissionOverwrites:{cache:new Collection()}});
  }
  channels.get(resources.adminCommands).name = '🤖・admin-bot';
  channels.set('duplicate-category', {id:'duplicate-category', name:'ADMIN PANEL', type:ChannelType.GuildCategory});
  channels.set('duplicate-admin', {id:'duplicate-admin', name:'admin-bot', type:ChannelType.GuildText, parentId:'duplicate-category'});
  guild.channels = {cache:channels, create:async () => assert.fail('Producción debe usar los canales existentes')};
  guild.roles = {cache:new Collection(Object.values(config.roleBindings[guild.id]).map(id => [id,{id}])), fetch:async () => {}};
  const me = {id:'bot', permissions:new PermissionsBitField(PermissionsBitField.All)};
  guild.members = {fetchMe:async () => me, fetch:async id => ({id})};
  return guild;
}

test('una instalación nueva vincula los originales aunque haya otro admin-bot',async()=>{
  const store=new Store(':memory:'); await store.migrate();
  try {
    const guild=productionGuild();
    const original=JSON.stringify([...guild.channels.cache.values()]);
    store.saveSettings(guild.id,{panels:{},roles:[],integration:{baseline:'fixture'}});
    const bot=new VexBot({user:{id:'bot'}},store,{});
    await prepareProduction(bot,guild);
    const first=store.settings(guild.id);
    await prepareProduction(bot,guild);
    assert.equal(JSON.stringify([...guild.channels.cache.values()]),original);
    assert.equal(first.mailboxes.channels.adminCommands,config.productionResources.adminCommands);
    assert.equal(first.mailboxes.channels.adminCategory,config.productionResources.adminCategory);
    assert.equal(first.mailboxes.channels.feedbackPublic,config.productionChannels.suggestions);
    assert.equal(first.tournamentsChannel,config.productionChannels.tournamentAnnouncements);
    assert.equal(first.clans.vxtg.role,config.roleBindings[guild.id]['clan.vxtg']);
    assert.deepEqual(first.community.externalPanels,['reglas','roles']);
    assert.equal(first.mailboxes.channels.testing,undefined);
    assert.deepEqual(store.settings(guild.id).integration.resources,config.productionResources);
    const interaction = {guild, guildId:guild.id, user:{id:guild.ownerId}};
    bot.mailboxes.assertAdminCommand({...interaction, channelId:config.productionResources.adminCommands});
    assert.throws(() => bot.mailboxes.assertAdminCommand({...interaction, channelId:'duplicate-admin'}), /Usa los comandos administrativos/);
  }finally{store.close();}
});

test('una base con destinos duplicados se corrige y conserva los mensajes asociados al canal correcto',async()=>{
  const store=new Store(':memory:'); await store.migrate();
  try {
    const guild=productionGuild(), ids=config.productionResources;
    const bot=new VexBot({user:{id:'bot'}},store,{});
    store.saveSettings(guild.id, {
      integration:{baseline:'fixture',resources:{adminCommands:'duplicate-admin'}},
      mailboxes:{channels:{adminCommands:'duplicate-admin',adminCategory:'duplicate-category'}},
      panels:{registro:{channel:ids.profile,message:'original-profile-message'},buscar:{channel:'duplicate-search',message:'duplicate-panel'}},
      teamsChannel:'duplicate-teams', chatSearch:{channels:['duplicate-teams'],channel:'duplicate-teams'},
      leaderboard:{channel:'duplicate-leaderboard',message:'duplicate-top',hash:'old-hash'},
      clans:{channels:{inbox:'duplicate-inbox',inboxMessage:'duplicate-inbox-guide'},
        vxtg:{joinChannel:ids['clanJoin.vxtg'],panel:{message:'original-clan-poster'},rankingChannel:'duplicate-ranking',ranking:[{message:'duplicate-rank'}],rankingHash:'old-hash',gameCount:20}},
    });
    await prepareProduction(bot,guild);
    const s=store.settings(guild.id);
    assert.equal(s.mailboxes.channels.adminCommands,ids.adminCommands);
    assert.deepEqual(s.panels.registro,{channel:ids.profile,message:'original-profile-message'});
    assert.deepEqual(s.panels.buscar,{channel:ids.search});
    assert.equal(s.teamsChannel,ids.teams);
    assert.deepEqual(s.chatSearch.channels,[ids.teams]);
    assert.deepEqual(s.leaderboard,{channel:ids.leaderboard});
    assert.equal(s.clans.channels.inbox,ids.clanInbox);
    assert.equal(s.clans.channels.inboxMessage,undefined);
    assert.equal(s.clans.vxtg.ranking,undefined);
    assert.equal(s.clans.vxtg.rankingHash,undefined);
    assert.deepEqual(s.clans.vxtg.panel,{message:'original-clan-poster'});
    assert.equal(s.clans.vxtg.gameCount,20);
  }finally{store.close();}
});

test('si desaparece el canal original el arranque señala su ID y rechaza usar el duplicado',async()=>{
  const store=new Store(':memory:'); await store.migrate();
  try {
    const guild=productionGuild(), id=config.productionResources.adminCommands;
    guild.channels.cache.delete(id);
    const bot=new VexBot({user:{id:'bot'}},store,{});
    await assert.rejects(prepareProduction(bot,guild), new RegExp(`🤖・admin-bot.*${id}`));
    assert.equal(store.settings(guild.id).mailboxes,undefined);
  }finally{store.close();}
});

test('eliminar un perfil conserva THE FINALS compartido con Carl-bot en producción',async()=>{
  let removed=0,finished=0;
  const role={id:'finals',guild:{id:'guild'},position:1,managed:false,permissions:new PermissionsBitField()};
  const member={id:'person',roles:{cache:new Collection([['finals',role]]),remove:async()=>removed++}};
  const settings={finalsRole:'finals',integration:{preserveExternalGrants:true}};
  const store={settings:()=>settings,roleJobs:()=>[{user:'person'}],profile:()=>null,reactionChoice:()=>false,finishRole:()=>finished++};
  const bot={store,queue:async(_,fn)=>fn(),log:()=>{}};
  const guild={id:'guild',roles:{fetch:async()=>role},members:{fetch:async()=>member,fetchMe:async()=>({permissions:new PermissionsBitField(P.ManageRoles),roles:{highest:{position:100}}})}};
  await processRoleJobs(bot,guild);
  assert.equal(removed,0);assert.equal(finished,1);
});

test('detección por texto admite ambos chats y excluye Cobro y mensajes directos',()=>{
  const cfg={channel:'ranked',channels:['ranked','casual']};
  assert.equal(chatSourceMatches(cfg,'ranked'),true);assert.equal(chatSourceMatches(cfg,'casual'),true);
  assert.equal(chatSourceMatches(cfg,'cashout'),false);assert.equal(chatSourceMatches(cfg,undefined),false);
});
