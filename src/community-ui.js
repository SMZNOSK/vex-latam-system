import { EmbedBuilder, LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { UserError } from './domain.js';
import { noMentions, safe, textLabel } from './ui.js';

export const SYSTEM_NAME = 'VEX LATAM SYSTEM';
export const SQUAD_NAME = 'VLS Find Squad';
export const defaultRoleEmbed = {
  title: '🎭 Auto roles · Juegos | VEX LATAM', color: '#ed243b', image: '', fields: [],
  description: 'Reacciona con los emojis de los juegos que juegas. Puedes elegir varios. Quita tu reacción para retirar el rol.',
};
export const defaultRules = {
  title: '📜 Reglamento general · VEX LATAM SQUAD', color: '#ed243b', image: '',
  description: '❤️ Usa el sentido común, respeta a los demás y disfruta la comunidad.',
  fields: [
    { name: '1 · Respeto', value: 'Respeta a todos. La carrilla entre amigos con confianza está permitida mientras no se pase de los límites. No insultes ni trates mal a personas que no lleven ese tipo de bromas. Los nuevos también merecen respeto.' },
    { name: '2 · Torneos', value: 'Mantén el respeto y el juego limpio durante torneos y eventos. No provoques, insultes ni generes conflictos.' },
    { name: '3 · Contenido prohibido', value: 'No se permite pornografía, gore, contenido ilegal, peligroso ni enlaces maliciosos.' },
    { name: '4 · Spam / flood', value: 'No hagas spam ni abuses de menciones, mensajes, imágenes, stickers o emojis.' },
    { name: '5 · Discords externos', value: 'No compartas, promociones ni invites a servidores de Discord externos sin autorización de los administradores.' },
    { name: '6 · Publicidad', value: 'No publiques publicidad ni promociones externas sin permiso del staff.' },
    { name: '7 · Canales de voz', value: 'No grites, molestes repetidamente, interrumpas ni uses sonidos para incomodar a otros.' },
    { name: '8 · Privacidad', value: 'No compartas información personal, fotos ni conversaciones privadas de otros sin autorización.' },
    { name: '9 · Staff', value: 'Respeta a administradores y moderadores. Si no estás de acuerdo con una decisión, solicita una revisión con respeto.' },
    { name: '10 · Sanciones', value: 'El staff podrá aplicar advertencias, silencios, restricciones y expulsiones temporales o permanentes según la gravedad.' },
  ],
};
export const defaultWelcome = {
  title: '👋 ¡Bienvenid@ a VEX LATAM SQUAD!', color: '#ed243b', image: '',
  description: '¡Qué onda, {usuario}! Nos da gusto tenerte por aquí. Aquí jugamos, convivimos y encontramos nuevos compañeros.',
  fields: [
    { name: '🎮 Juegos de la comunidad', value: '🔺 THE FINALS · Nuestro juego principal.\n🪖 HELLDIVERS 2 · Forma tu escuadra y entra a la acción.\n🤖 ARC RAIDERS · Encuentra compañeros y disfruta tus partidas.' },
    { name: '🤝 ¿Qué encontrarás aquí?', value: 'Gente para jugar · Nuevos compañeros · Squads · Torneos y eventos · Comunidad LATAM' },
    { name: '🚀 Empieza aquí', value: '📜 Lee las reglas: {reglas}\n🎭 Elige tus juegos: {roles}\n🏆 Encuentra equipo con VLS Find Squad: {buscar}' },
  ],
};

export function validateEmbed(input) {
  const value = { title: String(input.title ?? '').trim(), description: String(input.description ?? '').trim(),
    color: String(input.color || '#ed243b').trim(), image: String(input.image ?? '').trim(),
    fields: (input.fields ?? []).map(f => ({ name: String(f.name ?? '').trim(), value: String(f.value ?? '').trim(), inline: Boolean(f.inline) })) };
  if (!value.title || value.title.length > 256) throw new UserError('El título debe tener entre 1 y 256 caracteres.');
  if (value.description.length > 4096) throw new UserError('La descripción admite hasta 4096 caracteres.');
  if (!/^#[0-9a-f]{6}$/i.test(value.color)) throw new UserError('Usa un color hexadecimal como #ed243b.');
  if (value.image) {
    let url;
    try { url = new URL(value.image); } catch { throw new UserError('La imagen debe ser una URL HTTPS.'); }
    if (url.protocol !== 'https:' || url.username || url.password || value.image.length > 1000) throw new UserError('Usa una URL de imagen HTTPS de hasta 1000 caracteres.');
  }
  if (value.fields.length > 25 || value.fields.some(f => !f.name || f.name.length > 256 || !f.value || f.value.length > 1024)) {
    throw new UserError('Admite hasta 25 secciones: título de hasta 256 caracteres y contenido de hasta 1024.');
  }
  if (value.title.length + value.description.length + SYSTEM_NAME.length + value.fields.reduce((n, f) => n + f.name.length + f.value.length, 0) > 6000) {
    throw new UserError('El embed completo supera los 6000 caracteres. Reduce la descripción o las secciones.');
  }
  return value;
}
export function parseFields(text) {
  return String(text ?? '').split('\n').filter(line => line.trim()).map(line => {
    const split = line.indexOf('|');
    if (split < 1) throw new UserError('Cada sección debe escribirse como Título | Contenido. Usa \\n para un salto dentro del contenido.');
    let name = line.slice(0, split).trim();
    const inline = name.startsWith('[]');
    if (inline) name = name.slice(2).trim();
    return { name, value: line.slice(split + 1).trim().replaceAll('\\n', '\n'), inline };
  });
}
export const formatFields = fields => (fields ?? []).map(f => `${f.inline ? '[] ' : ''}${f.name} | ${f.value.replaceAll('\n', '\\n')}`).join('\n');

export function embedModal(draft) {
  const input = draft.data.embed;
  const paragraph = (id, label, value, max, description) => {
    const field = new TextInputBuilder().setCustomId(id).setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(max);
    if (value) field.setValue(value);
    const component = new LabelBuilder().setLabel(label).setTextInputComponent(field);
    if (description) component.setDescription(description);
    return component;
  };
  return new ModalBuilder().setCustomId(`community:save:${draft.id}`).setTitle('Editar embed · VEX LATAM')
    .addLabelComponents(textLabel('title', 'Título', input.title, true, 256),
      paragraph('description', 'Descripción', input.description, 4000, 'En bienvenida: {usuario}, {servidor}, {reglas}, {roles}, {buscar}.'),
      paragraph('fields', 'Secciones: Título | Contenido', formatFields(input.fields), 4000, 'Una sección por línea. Usa \\n para saltos y [] delante del título para mostrarla en columna.'),
      textLabel('color', 'Color hexadecimal', input.color || '#ed243b', true, 7),
      textLabel('image', 'URL HTTPS de imagen · Opcional', input.image, false, 1000));
}
export function modalEmbed(i) {
  return validateEmbed({ title: i.fields.getTextInputValue('title'), description: i.fields.getTextInputValue('description'),
    fields: parseFields(i.fields.getTextInputValue('fields')), color: i.fields.getTextInputValue('color'), image: i.fields.getTextInputValue('image') });
}
export function nativePayload(input) {
  const data = validateEmbed(input), embed = new EmbedBuilder().setColor(data.color).setTitle(data.title).setFooter({ text: SYSTEM_NAME });
  if (data.description) embed.setDescription(data.description);
  if (data.fields.length) embed.addFields(data.fields);
  if (data.image) embed.setImage(data.image);
  return { content: '', embeds: [embed], components: [], attachments: [], allowedMentions: noMentions };
}
export function rolesPayload(settings) {
  const mapped = (settings.roles ?? []).filter(r => r.emoji);
  const listing = mapped.map(r => `${r.emoji} **${safe(r.label)}** · <@&${r.id}>`).join('\n');
  const template = settings.community?.roleEmbed ?? defaultRoleEmbed;
  return nativePayload({ ...template,
    description: template.description + '\n\n' + (listing || 'Un administrador debe configurar los emojis con **/roles agregar**.')
      + '\n\nTHE FINALS se conserva mientras tengas un perfil registrado o su reacción activa.' });
}
export function rulesPayload(settings) {
  return nativePayload(settings.community?.rules ?? { ...defaultRules, ...(settings.rulesRaw ? { description: settings.rulesRaw, fields: [] } : {}) });
}
export function welcomePayload(member, settings) {
  const replacements = { usuario: `<@${member.id}>`, servidor: safe(member.guild.name),
    reglas: settings.panels?.reglas ? `<#${settings.panels.reglas.channel}>` : '#reglas',
    roles: settings.panels?.roles ? `<#${settings.panels.roles.channel}>` : '#seleccion-de-roles',
    buscar: settings.panels?.buscar ? `<#${settings.panels.buscar.channel}>` : '#buscar-equipo' };
  const replace = text => String(text).replace(/\{(usuario|servidor|reglas|roles|buscar)\}/g, (_, key) => replacements[key]);
  const template = settings.community?.welcome ?? defaultWelcome;
  const payload = nativePayload({ ...template, title: replace(template.title), description: replace(template.description),
    fields: template.fields.map(f => ({ ...f, name: replace(f.name), value: replace(f.value) })) });
  payload.content = `<@${member.id}>`;
  payload.components = [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('profile:edit')
    .setLabel('Crear / editar mi perfil').setStyle(ButtonStyle.Primary))];
  payload.allowedMentions = { ...noMentions, users: [member.id] };
  return payload;
}
