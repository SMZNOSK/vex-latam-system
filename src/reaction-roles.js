import { UserError } from './domain.js';
import { assertAssignable } from './roles.js';

// Variation selectors are not significant for matching the same Unicode reaction.
export const emojiKey = emoji => emoji?.id ? String(emoji.id) : String(emoji?.name ?? emoji ?? '').normalize('NFC').replaceAll('\ufe0f', '');
export function parseEmoji(input, guild) {
  const text = String(input ?? '').trim();
  const custom = /^<(a?):([a-zA-Z0-9_]+):(\d{17,20})>$/.exec(text);
  if (custom) {
    if (!guild.emojis.cache.has(custom[3])) throw new UserError('Usa un emoji personalizado de este servidor.');
    return { emoji: text, emojiKey: custom[3], reaction: `${custom[2]}:${custom[3]}` };
  }
  const segments = [...new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(text)];
  if (segments.length !== 1 || !/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(text)) {
    throw new UserError('Escribe un solo emoji de Unicode o un emoji personalizado de este servidor.');
  }
  return { emoji: text, emojiKey: emojiKey(text), reaction: text };
}
export class ReactionRoles {
  constructor(bot) { this.bot = bot; this.sequence = 0; this.versions = new Map(); }
  async handle(reaction, user, selected) {
    const message = reaction.message, guild = message.guild;
    if (!guild || !this.bot.guilds.has(guild.id)) return;
    if (user.partial) user = await user.fetch();
    if (user.bot) return;
    const settings = this.bot.store.settings(guild.id);
    if (settings.panels?.roles?.message !== message.id) return;
    const map = (settings.roles ?? []).find(r => r.emojiKey === emojiKey(reaction.emoji));
    if (!map) return;
    if([settings.clans?.vxtg?.role,settings.clans?.vxltm?.role].includes(map.id))return;
    this.versions.set(`${guild.id}:${map.id}:${user.id}`, ++this.sequence);
    await this.bot.queue(`member-role:${guild.id}:${user.id}`, async () => {
      const current = this.bot.store.settings(guild.id);
      if (current.panels?.roles?.message !== message.id || !current.roles.some(r => r.id === map.id && r.emojiKey === map.emojiKey)) return;
      this.bot.store.chooseReaction(guild.id, user.id, map.id, selected);
    });
    await this.process(guild);
  }
  async process(guild) {
    for (const job of this.bot.store.reactionJobs(guild.id)) await this.bot.queue(`member-role:${guild.id}:${job.user}`, async () => {
      try {
        const role = await guild.roles.fetch(job.role), me = await guild.members.fetchMe();
        const identity = this.bot.store.settings(guild.id);
        if([identity.clans?.vxtg?.role,identity.clans?.vxltm?.role].includes(job.role)){this.bot.store.finishReactionJob(guild.id,job.user,job.role);return;}
        if ([identity.verifiedRole, ...Object.values(identity.sponsorRoles ?? {})].includes(job.role)) {
          this.bot.store.finishReactionJob(guild.id, job.user, job.role);
          this.bot.store.queueRole(guild.id, job.user);
          return;
        }
        assertAssignable(role, me);
        const member = await guild.members.fetch(job.user);
        const selected = this.bot.store.reactionChoice(guild.id, job.user, job.role);
        const finals = this.bot.store.settings(guild.id).finalsRole === job.role;
        const desired = selected || (finals && Boolean(this.bot.store.profile(guild.id, job.user)));
        if (desired && !member.roles.cache.has(job.role)) await member.roles.add(job.role, 'Auto rol por reacción · VEX LATAM SYSTEM');
        if (!desired && member.roles.cache.has(job.role)) await member.roles.remove(job.role, 'Reacción retirada · VEX LATAM SYSTEM');
        this.bot.store.finishReactionJob(guild.id, job.user, job.role);
      } catch (error) {
        if ([10007, 10011].includes(error.code)) this.bot.store.finishReactionJob(guild.id, job.user, job.role);
        else {
          this.bot.store.retryReactionJob(guild.id, job.user, job.role);
          if (!job.attempts) this.bot.log(error, 'Auto rol pendiente; se reintentará');
        }
      }
    });
  }
  async seed(message, maps) {
    const active = new Set(maps.filter(r => r.emoji).map(r => r.emojiKey));
    for (const reaction of message.reactions.cache.values()) {
      if (reaction.me && !active.has(emojiKey(reaction.emoji))) await reaction.users.remove(this.bot.client.user.id);
    }
    for (const map of maps.filter(r => r.emoji)) {
      const existing = message.reactions.cache.find(r => emojiKey(r.emoji) === map.emojiKey);
      if (!existing?.me) await message.react(map.reaction ?? map.emoji);
    }
  }
  async reconcile(guild) {
    return this.bot.queue(`reaction-sync:${guild.id}`, () => this.sync(guild));
  }
  async sync(guild) {
    const settings = this.bot.store.settings(guild.id), ref = settings.panels?.roles;
    if (!ref?.message || settings.community?.externalPanels?.includes('roles')) return;
    const channel = await guild.channels.fetch(ref.channel), message = await channel.messages.fetch(ref.message);
    for (const map of settings.roles.filter(r => r.emoji)) {
      const snapshot = this.sequence;
      const reaction = message.reactions.cache.find(r => emojiKey(r.emoji) === map.emojiKey), current = new Set();
      if (reaction) {
        let after;
        for (;;) {
          const users = await reaction.users.fetch({ limit: 100, ...(after ? { after } : {}) });
          for (const user of users.values()) if (!user.bot) current.add(user.id);
          if (users.size < 100) break;
          after = users.last().id;
        }
      }
      const recorded = new Set(this.bot.store.reactionUsers(guild.id, map.id));
      for (const user of new Set([...current, ...recorded])) {
        if (current.has(user) === recorded.has(user)) continue;
        await this.bot.queue(`member-role:${guild.id}:${user}`, () => {
          const latest = this.bot.store.settings(guild.id);
          if (latest.panels?.roles?.message !== message.id || !latest.roles.some(r => r.id === map.id && r.emojiKey === map.emojiKey)) return;
          if ((this.versions.get(`${guild.id}:${map.id}:${user}`) ?? 0) <= snapshot) this.bot.store.chooseReaction(guild.id, user, map.id, current.has(user));
        });
      }
    }
    await this.process(guild);
    await this.seed(message, settings.roles);
  }
}
