import { ActionRowBuilder, ButtonStyle as B, StringSelectMenuBuilder, ModalBuilder, LabelBuilder, CheckboxGroupBuilder } from 'discord.js';
import { classes, classChoices, ALL_CLASSES, availableSkills, skillLabels, selectedClasses, classLabel } from './catalog.js';
import { card, row, button, textLabel, safe, playerCardLabel } from './ui.js';
import { rankFromRS } from './domain.js';
import { sponsorLabel, getSponsor } from './sponsors.js';

export const draftId = (d, action, value = '') => `draft:${d.id}:${d.revision}:${action}${value ? `:${value}` : ''}`;
const choices = d => new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
  .setCustomId(draftId(d, 'class')).setPlaceholder(d.kind === 'search' ? 'Marca una o varias clases' : 'Selecciona la clase')
  .setMinValues(1).setMaxValues(d.kind === 'search' ? 3 : 1)
  .setOptions((d.kind === 'search' ? classes : classChoices).map(label => ({ label, value: label,
    default: d.kind === 'search' ? selectedClasses(d.data).includes(label) : d.data.playerClass === label }))));
const selected = (label, yes) => `${yes ? '✓ ' : ''}${label}`;
export function profileDraftPayload(d) {
  const p = d.data;
  if (d.step === 'review') return card('03 · Revisa tu perfil', profileText(p), [
    row(button(draftId(d, 'save'), 'Guardar perfil', B.Success), button(draftId(d, 'back'), 'Cambiar clase / habilidades')),
    row(button(draftId(d, 'identity'), 'ID / RS / patrocinador / foto'), ...(p.cardImage ? [button(draftId(d, 'image-remove'), 'Quitar imagen')] : []), button(draftId(d, 'cancel'), 'Cancelar')),
  ], 'Al guardar, recibes Verificado, THE FINALS y tu patrocinador. Aceptas aparecer en sugerencias y en el top 10 por RS. Tu tarjeta o tu Embark ID se mostrará en equipos y clasificación.');
  return card('02 · Clase y especializaciones',
    `**Embark ID:** ${safe(p.embarkId)}\n**RS:** ${p.score} · **Rango:** ${safe(rankFromRS(p.score, p.leaderboardPosition))}\n\n`
    + `**Clase:** ${safe(p.playerClass)}\n**Selección:** ${skillLabels(p.specializationIds).map(safe).join(', ') || 'Todavía ninguna'}\n`
    + `**Patrocinador:** ${sponsorLabel(p.sponsorId)}\n`
    + `**Tarjeta:** ${p.cardImage ? 'Imagen adjunta' : 'Sin imagen · Usaremos tu Embark ID'}\n`
    + `${d.notice ? `\n${d.notice}\n` : ''}Elige tu clase y abre las casillas. Marca al menos una especialización.`, [choices(d),
      row(button(draftId(d, 'skills'), 'Elegir especializaciones', B.Primary), button(draftId(d, 'identity'), 'Identidad / patrocinador / foto'), button(draftId(d, 'cancel'), 'Cancelar')),
    ], `Borrador privado · Caduca <t:${Math.floor(d.expires / 1000)}:R>.`);
}
export function profileText(p) {
  return `**Embark ID:** ${safe(p.embarkId)}\n**Clase:** ${safe(p.playerClass)}\n`
    + `**Patrocinador:** ${sponsorLabel(p.sponsorId)}\n`
    + `**Especializaciones:** ${skillLabels(p.specializationIds).map(safe).join(', ') || 'Selección pendiente'}\n`
    + `**RS:** ${p.score ?? 'Pendiente'} · **Rango:** ${safe(p.rank ?? rankFromRS(p.score, p.leaderboardPosition))}\n`
    + `**Búsquedas:** ${p.searchable === false ? 'Pausadas' : 'Activas'}\n`
    + `**Tarjeta:** ${p.cardImage ? 'Imagen del jugador' : 'Sin imagen · Embark ID en los equipos'}\n`
    + (p.needsCompletion ? `\n⚠ ${getSponsor(p.sponsorId) ? 'Completa los datos de tu perfil para buscar por compatibilidad.' : 'Elige un patrocinador y completa tu perfil si quieres buscar por compatibilidad.'}${p.legacySpecialization ? ` Referencia anterior: ${safe(p.legacySpecialization)}.` : ''}\n` : '')
    + (p.rankSource === 'finalstracker' ? `\nRS de [FINALSTRACKER](https://finalstracker.net) · ${safe(p.season)}${p.leaderboardPosition ? ` · Puesto ${p.leaderboardPosition}` : ''}. Fuente comunitaria no oficial.\n` : '\nRS declarados por el jugador. Rango calculado automáticamente.\n')
    + 'La identidad del juego es declarada; no está verificada.';
}
export function profilePrivatePayload(p, notice = '') {
  const payload = card('Mi perfil · THE FINALS', `${notice ? `${notice}\n\n` : ''}${profileText(p)}`, [
    row(button('profile:edit', 'Editar perfil', B.Primary), button('profile:sync', 'Consultar clasificación')),
    row(button('profile:toggle', p.searchable ? 'Pausar búsquedas' : 'Activar búsquedas'), button('profile:delete', 'Eliminar perfil', B.Danger)),
    row(button('profile:image', p.cardImage ? 'Cambiar tarjeta' : 'Subir tarjeta'), ...(p.cardImage ? [button('profile:image-remove', 'Quitar tarjeta')] : [])),
  ], 'Consultar clasificación envía tu Embark ID a FINALSTRACKER, un servicio comunitario no oficial.');
  const sponsor = getSponsor(p.sponsorId);
  if (sponsor) payload.components[0].setAccentColor(Number.parseInt(sponsor.color.slice(1), 16));
  return payload;
}
export function playerCardModal(d) {
  return new ModalBuilder().setCustomId(draftId(d, 'photo-submit')).setTitle('Subir tarjeta del jugador')
    .addLabelComponents(playerCardLabel(false, Boolean(d.data.cardImage)));
}
export function skillsModal(d) {
  const groups = selectedClasses(d.kind === 'search' ? d.data : d.data.playerClass);
  const labels = groups.map(playerClass => {
    const checkbox = new CheckboxGroupBuilder().setCustomId(`skills-${playerClass}`)
      .setRequired(false).setMinValues(0).setMaxValues(4).setOptions(availableSkills(playerClass)
        .map(s => ({ label: s.label, value: s.id, default: d.data.specializationIds.includes(s.id) })));
    return new LabelBuilder().setLabel(playerClass)
      .setDescription(d.kind === 'profile' ? 'Marca al menos una especialización en total.' : 'Coincidir con cualquiera. Vacío = sin filtro.')
      .setCheckboxGroupComponent(checkbox);
  });
  return new ModalBuilder().setCustomId(draftId(d, 'skills-submit')).setTitle('Especializaciones · Marca varias')
    .addLabelComponents(...labels);
}
export function searchDraftPayload(d) {
  const f = d.data;
  const rows = [
    row(...['Ranked', 'Chill'].map(mode => button(draftId(d, 'mode', mode), selected(mode, f.mode === mode), f.mode === mode ? B.Primary : B.Secondary))),
    choices(d),
    row(button(draftId(d, 'skills'), 'Especializaciones'), button(draftId(d, 'description'), 'Mensaje opcional')),
    row(...[1, 2, 3, 4].map(n => button(draftId(d, 'count', String(n)), selected(String(n), f.teammates === n), f.teammates === n ? B.Primary : B.Secondary))),
  ];
  if (f.mode === 'Ranked') rows.push(
    row(button(draftId(d, 'min', '-2500'), 'Mín. −2500'), button(draftId(d, 'min', '2500'), 'Mín. +2500'),
      button(draftId(d, 'max', '-2500'), 'Máx. −2500'), button(draftId(d, 'max', '2500'), 'Máx. +2500')),
    row(button(draftId(d, 'range'), 'Escribir RS exactos')));
  rows.push(row(button(draftId(d, 'publish'), 'Publicar búsqueda', B.Success), button(draftId(d, 'cancel'), 'Cancelar')));
  return card('Diseña tu equipo', `**Modo:** ${f.mode}\n**Clases:** ${safe(classLabel(f))}\n`
    + `**Especializaciones:** ${skillLabels(f.specializationIds).map(safe).join(', ') || 'Cualquiera'}\n`
    + `**Compañeros:** ${f.teammates} · ${f.teammates + 1} jugadores contigo\n`
    + (f.mode === 'Ranked' ? `**RS:** ${f.minScore} – ${f.maxScore}\n` : '**RS:** sin filtro\n')
    + `**Mensaje:** ${safe(f.description) || 'Sin mensaje adicional'}${d.notice ? `\n\n${d.notice}` : ''}`, rows,
    `Las habilidades se comparan con **cualquiera** de las seleccionadas. Publicaremos en **#equipos**.\nBorrador privado · Caduca <t:${Math.floor(d.expires / 1000)}:R>.`);
}
export function rangeModal(d) {
  return new ModalBuilder().setCustomId(draftId(d, 'range-submit')).setTitle('Intervalo RS · Ranked').addLabelComponents(
    textLabel('minScore', 'RS mínimo · 0 a 999999', d.data.minScore, true, 6),
    textLabel('maxScore', 'RS máximo · 0 a 999999', d.data.maxScore, true, 6));
}
export function descriptionModal(d) {
  return new ModalBuilder().setCustomId(draftId(d, 'description-submit')).setTitle('Mensaje de la búsqueda')
    .addLabelComponents(textLabel('description', 'Mensaje opcional', d.data.description, false, 200, 'Ejemplo: Con micrófono · LATAM'));
}
export function teamPrivatePayload(s, user, notice = '') {
  const host = s.host === user, active = s.status === 'open' && s.expires > Date.now();
  return card(host ? 'Tu equipo · Organizador' : 'Tu equipo · Integrante',
    `${notice ? `${notice}\n\n` : ''}**${s.filters.mode}** · ${s.members.length}/${s.filters.teammates + 1} jugadores\n`
    + `**Estado:** ${active ? 'Abierto' : 'Terminado'}\n**Caduca:** <t:${Math.floor(s.expires / 1000)}:R>\n**Solicitud:** https://discord.com/channels/${s.guild}/${s.channel}/${s.message}`
    + (s.voiceChannel ? `\n**Sala de voz:** <#${s.voiceChannel}>` : ''), [
      row(button(`search:team:${s.id}`, 'Ver equipo'), ...(host ? [button(`search:candidates:${s.id}`, 'Ver compatibles', B.Secondary, !active),
        button(`search:close:${s.id}`, 'Cerrar búsqueda', B.Danger, !active)] : [button(`search:leave:${s.id}`, 'Salir', B.Secondary, !active)])),
      row(button(`search:voice:${s.id}`, s.voiceChannel ? 'Acceder a sala de voz' : host ? 'Crear sala de voz' : 'Sala pendiente del organizador',
        B.Primary, !s.voiceChannel && (!host || !active))),
    ], 'La sala es temporal y se elimina cuando queda vacía. Si estás conectado a otra sala de este servidor, el bot puede trasladarte. Si estás desconectado de voz, abre la sala y pulsa Conectarse en Discord.');
}
export function teamSelector(searches) {
  return card('Mis equipos', 'Selecciona un equipo para recuperar tus controles privados.', [
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('teams:select')
      .setPlaceholder('Elige tu equipo').setMinValues(1).setMaxValues(1).setOptions(searches.slice(0, 25).map(s => ({
        label: `${s.filters.mode} · ${s.members.length}/${s.filters.teammates + 1} · ${s.filters.description || 'Equipo'}`.slice(0, 100), value: s.id,
      })))),
  ]);
}
