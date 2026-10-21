import { randomUUID } from 'node:crypto';
import { UserError } from './domain.js';
import { embarkKey, parseManualRanking, manualRankingText } from './clan-domain.js';

export const clanSchema=`
CREATE TABLE IF NOT EXISTS clan_applications(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,clan TEXT NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL,data TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS clan_pending_user ON clan_applications(guild,user) WHERE status='pending';
CREATE TABLE IF NOT EXISTS clan_members(guild TEXT NOT NULL,user TEXT NOT NULL,clan TEXT NOT NULL,embark_key TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(guild,user),UNIQUE(guild,embark_key));
CREATE TABLE IF NOT EXISTS clan_jobs(id TEXT PRIMARY KEY,guild TEXT NOT NULL,next INTEGER NOT NULL DEFAULT 0,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS clan_audit(id TEXT PRIMARY KEY,guild TEXT NOT NULL,created INTEGER NOT NULL,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS clan_rankings(guild TEXT NOT NULL,clan TEXT NOT NULL,revision INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(guild,clan));
`;
export class ClanStore {
  constructor(store){this.db=store.db;}
  ranking(guild,clan){const r=this.db.prepare('SELECT revision,data FROM clan_rankings WHERE guild=? AND clan=?').get(guild,clan);return r?{...JSON.parse(r.data),revision:r.revision}:null;}
  initRanking(guild,clan,entries=[]){
    const clean=parseManualRanking(manualRankingText(entries));
    this.db.prepare('INSERT OR IGNORE INTO clan_rankings VALUES(?,?,0,?)').run(guild,clan,JSON.stringify({entries:clean,updated:Date.now(),source:'manual'}));
    return this.ranking(guild,clan);
  }
  replaceRanking(guild,clan,entries,revision,actor){return this.transaction(()=>{
    const current=this.ranking(guild,clan);if(!current||current.revision!==revision)throw new UserError('Otro administrador modificó esta lista. Abre Editar de nuevo para conservar sus cambios.');
    const clean=parseManualRanking(manualRankingText(entries));
    const other=this.ranking(guild,clan==='vxtg'?'vxltm':'vxtg');
    const duplicate=clean.find(p=>other?.entries.some(o=>embarkKey(o.embarkId)===embarkKey(p.embarkId)));
    if(duplicate)throw new UserError(`${duplicate.embarkId} figura en el otro clan. Retíralo de esa lista antes de cambiarlo de clan.`);
    const data={entries:clean,updated:Date.now(),actor,source:'manual'};
    this.db.prepare('UPDATE clan_rankings SET revision=revision+1,data=? WHERE guild=? AND clan=?').run(JSON.stringify(data),guild,clan);
    this.db.prepare('INSERT INTO clan_audit VALUES(?,?,?,?)').run(randomUUID(),guild,Date.now(),JSON.stringify({kind:'ranking',clan,actor,before:current.entries,after:clean,revision:revision+1}));
    return {...data,revision:revision+1};
  });}
  member(guild,user){const r=this.db.prepare('SELECT data FROM clan_members WHERE guild=? AND user=?').get(guild,user);return r?JSON.parse(r.data):null;}
  members(guild,clan){return this.db.prepare('SELECT data FROM clan_members WHERE guild=? AND clan=?').all(guild,clan).map(r=>JSON.parse(r.data));}
  pending(guild,user){const r=this.db.prepare("SELECT data FROM clan_applications WHERE guild=? AND user=? AND status='pending'").get(guild,user);return r?JSON.parse(r.data):null;}
  applications(guild){return this.db.prepare('SELECT data FROM clan_applications WHERE guild=? ORDER BY created DESC').all(guild).map(r=>JSON.parse(r.data));}
  get(id){const r=this.db.prepare('SELECT data FROM clan_applications WHERE id=?').get(id);return r?JSON.parse(r.data):null;}
  save(a){this.db.prepare('INSERT INTO clan_applications VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data').run(a.id,a.guild,a.user,a.clan,a.status,a.created,JSON.stringify(a));return a;}
  transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const value=fn();this.db.exec('COMMIT');return value;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  submit(data){return this.transaction(()=>{
    if(this.member(data.guild,data.user))throw new UserError('Ya perteneces a un clan. Un administrador debe retirarte antes de solicitar otro.');
    if(this.pending(data.guild,data.user))throw new UserError('Ya tienes una solicitud pendiente. Espera la revisión o cancélala desde su canal.');
    if(this.db.prepare('SELECT 1 FROM clan_members WHERE guild=? AND embark_key=?').get(data.guild,embarkKey(data.profile.embarkId)))throw new UserError('Ese Embark ID ya pertenece a un miembro registrado de un clan.');
    return this.save({...data,id:randomUUID(),status:'pending',created:Date.now()});
  });}
  approve(id,actor){return this.transaction(()=>{
    const a=this.get(id);if(a?.status!=='pending')throw new UserError('La solicitud ya fue atendida.');
    if(this.member(a.guild,a.user))throw new UserError('Esta persona ya pertenece a un clan.');
    if(this.db.prepare('SELECT 1 FROM clan_members WHERE guild=? AND embark_key=?').get(a.guild,embarkKey(a.profile.embarkId)))throw new UserError('Ese Embark ID ya está registrado en un clan.');
    const member={guild:a.guild,user:a.user,clan:a.clan,profile:a.profile,displayName:a.displayName,joined:Date.now(),application:a.id,rolePending:true};
    this.db.prepare('INSERT INTO clan_members VALUES(?,?,?,?,?)').run(a.guild,a.user,a.clan,embarkKey(a.profile.embarkId),JSON.stringify(member));
    a.status='approved';a.actor=actor;a.decided=Date.now();this.save(a);
    this.job({id:`admit:${a.id}`,guild:a.guild,kind:'admit',application:a.id,user:a.user,clan:a.clan});return a;
  });}
  decide(id,status,actor){const a=this.get(id);if(a?.status!=='pending')throw new UserError('La solicitud ya fue atendida.');a.status=status;a.actor=actor;a.decided=Date.now();return this.save(a);}
  remove(guild,user,clan,actor,reason){return this.transaction(()=>{
    const member=this.member(guild,user);if(member&&member.clan!==clan)throw new UserError('El miembro pertenece al otro clan.');
    this.db.prepare('DELETE FROM clan_members WHERE guild=? AND user=? AND clan=?').run(guild,user,clan);
    const id=randomUUID();this.db.prepare('INSERT INTO clan_audit VALUES(?,?,?,?)').run(id,guild,Date.now(),JSON.stringify({user,clan,actor,reason,member}));
    this.job({id:`remove:${id}`,guild,user,clan,kind:'remove'});return member;
  });}
  saveMember(m){this.db.prepare('UPDATE clan_members SET data=? WHERE guild=? AND user=?').run(JSON.stringify(m),m.guild,m.user);}
  job(job){this.db.prepare('INSERT INTO clan_jobs VALUES(?,?,0,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(job.id,job.guild,JSON.stringify(job));}
  jobs(guild){return this.db.prepare('SELECT data FROM clan_jobs WHERE guild=? AND next<=? ORDER BY rowid').all(guild,Date.now()).map(r=>JSON.parse(r.data));}
  retry(job){job.attempts=(job.attempts??0)+1;this.db.prepare('UPDATE clan_jobs SET next=?,data=? WHERE id=?').run(Date.now()+Math.min(3600000,30000*job.attempts),JSON.stringify(job),job.id);}
  finish(job){this.db.prepare('DELETE FROM clan_jobs WHERE id=?').run(job.id);}
}
