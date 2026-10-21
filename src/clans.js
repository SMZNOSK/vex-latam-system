import { createHash } from 'node:crypto';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { ChannelType, PermissionFlagsBits as P, PermissionsBitField, EmbedBuilder, ButtonStyle } from 'discord.js';
import { dataDir } from './config.js';
import { UserError } from './domain.js';
import { Drafts } from './drafts.js';
import { PlayerCards } from './player-cards.js';
import { assertAssignable } from './roles.js';
import { boundRole, assertPermanentRoleCreation } from './role-provisioning.js';
import { securePrivateChannel } from './admin-access.js';
import { pinIfAllowed } from './pins.js';
import { channelDisplayName } from './channel-names.js';
import { ClanStore } from './clan-store.js';
import { ClanRankingEditor } from './clan-ranking-editor.js';
import { clans, clanInfo, clanProfile, clanRoster, embarkKey, clanRSWarning } from './clan-domain.js';
import { clanPanel, clanModal, applicationPayload, clanFooter } from './clan-ui.js';
import { card, row, button, privateFlags, noMentions, safe } from './ui.js';

const unknown=e=>{if([10003,10008,10007].includes(e.code))return null;throw e;};
const hash=data=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
const marker=e=>e.footer?.text??e.data?.footer?.text;
const imageFilename=e=>{try{return decodeURIComponent(new URL(e.image?.url??e.data?.image?.url).pathname.split('/').pop());}catch{return null;}};
export const clanCommands=['clan','clan-vxtg-numero-miembros','clan-vxltm-numero-miembros'];

export class Clans {
  constructor(bot){this.bot=bot;this.store=new ClanStore(bot.store);this.rankingEditor=new ClanRankingEditor(this);this.drafts=new Drafts();this.pending=new Set();this.evidence=new PlayerCards(path.join(dataDir,'clan-evidence'),fetch,{maxWidth:1600,maxHeight:2400});}
  settings(guild){return this.bot.store.settings(guild).clans??{};}
  set(guild,key,value){const settings=this.bot.store.settings(guild);settings.clans??={};settings.clans[key]={...(settings.clans[key]??{}),...value};this.bot.store.saveSettings(guild,settings);}
  async channel(guild,name,type,parent,saved,permissions){
    name=channelDisplayName(guild.id,name);
    let c=saved?await guild.channels.fetch(saved).catch(unknown):null;
    if(c&&c.type!==type)throw new UserError(`El destino guardado de ${name} tiene otro tipo.`);
    if(!c){const matches=guild.channels.cache.filter(c=>c.type===type&&c.name===name&&(c.parentId??null)===(parent?.id??null));if(matches.size>1)throw new UserError(`Hay varios canales ${name}. Revisa los duplicados.`);c=matches.first();}
    if(!c)c=await guild.channels.create({name,type,...(parent?{parent:parent.id}:{}),permissionOverwrites:permissions,reason:'Solicitudes y rankings de clanes VEX LATAM'});
    if(c.name!==name||(c.parentId??null)!==(parent?.id??null))await c.edit({name,parent:parent?.id??null});
    if(c.permissionOverwrites.cache.size!==permissions.length||permissions.some(p=>{const o=c.permissionOverwrites.cache.get(p.id);return !o||o.allow.bitfield!==PermissionsBitField.resolve(p.allow)||o.deny.bitfield!==PermissionsBitField.resolve(p.deny);}))await c.permissionOverwrites.set(permissions,'Permisos de canales de clanes');
    return c;
  }
  async setup(guild){
    this.pending.add(guild.id);
    return this.bot.queue(`clan-setup:${guild.id}`,async()=>{
      await guild.channels.fetch();await guild.roles.fetch();const me=await guild.members.fetchMe();
      const adminId=this.bot.store.settings(guild.id).mailboxes?.channels?.adminCategory;
      const admin=adminId?await guild.channels.fetch(adminId).catch(unknown):null;if(!admin)throw new UserError('Primero debe estar preparado ADMIN PANEL.');
      const visible=this.bot.mailboxes.permissions(guild,me,false),hidden=this.bot.mailboxes.permissions(guild,me,true);
      const cfg=this.settings(guild.id),category=await this.channel(guild,'CLANES',ChannelType.GuildCategory,null,cfg.channels?.category,visible);
      this.set(guild.id,'channels',{category:category.id});
      const inbox=await this.channel(guild,'solicitudes-clanes',ChannelType.GuildText,admin,cfg.channels?.inbox,hidden);this.set(guild.id,'channels',{inbox:inbox.id});
      const editor=await this.channel(guild,'rankings-clanes',ChannelType.GuildText,admin,cfg.channels?.rankingAdmin,hidden);this.set(guild.id,'channels',{rankingAdmin:editor.id});
      const receipt=clanFooter('Administración','clanes');
      const guide=await this.write(inbox,cfg.channels?.inboxMessage,{embeds:[new EmbedBuilder().setColor(0xf5f5f5).setTitle('Solicitudes de ingreso · VXTG y VXLTM')
        .setDescription('Aquí llegan los datos del perfil y la captura de cada solicitante. **Solo los administradores pueden ver este receptor y aprobar ingresos.**\n\n**Aprobar ingreso:** registra su membresía, asigna el rol, envía un mensaje privado y anuncia al integrante en el canal del clan.\n**Rechazar:** cierra la solicitud; el solicitante puede consultar el estado.\n\nRevisa que la captura corresponda al Embark ID y RS mostrados. La evidencia nunca se publica en los rankings ni en los anuncios.')
        .addFields({name:'Prioridad de revisión',value:'En #admin-bot usa `/clan solicitudes` para ver los pendientes por RS descendente. VXTG recomienda Oro 4 (20,000 RS actuales). Por debajo se muestra una advertencia, pero se permite solicitar y el staff puede aprobar. VXLTM admite cualquier RS.'},
          {name:'Administrar integrantes',value:'`/clan miembros` muestra Discord, Embark ID y RS. `/clan quitar` retira el registro y su rol, con confirmación.'},
          {name:'Rankings manuales',value:`Carga o edita la lista completa y los RS en <#${editor.id}>. No requiere perfiles del bot. Las aprobaciones y los cambios de perfil no alteran estas tablas.`},
          {name:'Conteo real dentro del juego',value:'En #admin-bot usa `/clan-vxtg-numero-miembros total:...` o `/clan-vxltm-numero-miembros total:...`. Ese total manual es independiente de los registrados por el bot. La invitación y retirada dentro de THE FINALS las hace el staff.'})
        .setFooter({text:receipt})],allowedMentions:noMentions},receipt);
      this.set(guild.id,'channels',{inboxMessage:guide.id});await pinIfAllowed(guide,'Guía para revisar solicitudes de clanes');
      for(const id of Object.keys(clans)){
        const saved=this.settings(guild.id)[id]??{};
        let role=boundRole(guild,`clan.${id}`)??(saved.role?await guild.roles.fetch(saved.role).catch(e=>{if(e.code===10011)return null;throw e;}):null);
        if(!role){const matches=guild.roles.cache.filter(r=>r.name===clans[id].tag&&!r.managed);if(matches.size>1)throw new UserError(`Hay varios roles ${clans[id].tag}.`);role=matches.first();}
        if(!role){assertPermanentRoleCreation(guild,clans[id].tag);role=await guild.roles.create({name:clans[id].tag,permissions:[],mentionable:false,reason:'Identificación de miembros aprobados del clan'});}
        assertAssignable(role,me);
        this.set(guild.id,id,{role:role.id});
        const join=await this.channel(guild,`unete-a-${id}`,ChannelType.GuildText,category,saved.joinChannel,visible);
        const ranking=await this.channel(guild,`ranking-${id}`,ChannelType.GuildText,category,saved.rankingChannel,visible);
        this.set(guild.id,id,{joinChannel:join.id,rankingChannel:ranking.id});
        // Conserva una vez el ranking anterior; desde aquí todos los cambios son manuales.
        if(!this.store.ranking(guild.id,id))this.store.initRanking(guild.id,id,this.roster(guild.id,id));
        await this.panel(guild,id,true);await this.ranking(guild,id,true);
      }
      await this.rankingEditor.panel(guild);
      await this.refreshAdmissions(guild);
      const latest=this.bot.store.settings(guild.id);
      if(!latest.clans.welcomeLinked&&latest.community?.welcome){
        const fields=latest.community.welcome.fields??=[];
        if(!fields.some(f=>f.value.includes('{clan_vxtg}')&&f.value.includes('{clan_vxltm}'))&&fields.length<25){
          fields.push({name:'🏆 Encuentra tu clan',value:'Primero completa tu perfil: {perfil}\nVXTG · Competitivo, Oro recomendado: {clan_vxtg}\nVXLTM · Comunidad, cualquier RS: {clan_vxltm}\nSolo puedes pertenecer a uno. La solicitud requiere una captura.',inline:false});
          latest.community.welcomeVersion=(latest.community.welcomeVersion??0)+1;
        }
        latest.clans.welcomeLinked=true;
      }
      for(const f of latest.community?.welcome?.fields??[])if(f.name==='🏆 Encuentra tu clan'&&f.value.includes('{clan_vxtg}')&&f.value.includes('Oro o superior')){f.value=f.value.replace('Oro o superior','Oro recomendado');latest.community.welcomeVersion=(latest.community.welcomeVersion??0)+1;}
      const clanRoles=[latest.clans.vxtg.role,latest.clans.vxltm.role];
      if(latest.roles?.some(r=>clanRoles.includes(r.id))){for(const r of latest.roles.filter(r=>clanRoles.includes(r.id)))this.bot.store.forgetReactionRole(guild.id,r.id);latest.roles=latest.roles.filter(r=>!clanRoles.includes(r.id));this.bot.community.pending.add(guild.id);}
      this.bot.store.saveSettings(guild.id,latest);
      this.pending.delete(guild.id);
    });
  }
  async write(channel,previous,payload,receipt){
    let message=previous?await channel.messages.fetch(previous).catch(unknown):null;
    if(message&&message.author.id!==this.bot.client.user.id)throw new UserError('La referencia del clan no pertenece al bot.');
    if(!message)message=await this.findMessage(channel,receipt,payload.files?.find(f=>f.name?.startsWith('clan-admission-'))?.name);
    if(message)return message.edit({...payload,content:payload.content??null});
    return channel.send({...payload,nonce:hash(`${channel.id}:${receipt}`).slice(0,25),enforceNonce:true});
  }
  async findMessage(channel,receipt,filename){
    let before;for(;;){const batch=await channel.messages.fetch({limit:100,...(before?{before}:{})});const message=batch.find(m=>m.author.id===this.bot.client.user.id&&(m.embeds.some(e=>marker(e)===receipt)||filename&&(m.attachments.some(a=>a.name===filename)||m.embeds.some(e=>imageFilename(e)===filename))));if(message)return message;if(batch.size<100)return null;before=batch.last().id;}
  }
  panel(guild,clan,force=false){return this.bot.queue(`clan-panel:${guild.id}:${clan}`,()=>this.publishPanel(guild,clan,force));}
  async publishPanel(guild,clan,force=false){
    const cfg=this.settings(guild.id)[clan],members=this.store.members(guild.id,clan),settings=this.bot.store.settings(guild.id);
    const fingerprint=hash(['clan-poster-v4-warning',clans[clan],cfg.gameCount,members.length,settings.panels?.registro?.channel]);
    if(!force&&cfg.panel?.hash===fingerprint)return;
    const channel=await this.bot.channel(guild,cfg.joinChannel),payload=clanPanel(clan,settings,members.length);
    if(this.bot.renderer){try{payload.files=[{attachment:await this.bot.renderer.render('clan-poster',{clan},1080),name:'clan.png'}];payload.attachments=[];payload.embeds[0].setImage('attachment://clan.png');}catch(e){this.bot.log(e,'Cartel de clan; se conserva el texto');}}
    const message=await this.write(channel,cfg.panel?.message,payload,clanFooter('Ingreso',clan));
    this.set(guild.id,clan,{panel:{message:message.id,hash:fingerprint}});await pinIfAllowed(message,'Solicitud de ingreso al clan');
  }
  roster(guild,clan){return clanRoster(this.bot.store,guild,this.store.members(guild,clan));}
  ranking(guild,clan,force=false){return this.bot.queue(`clan-ranking:${guild.id}:${clan}`,()=>this.publishRanking(guild,clan,force));}
  async publishRanking(guild,clan,force=false){
    const cfg=this.settings(guild.id)[clan],manual=this.store.ranking(guild.id,clan);if(!manual)throw new UserError('El ranking manual está pendiente de preparar.');const people=manual.entries;
    const fingerprint=hash(['clan-ranking-v2-manual',people,cfg.gameCount]);if(!force&&cfg.rankingHash===fingerprint)return;
    const channel=await this.bot.channel(guild,cfg.rankingChannel),pages=Math.max(1,Math.ceil(people.length/15)),references=[];
    for(let page=0;page<pages;page++){
      const slice=people.slice(page*15,(page+1)*15),receipt=clanFooter('Ranking',`${clan}:${page}`);
      const embed=new EmbedBuilder().setColor(clans[clan].color).setTitle(`Ranking ${clans[clan].tag} · ${page+1}/${pages}`)
        .setDescription(slice.map((p,n)=>`**${page*15+n+1}. ${safe(p.embarkId)}** · ${p.score.toLocaleString('es-MX')} RS · ${safe(p.rank)}`).join('\n')||'El staff está preparando la lista de integrantes.')
        .addFields({name:'Conteo',value:`THE FINALS: **${cfg.gameCount??'sin registrar'}** · En esta tabla: **${people.length}**`},{name:'Datos del staff',value:'Lista y RS cargados manualmente por los administradores. No es necesario crear un perfil para aparecer.'})
        .setFooter({text:receipt});
      const payload={embeds:[embed],attachments:[],allowedMentions:noMentions};
      if(this.bot.renderer){try{payload.files=[{attachment:await this.bot.renderer.render('clan-ranking',{clan,people:slice,offset:page*15,total:people.length,gameCount:cfg.gameCount,page:page+1,pages},1080),name:'ranking-clan.png'}];embed.setImage('attachment://ranking-clan.png');}catch(e){this.bot.log(e,'Imagen del ranking de clan; se conserva el listado');}}
      const message=await this.write(channel,cfg.ranking?.[page]?.message,payload,receipt);references.push({message:message.id});
      this.set(guild.id,clan,{ranking:[...references,...(cfg.ranking??[]).slice(page+1)]});if(!page)await pinIfAllowed(message,'Ranking de todos los miembros del clan');
    }
    for(const old of (cfg.ranking??[]).slice(pages)){const m=await channel.messages.fetch(old.message).catch(unknown);if(m?.author.id===this.bot.client.user.id)await m.delete();}
    this.set(guild.id,clan,{ranking:references,rankingHash:fingerprint});
  }
  async inbox(guild){return this.privateChannel(guild,'inbox');}
  async privateChannel(guild,key){
    await guild.roles.fetch();const ids=this.settings(guild.id).channels??{},adminId=this.bot.store.settings(guild.id).mailboxes?.channels?.adminCategory;
    const [channel,category]=await Promise.all([guild.channels.fetch(ids[key],{force:true}).catch(unknown),guild.channels.fetch(adminId,{force:true}).catch(unknown)]),me=await guild.members.fetchMe();
    const secure=c=>securePrivateChannel(c,guild,me.id);
    if(channel?.type!==ChannelType.GuildText||channel.parentId!==category?.id||!secure(channel)||!secure(category)){this.pending.add(guild.id);throw new UserError('El receptor de solicitudes está pendiente de asegurar sus permisos privados. Inténtalo más tarde.');}
    if(!channel.permissionsFor(me)?.has([P.ViewChannel,P.SendMessages,P.EmbedLinks,P.AttachFiles]))throw new UserError('Faltan permisos para entregar la evidencia al receptor privado.');
    return channel;
  }
  syncApplication(guild,application){return this.bot.queue(`clan-members:${guild.id}`,()=>this.publishApplication(guild,this.store.get(application.id)));}
  async publishApplication(guild,a){
    if(!a)return;
    const fingerprint=hash(['clan-application-v4-warning',clans[a.clan].color,a.status,a.actor,a.roleAssigned,a.dmStatus,a.profile,a.availability,a.motivation]);if(a.inboxHash===fingerprint)return;
    const channel=await this.inbox(guild),uri=await this.evidence.dataURI(a.evidence);if(!uri)throw new UserError('No se encuentra la captura de esta solicitud. Contacta con el administrador.');
    const payload=applicationPayload(a);payload.files=[{attachment:Buffer.from(uri.split(',')[1],'base64'),name:'evidencia-clan.png'}];
    const m=await this.write(channel,a.inboxMessage,payload,clanFooter('Solicitud',a.id));a.inboxMessage=m.id;a.inboxChannel=channel.id;a.inboxHash=fingerprint;this.store.save(a);
  }
  profile(guild,user,clan){this.bot.workflows.assertProfileSaved(guild,user);return clanProfile(this.bot.store.profile(guild,user),clan);}
  async eligible(guild,user,clan,fresh=true){
    const profile=this.profile(guild.id,user,clan);
    if(this.store.member(guild.id,user))throw new UserError('Ya perteneces a un clan. Pide a un administrador que te retire antes de solicitar otro.');
    if(this.store.pending(guild.id,user))throw new UserError('Ya tienes una solicitud pendiente. Usa Mi solicitud para consultarla o cancelarla.');
    const member=(!fresh&&guild.members.cache.get(user))||await guild.members.fetch({user,force:true});
    const assigned=Object.entries(clans).find(([id])=>member.roles.cache.has(this.settings(guild.id)[id]?.role));
    if(assigned)throw new UserError(`Ya tienes el rol de ${assigned[1].tag}. Un administrador debe revisar tu membresía antes de una nueva solicitud.`);
    return {profile,member};
  }
  async status(i,clan){
    await this.bot.ackCard(i);const applications=this.store.applications(i.guildId).filter(a=>a.user===i.user.id&&a.clan===clan),a=applications[0],member=this.store.member(i.guildId,i.user.id);
    const labels={pending:'Pendiente de revisión',approved:'Aprobada',rejected:'Rechazada',cancelled:'Cancelada'};
    return this.bot.replyCard(i,card(`Mi solicitud · ${clans[clan].tag}`,member?.clan===clan?`**Ya formas parte de ${clans[clan].name}.**\nTu ingreso dentro de THE FINALS se coordina con el staff.`:a?`Estado: **${labels[a.status]}**.\n${a.status==='approved'?'Tu membresía ya no está activa en el registro.':a.status==='pending'?'Tu captura y datos solo los revisan los administradores.':'Puedes enviar una nueva solicitud si cumples los requisitos.'}`:'Todavía no has enviado una solicitud.',a?.status==='pending'?[row(button(`clan:cancel:${a.id}`,'Cancelar mi solicitud',ButtonStyle.Danger))]:[]));
  }
  async handle(i){
    const [,action,id,...rest]=i.customId.split(':');
    if(action.startsWith('rank-'))return this.rankingEditor.handle(i,action,id);
    if(['apply','status'].includes(action)){
      clanInfo(id);const cfg=this.settings(i.guildId)[id];
      if(!i.isButton()||i.channelId!==cfg?.joinChannel||i.message?.id!==cfg.panel?.message||i.message.author.id!==this.bot.client.user.id)throw new UserError('Usa el cartel actualizado del canal de ingreso al clan.');
      if(action==='status')return this.status(i,id);
      const {profile}=await this.eligible(i.guild,i.user.id,id,false);const d=this.drafts.create('clan-application',i.guildId,i.user.id,{clan:id,channel:i.channelId,profile});
      return i.showModal(clanModal(d,profile));
    }
    if(action==='submit'){
      if(!i.isModalSubmit())throw new UserError('Abre el formulario desde el canal del clan.');
      const d=this.drafts.get(id,i.guildId,i.user.id);if(d.kind!=='clan-application'||d.busy||i.channelId!==d.data.channel||i.channelId!==this.settings(i.guildId)[d.data.clan]?.joinChannel)throw new UserError('Este formulario cambió o ya se está enviando. Abre uno nuevo.');
      const files=i.fields.getUploadedFiles('evidence',true),availability=i.fields.getTextInputValue('availability').trim(),motivation=i.fields.getTextInputValue('motivation').trim();
      if(files.size!==1||availability.length>300||motivation.length>450)throw new UserError('Adjunta una sola captura y respeta los límites de los comentarios.');
      d.busy=true;await i.deferReply({flags:privateFlags});
      try{
        await this.inbox(i.guild);const {profile,member}=await this.eligible(i.guild,i.user.id,d.data.clan);
        if(profile.embarkId!==d.data.profile.embarkId||profile.score!==d.data.profile.score)throw new UserError('Tu Embark ID o RS cambiaron mientras completabas el formulario. Abre uno nuevo con los datos actuales.');
        let evidence;try{evidence=await this.evidence.upload(files.first());}catch(e){if(e instanceof UserError)throw new UserError(e.message.replaceAll('tarjeta','captura de evidencia').replace('tu perfil conserva la anterior.','vuelve a intentarlo.'));throw e;}
        const a=await this.bot.queue(`clan-members:${i.guildId}`,async()=>{const current=this.profile(i.guildId,i.user.id,d.data.clan);if(current.embarkId!==profile.embarkId||current.score!==profile.score)throw new UserError('Tu perfil cambió. Envía la solicitud con una captura actualizada.');return this.store.submit({guild:i.guildId,user:i.user.id,displayName:member.displayName,clan:d.data.clan,profile:current,evidence,availability,motivation});});
        this.drafts.remove(d.id);let delivered=true;await this.syncApplication(i.guild,a).catch(e=>{delivered=false;this.bot.log(e,'Entregar solicitud de clan; se reintentará');});
        return this.bot.sendPrivate(i,`Solicitud a **${clans[a.clan].tag}** guardada.${delivered?' La recibieron los administradores.':' La entrega al receptor privado está pendiente y se reintentará automáticamente.'}${clanRSWarning(a.profile,a.clan)?'\n⚠️ Tu RS actual está por debajo de los 20,000 recomendados; el staff recibió la advertencia y decidirá tu ingreso.':''}\nTu evidencia permanece privada. Puedes revisar el estado con **Mi solicitud**.`);
      }finally{d.busy=false;}
    }
    if(action==='cancel'){
      await this.bot.ackCard(i);const a=this.store.get(id);if(!a||a.guild!==i.guildId||a.user!==i.user.id)throw new UserError('Esta solicitud no te pertenece.');
      await this.bot.queue(`clan-members:${i.guildId}`,()=>this.store.decide(id,'cancelled',i.user.id));await this.syncApplication(i.guild,this.store.get(id));return this.bot.sendPrivate(i,'Tu solicitud fue cancelada.');
    }
    if(['approve','reject'].includes(action)){
      this.bot.admin(i);await i.deferReply({flags:privateFlags});const channel=await this.inbox(i.guild),a=this.store.get(id);
      if(!a||a.guild!==i.guildId||i.channelId!==channel.id||i.message?.id!==a.inboxMessage||i.message.author.id!==this.bot.client.user.id)throw new UserError('Usa los botones de la solicitud original en el receptor privado.');
      await this.bot.queue(`clan-members:${i.guildId}`,async()=>{
        const current=this.store.get(id);if(current.status!=='pending')throw new UserError('La solicitud ya fue atendida.');
        if(action==='reject'){this.store.decide(id,'rejected',i.user.id);return;}
        const profile=this.profile(i.guildId,current.user,current.clan);
        if(profile.embarkId!==current.profile.embarkId||profile.score!==current.profile.score)throw new UserError('El Embark ID o los RS cambiaron desde la solicitud. Pide una nueva solicitud con evidencia actualizada.');
        const member=await i.guild.members.fetch({user:current.user,force:true}).catch(unknown);if(!member)throw new UserError('El solicitante ya no está en el servidor.');
        for(const other of Object.keys(clans))if(other!==current.clan&&member.roles.cache.has(this.settings(i.guildId)[other]?.role))throw new UserError('La persona ya tiene el rol del otro clan.');
        await this.role(i.guild,current.clan);
        const fresh=this.profile(i.guildId,current.user,current.clan);if(fresh.embarkId!==current.profile.embarkId||fresh.score!==current.profile.score)throw new UserError('El perfil cambió durante la aprobación. Revisa una nueva captura.');
        this.store.approve(id,i.user.id);
      });
      await this.processJobs(i.guild);await this.syncApplication(i.guild,this.store.get(id));
      return this.bot.sendPrivate(i,action==='approve'?'Solicitud aprobada. El rol, el mensaje privado y el anuncio se procesan de forma persistente; los pasos pendientes se reintentan.':'Solicitud rechazada. La persona puede consultar el estado en Mi solicitud.');
    }
    if(action==='list'){const [clan,user,page]=rest;if(user!==i.user.id)throw new UserError('Abre tu propia lista desde /clan.');return this.list(i,id,clan,Number(page)||0);}
    if(action==='remove'){
      this.bot.mailboxes.assertAdminCommand(i);const d=this.drafts.get(id,i.guildId,i.user.id);if(d.kind!=='clan-remove')throw new UserError('Control de retirada no válido.');await this.bot.ackCard(i);
      await this.bot.queue(`clan-members:${i.guildId}`,()=>{const current=this.store.member(i.guildId,d.data.user);if((current?.application??null)!==d.data.expected)throw new UserError('La membresía cambió desde que abriste la confirmación. Usa /clan quitar de nuevo.');return this.store.remove(i.guildId,d.data.user,d.data.clan,i.user.id,d.data.reason);});this.drafts.remove(d.id);await this.processJobs(i.guild);
      return this.bot.sendPrivate(i,'Membresía retirada del registro del bot. Se retira su rol de Discord. El total manual de THE FINALS no cambia; la retirada dentro del juego corresponde al staff.');
    }
    throw new UserError('Control de clanes no válido.');
  }
  async role(guild,clan){const id=this.settings(guild.id)[clan]?.role,role=id?await guild.roles.fetch(id).catch(e=>{if(e.code===10011)return null;throw e;}):null;if(!role){this.pending.add(guild.id);throw new UserError('Revisa el rol del clan: debe existir.');}assertAssignable(role,await guild.members.fetchMe());return role;}
  async admission(guild,application,{notify=false,existingOnly=false}={}){
    const a=this.store.get(application.id),channel=await this.bot.channel(guild,this.settings(guild.id)[a.clan].joinChannel);
    const receipt=clanFooter('Nuevo integrante',a.id),filename=`clan-admission-${a.id}.png`;
    let previous=a.announcement;
    if(existingOnly){
      const found=previous?await channel.messages.fetch(previous).catch(unknown):await this.findMessage(channel,receipt,filename);
      if(!found){a.announcementMissingAt=Date.now();this.store.save(a);return null;}
      previous=found.id;
    }
    const member=await guild.members.fetch({user:a.user,force:true}).catch(unknown);if(!member)return null;
    const data={...(this.bot.memberCards?await this.bot.memberCards.data(member):{displayName:member.displayName}),clan:a.clan,...a.profile};
    const embed=new EmbedBuilder().setColor(clans[a.clan].color).setTitle(`Nuevo integrante de ${clans[a.clan].tag}`)
      .setDescription(`¡Bienvenido, <@${a.user}>!\n**${safe(a.profile.embarkId)}** · ${a.profile.score.toLocaleString('es-MX')} RS · ${safe(a.profile.rank)}\n\n**${clans[a.clan].motto}**`)
      .setFooter({text:`VEX LATAM · ${clans[a.clan].tag} · Ingreso aprobado`});
    const payload={embeds:[embed],attachments:[],allowedMentions:notify?{...noMentions,users:[a.user]}:noMentions};
    let rendered=false;
    if(this.bot.renderer){try{payload.files=[{attachment:await this.bot.renderer.render('clan-admission',data,1080),name:filename}];embed.setImage(`attachment://${filename}`);rendered=true;}catch(e){if(existingOnly)throw e;this.bot.log(e,'Tarjeta de ingreso pendiente; se conserva el anuncio de texto');}}
    // El recibo heredado permite recuperar incluso un envío sin imagen tras una caída.
    if(!rendered)embed.setFooter({text:receipt});
    const message=await this.write(channel,previous,payload,receipt);
    a.announcement=message.id;a.announcementChannel=channel.id;a.announcementVersion=rendered?2:0;this.store.save(a);
    return message;
  }
  async refreshAdmissions(guild){
    for(const a of this.store.applications(guild.id)){
      if(a.status!=='approved'||!a.roleAssigned||a.announcementVersion===2||Date.now()-(a.announcementMissingAt??0)<3600000)continue;
      await this.bot.queue(`clan-members:${guild.id}`,async()=>{
        const fresh=this.store.get(a.id);
        if(fresh?.status==='approved'&&fresh.announcementVersion!==2)await this.admission(guild,fresh,{existingOnly:true});
      }).catch(e=>this.bot.log(e,'Actualizar tarjeta de ingreso existente; se reintentará'));
    }
  }
  async processJobs(guild){
    for(const entry of this.store.jobs(guild.id))await this.bot.queue(`clan-members:${guild.id}`,async()=>{
      const job=entry;
      try{
        const member=await guild.members.fetch({user:job.user,force:true}).catch(unknown);
        if(job.kind==='remove'){
          const role=await this.role(guild,job.clan);if(member?.roles.cache.has(role.id))await member.roles.remove(role,'Retirada de membresía del clan');this.store.finish(job);return;
        }
        const membership=this.store.member(guild.id,job.user),a=this.store.get(job.application);
        if(!membership||membership.application!==job.application||!member){this.store.finish(job);return;}
        const other=Object.keys(clans).find(c=>c!==job.clan&&member.roles.cache.has(this.settings(guild.id)[c]?.role));if(other)throw new UserError('El integrante tiene el rol del otro clan. Revisa su membresía.');
        if(!job.roleDone){const role=await this.role(guild,job.clan);if(!member.roles.cache.has(role.id))await member.roles.add(role,'Solicitud de clan aprobada por un administrador');job.roleDone=true;membership.rolePending=false;this.store.saveMember(membership);a.roleAssigned=true;this.store.save(a);this.store.job(job);}
        if(!job.dmDone){
          try{const dm=await member.createDM(),receipt=clanFooter('Aprobación',a.id);const message=await this.write(dm,null,{embeds:[new EmbedBuilder().setColor(clans[a.clan].color).setTitle(`¡Tu solicitud a ${clans[a.clan].tag} fue aprobada!`).setDescription(`Embark ID: **${safe(a.profile.embarkId)}**\nYa tienes tu rol de clan en Discord. El staff coordinará contigo la invitación dentro de THE FINALS.\n\n**${clans[a.clan].motto}**`).setFooter({text:receipt})],allowedMentions:noMentions},receipt);job.dmMessage=message.id;a.dmStatus='sent';}
          catch(e){if(![50007,50278].includes(e.code))throw e;a.dmStatus='blocked';}
          job.dmDone=true;this.store.save(a);this.store.job(job);
        }
        if(!job.announcement){
          const message=await this.admission(guild,a,{notify:true});if(!message)throw new UserError('No se pudo publicar el anuncio del integrante.');
          job.announcement=message.id;this.store.job(job);
        }
        this.store.finish(job);
      }catch(e){this.store.retry(job);this.bot.log(e,'Procesar ingreso o retirada de clan; se reintentará');}
    });
  }
  async list(i,kind,clan,page=0){
    this.bot.mailboxes.assertAdminCommand(i);clanInfo(clan);if(!['miembros','solicitudes'].includes(kind))throw new UserError('Lista de clanes desconocida.');await this.bot.ackCard(i);
    const entries=kind==='miembros'?this.roster(i.guildId,clan):this.store.applications(i.guildId).filter(a=>a.clan===clan&&a.status==='pending').sort((a,b)=>b.profile.score-a.profile.score||a.created-b.created);
    const pages=Math.max(1,Math.ceil(entries.length/12));page=Math.max(0,Math.min(page,pages-1));
    const lines=entries.slice(page*12,(page+1)*12).map((p,n)=>`${page*12+n+1}. <@${p.user}> · ID: ${p.user}\n**${safe(p.embarkId??p.profile.embarkId)}** · ${(p.score??p.profile.score).toLocaleString('es-MX')} RS${kind==='solicitudes'&&clanRSWarning(p.profile,clan)?' · ⚠️ RS por debajo de lo recomendado':''}${p.inboxMessage?` · [Revisar](https://discord.com/channels/${i.guildId}/${p.inboxChannel}/${p.inboxMessage})`:''}`);
    return this.bot.replyCard(i,card(`${clans[clan].tag} · ${kind} · ${page+1}/${pages}`,`**${entries.length} ${kind}**\n\n${lines.join('\n\n')||'No hay registros.'}`,pages>1?[row(button(`clan:list:${kind}:${clan}:${i.user.id}:${page-1}`,'Anterior',undefined,page===0),button(`clan:list:${kind}:${clan}:${i.user.id}:${page+1}`,'Siguiente',undefined,page===pages-1))]:[]));
  }
  async command(i){
    this.bot.mailboxes.assertAdminCommand(i);
    if(i.commandName!=='clan'){
      const clan=i.commandName==='clan-vxtg-numero-miembros'?'vxtg':'vxltm',total=i.options.getInteger('total');
      if(!Number.isInteger(total)||total<0||total>1000)throw new UserError('Indica un total entre 0 y 1000 miembros.');
      await i.deferReply({flags:privateFlags});this.set(i.guildId,clan,{gameCount:total,gameCountBy:i.user.id,gameCountAt:Date.now()});await this.panel(i.guild,clan);await this.ranking(i.guild,clan);
      return this.bot.sendPrivate(i,`Total real de ${clans[clan].tag} en THE FINALS actualizado a **${total}**. Registrados por el bot: **${this.store.members(i.guildId,clan).length}**.`);
    }
    const sub=i.options.getSubcommand(),clan=i.options.getString('clan');clanInfo(clan);
    if(sub==='ranking')return this.bot.sendPrivate(i,`Edita la lista completa de **${clans[clan].tag}** en <#${this.settings(i.guildId).channels.rankingAdmin}>. Usa el botón Editar ${clans[clan].tag}; no requiere perfiles del bot.`);
    if(['miembros','solicitudes'].includes(sub))return this.list(i,sub,clan);
    const user=i.options.getUser('usuario'),reason=(i.options.getString('motivo')??'Retirada por administración').trim();
    const member=this.store.member(i.guildId,user.id);if(member&&member.clan!==clan)throw new UserError('Esa persona pertenece al otro clan.');
    const d=this.drafts.create('clan-remove',i.guildId,i.user.id,{clan,user:user.id,reason,expected:member?.application??null});
    return this.bot.replyCard(i,card(`Quitar de ${clans[clan].tag}`,`Se retirará a <@${user.id}> del registro y del rol de Discord.\nMotivo: ${safe(reason)}\nEl total manual y la membresía dentro de THE FINALS se gestionan por separado.`,[row(button(`clan:remove:${d.id}`,'Confirmar retirada',ButtonStyle.Danger))]));
  }
  async left(member){
    if(!this.bot.guilds.has(member.guild.id))return;
    await this.bot.queue(`clan-members:${member.guild.id}`,()=>{const current=this.store.member(member.guild.id,member.id);if(current)this.store.remove(member.guild.id,member.id,current.clan,this.bot.client.user.id,'Salió del servidor Discord');const pending=this.store.pending(member.guild.id,member.id);if(pending)this.store.decide(pending.id,'cancelled',member.id);});
  }
  async tick(guild){
    this.drafts.expire();const cfg=this.settings(guild.id);
    if(this.pending.has(guild.id)||!cfg.channels?.inbox||!guild.channels.cache.has(cfg.channels?.rankingAdmin)||!Object.keys(clans).every(c=>guild.channels.cache.has(cfg[c]?.joinChannel)&&guild.channels.cache.has(cfg[c]?.rankingChannel)))await this.setup(guild);
    await this.processJobs(guild);
    await this.refreshAdmissions(guild);
    for(const a of this.store.applications(guild.id))await this.syncApplication(guild,a).catch(e=>this.bot.log(e,'Actualizar solicitud de clan'));
    for(const clan of Object.keys(clans)){await this.panel(guild,clan);await this.ranking(guild,clan);}
    await this.rankingEditor.panel(guild);
  }
}
