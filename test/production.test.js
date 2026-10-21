import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Collection, PermissionsBitField, PermissionFlagsBits as P} from 'discord.js';
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

test('preparar producción dos veces conserva los canales originales y crea exactamente 19 recursos nuevos',async()=>{
  const store=new Store(':memory:'); await store.migrate();
  try {
    const guild={id:config.productionGuildId,ownerId:'905678811255955517'};
    const channels=new Collection(Object.values(config.productionChannels).map(id=>[id,{id,name:`original-${id}`,type:0,parentId:'original-parent',permissionOverwrites:{cache:new Collection()}}]));
    const original=JSON.stringify([...channels.values()]);
    let serial=0;
    guild.channels={cache:channels,create:async data=>{const c={...data,id:`new-${++serial}`,parentId:data.parent??null};channels.set(c.id,c);return c;}};
    guild.roles={cache:new Collection(Object.values(config.roleBindings[guild.id]).map(id=>[id,{id}])),fetch:async()=>{}};
    const me={id:'bot',permissions:new PermissionsBitField(PermissionsBitField.All)};
    guild.members={fetchMe:async()=>me,fetch:async id=>({id})};
    store.saveSettings(guild.id,{panels:{},roles:[],integration:{baseline:'fixture'}});
    const bot=new VexBot({user:{id:'bot'}},store,{});
    await prepareProduction(bot,guild);
    assert.equal(serial,19);
    const first=store.settings(guild.id);
    await prepareProduction(bot,guild);
    assert.equal(serial,19);
    assert.equal(JSON.stringify([...channels.values()].filter(c=>!c.id.startsWith('new-'))),original);
    assert.equal(first.mailboxes.channels.feedbackPublic,config.productionChannels.suggestions);
    assert.equal(first.tournamentsChannel,config.productionChannels.tournamentAnnouncements);
    assert.equal(first.clans.vxtg.role,config.roleBindings[guild.id]['clan.vxtg']);
    assert.deepEqual(first.community.externalPanels,['reglas','roles']);
    assert.equal(first.mailboxes.channels.testing,undefined);
    assert.deepEqual(store.settings(guild.id).integration.resources,first.integration.resources);
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
