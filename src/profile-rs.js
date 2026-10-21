import { rankFromRS, UserError } from './domain.js';

export const validRS=value=>Number.isInteger(value)&&value>=0&&value<=999999;
export const rsIdentity=value=>String(value??'').normalize('NFKC').trim().toLowerCase();
// score es siempre el RS actual; nunca se recupera el actual desde el récord.
export const currentRS=profile=>validRS(profile?.score)?profile.score:null;
export function recordRS(profile){
  const values=[currentRS(profile),validRS(profile?.peakScore)?profile.peakScore:null].filter(n=>n!==null);
  return values.length?Math.max(...values):null;
}
export function applyProfileRS(previous,input,now=Date.now()){
  const value={...previous,...input},hasScore=Object.hasOwn(input,'score');
  const same=Boolean(previous&&rsIdentity(previous.embarkId)===rsIdentity(value.embarkId));
  if(hasScore&&input.score!==null&&!validRS(input.score))throw new UserError('El RS actual debe ser un entero entre 0 y 999999.');
  if(previous&&!same&&!hasScore)value.score=null;
  const current=currentRS(value),baseline=same?recordRS(previous):null;
  value.peakScore=current===null?baseline:baseline===null?current:Math.max(baseline,current);
  value.peakRecordedAt=current!==null&&(baseline===null||current>baseline)?now:same?(previous.peakRecordedAt??previous.rankUpdatedAt??now):null;
  value.peakEmbarkKey=rsIdentity(value.embarkId);
  if(hasScore||previous&&!same){
    const unchanged=same&&previous.score===current;
    value.rankSource=input.rankSource??(unchanged?previous.rankSource:'manual')??'manual';
    const position=value.rankSource==='finalstracker'?value.leaderboardPosition:null;
    value.leaderboardPosition=position;
    value.rank=current===null?'RS pendientes':rankFromRS(current,position);
    value.rankUpdatedAt=input.rankUpdatedAt??(unchanged?previous.rankUpdatedAt:now)??now;
    if(!same&&!Object.hasOwn(input,'season'))value.season=null;
  }
  return value;
}
