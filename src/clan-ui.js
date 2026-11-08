import { EmbedBuilder, ModalBuilder, TextDisplayBuilder, LabelBuilder, TextInputBuilder, TextInputStyle, FileUploadBuilder, StringSelectMenuBuilder, ButtonStyle } from 'discord.js';
import { clanInfo, manualRankingText, clanRSWarning } from './clan-domain.js';
import { row, button, noMentions, safe } from './ui.js';

export const clanFooter = (kind,id) => `VEX LATAM · ${kind} · ${id}`;
export function rankingAdminPanel(settings,rankings){
  return {embeds:[new EmbedBuilder().setColor(0xf5f5f5).setTitle('Rankings de clanes · Editor del staff')
    .setDescription('Carga a los jugadores directamente: **no necesitan registrarse ni crear un perfil**.\n\n**1.** Pulsa Editar en el clan.\n**2.** Pega la lista completa, una persona por línea: `Jugador#1234 | 32000`. Puedes usar solo su nombre si no tienes el Embark ID.\n**3.** Revisa el resumen y confirma para publicar.\n\nPara cambiar RS, modifica el número. Para agregar o quitar un jugador, agrega o borra su línea. Hasta **50 jugadores por clan**. El rango y el orden se calculan por RS.')
    .addFields(...['vxtg','vxltm'].map(id=>({name:clanInfo(id).tag,value:`**${rankings[id]?.entries.length??0}** en la tabla · Lista v${rankings[id]?.revision??0}\n<#${settings[id].rankingChannel}>`,inline:true})),
      {name:'Gestión manual',value:'Guardar reemplaza la lista completa de ese clan. Revisa las bajas antes de confirmar. Los cambios de perfil y las aprobaciones no alteran esta lista. El total real de THE FINALS, las solicitudes y los roles se gestionan por separado.'})
    .setFooter({text:clanFooter('Administración','rankings')})],components:[row(button('clan:rank-edit:vxtg','Editar VXTG'),button('clan:rank-edit:vxltm','Editar VXLTM',ButtonStyle.Danger))],allowedMentions:noMentions};
}
export function rankingEditModal(d,entries){
  const input=new TextInputBuilder().setCustomId('players').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(4000).setPlaceholder('Jugador#1234 | 32000\nOtra persona | 25000');
  const value=manualRankingText(entries);if(value)input.setValue(value);
  return new ModalBuilder().setCustomId(`clan:rank-preview:${d.id}`).setTitle(`Ranking manual · ${clanInfo(d.data.clan).tag}`)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('Edita la **lista completa** (hasta 50). Una persona por línea: **Nombre o Embark ID | RS**. No requiere perfil.\nEliminar una línea retira al jugador de esta tabla. Se mostrará un resumen antes de guardar.'))
    .addLabelComponents(new LabelBuilder().setLabel('Jugadores y puntos RS').setTextInputComponent(input));
}
export function clanPanel(clan,settings,count){
  const c=clanInfo(clan), config=settings.clans?.[clan]??{};
  const open=clan==='vxltm';
  const embed=new EmbedBuilder().setColor(c.color).setTitle(`${open?'🌎':'🏆'} ${c.name}`).setDescription(`${c.description}\n\n**${c.tag} — ${c.motto}**`)
    .addFields({name:open?'Ingreso libre':'Antes de solicitar',value:open?'Pulsa **Unirme a VXLTM** para ingresar automáticamente en Discord. No necesitas perfil, captura ni cuestionario. Solo puedes pertenecer a un clan. El staff coordinará contigo la entrada en THE FINALS.':`Completa tu perfil en ${settings.panels?.registro?.channel?`<#${settings.panels.registro.channel}>`:'#configurar-perfil'}, responde el cuestionario y adjunta una captura de tu Embark ID y RS. Se recomiendan 20,000 RS; con menos también puedes solicitar. Solo puedes pertenecer a un clan.`},
      {name:'Miembros',value:`**THE FINALS:** ${config.gameCount??'sin registrar'} · **Registrados por el bot:** ${count}`}).setFooter({text:clanFooter('Ingreso',clan)});
  return {embeds:[embed],components:[row(button(`clan:apply:${clan}`,open?'Unirme a VXLTM':'Solicitar ingreso'),...(open?[]:[button(`clan:status:${clan}`,'Mi solicitud'),button('profile:edit','Crear / completar perfil'),button('profile:rs','Actualizar RS')]))],allowedMentions:noMentions};
}
export function clanModal(d,profile){
  const warning=clanRSWarning(profile,d.data.clan);
  const label=(id,title,max,required)=>new LabelBuilder().setLabel(title).setTextInputComponent(new TextInputBuilder().setCustomId(id).setStyle(TextInputStyle.Paragraph).setMaxLength(max).setRequired(required));
  return new ModalBuilder().setCustomId(`clan:submit:${d.id}`).setTitle(`Solicitud a ${clanInfo(d.data.clan).tag}`)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Datos guardados de tu perfil**\nEmbark ID: **${safe(profile.embarkId)}**\nRS actual: **${profile.score.toLocaleString('es-MX')}** · ${safe(profile.rank)}\nRécord registrado: **${(profile.peakScore??profile.score).toLocaleString('es-MX')} RS**\n${warning?`\n**Advertencia de RS**\n${warning}\n`:''}\nSi tus puntos cambiaron, cancela y pulsa **Actualizar RS** antes de solicitar. El staff revisará la captura. La solicitud y la evidencia son privadas.`))
    .addLabelComponents(label('experience','¿Cuánto tiempo llevas jugando competitivo?',200,true),label('highestRank','¿Cuál fue tu mayor rango?',150,true),
      new LabelBuilder().setLabel('¿Representarías a VEX en THE FINALS?').setStringSelectMenuComponent(new StringSelectMenuBuilder().setCustomId('represent').setRequired(true).addOptions({label:'Sí',value:'si'},{label:'¡Sí!',value:'si_claro'})),
      new LabelBuilder().setLabel('Captura de tu Embark ID y RS · Obligatoria').setDescription('PNG, JPG o WebP. Máximo 8 MB. Tu evidencia solo la ve el equipo administrador.')
        .setFileUploadComponent(new FileUploadBuilder({file_types:['.png','.jpg','.jpeg','.webp']}).setCustomId('evidence').setRequired(true).setMinValues(1).setMaxValues(1)));
}
export function applicationPayload(a){
  const c=clanInfo(a.clan),warning=clanRSWarning(a.profile,a.clan),status={pending:'Pendiente',approved:'Aprobado',rejected:'Rechazado',cancelled:'Cancelado'}[a.status];
  const embed=new EmbedBuilder().setColor(c.color).setTitle(`${c.tag} · Solicitud ${status}`)
    .setDescription(`**Solicitante:** <@${a.user}> · ID: ${a.user}\n**Embark ID:** ${safe(a.profile.embarkId)}\n**RS actual al solicitar:** ${a.profile.score.toLocaleString('es-MX')} · **${safe(a.profile.rank)}**\n**Récord al solicitar:** ${a.profile.peakScore==null?'No registrado en esta solicitud':a.profile.peakScore.toLocaleString('es-MX')+' RS'}\nLa recomendación y la prioridad usan el RS actual.`)
    .addFields({name:'Tiempo en competitivo',value:safe(a.experience||a.availability||'No indicado.')},{name:'Mayor rango',value:safe(a.highestRank||'No indicado.')},{name:'Representar a VEX',value:a.represent?'Sí':'No indicado'},{name:'Motivación',value:safe(a.motivation||'No añadió comentario.')},
      {name:'Estado',value:`**${status}**${a.actor?` · <@${a.actor}>`:''}${a.roleAssigned?'\nRol de clan asignado.':''}${a.dmStatus==='sent'?'\nConfirmación enviada por mensaje privado.':a.dmStatus==='blocked'?'\nNo se pudo enviar el mensaje privado; puede consultar Mi solicitud.':''}`})
    .setImage('attachment://evidencia-clan.png').setFooter({text:clanFooter('Solicitud',a.id)}).setTimestamp(a.created);
  if(warning)embed.addFields({name:'⚠️ RS por debajo de la recomendación',value:`${a.profile.score.toLocaleString('es-MX')} RS actuales frente a ${c.recommendedRS.toLocaleString('es-MX')} recomendados. **No bloquea el ingreso.** Revisa la evidencia y decide si lo apruebas.`});
  return {embeds:[embed],attachments:[],components:[row(button(`clan:approve:${a.id}`,a.status==='approved'?'Aprobado':warning?'Aprobar con RS bajo':'Aprobar ingreso',ButtonStyle.Success,a.status!=='pending'),button(`clan:reject:${a.id}`,'Rechazar',ButtonStyle.Danger,a.status!=='pending'))],allowedMentions:noMentions};
}
