import { PermissionFlagsBits as P, MessageType, EmbedBuilder } from 'discord.js';
import { contentIntent } from './config.js';
import { UserError } from './domain.js';
import { assertAssignable } from './roles.js';
import { boundRole, assertPermanentRoleCreation } from './role-provisioning.js';
import { parseEmoji } from './reaction-roles.js';
import { ALL_CLASSES, classes } from './catalog.js';
import { noMentions, safe, row, button } from './ui.js';

const normalize = text => String(text ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export const chatSourceMatches = (cfg, channel) => (cfg?.channels?.length ? cfg.channels : [cfg?.channel]).includes(channel);
// Las citas, ejemplos de código, enlaces y menciones no son solicitudes del autor.
export const searchText = text => normalize(String(text ?? '').replace(/^\s*>>>[\s\S]*/m, ' ').replace(/```[\s\S]*?```|`[^`]*`|^\s*>.*$/gm, ' ')
  .replace(/https?:\/\/\S+|<[^>]+>/g, ' ').replace(/[^\p{L}\p{N}+\s]/gu, ' ').replace(/\s+/g, ' ').trim());

export const DEFAULT_CHAT_SEARCH_TERMS = Object.freeze([
  'quién juega', 'quién para jugar', 'alguien para jugar', 'alguien para ranks', 'alguien para rápidas',
  'busco equipo', 'buscamos equipo', 'busco team', 'busco squad', 'busco compañero',
  'me falta uno', 'nos faltan dos', 'a quién le falta uno', '+1', '+2', 'alguien', 'alguien disponible',
]);
const keywordText = text => searchText(text).replace(/\+\s+(\d+)\b/g, '+$1');

export function parseChatSearchTerms(input) {
  const text = String(input ?? '').trim();
  if (text === '-') return [];
  if (text.length > 1000) throw new UserError('La lista admite hasta 1000 caracteres.');
  const terms = [], seen = new Set();
  for (const term of text.split(/[,\r\n]+/u).map(item => item.trim()).filter(Boolean)) {
    const key = keywordText(term);
    if (term.length > 80 || !/[\p{L}\p{N}]/u.test(key)) throw new UserError('Usa palabras o frases de hasta 80 caracteres; también se admiten expresiones como +1.');
    if (seen.has(key)) continue;
    terms.push(term); seen.add(key);
  }
  if (terms.length > 100) throw new UserError('Usa como máximo 100 palabras o frases.');
  return terms;
}

export function lookingForTeam(content, terms) {
  const text = searchText(content);
  if (/\+\s*\d+\s*[=+*/\-]/.test(String(content))) return false;
  if (!text || /\b(?:helldivers|arc raiders|rocket league|valorant|fortnite|overwatch|apex|warzone|minecraft)\b/.test(text)) return false;
  if (/\b(?:ya (?:estamos|somos) completos|equipo completo|ya encontre equipo|(?:ya )?no (?:busco|buscamos|quiero jugar|voy a jugar|puedo jugar))\b/.test(text)) return false;
  if (Array.isArray(terms)) {
    const words = ` ${keywordText(content)} `;
    return terms.some(term => { const key = keywordText(term); return key && words.includes(` ${key} `); });
  }
  return /\b(?:quien(?:es)?|alguien|alguno[sa]?) (?:para |pa )?(?:juega[n]?|jugar|le entra|se apunta|para (?:rankeds?|ranks?|rapidas|casuales))\b/.test(text)
    || /\b(?:busco|buscamos|buscando|se busca[n]?|necesito|necesitamos) (?:(?:un[oa]?|dos|[12]) )?(?:equipo|team|squad|duo|trio|companeros?|gente|jugadores?|alguien)\b/.test(text)
    || /\b(?:(?:a )?quien le|me|nos|les) falta[n]? (?:un[oa]?|dos|[12])\b/.test(text)
    || /\b(?:alguien|quien) (?:para|pa) (?:unas? |unos? )?(?:rankeds?|ranks?|rapidas|casuales|partidas|the finals|finals)\b/.test(text)
    || /^(?:\+\s*[12])(?:\s|$)/.test(text)
    || /\b(?:falta[n]?|busco|buscamos) \+\s*[12]\b/.test(text)
    || /^(?:alguien|quien|alguno)(?:\s+(?:disponible|libre|juega))?$/.test(text);
}

export function hasRegion(content, mentionedRoles = []) {
  const text = searchText(content);
  // NA solo cuenta en mayúsculas o tras "región/servidor": evita el coloquial "na".
  return /\b(?:latam|lan|las|sa|eu|euw|eune|br|oce|asia|europa|norteamerica|sudamerica|suramerica|centroamerica|norte america|sud america|sur america|north america|south america|mexico|argentina|chile|colombia|peru|brasil|brazil|espana|usa|estados unidos)\b/.test(text)
    || /\bNA\b/.test(String(content).replace(/<[^>]+>|https?:\/\/\S+/g, ' '))
    || /\b(?:region|servidor|server)\s+(?:na|norte|sur|america)\b/.test(text)
    || mentionedRoles.some(role => /^(?:region\s*)?(?:na|sa|eu|latam|lan|las|br|oce|asia|europa|norteamerica|sudamerica|suramerica)$/.test(searchText(role.name)));
}

export function chatSearchPayload(message, settings) {
  const cfg = settings.chatSearch ?? {};
  const roles = message.guild.roles.cache;
  const game = cfg.gameRole ?? settings.finalsRole;
  if (!game || !roles.has(game)) return null;
  // Metadatos de la respuesta al mensaje; la ficha real se construye con searchCard.
  return { content: `<@&${game}>`, components: [], allowedMentions: noMentions,
    reply: { messageReference: message.id, failIfNotExists: false } };
}

export class ChatSearch {
  constructor(bot) { this.bot = bot; this.pending = new Set(); }
  async setup(guild) {
    this.pending.add(guild.id);
    let settings = this.bot.store.settings(guild.id);
    settings.chatSearch ??= { enabled: true, channel: settings.teamsChannel, cooldownSeconds: 300 };
    settings.chatSearch.channel ??= settings.teamsChannel;
    this.bot.store.saveSettings(guild.id, settings);
    if (!settings.chatSearch.rolesSeeded) {
      await guild.roles.fetch();
      const me = await guild.members.fetchMe();
      for (const [key, name, emoji] of [['rankedRole', 'THE FINALS RANKS', '🏆'], ['quickRole', 'THE FINALS RÁPIDAS', '⚡']]) {
        settings = this.bot.store.settings(guild.id);
        let role = boundRole(guild, `chatSearch.${key}`) ?? guild.roles.cache.get(settings.chatSearch[key])
          ?? guild.roles.cache.find(r => normalize(r.name) === normalize(name) && !r.managed && r.permissions.bitfield === 0n);
        if (!role) { assertPermanentRoleCreation(guild, name); role = await guild.roles.create({ name, permissions: [], mentionable: true, reason: 'Roles para búsquedas de equipo por chat' }); }
        assertAssignable(role, me);
        if (role.permissions.bitfield !== 0n) throw new UserError('Los roles de búsqueda por chat deben estar sin permisos.');
        settings = this.bot.store.settings(guild.id);
        settings.chatSearch[key] = role.id;
        settings.roles ??= [];
        const parsed = parseEmoji(emoji, guild);
        if (settings.roles.length < 20 && !settings.roles.some(r => r.id === role.id || r.emojiKey === parsed.emojiKey)) {
          settings.roles.push({ id: role.id, label: role.name, ...parsed });
        }
        this.bot.store.saveSettings(guild.id, settings);
      }
      settings = this.bot.store.settings(guild.id);
      settings.chatSearch.rolesSeeded = true;
      this.bot.store.saveSettings(guild.id, settings);
    }
    if (this.bot.store.settings(guild.id).chatSearch.channel) this.pending.delete(guild.id);
  }
  async handle(message) {
    if (!contentIntent || !message.guildId || !this.bot.guilds.has(message.guildId) || message.author.bot || message.webhookId
      || message.messageSnapshots?.size || ![MessageType.Default, MessageType.Reply].includes(message.type)) return;
    return this.bot.queue(`chat-search:${message.guildId}`, async () => {
      const settings = this.bot.store.settings(message.guildId), cfg = settings.chatSearch;
      if (!cfg?.enabled || !chatSourceMatches(cfg,message.channelId) || !lookingForTeam(message.content, cfg.terms)) return;
      const now = Date.now();
      const me = await message.guild.members.fetchMe();
      if (!message.channel.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages, P.ReadMessageHistory])) return;
      // Una orden de desactivar o cambiar palabras durante la consulta también debe respetarse.
      const current = this.bot.store.settings(message.guildId), currentCfg = current.chatSearch;
      if (!currentCfg?.enabled || !chatSourceMatches(currentCfg,message.channelId) || !lookingForTeam(message.content, currentCfg.terms)) return;
      const payload = chatSearchPayload(message, current);
      if (!payload) return;
      const existing = this.bot.store.activeSearch(message.guildId, message.author.id);
      if (existing) {
        const last = currentCfg.lastReplies?.[message.author.id];
        if (!existing.message || (last != null && now - last < (currentCfg.cooldownSeconds ?? 300) * 1000)) return;
        await message.channel.send({ content: `Ya tienes una búsqueda activa. Ciérrala o espera a que caduque antes de crear otra.\nhttps://discord.com/channels/${existing.guild}/${existing.channel}/${existing.message}`,
          components: [row(button(`search:controls:${existing.id}`, 'Mi búsqueda activa'))], allowedMentions: noMentions, reply: payload.reply });
      } else {
        const filters = { mode: 'HOT', description: '', teammates: 2, playerClass: ALL_CLASSES, playerClasses: [...classes],
          specializationIds: [], minScore: null, maxScore: null, schemaVersion: 3 };
        const published = await this.bot.publishTeam(message.guildId, message.author.id, message.channel, filters, {
          reply: payload.reply,
          beforeSend: () => {
            const latest = this.bot.store.settings(message.guildId), live = latest.chatSearch;
            return live?.enabled && chatSourceMatches(live,message.channelId) && lookingForTeam(message.content, live.terms)
              && chatSearchPayload(message, latest)?.content === payload.content;
          },
        });
        if (!published) return;
      }
      // Solo se guardan IDs y tiempos; releer conserva cambios administrativos durante el envío.
      const latest = this.bot.store.settings(message.guildId);
      latest.chatSearch.lastReplies = Object.fromEntries(Object.entries(latest.chatSearch.lastReplies ?? {})
        .filter(([, time]) => now - time < 3600000));
      latest.chatSearch.lastReplies[message.author.id] = now;
      this.bot.store.saveSettings(message.guildId, latest);
    });
  }
  async configure(i) {
    const sub = i.options.getSubcommand();
    const terms = sub === 'palabras' ? parseChatSearchTerms(i.options.getString('lista')) : null;
    if (sub === 'activar' && !contentIntent) throw new UserError('Activa Message Content Intent en el portal y ENABLE_MESSAGE_CONTENT=true en .env; después reinicia.');
    const target = sub === 'configurar' ? i.options.getChannel('canal') : null;
    if (target) {
      await this.bot.channel(i.guild, target.id);
      if (!target.permissionsFor(await i.guild.members.fetchMe())?.has(P.ReadMessageHistory)) throw new UserError('El bot necesita Leer historial para responder a mensajes de ese canal.');
    }
    const selected = {};
    if (sub === 'configurar') {
      for (const [option, key] of [['juego', 'gameRole'], ['ranks', 'rankedRole'], ['rapidas', 'quickRole']]) {
        const role = i.options.getRole(option);
        if (!role) continue;
        assertAssignable(role, await i.guild.members.fetchMe());
        if (role.permissions.bitfield !== 0n) throw new UserError('Selecciona roles sin permisos para las sugerencias.');
        selected[key] = role.id;
      }
    }
    const settings = this.bot.store.settings(i.guildId);
    const cfg = settings.chatSearch ??= { enabled: false, channel: settings.teamsChannel, cooldownSeconds: 300 };
    const proposed = { ...cfg, ...selected };
    const ids = [proposed.gameRole ?? settings.finalsRole, proposed.rankedRole, proposed.quickRole].filter(Boolean);
    if (sub === 'configurar' && new Set(ids).size !== ids.length) throw new UserError('Elige roles distintos para el juego, ranks y rápidas.');
    if (sub === 'activar') {
      if (Array.isArray(cfg.terms) && cfg.terms.length === 0) throw new UserError('Primero configura /busqueda-chat palabras o usa /busqueda-chat restablecer.');
      cfg.enabled = true;
    }
    if (sub === 'desactivar') cfg.enabled = false;
    if (sub === 'palabras') {
      cfg.terms = terms;
      if (!terms.length) cfg.enabled = false;
    }
    if (sub === 'restablecer') delete cfg.terms;
    if (sub === 'configurar') {
      if (target) {cfg.channel = target.id; cfg.channels = [target.id];}
      const cooldown = i.options.getInteger('espera');
      if (cooldown != null) cfg.cooldownSeconds = cooldown;
      Object.assign(cfg, selected);
    }
    this.bot.store.saveSettings(i.guildId, settings);
    const label = id => id && i.guild.roles.cache.has(id) ? `<@&${id}>` : 'pendiente';
    const custom = Array.isArray(cfg.terms), activeTerms = custom ? cfg.terms : DEFAULT_CHAT_SEARCH_TERMS;
    const words = new EmbedBuilder().setTitle('Palabras y frases activadoras').setColor(0xed243b)
      .setDescription(activeTerms.length ? activeTerms.map(safe).join(', ') : 'Ninguna. Configura una lista antes de activar la ayuda.')
      .setFooter({ text: custom ? 'Lista personalizada: solo estas palabras o frases activan la respuesta.'
        : 'Frases predeterminadas: también se reconocen variantes habituales de búsqueda de equipo.' });
    return this.bot.sendPrivate(i, `Ayuda de búsqueda por chat: **${cfg.enabled ? 'activada' : 'desactivada'}**.\n`
      + `Canal: ${cfg.channel ? `<#${cfg.channel}>` : 'pendiente'}.\n`
      + `Rol de la tarjeta: ${label(cfg.gameRole ?? settings.finalsRole)}.\n`
      + `Espera entre recordatorios de búsqueda activa: **${cfg.cooldownSeconds} segundos**.\n`
      + `Palabras: **${custom ? 'personalizadas' : 'predeterminadas y variantes'}**.\n`
      + `Lectura de texto: **${contentIntent ? 'habilitada' : 'pendiente: activa Message Content Intent y reinicia'}**.\n`
      + 'Usa /busqueda-chat palabras para reemplazar la lista; escribe - para vaciarla.\n'
      + 'Crea una búsqueda HOT de 3 jugadores, con RS y tarjeta si están registrados, sin filtrar por modo ni RS. Incluye equipo, voz y cierre. Solo una búsqueda activa por organizador, contando normales y HOT; cerrar o caducar permite crear otra. El rol se muestra sin notificarlo. No requiere perfil.', { embeds: [words] });
  }
}
