import path from 'node:path';
import {ActionRowBuilder,ButtonBuilder,ButtonStyle,ChannelType,EmbedBuilder,FileUploadBuilder,LabelBuilder,ModalBuilder,PermissionFlagsBits as P} from 'discord.js';
import {config,dataDir} from './config.js';
import {Drafts} from './drafts.js';
import {UserError} from './domain.js';
import {assertAssignable} from './roles.js';
import {assertPermanentRoleCreation} from './role-provisioning.js';
import {PromotionMedia} from './promotion-media.js';
import {promotionInput} from './promotion-domain.js';
import {privateFlags,noMentions,textLabel,row,button,safe} from './ui.js';

const normalized = value => String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const unknown = error => {if([10003,10007,10011].includes(error.code))return null;throw error;};
const receipt = id => `VEX PROMO · ${id}`;
const required = [P.ViewChannel,P.SendMessages,P.EmbedLinks,P.AttachFiles,P.ReadMessageHistory,P.MentionEveryone];
export const promotionRoles = {promo:'Promo VEX',creator:'Creador VEX'};

export class Promotions {
  constructor(bot) {
    this.bot=bot;this.drafts=new Drafts();this.media=new PromotionMedia(path.join(dataDir,'promotion-covers'));
  }
  settings(guild) {return this.bot.store.settings(guild).promotions??{};}
  save(guild,patch) {
    const settings=this.bot.store.settings(guild);settings.promotions={...settings.promotions,...patch};this.bot.store.saveSettings(guild,settings);
  }
  publication(guild,record) {
    const publications=this.settings(guild).publications??{};publications[record.id]=record;this.save(guild,{publications});return record;
  }
  async destination(guild,{prepare=false}={}) {
    const id=config.promotionChannels?.[guild.id]??this.settings(guild.id).channel;
    let channel=id?await guild.channels.fetch(id).catch(unknown):null;
    if(id&&!channel)throw new UserError('El canal Promo configurado ya no existe. Revisa su ID antes de publicar.');
    const me=await guild.members.fetchMe();
    if(!channel&&prepare){
      await guild.channels.fetch();
      const matches=guild.channels.cache.filter(c=>c.type===ChannelType.GuildText&&normalized(c.name)==='promo');
      if(matches.size>1)throw new UserError('Hay varios canales Promo. Configura el ID del canal correcto.');
      channel=matches.first();
      if(!channel){
        if(!me.permissions.has(P.ManageChannels))throw new UserError('El bot necesita Administrar canales para preparar #promo.');
        channel=await guild.channels.create({name:'promo',type:ChannelType.GuildText,topic:'Promociones de miembros autorizados de VEX LATAM SQUAD.',
          permissionOverwrites:[{id:guild.id,allow:[P.ViewChannel,P.ReadMessageHistory],deny:[P.SendMessages,P.CreatePublicThreads,P.CreatePrivateThreads]},
            {id:me.id,allow:required}],reason:'Canal de promociones solicitado para el bot'});
      }
    }
    if(!channel||channel.type!==ChannelType.GuildText||channel.guildId!==guild.id)throw new UserError('Usa primero /rollpromocion para preparar el rol y el canal Promo.');
    if(!channel.permissionsFor(me)?.has(required))throw new UserError('En Promo, el bot necesita Ver canal, Enviar mensajes, Insertar enlaces, Adjuntar archivos, Leer historial y Mencionar @here.');
    return channel;
  }
  memberType(guild,member) {
    const settings=this.bot.store.settings(guild),bindings=config.roleBindings?.[guild]??{};
    const clanRoles=['vxtg','vxltm'].map(clan=>settings.clans?.[clan]?.role??bindings[`clan.${clan}`]).filter(Boolean);
    return clanRoles.some(id=>member.roles.cache.has(id))||this.bot.clans?.store.member(guild,member.id)?'creator':'promo';
  }
  async role(guild,type,{prepare=false}={}) {
    await guild.roles.fetch();
    const name=promotionRoles[type],id=this.settings(guild.id).roles?.[type];
    let role=id?guild.roles.cache.get(id):null;
    if(id&&!role)throw new UserError(`El rol ${name} configurado ya no existe. Revisa su configuración.`);
    if(!role){
      const matches=guild.roles.cache.filter(r=>normalized(r.name)===normalized(name));
      if(matches.size>1)throw new UserError(`Hay varios roles ${name}. Configura un ID único antes de asignarlo.`);
      role=matches.first();
    }
    if(!role&&prepare){assertPermanentRoleCreation(guild,name);role=await guild.roles.create({name,permissions:[],colors:{primaryColor:0xdf263c},reason:'Rol para promociones solicitado por administración'});}
    if(!role)return null;
    assertAssignable(role,await guild.members.fetchMe());
    if(role.permissions.bitfield!==0n)throw new UserError(`El rol ${name} debe estar sin permisos globales; el bot gestiona la publicación.`);
    return role;
  }
  async authorized(i) {
    const roles=await Promise.all(['promo','creator'].map(type=>this.role(i.guild,type))),member=await i.guild.members.fetch({user:i.user.id,force:true}).catch(unknown);
    if(!member||member.user?.bot||!roles.some(role=>role&&member.roles.cache.has(role.id)))throw new UserError('Necesitas Promo VEX o Creador VEX. Administración puede asignarlo con /rollpromocion.');
    return member;
  }
  async grant(i) {
    this.bot.mailboxes.assertAdminCommand(i);
    const user=i.options.getUser('usuario',true);
    if(user.bot)throw new UserError('Selecciona una persona, no un bot.');
    await i.deferReply({flags:privateFlags});
    const result=await this.bot.queue(`promotions-setup:${i.guildId}`,async()=>{
      const member=await i.guild.members.fetch({user:user.id,force:true}).catch(unknown);
      if(!member)throw new UserError('La persona debe estar dentro de este servidor.');
      const type=this.memberType(i.guildId,member),role=await this.role(i.guild,type,{prepare:true}),channel=await this.destination(i.guild,{prepare:true});
      this.save(i.guildId,{roles:{...this.settings(i.guildId).roles,[type]:role.id},channel:channel.id});
      if(!member.roles.cache.has(role.id))await member.roles.add(role,`Promoción autorizada por ${i.user.id}`);
      const other=await this.role(i.guild,type==='promo'?'creator':'promo');
      if(other&&member.roles.cache.has(other.id))await member.roles.remove(other,'Actualizar categoría de promociones según pertenencia al clan');
      const grants=this.settings(i.guildId).grants??{};grants[user.id]={actor:i.user.id,at:Date.now(),type};this.save(i.guildId,{grants});
      return {role,channel};
    });
    return this.bot.sendPrivate(i,`**${result.role.name}** asignado a <@${user.id}>. Ya puede usar **/agregar promocion**. Las publicaciones se envían únicamente a <#${result.channel.id}> con **@here**.`);
  }
  async command(i) {
    if(i.commandName==='rollpromocion')return this.grant(i);
    if(i.options.getSubcommand()!=='promocion')throw new UserError('Subcomando de promoción desconocido.');
    const member=await this.authorized(i),channel=await this.destination(i.guild);
    const pending=Object.values(this.settings(i.guildId).publications??{}).find(p=>p.user===i.user.id&&p.status==='sending');
    const d=this.drafts.create('promotion',i.guildId,i.user.id,{channel:channel.id,origin:i.channelId,publicationId:pending?.id,values:pending?.values,coverRef:pending?.coverRef});
    if(pending){await i.deferReply({flags:privateFlags});return this.preview(i,d,member);}
    return i.showModal(new ModalBuilder().setCustomId(`promotion:submit:${d.id}`).setTitle('Agregar promoción').addLabelComponents(
      textLabel('title','Título del video','',true,120,'Ej. Nuevo meta de THE FINALS'),
      textLabel('url','Enlace del video','',true,512,'https://...'),
      textLabel('description','Cuéntanos de qué trata','',false,350,'Descripción breve, opcional'),
      new LabelBuilder().setLabel('Carátula del video · Opcional').setDescription('YouTube: automática. Otras plataformas: adjunta PNG, JPG o WebP de hasta 8 MB.')
        .setFileUploadComponent(new FileUploadBuilder({file_types:['.png','.jpg','.jpeg','.webp']}).setCustomId('cover').setRequired(false).setMinValues(0).setMaxValues(1))));
  }
  async preview(i,d,member) {
    if(!this.bot.renderer)throw new UserError('El generador de tarjetas está pendiente de preparar.');
    let coverData=await this.media.cards.dataURI(d.data.coverRef);
    if(!coverData){const cover=await this.media.videoCover(d.data.values.url);if(cover){d.data.coverRef=cover.ref;coverData=cover.data;}}
    const avatarData=await this.bot.memberCards?.avatar(member)??null;
    d.data.displayName=member.displayName??member.user?.username??'Usuario de Discord';d.data.creatorType=this.memberType(i.guildId,member);
    d.data.image=await this.bot.renderer.render('promotion',{...d.data.values,displayName:d.data.displayName,creatorType:d.data.creatorType,avatarData,coverData},1100);d.step='ready';
    return i.editReply({content:`Vista previa privada. Destino: <#${d.data.channel}>. Al publicar se avisará con **@here**.`,files:[{attachment:d.data.image,name:'promocion.png'}],components:this.controls(d),allowedMentions:noMentions});
  }
  controls(d) {
    const controls=[button(`promotion:publish:${d.id}`,d.data.publicationId?'Recuperar / publicar':'Publicar en Promo',ButtonStyle.Success)];
    if(!d.data.publicationId)controls.push(button(`promotion:cancel:${d.id}`,'Cancelar'));
    return [row(...controls)];
  }
  async findPublished(channel,record) {
    let before;
    for(;;){
      const batch=await channel.messages.fetch({limit:100,...(before?{before}:{})});
      const found=batch.find(m=>m.author.id===this.bot.client.user.id&&m.embeds.some(e=>(e.footer?.text??e.data?.footer?.text)===receipt(record.id)));
      if(found)return found;
      if(batch.size<100||batch.last().createdTimestamp<record.created-60000)return null;
      before=batch.last().id;
    }
  }
  async publish(i,d,member) {
    if(d.data.creatorType!==this.memberType(i.guildId,member))throw new UserError('Cambió tu pertenencia al clan desde la vista previa. Abre de nuevo /agregar promocion para actualizar tu tarjeta.');
    const channel=await this.destination(i.guild);
    if(channel.id!==d.data.channel)throw new UserError('Cambió el canal Promo. Abre de nuevo /agregar promocion.');
    const id=d.data.publicationId??d.id,previous=this.settings(i.guildId).publications?.[id];
    if(previous?.channel&&previous.channel!==channel.id)throw new UserError('La publicación pendiente pertenece a otro canal. Contacta con administración.');
    if(previous&&previous.user!==i.user.id)throw new UserError('La publicación pertenece a otra persona.');
    if(previous?.status==='sent')return `https://discord.com/channels/${i.guildId}/${channel.id}/${previous.message}`;
    let record=previous,existing=record?await this.findPublished(channel,record):null;
    if(!record){record=this.publication(i.guildId,{id,user:i.user.id,channel:channel.id,created:Date.now(),status:'sending',values:d.data.values,coverRef:d.data.coverRef});d.data.publicationId=id;}
    const embed=new EmbedBuilder().setColor(0xdf263c).setTitle(record.values.title).setURL(record.values.url)
      .setAuthor({name:member.displayName??member.user?.username??'Usuario de Discord'}).setImage('attachment://promocion.png').setFooter({text:receipt(id)});
    if(record.values.description)embed.setDescription(safe(record.values.description));
    const link=new ButtonBuilder().setLabel('Ver video').setStyle(ButtonStyle.Link).setURL(record.values.url);
    const message=existing??await channel.send({content:'@here',embeds:[embed],files:[{attachment:d.data.image,name:'promocion.png'}],components:[new ActionRowBuilder().addComponents(link)],
      allowedMentions:{parse:['everyone'],users:[],roles:[],repliedUser:false},nonce:id,enforceNonce:true});
    this.publication(i.guildId,{...record,status:'sent',message:message.id,sent:Date.now()});
    return `https://discord.com/channels/${i.guildId}/${channel.id}/${message.id}`;
  }
  async handle(i) {
    const [,action,id]=i.customId.split(':'),d=this.drafts.get(id,i.guildId,i.user.id);
    if(i.channelId!==d.data.origin)throw new UserError('Usa los controles en el canal donde abriste el formulario.');
    if(action==='cancel'&&i.isButton()&&d.step==='ready'&&!d.data.publicationId){this.drafts.remove(id);return i.update({content:'Promoción cancelada.',components:[],attachments:[],allowedMentions:noMentions});}
    if(action==='submit'&&i.isModalSubmit()){
      if(d.step!=='filters')throw new UserError('Este formulario ya se está procesando.');
      const values=promotionInput(i.fields),files=i.fields.getUploadedFiles('cover');
      if((files?.size??0)>1)throw new UserError('Adjunta una sola carátula.');
      d.step='rendering';await i.deferReply({flags:privateFlags});
      try{
        const member=await this.authorized(i);await this.destination(i.guild);d.data.values=values;
        if(files?.size)d.data.coverRef=await this.media.cards.upload(files.first());
        return await this.preview(i,d,member);
      }catch(e){this.drafts.remove(id);throw e;}
    }
    if(action!=='publish'||!i.isButton()||d.step!=='ready')throw new UserError('Esta vista previa ya no está disponible.');
    d.step='publishing';await i.deferUpdate();
    try{
      const link=await this.bot.queue(`promotion-publish:${i.guildId}`,async()=>{const member=await this.authorized(i);return this.publish(i,d,member);});
      this.drafts.remove(id);return i.editReply({content:`Promoción publicada en Promo: ${link}`,components:[],attachments:[],allowedMentions:noMentions});
    }catch(e){d.step='ready';await i.editReply({content:'No pude confirmar la publicación. Puedes reintentar: primero comprobaré si ya se envió para no repetir el aviso.',components:this.controls(d),allowedMentions:noMentions});throw e;}
  }
}
