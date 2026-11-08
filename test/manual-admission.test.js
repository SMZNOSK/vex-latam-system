import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ClanStore, clanSchema } from '../src/clan-store.js';
import { Clans } from '../src/clans.js';
import { noMentions } from '../src/ui.js';
import { commands } from '../src/commands.js';

function fixture() {
  const db = new DatabaseSync(':memory:'); db.exec(clanSchema);
  return { db, store: new ClanStore({ db }) };
}

test('alta manual en ambos clanes guarda actor, rol pendiente y trabajo durable, sin exigir perfil', () => {
  const { db, store } = fixture();
  try {
    for (const clan of ['vxtg', 'vxltm']) {
      const a = store.addManual({ guild:'g', user:clan, clan, displayName:'Jugador' }, 'staff');
      assert.equal(a.manual, true); assert.equal(a.actor, 'staff'); assert.equal(a.profile.score, null);
      assert.equal(store.member('g', clan).clan, clan);
      assert.equal(store.member('g', clan).rolePending, true);
      assert.equal(store.jobs('g').find(job=>job.application===a.id).kind, 'admit');
      assert.throws(()=>store.addManual({ guild:'g', user:clan, clan }, 'staff'));
    }
    assert.equal(db.prepare('SELECT count(*) AS n FROM clan_audit').get().n, 2);
  } finally { db.close(); }
});

test('alta manual protege IDs duplicados y solicitudes pendientes sin dejar escrituras parciales', () => {
  const { db, store } = fixture();
  try {
    const profile={embarkId:'Jugador#1234',score:30000,rank:'Platino 4'};
    store.addManual({guild:'g',user:'a',clan:'vxtg',profile},'staff');
    assert.throws(()=>store.addManual({guild:'g',user:'b',clan:'vxltm',profile},'staff'));
    store.submit({guild:'g',user:'b',clan:'vxltm',profile:{...profile,embarkId:'Otro#1234'}});
    assert.throws(()=>store.addManual({guild:'g',user:'b',clan:'vxltm'},'staff'),/pendiente/);
    assert.equal(store.applications('g').length,2);
    assert.equal(store.jobs('g').length,1);
  } finally { db.close(); }
});

test('bienvenida menciona solo al integrante en texto y actualizar no permite nuevas notificaciones', async () => {
  let payload;
  const a={id:'a',user:'123',clan:'vxtg',profile:{embarkId:'Jugador#1234',score:30000,rank:'Platino 4'}};
  const service=Object.create(Clans.prototype);
  service.store={get:()=>a,save:()=>{}};
  service.settings=()=>({vxtg:{joinChannel:'channel'}});
  service.bot={channel:async()=>({id:'channel'}),log:()=>{},renderer:{render:async()=>Buffer.from('image')}};
  service.write=async(c,p,data)=>{payload=data;return {id:'message'};};
  const guild={id:'g',members:{fetch:async()=>({displayName:'Jugador'})}};
  await service.admission(guild,a,{notify:true});
  assert.match(payload.content,/<@123>/);
  assert.deepEqual(payload.allowedMentions,{...noMentions,users:['123']});
  assert.equal(payload.files.length,1);
  let edited;
  service.bot.client={user:{id:'bot'}};
  await Clans.prototype.write.call(service,{messages:{fetch:async()=>({author:{id:'bot'},edit:async p=>{edited=p;}})}},'message',payload,'receipt');
  assert.deepEqual(edited.allowedMentions,noMentions);
});

test('comando manual requiere usuario y clan, y permite Embark ID y RS opcionales', () => {
  const command=commands.find(c=>c.name==='clan');
  const add=command.options.find(s=>s.name==='agregar');
  assert.ok(command.default_member_permissions);
  assert.deepEqual(add.options.filter(o=>o.required).map(o=>o.name),['clan','usuario']);
  assert.equal(add.options.find(o=>o.name==='rs').max_value,999999);
});

test('alta administrativa reutiliza datos y no hereda RS ni Ruby al cambiar de identidad', async () => {
  for(const input of [
    {saved:null,score:null,rank:'Sin registrar'},
    {saved:{embarkId:'Viejo#1234',score:50000,rankSource:'finalstracker',leaderboardPosition:5},score:50000,rank:'Ruby'},
    {saved:{embarkId:'Viejo#1234',score:50000,rankSource:'finalstracker',leaderboardPosition:5},id:'Nuevo#1234',score:null,rank:'Sin registrar'},
    {saved:{embarkId:'Viejo#1234',score:50000,rankSource:'finalstracker',leaderboardPosition:5},rs:30000,score:30000,rank:'Platino 4'},
  ]) {
    const {db,store}=fixture();
    try {
      const service=Object.create(Clans.prototype);service.store=store;
      service.settings=()=>({vxtg:{role:'role'},vxltm:{role:'other-role'}});
      service.role=async()=>({id:'role'});service.processJobs=async()=>{};
      let authorized=false,deferred=false;
      service.bot={mailboxes:{assertAdminCommand:()=>{authorized=true;}},store:{profile:()=>input.saved},
        queue:async(key,fn)=>fn(),sendPrivate:async()=>{}};
      const interaction={commandName:'clan',guildId:'g',user:{id:'staff'},
        guild:{members:{fetch:async()=>({displayName:'Jugador',roles:{cache:new Map()}})}},
        options:{getSubcommand:()=> 'agregar',getString:key=>key==='clan'?'vxtg':input.id??null,
          getInteger:()=>input.rs??null,getUser:()=>({id:'player',bot:false})},deferReply:async()=>{deferred=true;}};
      await service.command(interaction);
      const member=store.member('g','player');
      assert.equal(authorized,true);assert.equal(deferred,true);
      assert.equal(member.profile.score,input.score);assert.equal(member.profile.rank,input.rank);
    } finally {db.close();}
  }
});
