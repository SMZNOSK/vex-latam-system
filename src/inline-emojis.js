import { UserError } from './domain.js';
import { button, card, row } from './ui.js';

export const emojiMarkup = emoji => `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
// Respetar códigos completos, bloques de código y nombres escapados.
const tokens = /```[\s\S]*?```|`[^`\n]*`|<a?:[A-Za-z0-9_]+:\d{17,20}>|(?<![\\\w:]):([A-Za-z0-9_]{2,32}):/g;
const textParts = input => [input.title, input.description, ...(input.fields ?? []).flatMap(f => [f.name, f.value])];

export async function resolveEmbedEmojis(input, guild) {
  if (!textParts(input).some(text => /:[A-Za-z0-9_]{2,32}:/.test(text ?? ''))) return input;
  const emojis = guild.emojis?.fetch ? await guild.emojis.fetch() : guild.emojis?.cache;
  const names = new Map();
  for (const emoji of emojis?.values() ?? []) {
    if (!names.has(emoji.name)) names.set(emoji.name, []);
    names.get(emoji.name).push(emoji);
  }
  const resolve = text => String(text ?? '').replace(tokens, (full, name) => {
    if (!name || !names.has(name)) return full;
    const found = names.get(name);
    if (found.length !== 1) throw new UserError(`Hay varios emojis llamados :${name}:. Usa su código completo desde /embed emojis.`);
    if (found[0].available === false) throw new UserError(`El emoji :${name}: no está disponible en este servidor. Elige otro con /embed emojis.`);
    return emojiMarkup(found[0]);
  });
  return { ...input, title: resolve(input.title), description: resolve(input.description),
    fields: (input.fields ?? []).map(f => ({ ...f, name: resolve(f.name), value: resolve(f.value) })) };
}

export class InlineEmojis {
  constructor(bot) { this.bot = bot; }
  async list(i, requested = 0) {
    this.bot.mailboxes.assertAdminCommand(i);
    await this.bot.ackCard(i);
    const emojis = [...(await i.guild.emojis.fetch()).values()].sort((a,b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const pages = Math.max(1, Math.ceil(emojis.length / 12)), page = Math.max(0, Math.min(requested, pages - 1));
    const listing = emojis.slice(page * 12, (page + 1) * 12).map(e => `${e.available === false ? '⏸️' : emojiMarkup(e)}  \`:${e.name}:\` · \`${emojiMarkup(e)}\`${e.available === false ? ' (no disponible)' : ''}`).join('\n');
    return this.bot.replyCard(i, card(`Emojis para tus mensajes · ${page + 1}/${pages}`,
      'Escribe **:nombre:** en la descripción o las secciones de /bienvenida editar o /embed crear y editar. También puedes pegar el código completo.\n'
      + 'Los nombres de este servidor se convierten al guardar. Los nombres desconocidos quedan como texto.\n\n'
      + (listing || 'Este servidor todavía no tiene emojis personalizados.')
      + '\n\nEjemplo: **¡Bienvenido, {usuario}! :nombre:** · Usa /bienvenida probar para ver el resultado.',
      pages > 1 ? [row(button(`emoji:page:${i.user.id}:${page - 1}`, 'Anterior', undefined, page === 0),
        button(`emoji:page:${i.user.id}:${page + 1}`, 'Siguiente', undefined, page === pages - 1))] : []));
  }
  async handle(i) {
    const [, action, user, page] = i.customId.split(':');
    if (action !== 'page' || !i.isButton() || user !== i.user.id || !/^-?\d{1,4}$/.test(page)) throw new UserError('Abre tu propio catálogo con /embed emojis.');
    return this.list(i, Number(page));
  }
}
