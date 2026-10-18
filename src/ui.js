import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, EmbedBuilder,
  LabelBuilder, ModalBuilder, TextDisplayBuilder, StringSelectMenuBuilder,
  TextInputBuilder, TextInputStyle, MessageFlags, escapeMarkdown, MediaGalleryBuilder, MediaGalleryItemBuilder, FileUploadBuilder,
} from 'discord.js';
import { skillLabels, classLabel } from './catalog.js';
import { rolesPayload, rulesPayload, SQUAD_NAME } from './community-ui.js';
import { sponsors, getSponsor, sponsorLabel } from './sponsors.js';

export const safe = value => escapeMarkdown(String(value ?? ''));
export const privateFlags = MessageFlags.Ephemeral;
export const noMentions = { parse: [], users: [], roles: [], repliedUser: false };
export const button = (id, label, style = ButtonStyle.Secondary, disabled = false) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
export const row = (...buttons) => new ActionRowBuilder().addComponents(...buttons);
const display = content => new TextDisplayBuilder().setContent(content);

export function card(title, body, rows = [], extra = '') {
  const container = new ContainerBuilder().setAccentColor(0xed243b)
    .addTextDisplayComponents(display(`## ${title}\n${body}${extra ? `\n\n${extra}` : ''}`));
  for (const r of rows) container.addActionRowComponents(r);
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: noMentions };
}

export function panelPayload(type, settings) {
  if (type === 'registro') return card('🎮 Tu perfil · THE FINALS',
    '**01 · Embark ID, RS y patrocinador → 02 · Clase y especializaciones → 03 · Guardar**\n'
    + 'El rango se calcula automáticamente. El asistente y tu ficha son privados.\n'
    + 'El perfil es opcional para acceder al servidor y crear equipos HOT. Regístralo para mostrar tus datos y usar búsquedas con filtros.\n'
    + 'La foto es opcional. Tu tarjeta, Embark ID y RS podrán aparecer en equipos y en el **top 10 de la comunidad**. Al guardar recibes **Verificado**, **THE FINALS** y el rol de tu patrocinador, y aceptas aparecer en sugerencias.', [
      row(button('profile:edit', 'Completar / editar perfil', ButtonStyle.Primary), button('profile:view', 'Ver mi perfil')),
      row(button('private:clear', 'Limpiar mis mensajes')),
    ], 'La consulta de clasificación envía tu Embark ID a [FINALSTRACKER](https://finalstracker.net), un servicio comunitario no oficial. No consulta habilidades ni verifica que la cuenta te pertenezca.');
  if (type === 'buscar') return card(`🏆 ${SQUAD_NAME} · THE FINALS`,
    '**Ranked** · Filtra por puntos RS, clase y especializaciones.\n**Chill** · Encuentra compañía sin filtro de RS.\n'
    + `Las solicitudes se publican en ${settings.teamsChannel ? `<#${settings.teamsChannel}>` : '**#equipos**'}.\n`
    + 'Necesitas un perfil completo y activo. Recupera los controles privados con **Mis equipos**. El organizador puede crear una sala de voz temporal y los integrantes entrar desde ese panel.', [
      row(button('search:create', 'Buscar compañeros', ButtonStyle.Success), button('search:mine', 'Mis equipos')),
      row(button('private:clear', 'Limpiar mis mensajes')),
    ]);
  if (type === 'roles') {
    return rolesPayload(settings);
  }
  return rulesPayload(settings);
}

export function textLabel(id, label, value = '', required = true, max = 100, placeholder = '') {
  const input = new TextInputBuilder().setCustomId(id).setStyle(TextInputStyle.Short)
    .setRequired(required).setMaxLength(max);
  if (value !== '' && value != null) input.setValue(String(value));
  if (placeholder) input.setPlaceholder(placeholder);
  return new LabelBuilder().setLabel(label).setTextInputComponent(input);
}
export function profileModal(profile, customId = 'profile:save') {
  return new ModalBuilder().setCustomId(customId).setTitle('01 · Identidad y patrocinador').addLabelComponents(
    textLabel('embarkId', 'Embark ID', profile?.embarkId, true, 70, 'Jugador#1234'),
    textLabel('score', 'Puntos RS · Obligatorio', profile?.score, true, 6, 'Ejemplo: 25000'),
    new LabelBuilder().setLabel('Patrocinador · Obligatorio').setDescription('Elige el diseño de tu ficha y tu rol. Puedes cambiarlo al editar el perfil.')
      .setStringSelectMenuComponent(new StringSelectMenuBuilder().setCustomId('sponsor').setRequired(true)
        .setMinValues(1).setMaxValues(1).setPlaceholder('Elige tu patrocinador')
        .setOptions(sponsors.map(s => ({ label: s.label, value: s.id, default: profile?.sponsorId === s.id })))),
    playerCardLabel(false, Boolean(profile?.cardImage)),
  );
}
export function playerCardLabel(required = false, existing = false) {
  return new LabelBuilder().setLabel(required ? 'Tarjeta del juego' : 'Tarjeta del juego · Imagen opcional')
    .setDescription(`PNG, JPG o WebP · Máx. 8 MB. Se mostrará en tus equipos.${!required ? existing ? ' Vacío conserva tu tarjeta actual.' : ' Sin foto usaremos tu Embark ID.' : ''}`)
    .setFileUploadComponent(new FileUploadBuilder({ file_types: ['.png', '.jpg', '.jpeg', '.webp'] })
      .setCustomId('cardImage').setRequired(required).setMinValues(required ? 1 : 0).setMaxValues(1));
}
export function publishModal(type, channelId, rules = '') {
  const body = new TextInputBuilder().setCustomId('body').setStyle(TextInputStyle.Paragraph)
    .setRequired(true).setMaxLength(3000).setPlaceholder('Escribe el mensaje. Se publicará en el canal elegido.');
  if (rules) body.setValue(rules);
  return new ModalBuilder().setCustomId(`publish:${type}:${channelId}`).setTitle(type === 'reglas' ? 'Reglas del servidor' : 'Publicar anuncio')
    .addLabelComponents(textLabel('title', 'Título', type === 'reglas' ? 'Reglas del servidor' : '', true, 120),
      new LabelBuilder().setLabel('Contenido').setTextInputComponent(body));
}

export function profileEmbed(profile, includeIdentity = true) {
  const source = profile.rankSource === 'finalstracker'
    ? `FINALSTRACKER · ${safe(profile.season)} · <t:${Math.floor(profile.rankUpdatedAt / 1000)}:R>`
    : 'Datos declarados por el jugador';
  const embed = new EmbedBuilder().setColor(0xed243b).setTitle('Perfil · THE FINALS')
    .addFields(
      { name: 'Clase', value: safe(profile.playerClass), inline: true },
      { name: 'Patrocinador', value: sponsorLabel(profile.sponsorId), inline: true },
      { name: 'Especializaciones', value: skillLabels(profile.specializationIds).map(safe).join('\n') || 'Completa tu selección', inline: true },
      { name: 'Rango', value: safe(profile.rank), inline: true },
      { name: 'Puntos RS', value: profile.score == null ? 'Sin registrar' : String(profile.score), inline: true },
      { name: 'Búsquedas', value: profile.searchable ? 'Activo' : 'Pausado', inline: true },
      { name: 'Origen de rango y RS', value: source },
    );
  if (includeIdentity) embed.setDescription(`Embark ID: **${safe(profile.embarkId)}**\nLa identidad del juego es declarada; no está verificada.`);
  if (profile.rankSource === 'finalstracker') embed.addFields({ name: 'Fuente no oficial', value: '[FINALSTRACKER](https://finalstracker.net)' });
  return embed;
}

export function searchPayload(s, roleId = null, notify = false) {
  const active = s.status === 'open' && s.expires > Date.now();
  const full = s.members.length >= s.filters.teammates + 1;
  const f = s.filters;
  if (f.mode === 'HOT') {
    const container = new ContainerBuilder().setAccentColor(0xed243b)
      .addTextDisplayComponents(display(roleId ? `<@&${roleId}>` : 'THE FINALS'))
      .addActionRowComponents(row(button(`search:join:${s.id}`, 'Unirme', ButtonStyle.Success, !active || full),
        button(`search:controls:${s.id}`, 'Mi equipo')))
      .addActionRowComponents(row(button(`search:voice:${s.id}`, s.voiceChannel ? 'Acceder a sala de voz' : 'Crear sala de voz', ButtonStyle.Primary, !active && !s.voiceChannel),
        button(`search:close:${s.id}`, 'Cerrar búsqueda', ButtonStyle.Danger, !active)));
    const sponsor = getSponsor(s.sponsorId);
    if (sponsor) container.setAccentColor(Number.parseInt(sponsor.color.slice(1), 16));
    return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: noMentions };
  }
  const filters = [classLabel(f), `Especializaciones: ${skillLabels(f.specializationIds).map(safe).join(', ') || safe(f.legacySpecialization) || 'cualquiera'}`,
    f.legacyRank ? `Rango anterior: ${safe(f.legacyRank)}` : '', f.mode === 'Chill' ? 'RS: sin filtro' : `RS: ${f.minScore ?? 0}–${f.maxScore ?? 999999}`].filter(Boolean).join('\n');
  const status = active ? (full ? 'Equipo completo' : 'Buscando jugadores') : s.status === 'expired' ? 'Caducada' : 'Cerrada';
  const payload = card(`🎮 ${SQUAD_NAME} · ${status} · ${f.mode ?? 'Ranked'}`, `${safe(f.description)}\n\n**Organiza:** <@${s.host}>\n**Filtros:** ${filters}\n`
    + `**Patrocinador del equipo:** ${sponsorLabel(s.sponsorId)}\n`
    + `**Equipo (${s.members.length}/${f.teammates + 1}):** ${s.members.map((id, index) => `<@${id}>${s.membersDisplay?.[index]?.embarkId ? ` · ${safe(s.membersDisplay[index].embarkId)}` : ''}`).join(', ') || 'Sin integrantes'}\n`
    + `**Termina:** <t:${Math.floor(s.expires / 1000)}:R>${roleId ? `\n\n<@&${roleId}>` : ''}`, [
      row(button(`search:join:${s.id}`, 'Unirme', ButtonStyle.Success, !active || full)),
    ], 'Al unirte, tu tarjeta de jugador o tu Embark ID aparecerá en la ficha pública. Recupera tus controles privados con **Mis equipos**.');
  if (roleId && notify) payload.allowedMentions = { ...noMentions, roles: [roleId] };
  const sponsor = getSponsor(s.sponsorId);
  if (sponsor) payload.components[0].setAccentColor(Number.parseInt(sponsor.color.slice(1), 16));
  return payload;
}

export async function withImage(payload, renderer, kind, data) {
  // Sustituir las adjuntas evita conservar imágenes antiguas al editar un mensaje.
  payload.attachments = [];
  if (!renderer) return payload;
  try {
    const buffer = await renderer.render(kind, data);
    const name = `vex-${kind}.png`;
    const gallery = new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder()
      .setURL(`attachment://${name}`).setDescription(data.filters?.mode === 'HOT'
        ? `Búsqueda HOT · ${data.members.length}/${data.filters.teammates + 1} jugadores · RS del organizador: ${data.hostScore ?? 'sin registrar'} · ${data.status === 'open' && data.expires > Date.now() ? 'Activa' : 'Terminada'}.`
        : kind === 'profile' ? 'Ficha de jugador. Los datos también están escritos en el mensaje.' : 'Tarjeta THE FINALS. Los datos también están escritos en el mensaje.'));
    payload.components.unshift(gallery);
    payload.files = [{ attachment: buffer, name }];
  } catch {
    // Las acciones y el texto siguen disponibles aunque no exista un navegador.
    if (!renderer.warned) { console.error('Fichas: imagen no disponible; usando tarjeta nativa.'); renderer.warned = true; }
  }
  return payload;
}

export async function deliverCard(deliver, payload) {
  try { return await deliver(payload); }
  catch (error) {
    if (!payload.files?.length || ![50013, 50035].includes(error.code)) throw error;
    const fallback = { ...payload, files: [], attachments: [], components: payload.components.filter(c => (c.data?.type ?? c.type) !== 12) };
    console.error('Fichas: Discord rechazó la imagen; enviando controles nativos. Revisa Adjuntar archivos.');
    return deliver(fallback);
  }
}
