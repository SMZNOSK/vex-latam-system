import { UserError, rankFromRS } from './domain.js';
import { completeProfile } from './sponsors.js';
import { currentRS, recordRS } from './profile-rs.js';

export const clans = Object.freeze({
  vxtg: { id:'vxtg', tag:'VXTG', name:'VXTG | VEXLATAM', recommendedRS:20000, color:0xf5f5f5,
    motto:'Competimos para dejar huella.',
    description:'Club competitivo de THE FINALS enfocado en el rendimiento, la coordinación, el trabajo en equipo y el crecimiento competitivo.\n\nDurante la Temporada 11, VXTG consiguió un resultado histórico: TOP 3 de LATAM y TOP 48 GLOBAL, consolidándose entre los clubes competitivos más destacados de la comunidad hispanohablante.\n\nNuestro objetivo es seguir creciendo, alcanzar nuevas metas y conseguir reconocimiento internacional a través de nuestros resultados, la organización y el compromiso de nuestros jugadores.\n\nNo buscamos ser los reyes, sino demostrar nuestro nivel y ganarnos un lugar entre los mejores.' },
  vxltm: { id:'vxltm', tag:'VXLTM', name:'VEX LATAM SQUAD | VXLTM', recommendedRS:0, color:0xf5f5f5,
    motto:'Nuestra casa, nuestra comunidad.',
    description:'Comunidad hispanohablante dedicada a THE FINALS, creada para reunir jugadores, formar equipos y fortalecer la comunidad competitiva y casual de la región.\n\nSomos un espacio para encontrar compañeros, compartir experiencias, organizar partidas y eventos, y disfrutar del juego con un ambiente de respeto, colaboración y la menor toxicidad posible.\n\nMás que un grupo de jugadores, somos una comunidad que crece unida y busca dejar huella en THE FINALS.' },
});
export function clanInfo(id) { if (!clans[id]) throw new UserError('Selecciona VXTG o VXLTM.'); return clans[id]; }
export const embarkKey = value => String(value).normalize('NFKC').trim().toLowerCase();
// El ranking del staff no exige cuenta de Discord ni perfil del bot.
export function parseManualRanking(text) {
  const lines=String(text??'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if(lines.length>50)throw new UserError('El editor admite hasta 50 jugadores por clan.');
  const seen=new Set();
  return lines.map((line,n)=>{
    const parts=line.split(/[|\t]/).map(s=>s.trim());
    const name=parts[0],points=parts[1];
    if(parts.length!==2||!name||name.length>70||/[<>@`\p{Cc}\p{Cf}]/u.test(name))throw new UserError(`Línea ${n+1}: usa Nombre o Embark ID | RS (nombre de hasta 70 caracteres).`);
    if(!/^(?:\d{1,6}|\d{1,3}(?:,\d{3})|\d{1,3}(?:\.\d{3}))$/.test(points??''))throw new UserError(`Línea ${n+1}: escribe RS enteros entre 0 y 999999; por ejemplo 32000.`);
    const key=embarkKey(name),score=Number(points.replace(/[,.]/g,''));
    if(seen.has(key))throw new UserError(`Línea ${n+1}: ${name} aparece más de una vez.`);
    seen.add(key);return {embarkId:name,score,rank:rankFromRS(score)};
  }).sort((a,b)=>b.score-a.score||a.embarkId.localeCompare(b.embarkId,'es'));
}
export const manualRankingText = entries => entries.map(p=>`${p.embarkId} | ${p.score}`).join('\n');
export function clanRSWarning(profile,clan){
  const c=clanInfo(clan),current=currentRS(profile);
  return current!==null&&current<c.recommendedRS?`⚠️ Tu RS actual (${current.toLocaleString('es-MX')}) está por debajo de Oro 4 · ${c.recommendedRS.toLocaleString('es-MX')} RS recomendados para ${c.tag}. Puedes enviar la solicitud; los administradores decidirán tu ingreso. El récord no cambia esta advertencia.`:null;
}
export function clanProfile(profile, clan) {
  clanInfo(clan);const current=currentRS(profile);
  if (!completeProfile(profile) || current===null
    || !/^[^#\r\n<>@`]{2,64}#\d{4}$/.test(profile.embarkId??'')) throw new UserError('Primero crea o completa tu perfil en #configurar-perfil. Se necesitan tu Embark ID y tus RS.');
  return { embarkId:profile.embarkId, score:current, peakScore:recordRS(profile),rsWarning:clanRSWarning(profile,clan),
    rank:rankFromRS(current,profile.rankSource==='finalstracker'?profile.leaderboardPosition:null),
    rankSource:profile.rankSource,leaderboardPosition:profile.rankSource==='finalstracker'?profile.leaderboardPosition:null,
    playerClass:profile.playerClass, sponsorId:profile.sponsorId, specializationIds:profile.specializationIds??[] };
}
export function clanRoster(store, guild, members) {
  return members.map(member=>{
    const profile=store.profile(guild,member.user),current=Number.isInteger(profile?.score)&&embarkKey(profile.embarkId)===embarkKey(member.profile.embarkId),p=current?profile:member.profile;
    return {...member,embarkId:p.embarkId,score:p.score,
      rank:p.score==null?'Sin registrar':rankFromRS(p.score,p.rankSource==='finalstracker'?p.leaderboardPosition:null),lastApproved:!current};
  }).sort((a,b)=>b.score-a.score||a.embarkId.localeCompare(b.embarkId,'es')||a.user.localeCompare(b.user));
}
