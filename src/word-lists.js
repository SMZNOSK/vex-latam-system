import { EmbedBuilder, LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { Drafts } from './drafts.js';
import { UserError } from './domain.js';
import { DEFAULT_CHAT_SEARCH_TERMS, parseChatSearchTerms } from './chat-search.js';
import { privateFlags, safe } from './ui.js';
import { CHAT_TERMS_MAX_LENGTH, CHAT_TERMS_MAX_COUNT, termsDescription } from './chat-search-terms.js';

export function parseModerationTerms(input) {
  const text = String(input ?? '').trim();
  if (text.length > 1000) throw new UserError('La lista admite hasta 1000 caracteres.');
  const terms = text === '-' ? [] : [...new Set(text.split(/[,\r\n]+/u).map(s => s.trim()).filter(Boolean))];
  if (terms.length > 100 || terms.some(s => s.length > 80)) throw new UserError('Usa como máximo 100 palabras o frases de hasta 80 caracteres.');
  return terms;
}

const configTerms = (settings, kind) => kind === 'chat' ? settings.chatSearch?.terms : settings.moderation?.terms ?? [];
const signature = (settings, kind) => JSON.stringify(configTerms(settings, kind) ?? null);

export class WordLists {
  constructor(bot) { this.bot = bot; this.drafts = new Drafts(); }
  open(i, kind) {
    this.bot.mailboxes.assertAdminCommand(i);
    if (!['chat', 'moderation'].includes(kind)) throw new UserError('Lista de palabras desconocida.');
    const settings = this.bot.store.settings(i.guildId);
    const terms = configTerms(settings, kind) ?? DEFAULT_CHAT_SEARCH_TERMS;
    const d = this.drafts.create(`words-${kind}`, i.guildId, i.user.id, { kind, channel: i.channelId, base: signature(settings, kind) });
    const input = new TextInputBuilder().setCustomId('lista').setStyle(TextInputStyle.Paragraph)
      .setRequired(true).setMaxLength(kind === 'chat' ? CHAT_TERMS_MAX_LENGTH : 1000).setValue(terms.length ? terms.join('\n') : '-')
      .setPlaceholder('Una palabra o frase por línea, o separadas por comas');
    return i.showModal(new ModalBuilder().setCustomId(`words:save:${d.id}`)
      .setTitle(kind === 'chat' ? 'Búsqueda por chat · Palabras' : 'Palabras altisonantes')
      .addLabelComponents(new LabelBuilder().setLabel('Edita la lista completa')
        .setDescription(`Una por línea o con comas. - la vacía. Máx. ${kind === 'chat' ? CHAT_TERMS_MAX_COUNT : 100} entradas / ${kind === 'chat' ? CHAT_TERMS_MAX_LENGTH : 1000} caracteres.`)
        .setTextInputComponent(input)));
  }
  async handle(i) {
    if (!i.customId?.startsWith('words:')) return false;
    this.bot.mailboxes.assertAdminCommand(i);
    const [, action, id] = i.customId.split(':');
    if (action !== 'save' || !i.isModalSubmit()) throw new UserError('Abre el editor desde /busqueda-chat palabras o /moderacion palabras.');
    const d = this.drafts.get(id, i.guildId, i.user.id), { kind } = d.data;
    if (i.channelId !== d.data.channel) throw new UserError('Abre el editor de nuevo en #admin-bot.');
    const input = i.fields.getTextInputValue('lista').trim();
    if (!input) throw new UserError('Escribe una lista o - para vaciarla.');
    const terms = kind === 'chat' ? parseChatSearchTerms(input) : parseModerationTerms(input);
    await i.deferReply({ flags: privateFlags });
    const settings = this.bot.store.settings(i.guildId);
    if (signature(settings, kind) !== d.data.base) throw new UserError('La lista cambió mientras editabas. Abre el formulario de nuevo para conservar los cambios más recientes.');
    const cfg = kind === 'chat' ? settings.chatSearch ??= { enabled: false, channel: settings.teamsChannel, cooldownSeconds: 300 }
      : settings.moderation ??= { enabled: false, terms: [] };
    cfg.terms = terms;
    if (!terms.length) cfg.enabled = false;
    this.bot.store.saveSettings(i.guildId, settings);
    this.drafts.remove(d.id);
    const words = new EmbedBuilder().setTitle(kind === 'chat' ? 'Palabras de búsqueda por chat' : 'Palabras altisonantes')
      .setColor(0xed243b).setDescription(terms.length ? termsDescription(terms, safe) : 'Lista vacía.')
      .setFooter({ text: 'Solo administradores · Lista guardada' });
    await this.bot.sendPrivate(i, `Lista guardada: **${terms.length} entradas**. ${kind === 'chat' ? 'Ayuda por chat' : 'Filtro'}: **${cfg.enabled ? 'activado' : 'desactivado'}**.`
      + (terms.length && !cfg.enabled ? `\nPara activarlo, usa ${kind === 'chat' ? '/busqueda-chat activar' : '/moderacion activar'}.` : ''), { embeds: [words] });
    return true;
  }
}
