import { ModalBuilder, LabelBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder, ButtonStyle, EmbedBuilder, ActionRowBuilder, ButtonBuilder } from 'discord.js';
import { classes, specializations, skillLabels } from './catalog.js';
import { card, row, button, textLabel, safe, noMentions } from './ui.js';
import { localDate, rsLabel, tournamentTimes, tournamentStatus, tournamentRegistrationModes } from './tournament-domain.js';

export const draftControl = (d, action) => `tour:d:${d.id}:${d.revision}:${action}`;
function select(id, label, choices, selected = [], optional = false, max = 1) {
  return new LabelBuilder().setLabel(label).setStringSelectMenuComponent(new StringSelectMenuBuilder().setCustomId(id)
    .setRequired(!optional).setMinValues(optional ? 0 : 1).setMaxValues(max)
    .setOptions(choices.map(c => ({ label: c.label ?? c, value: c.value ?? c, default: selected.includes(c.value ?? c) }))));
}
export function tournamentModal(d, step) {
  const v = d.data, r = v.rules ?? {}, modal = new ModalBuilder().setCustomId(draftControl(d, `save-${step}`));
  if (step === 'missing') {
    const p = v.people.find(p => !p.embarkId);
    if (!p) throw new Error('No hay un miembro pendiente de Embark ID');
    return modal.setTitle('Asociar Embark ID').addLabelComponents(
      textLabel('embarkId', `Embark ID de ${String(p.displayName ?? 'jugador').slice(0, 28)}`, '', true, 70, 'Jugador#1234'));
  }
  if (step === 'solo-id') return modal.setTitle('Tu Embark ID').addLabelComponents(
    textLabel('embarkId', 'Embark ID', '', true, 70, 'Jugador#1234'));
  if (step === 'rename') return modal.setTitle('Nombre del equipo').addLabelComponents(
    textLabel('teamName', 'Nuevo nombre del equipo', v.name, true, 70));
  if (step === 'basics') return modal.setTitle('01 · Torneo y calendario').addLabelComponents(
    textLabel('name', 'Nombre del torneo', v.name, true, 70),
    textLabel('date', 'Fecha de México centro (CDMX) · AAAA-MM-DD', v.date, true, 10),
    textLabel('time', 'Hora de México centro (CDMX) · HH:MM', v.time, true, 5),
    textLabel('capacity', 'Cupos en equipos · vacío = abierto', v.capacity, false, 4),
    select('access', 'Participantes', [{ label: 'Público · miembros de este servidor', value: 'public' }, { label: 'Solo clan VXTG · rol obligatorio', value: 'clan' }], [v.access ?? 'public']));
  if (step === 'rules') return modal.setTitle('02 · Inscripción y reglas').addLabelComponents(
    select('registrationMode', 'Modalidad de inscripción', tournamentRegistrationModes, [v.registrationMode ?? 'mixed']),
    textLabel('minRS', 'Piso RS por jugador · vacío = sin piso', r.minRS, false, 6),
    textLabel('maxRS', 'Techo RS por jugador · vacío = sin techo', r.maxRS, false, 6),
    select('allowedClasses', 'Clases permitidas · vacío = todas', classes, r.allowedClasses, true, 3),
    select('bannedClasses', 'Clases baneadas · vacío = ninguna', classes, r.bannedClasses, true, 3));
  if (step === 'skills') return modal.setTitle('03 · Especializaciones').addLabelComponents(
    select('allowedSkills', 'Permitidas · vacío = todas las válidas', specializations.map(s => ({ label: `${s.playerClass} · ${s.label}`, value: s.id })), r.allowedSkills, true, 12),
    select('bannedSkills', 'Baneadas · vacío = ninguna', specializations.map(s => ({ label: `${s.playerClass} · ${s.label}`, value: s.id })), r.bannedSkills, true, 12));
  if (step === 'identity') {
    return modal.setTitle('Inscribir equipo de tres').addLabelComponents(
      textLabel('teamName', 'Nombre del equipo', v.teamName, true, 70),
      new LabelBuilder().setLabel('Tus dos compañeros de Discord')
        .setUserSelectMenuComponent(new UserSelectMenuBuilder().setCustomId('teammates')
          .setRequired(true).setMinValues(2).setMaxValues(2).setPlaceholder('Busca a dos miembros del servidor')));
  }
  throw new Error('Unknown tournament modal');
}
export function rulesText(t) {
  const r = t.rules;
  return `**Fecha de referencia:** ${localDate(t.startsAt)} · México centro (CDMX)\n`
    + `**Cupos:** ${t.capacity == null ? 'Inscripción abierta' : `${t.capacity} equipos / ${t.capacity * 3} jugadores`}\n`
    + `**Acceso:** ${t.access === 'clan' ? 'VXTG · rol obligatorio para todos' : 'Público · miembros de este servidor'}\n`
    + `**Inscripciones:** ${t.registrationMode === 'solo' ? 'Solo individuales · los equipos se forman después' : 'Individuales o equipos de tres'}\n`
    + `**RS por jugador:** ${r.minRS == null && r.maxRS == null ? 'Sin requisito' : `${r.minRS ?? 0} a ${r.maxRS ?? 'sin techo'}`}\n`
    + `**Clases permitidas:** ${r.allowedClasses.join(', ') || 'Todas'}\n**Clases baneadas:** ${r.bannedClasses.join(', ') || 'Ninguna'}\n`
    + `**Especializaciones permitidas:** ${skillLabels(r.allowedSkills).join(', ') || 'Todas las de clases válidas'}\n`
    + `**Especializaciones baneadas:** ${skillLabels(r.bannedSkills).join(', ') || 'Ninguna'}\n`
    + `**Horarios por ciudad:**\n${tournamentTimes(t.startsAt).map(h => `${h.country} (${h.city}): ${h.time}${h.date ? ` · ${h.date}` : ''}`).join('\n')}`;
}
export function rosterText(people, mentions = true) {
  return people.map(p => `${mentions && p.user ? `<@${p.user}> · ` : ''}**${safe(p.embarkId)}** · ${rsLabel(p)}${p.playerClass ? `\n${p.playerClass}${p.specializationIds?.length ? ` · ${skillLabels(p.specializationIds).join(', ')}` : ''}` : ''}`).join('\n\n');
}
export function draftPanel(d, message = '') {
  if (d.kind === 'tournament-create' || d.kind === 'tournament-edit') {
    const complete = d.data.skillsDone;
    return card(d.kind === 'tournament-edit' ? '🏆 Editar torneo · panel privado' : '🏆 Crear torneo · panel privado', `${message}\n${d.data.startsAt ? `**${safe(d.data.name)}**\n${rulesText(d.data)}` : 'Completa el calendario y las reglas antes de publicar.'}`, [
      row(button(draftControl(d, 'basics'), '01 · Calendario'), button(draftControl(d, 'rules'), '02 · Inscripción y reglas', ButtonStyle.Secondary, !d.data.startsAt), button(draftControl(d, 'skills'), '03 · Especializaciones', ButtonStyle.Secondary, !d.data.rulesDone)),
      row(button(draftControl(d, 'publish'), d.kind === 'tournament-edit' ? 'Guardar cambios' : 'Publicar torneo', ButtonStyle.Success, !complete), button(draftControl(d, 'cancel'), 'Cancelar', ButtonStyle.Danger)),
    ]);
  }
  if (d.kind.startsWith('tournament-signup-') && d.data.mode === 'team') {
    const missing = d.data.people?.filter(p => !p.embarkId) ?? [];
    return card('Inscribir equipo · privado', `**${safe(d.data.teamName)}**\n${d.data.people.map(p => `<@${p.user}> · ${p.embarkId ? safe(p.embarkId) : '**Falta asociar Embark ID**'}`).join('\n')}\n\n${missing.length ? 'Asocia el Embark ID de los miembros sin perfil. Se guardará junto a su usuario de Discord para este torneo.' : 'Los tres integrantes están listos.'}`, [
      row(button(draftControl(d, 'missing'), 'Asociar siguiente Embark ID', ButtonStyle.Primary, !missing.length),
        button(draftControl(d, 'register'), 'Inscribir equipo', ButtonStyle.Success, !!missing.length)),
      row(button(draftControl(d, 'cancel'), 'Cancelar', ButtonStyle.Danger)),
    ]);
  }
  throw new Error('No hay un panel de torneo para este paso.');
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
  payload.embeds[0].addFields({ name: 'Cómo inscribirse', value: (t.registrationMode === 'solo'
    ? 'Inscripción individual con un clic si ya tienes perfil. Si no, solo indica tu Embark ID. Los equipos se forman después.'
    : 'Individual: un clic con perfil, o solo tu Embark ID. Equipo: escribe el nombre y busca a tus dos compañeros de Discord; el sistema pide Embark ID únicamente a quienes no tengan perfil.')
    + ' El líder del equipo inscrito es quien lo registra; en los equipos formados después lidera el mayor RS registrado.' });
  if (pending.length) payload.embeds[0].addFields({ name: 'Buscando equipo', value: pending.slice(0, 12).map(p => `${p.user ? `<@${p.user}>` : safe(p.embarkId)} · ${rsLabel(p)}`).join('\n') + (pending.length > 12 ? `\nY ${pending.length - 12} más…` : '') });
  const controls = [button(`tour:join:${t.id}:solo`, 'Inscribirme individualmente', ButtonStyle.Primary, t.status !== 'open')];
  if (t.registrationMode !== 'solo') controls.push(button(`tour:join:${t.id}:team`, 'Registrar equipo', ButtonStyle.Success, t.status !== 'open'));
  payload.components = [row(...controls)];
  return payload;
}
export function teamPayload(t, team, people, notify = true) {
  const known = people.filter(p => Number.isInteger(p.score));
  const average = known.length ? Math.round(known.reduce((n, p) => n + p.score, 0) / known.length) : null;
  const leader = team.leader ?? people.find(p => p.user)?.user;
  return { embeds: [new EmbedBuilder().setColor(0xed243b).setTitle(`⚡ ${team.name}`).setDescription(rosterText(people))
    .addFields({ name: 'Líder', value: leader ? `<@${leader}>` : 'Pendiente de vincular' },
      { name: 'Promedio RS registrado', value: average == null ? 'Pendiente' : `${known.length < people.length || people.some(p => p.approximate) ? '≈ ' : ''}${average.toLocaleString('es-MX')}` }, { name: 'Torneo', value: safe(t.name) })
    .setFooter({ text: `VEX LATAM · Equipo ${team.id}` })],
    content: notify ? people.filter(p => p.user).map(p => `<@${p.user}>`).join(' ') || undefined : undefined,
    components: t.status === 'finished' ? [] : [row(button(`tour:rename:${t.id}:${team.id}`, 'Cambiar nombre del equipo', ButtonStyle.Secondary))],
    allowedMentions: { ...noMentions, users: notify ? people.map(p => p.user).filter(Boolean) : [] } };
}
export function voiceLink(guild, channel, label = 'Entrar a voz') {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(`https://discord.com/channels/${guild}/${channel}`));
}
