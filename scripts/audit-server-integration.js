// Read-only Discord inventory; writes a local report only.
import { REST, Routes, PermissionsBitField, PermissionFlagsBits as P } from 'discord.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { dataDir } from '../src/config.js';

const id = process.argv[2];
if (!/^\d{17,20}$/.test(id ?? '')) throw new Error('Indica el ID del servidor.');
const rest = new REST({ timeout: 20000 }).setToken(process.env.DISCORD_TOKEN);
const me = await rest.get(Routes.user());
const [guild, roles, channels, member, emojis, commands, onboarding] = await Promise.all([
  rest.get(Routes.guild(id)), rest.get(Routes.guildRoles(id)), rest.get(Routes.guildChannels(id)),
  rest.get(Routes.guildMember(id, me.id)), rest.get(Routes.guildEmojis(id)),
  rest.get(Routes.applicationGuildCommands(me.id, id)),
  rest.get(`/guilds/${id}/onboarding`),
]);
const base = roles.filter(r => r.id === id || member.roles.includes(r.id)).reduce((n, r) => n | BigInt(r.permissions), 0n);
const botPermissions = new PermissionsBitField(base);
const permissionNames = ['ViewChannel', 'ManageGuild', 'ManageChannels', 'ManageRoles', 'SendMessages', 'EmbedLinks', 'AttachFiles',
  'ReadMessageHistory', 'ManageMessages', 'PinMessages', 'AddReactions', 'Connect', 'Speak', 'MoveMembers', 'MentionEveryone'];
function effective(channel, roleIds, initial) {
  if (new PermissionsBitField(initial).has(P.Administrator)) return new PermissionsBitField(PermissionsBitField.All);
  let bits = initial;
  const all = channel.permission_overwrites ?? [];
  const everyone = all.find(o => o.id === id);
  if (everyone) bits = (bits & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
  const selected = all.filter(o => o.type === 0 && roleIds.includes(o.id));
  bits = (bits & ~selected.reduce((n, o) => n | BigInt(o.deny), 0n)) | selected.reduce((n, o) => n | BigInt(o.allow), 0n);
  const own = roleIds === member.roles ? all.find(o => o.type === 1 && o.id === me.id) : null;
  if (own) bits = (bits & ~BigInt(own.deny)) | BigInt(own.allow);
  return new PermissionsBitField(bits);
}
const highest = roles.filter(r => member.roles.includes(r.id)).sort((a, b) => b.position - a.position)[0];
const everyoneBits = BigInt(roles.find(r => r.id === id)?.permissions ?? '0');
const report = {
  capturedAt: new Date().toISOString(), guild: { id, name: guild.name, owner: guild.owner_id },
  onboarding: { enabled: onboarding.enabled, defaultChannels: onboarding.default_channel_ids },
  bot: { id: me.id, name: me.username, roles: member.roles, highestRole: highest && { id: highest.id, name: highest.name, position: highest.position },
    permissions: Object.fromEntries(permissionNames.map(k => [k, botPermissions.has(P[k])])) },
  roles: roles.sort((a, b) => b.position - a.position).map(r => ({ id: r.id, name: r.name, position: r.position, managed: r.managed,
    mentionable: r.mentionable, permissions: new PermissionsBitField(BigInt(r.permissions)).toArray(), permissionsBits: r.permissions,
    botCanAssign: r.id !== id && !r.managed && botPermissions.has(P.ManageRoles) && (r.position < (highest?.position ?? 0)) })),
  channels: channels.map(c => ({ id: c.id, name: c.name, type: c.type, parent: c.parent_id ?? null, position: c.position,
    topic: c.topic ?? null, overwrites: c.permission_overwrites ?? [], defaultOnboardingChannel: onboarding.default_channel_ids.includes(c.id),
    everyoneView: effective(c, [], everyoneBits).has(P.ViewChannel),
    botPermissions: Object.fromEntries(permissionNames.map(k => [k, effective(c, member.roles, base).has(P[k])])) })),
  emojis: emojis.map(e => ({ id: e.id, name: e.name, animated: e.animated, available: e.available, roles: e.roles })),
  commands: commands.map(c => ({ id: c.id, name: c.name })),
};
const directory = path.join(dataDir, 'server-audits');
mkdirSync(directory, { recursive: true });
const output = path.join(directory, `${id}.json`);
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ guild: report.guild, channels: channels.length, roles: roles.length, emojis: emojis.length,
  commands: commands.length, onboarding: report.onboarding, bot: report.bot, output }, null, 2));
