import { ModalBuilder, LabelBuilder, StringSelectMenuBuilder, ButtonStyle, EmbedBuilder, ActionRowBuilder, ButtonBuilder } from 'discord.js';
import { classes, specializations, skillLabels } from './catalog.js';
import { card, row, button, textLabel, safe, noMentions } from './ui.js';
import { localDate, rsLabel, tournamentTimes, tournamentStatus } from './tournament-domain.js';

export const draftControl = (d, action) => `tour:d:${d.id}:${d.revision}:${action}`;
function select(id, label, choices, selected = [], optional = false, max = 1) {
  return new LabelBuilder().setLabel(label).setStringSelectMenuComponent(new StringSelectMenuBuilder().setCustomId(id)
    .setRequired(!optional).setMinValues(optional ? 0 : 1).setMaxValues(max)
    .setOptions(choices.map(c => ({ label: c.label ?? c, value: c.value ?? c, default: selected.includes(c.value ?? c) }))));
}
export function tournamentModal(d, step) {
  const v = d.data, r = v.rules ?? {}, modal = new ModalBuilder().setCustomId(draftControl(d, `save-${step}`));
  if (step === 'basics') return modal.setTitle('01 · Torneo y calendario').addLabelComponents(
    textLabel('name', 'Nombre del torneo', v.name, true, 70),
    textLabel('date', 'Fecha de México centro (CDMX) · AAAA-MM-DD', v.date, true, 10),
    textLabel('time', 'Hora de México centro (CDMX) · HH:MM', v.time, true, 5),
    textLabel('capacity', 'Cupos en equipos · vacío = abierto', v.capacity, false, 4),
    select('access', 'Participantes', [{ label: 'Público · miembros de este servidor', value: 'public' }, { label: 'Solo clan VXTG · perfil y rol obligatorios', value: 'clan' }], [v.access ?? 'public']));
  if (step === 'rules') return modal.setTitle('02 · RS y clases').addLabelComponents(
    textLabel('minRS', 'Piso RS por jugador · vacío = sin piso', r.minRS, false, 6),
    textLabel('maxRS', 'Techo RS por jugador · vacío = sin techo', r.maxRS, false, 6),
    select('allowedClasses', 'Clases permitidas · vacío = todas', classes, r.allowedClasses, true, 3),
    select('bannedClasses', 'Clases baneadas · vacío = ninguna', classes, r.bannedClasses, true, 3));
  if (step === 'skills') return modal.setTitle('03 · Especializaciones').addLabelComponents(
    select('allowedSkills', 'Permitidas · vacío = todas las válidas', specializations.map(s => ({ label: `${s.playerClass} · ${s.label}`, value: s.id })), r.allowedSkills, true, 12),
    select('bannedSkills', 'Baneadas · vacío = ninguna', specializations.map(s => ({ label: `${s.playerClass} · ${s.label}`, value: s.id })), r.bannedSkills, true, 12));
  if (step === 'identity') {
    modal.setTitle(v.mode === 'solo' ? 'Inscripción individual' : 'Inscribir equipo de tres');
    if (v.mode === 'team') modal.addLabelComponents(textLabel('teamName', 'Nombre del equipo', v.teamName, true, 70));
    for (let n = 0; n < (v.mode === 'solo' ? 1 : 3); n++) modal.addLabelComponents(textLabel(`id${n}`, `Embark ID ${n + 1}`, v.people?.[n]?.embarkId, true, 70, 'Jugador#1234'));
    return modal;
  }
  if (step === 'player') {
    const p = v.people[v.index];
    return modal.setTitle(`Jugador ${v.index + 1} · RS y selección`).addLabelComponents(
      textLabel('score', 'RS · revisa el valor importado del perfil', p.score, true, 6),
      select('approximate', 'Exactitud del RS declarado', [{ label: 'Exacto', value: 'exact' }, { label: 'Aproximado', value: 'approximate' }], [p.approximate ? 'approximate' : 'exact']),
      select('playerClass', 'Clase para este torneo', classes, [p.playerClass]),
      select('specializationIds', 'Especializaciones de la clase seleccionada', specializations.map(s => ({ label: `${s.playerClass} · ${s.label}`, value: s.id })), p.specializationIds ?? [], false, 12));
  }
  throw new Error('Unknown tournament modal');
}
export function rulesText(t) {
  const r = t.rules;
  return `**Fecha de referencia:** ${localDate(t.startsAt)} · México centro (CDMX)\n`
    + `**Cupos:** ${t.capacity == null ? 'Inscripción abierta' : `${t.capacity} equipos / ${t.capacity * 3} jugadores`}\n`
    + `**Acceso:** ${t.access === 'clan' ? 'VXTG · perfil y rol obligatorios para todos' : 'Público · miembros de este servidor'}\n`
    + `**RS por jugador:** ${r.minRS == null && r.maxRS == null ? 'Sin requisito' : `${r.minRS ?? 0} a ${r.maxRS ?? 'sin techo'}`}\n`
    + `**Clases permitidas:** ${r.allowedClasses.join(', ') || 'Todas'}\n**Clases baneadas:** ${r.bannedClasses.join(', ') || 'Ninguna'}\n`
    + `**Especializaciones permitidas:** ${skillLabels(r.allowedSkills).join(', ') || 'Todas las de clases válidas'}\n`
    + `**Especializaciones baneadas:** ${skillLabels(r.bannedSkills).join(', ') || 'Ninguna'}\n`
    + `**Horarios por ciudad:**\n${tournamentTimes(t.startsAt).map(h => `${h.country} (${h.city}): ${h.time}${h.date ? ` · ${h.date}` : ''}`).join('\n')}`;
}
export function rosterText(people, mentions = true) {
  return people.map(p => `${mentions && p.user ? `<@${p.user}> · ` : ''}**${safe(p.embarkId)}** · ${rsLabel(p)}\n${p.playerClass} · ${skillLabels(p.specializationIds).join(', ')}`).join('\n\n');
}
export function draftPanel(d, message = '') {
  if (d.kind === 'tournament-create') {
    const complete = d.data.skillsDone;
    return card('🏆 Crear torneo · panel privado', `${message}\n${d.data.startsAt ? `**${safe(d.data.name)}**\n${rulesText(d.data)}` : 'Completa el calendario y las reglas antes de publicar.'}`, [
      row(button(draftControl(d, 'basics'), '01 · Calendario'), button(draftControl(d, 'rules'), '02 · RS y clases', ButtonStyle.Secondary, !d.data.startsAt), button(draftControl(d, 'skills'), '03 · Especializaciones', ButtonStyle.Secondary, !d.data.rulesDone)),
      row(button(draftControl(d, 'publish'), 'Publicar torneo', ButtonStyle.Success, !complete), button(draftControl(d, 'cancel'), 'Cancelar', ButtonStyle.Danger)),
    ]);
  }
  const v = d.data, complete = v.people?.every(p => p.confirmed);
  return card(v.mode === 'solo' ? 'Inscripción individual · privada' : 'Inscribir equipo · privado', `${message}\n${v.people?.length ? rosterText(v.people.filter(p => Number.isInteger(p.score)), false) : 'Escribe los Embark ID. Buscaremos perfiles coincidentes en este servidor.'}\n${complete ? 'Confirma para ocupar los cupos. Los datos aparecerán en las tarjetas del torneo.' : `Revisa RS, clase y especializaciones de cada jugador. Jugador actual: ${(v.index ?? 0) + 1}.`}`, [
    row(button(draftControl(d, 'identity'), 'Editar identidad'), button(draftControl(d, 'player'), 'Revisar siguiente jugador', ButtonStyle.Primary, !v.people?.length || complete)),
    row(button(draftControl(d, 'register'), 'Confirmar inscripción', ButtonStyle.Success, !complete), button(draftControl(d, 'cancel'), 'Cancelar', ButtonStyle.Danger)),
  ]);
}
export function tournamentPayload(t, entries = [], teams = []) {
  const pending = entries.filter(p => !p.team), isOpen = t.status === 'open';
  const payload = { embeds: [new EmbedBuilder().setColor(isOpen ? 0xed243b : 0x686b77).setTitle(`🏆 ${t.name}`)
    .setDescription(rulesText(t)).addFields({ name: 'Estado', value: tournamentStatus(t) },
      { name: 'Inicio en tu horario local', value: `<t:${Math.floor(t.startsAt / 1000)}:F>` },
      { name: 'Participación', value: `${entries.length} jugadores · ${teams.length} equipos · ${pending.length} esperando equipo` },
      { name: 'Canales', value: t.channelsDeletedAt ? 'Canales temporales eliminados.' : [t.registrationChannel, t.teamsChannel].filter(Boolean).map(id => `<#${id}>`).join(' · ') || 'Se crearán al publicar.' })
    .setFooter({ text: `VEX LATAM SYSTEM · Torneo ${t.id}` })], allowedMentions: noMentions };
  if (t.deleteAt && !t.channelsDeletedAt) payload.embeds[0].addFields({ name: 'Eliminación automática de canales', value: `<t:${Math.floor(t.deleteAt / 1000)}:F> · <t:${Math.floor(t.deleteAt / 1000)}:R>\n7 días desde el fin del torneo. Referencia: ${localDate(t.deleteAt)} · CDMX.` });
  return payload;
}
export function registrationPayload(t, entries, teams) {
  const payload = tournamentPayload(t, entries, teams), pending = entries.filter(p => !p.team);
  payload.embeds[0].addFields({ name: 'Cómo inscribirse', value: 'Solo: deja tu Embark ID y RS para encontrar equipo. Equipo: registra tres Embark ID. RS aproximados se marcan con ≈. Un perfil coincidente permite menciones y acceso individual a voz.' });
  if (pending.length) payload.embeds[0].addFields({ name: 'Buscando equipo', value: pending.slice(0, 12).map(p => `${p.user ? `<@${p.user}>` : safe(p.embarkId)} · ${rsLabel(p)}`).join('\n') + (pending.length > 12 ? `\nY ${pending.length - 12} más…` : '') });
  payload.components = [row(button(`tour:join:${t.id}:solo`, 'Inscribirme individualmente', ButtonStyle.Primary, t.status !== 'open'), button(`tour:join:${t.id}:team`, 'Registrar equipo', ButtonStyle.Success, t.status !== 'open'))];
  return payload;
}
export function teamPayload(t, team, people, notify = true) {
  const average = Math.round(people.reduce((n, p) => n + p.score, 0) / people.length);
  return { embeds: [new EmbedBuilder().setColor(0xed243b).setTitle(`⚡ ${team.name}`).setDescription(rosterText(people))
    .addFields({ name: 'Promedio RS', value: `${people.some(p => p.approximate) ? '≈ ' : ''}${average.toLocaleString('es-MX')}` }, { name: 'Torneo', value: safe(t.name) })
    .setFooter({ text: `VEX LATAM · Equipo ${team.id}` })],
    content: notify ? people.filter(p => p.user).map(p => `<@${p.user}>`).join(' ') || undefined : undefined,
    allowedMentions: { ...noMentions, users: notify ? people.map(p => p.user).filter(Boolean) : [] } };
}
export function voiceLink(guild, channel, label = 'Entrar a voz') {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(`https://discord.com/channels/${guild}/${channel}`));
}
