import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ClanStore, clanSchema } from '../src/clan-store.js';
import { template } from '../src/renderer.js';
import { Clans } from '../src/clans.js';

test('rechazo guarda decisión y trabajo persistente de mensaje privado',()=>{
 const db=new DatabaseSync(':memory:');db.exec(clanSchema);const store=new ClanStore({db});
 const a=store.submit({guild:'g',user:'u',clan:'vxtg',profile:{embarkId:'Jugador#1234',score:100,rank:'Bronce 4'}});
 store.decide(a.id,'rejected','staff');assert.equal(store.get(a.id).status,'rejected');assert.equal(store.jobs('g')[0].kind,'reject');db.close();
});
test('tarjetas distinguen decisiones y escapan datos',()=>{
 for(const clan of ['vxtg','vxltm'])for(const status of ['approved','rejected']){
  const html=template('clan-decision',{clan,status,displayName:'<script>',embarkId:'X#1234',score:10,rank:'Bronce 4'},1080);
  assert.match(html,status==='approved'?/APROBADA\./:/NO APROBADA\./);assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));if(status==='approved'){assert.match(html,/VEXINK \(fundador\)/);assert.match(html,/solicitud al club/);}
 }
});
test('ambos resultados generan imagen y registran recibo de DM',async()=>{
 for(const status of ['approved','rejected']){
  let payload;const saves=[];const service=Object.create(Clans.prototype);service.bot={renderer:{render:async(kind,data)=>{assert.equal(kind,'clan-decision');assert.equal(data.status,status);return Buffer.from('image');}},log:()=>{}};service.store={save:a=>saves.push(a.dmStatus),job:()=>{}};service.write=async(channel,previous,p,receipt)=>{payload=p;assert.ok(receipt);return {id:'message'};};
  const job={},a={id:'id',status,clan:'vxtg',profile:{embarkId:'X#1234',score:10,rank:'Bronce 4'}};await service.sendDecision({createDM:async()=>({})},a,job);
  assert.equal(a.dmStatus,'sent');assert.equal(job.dmDone,true);assert.equal(payload.files.length,1);assert.deepEqual(saves,['sent']);
 }
});
test('ingreso libre sin perfil crea membresía y trabajo sin duplicados',()=>{
 const db=new DatabaseSync(':memory:');db.exec(clanSchema);const store=new ClanStore({db});
 const data={guild:'g',user:'u',clan:'vxltm',displayName:'Jugador'};const a=store.joinOpen(data);
 assert.equal(a.automatic,true);assert.equal(a.profile.score,null);assert.equal(store.member('g','u').clan,'vxltm');assert.equal(store.jobs('g')[0].kind,'admit');assert.throws(()=>store.joinOpen(data));
 store.joinOpen({...data,user:'otro'});assert.equal(store.members('g','vxltm').length,2);db.close();
});
import {clanModal} from '../src/clan-ui.js';
test('cuestionario VXTG respeta límite de cinco componentes del modal',()=>{const modal=clanModal({id:'x',data:{clan:'vxtg'}},{embarkId:'Jugador#1234',score:20000,rank:'Oro 4'}).toJSON();assert.equal(modal.components.length,5);});
