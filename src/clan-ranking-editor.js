import { PermissionFlagsBits as P, ButtonStyle } from 'discord.js';
import { clanInfo, parseManualRanking, embarkKey } from './clan-domain.js';
import { rankingAdminPanel, rankingEditModal, clanFooter } from './clan-ui.js';
import { UserError } from './domain.js';
import { card, row, button, safe } from './ui.js';
import { requireOperator } from './admin-access.js';
import { pinIfAllowed } from './pins.js';

export class ClanRankingEditor {
  constructor(clans){this.clans=clans;this.bot=clans.bot;this.store=clans.store;}
  async assert(i){
    requireOperator(i);
    if(i.channelId!==this.clans.settings(i.guildId).channels?.rankingAdmin)throw new UserError('Usa el editor actualizado de #rankings-clanes en ADMIN PANEL.');
    await this.clans.privateChannel(i.guild,'rankingAdmin');
  }
  panel(guild){return this.bot.queue(`clan-ranking-admin:${guild.id}`,async()=>{
    const cfg=this.clans.settings(guild.id),channel=await this.clans.privateChannel(guild,'rankingAdmin');
    const rankings=Object.fromEntries(['vxtg','vxltm'].map(c=>[c,this.store.ranking(guild.id,c)]));
    const message=await this.clans.write(channel,cfg.channels.rankingAdminMessage,rankingAdminPanel(cfg,rankings),clanFooter('Administración','rankings'));
    this.clans.set(guild.id,'channels',{rankingAdminMessage:message.id});await pinIfAllowed(message,'Editor manual de rankings de clanes');
  });}
  async handle(i,action,id){
    await this.assert(i);
    if(action==='rank-edit'){
      clanInfo(id);const cfg=this.clans.settings(i.guildId);
      if(!i.isButton()||i.message?.id!==cfg.channels.rankingAdminMessage||i.message.author.id!==this.bot.client.user.id)throw new UserError('Abre el editor desde el cartel fijado de #rankings-clanes.');
      const current=this.store.ranking(i.guildId,id);if(!current)throw new UserError('La lista está pendiente de preparar.');
      const d=this.clans.drafts.create('clan-ranking',i.guildId,i.user.id,{clan:id,channel:i.channelId,revision:current.revision});
      return i.showModal(rankingEditModal(d,current.entries));
    }
    const d=this.clans.drafts.get(id,i.guildId,i.user.id);
    if(d.kind!=='clan-ranking'||d.data.channel!==i.channelId||d.busy)throw new UserError('Este editor caducó o ya está guardando. Abre uno nuevo.');
    const clan=d.data.clan;
    if(action==='rank-preview'){
      if(!i.isModalSubmit())throw new UserError('Abre primero el formulario del ranking.');
      const entries=parseManualRanking(i.fields.getTextInputValue('players')),current=this.store.ranking(i.guildId,clan);
      if(current.revision!==d.data.revision)throw new UserError('La lista cambió mientras la editabas. Abre Editar de nuevo.');
      d.data.entries=entries;await this.bot.ackCard(i);
      const before=new Map(current.entries.map(p=>[embarkKey(p.embarkId),p])),after=new Map(entries.map(p=>[embarkKey(p.embarkId),p]));
      const removed=current.entries.filter(p=>!after.has(embarkKey(p.embarkId))),added=entries.filter(p=>!before.has(embarkKey(p.embarkId)));
      const changed=entries.filter(p=>before.has(embarkKey(p.embarkId))&&before.get(embarkKey(p.embarkId)).score!==p.score);
      return this.bot.replyCard(i,card(`Revisar ranking · ${clanInfo(clan).tag}`,
        `Se publicarán **${entries.length} jugadores**.\n**${added.length} altas · ${removed.length} bajas · ${changed.length} cambios de RS**\n\n`
        +(removed.length?`**Se retirarán de la tabla:**\n${removed.slice(0,8).map(p=>`• ${safe(p.embarkId)}`).join('\n')}${removed.length>8?`\n… y ${removed.length-8} más.`:''}\n\n`:'')
        +`**Primeros puestos:**\n${entries.slice(0,5).map((p,n)=>`${n+1}. **${safe(p.embarkId)}** · ${p.score.toLocaleString('es-MX')} RS · ${safe(p.rank)}`).join('\n')||'La lista quedará vacía.'}\n\n`
        +'Guardar reemplaza la lista completa de este clan. No cambia perfiles, roles, solicitudes ni el total manual del juego.',
        [row(button(`clan:rank-save:${d.id}`,entries.length?'Confirmar y publicar':'Confirmar lista vacía',entries.length?ButtonStyle.Success:ButtonStyle.Danger),button(`clan:rank-cancel:${d.id}`,'Cancelar'))]));
    }
    if(action==='rank-cancel'){await this.bot.ackCard(i);this.clans.drafts.remove(id);return this.bot.sendPrivate(i,'Edición cancelada. El ranking conserva la lista anterior.');}
    if(action==='rank-save'){
      if(!i.isButton()||!Array.isArray(d.data.entries))throw new UserError('Revisa el resumen antes de guardar.');
      d.busy=true;await this.bot.ackCard(i);
      try{
        await this.bot.queue(`clan-manual:${i.guildId}`,()=>this.store.replaceRanking(i.guildId,clan,d.data.entries,d.data.revision,i.user.id));
        this.clans.drafts.remove(id);
      }catch(e){d.busy=false;throw e;}
      let published=true;
      try{await this.clans.ranking(i.guild,clan);await this.panel(i.guild);}catch(e){published=false;this.bot.log(e,'Publicar ranking manual; se reintentará');}
      return this.bot.sendPrivate(i,`Lista de **${clanInfo(clan).tag}** guardada: **${d.data.entries.length} jugadores**. ${published?`Publicada en <#${this.clans.settings(i.guildId)[clan].rankingChannel}>.`:'La publicación está pendiente y se reintentará automáticamente.'}`);
    }
    throw new UserError('Control del ranking no válido.');
  }
}
