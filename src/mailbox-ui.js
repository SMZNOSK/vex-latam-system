import { ButtonStyle, CheckboxBuilder, EmbedBuilder, LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder } from 'discord.js';
import { button, card, noMentions, row, safe, textLabel } from './ui.js';
import { SYSTEM_NAME } from './community-ui.js';
import { FEEDBACK_DAILY_LIMIT } from './feedback-quota.js';

export function mailboxPanel(kind) {
  return kind === 'feedback'
    ? card('📬 Tu opinión cuenta',
      'Comparte ideas, sugerencias o problemas del bot y de la comunidad.\n'
      + 'Tu mensaje llegará únicamente a los administradores. Puedes marcar **Enviar anónimamente** para ocultarles tu identidad.\n'
      + 'Si no marcas esa casilla, solo los administradores verán quién lo envió.\n'
      + `**Máximo ${FEEDBACK_DAILY_LIMIT} feedbacks por persona al día**, incluyendo los anónimos. Se reinicia a las 00:00, hora de CDMX.`,
      [row(button('mailbox:open:feedback', 'Enviar feedback', ButtonStyle.Primary))])
    : card('🛡️ Reportes confidenciales',
      '¿Necesitas reportar una situación con otro miembro? Selecciona al usuario y explica lo sucedido.\n'
      + '**El reporte y tu identidad se entregan únicamente a los administradores.** No se publica en este canal ni se avisa al usuario reportado.\n'
      + 'Puedes incluir un enlace a un mensaje o a evidencia. Los administradores revisarán el caso.',
      [row(button('mailbox:open:report', 'Enviar reporte', ButtonStyle.Primary))]);
}

const paragraph = (id, label, max, placeholder) => new LabelBuilder().setLabel(label)
  .setTextInputComponent(new TextInputBuilder().setCustomId(id).setStyle(TextInputStyle.Paragraph)
    .setRequired(true).setMaxLength(max).setPlaceholder(placeholder));

export function mailboxModal(draft) {
  const modal = new ModalBuilder().setCustomId(`mailbox:submit:${draft.id}`);
  if (draft.kind === 'feedback') return modal.setTitle('Enviar feedback').addLabelComponents(
    textLabel('subject', 'Asunto', '', true, 120),
    paragraph('body', 'Tu mensaje', 3000, 'Cuéntanos tu idea, sugerencia o problema.'),
    new LabelBuilder().setLabel('Enviar anónimamente')
      .setDescription('Marcado: los administradores no verán tu nombre ni ID. Sin marcar: podrán contactarte.')
      .setCheckboxComponent(new CheckboxBuilder().setCustomId('anonymous').setDefault(false)),
  );
  return modal.setTitle('Enviar reporte confidencial').addLabelComponents(
    new LabelBuilder().setLabel('Usuario que quieres reportar')
      .setUserSelectMenuComponent(new UserSelectMenuBuilder().setCustomId('target').setRequired(true)
        .setMinValues(1).setMaxValues(1).setPlaceholder('Busca y selecciona un miembro del servidor')),
    paragraph('body', '¿Qué sucedió?', 3000, 'Explica lo sucedido y dónde ocurrió.'),
    textLabel('evidence', 'Enlace a mensaje o evidencia · Opcional', '', false, 500, 'https://discord.com/channels/...'),
  );
}

export function mailboxEntry(kind, input, author, target, receipt) {
  const embed = new EmbedBuilder().setColor(kind === 'feedback' ? 0xed243b : 0xe4a853)
    .setTitle(kind === 'feedback' ? `📬 ${safe(input.subject)}` : '🛡️ Reporte confidencial')
    .setDescription(input.body).setTimestamp()
    .setFooter({ text: `${SYSTEM_NAME} · ${receipt}` });
  embed.addFields({ name: 'Enviado por', value: input.anonymous ? 'Anónimo' : `<@${author.id}> · ID: ${author.id}` });
  if (kind === 'report') {
    embed.addFields({ name: 'Usuario reportado', value: `<@${target.id}> · ${safe(target.username)} · ID: ${target.id}` });
    if (input.evidence) embed.addFields({ name: 'Evidencia', value: input.evidence });
  }
  return { embeds: [embed], allowedMentions: noMentions };
}
