// Solo lectura: no publica mensajes, no modifica roles ni se conecta al Gateway.
import { REST, Routes, PermissionsBitField, PermissionFlagsBits as P, MessageFlags } from 'discord.js';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { config, dataDir } from '../src/config.js';
import { hasMembersIntent } from '../src/gateway-config.js';
const rest = new REST().setToken(process.env.DISCORD_TOKEN);
const me = await rest.get(Routes.user());
const guilds = await rest.get(Routes.userGuilds());
const guild = guilds.find(g => g.id === process.env.DISCORD_GUILD_ID || g.name === config.guildName) ?? (guilds.length === 1 ? guilds[0] : null);
if (!guild) throw new Error('No se pudo identificar el servidor');
const [roles, member, channels] = await Promise.all([rest.get(Routes.guildRoles(guild.id)),
  rest.get(Routes.guildMember(guild.id, me.id)), rest.get(Routes.guildChannels(guild.id))]);
const base = roles.filter(r => r.id === guild.id || member.roles.includes(r.id)).reduce((bits, r) => bits | BigInt(r.permissions), 0n);
function channelPermissions(channel) {
  if (new PermissionsBitField(base).has(P.Administrator)) return new PermissionsBitField(P.Administrator);
  let bits = base;
  const everyone = channel.permission_overwrites.find(o => o.id === guild.id);
  if (everyone) bits = (bits & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
  const all = channel.permission_overwrites.filter(o => o.type === 0 && member.roles.includes(o.id));
  bits = (bits & ~all.reduce((b, o) => b | BigInt(o.deny), 0n)) | all.reduce((b, o) => b | BigInt(o.allow), 0n);
  const own = channel.permission_overwrites.find(o => o.id === me.id);
  if (own) bits = (bits & ~BigInt(own.deny)) | BigInt(own.allow);
  return new PermissionsBitField(bits);
}
const db = new DatabaseSync(path.join(dataDir, 'vex.sqlite'), { readOnly: true });
try {
  const row = db.prepare('SELECT data FROM settings WHERE guild=?').get(guild.id);
  const settings = row ? JSON.parse(row.data) : {};
  const panels = [];
  for (const type of ['registro', 'buscar']) {
    const ref = settings.panels?.[type]; if (!ref) continue;
    const message = await rest.get(Routes.channelMessage(ref.channel, ref.message));
    const channel = channels.find(c => c.id === ref.channel), permissions = channelPermissions(channel);
    panels.push({ type, channel: channel.name, message: ref.message, pinned: message.pinned,
      hasPrivateCleanup: JSON.stringify(message.components).includes('private:clear'),
      images: message.components.filter(c => c.type === 12).reduce((n, c) => n + c.items.filter(item => item.media?.content_type?.startsWith('image/')).length, 0),
      ManageChannels: permissions.has(P.ManageChannels), PinMessages: permissions.has(P.PinMessages), AttachFiles: permissions.has(P.AttachFiles),
      everyoneCannotPost: Boolean(channel.permission_overwrites.find(o => o.id === guild.id && (BigInt(o.deny) & P.SendMessages))),
      url: `https://discord.com/channels/${guild.id}/${ref.channel}/${ref.message}` });
  }
  let leaderboard = null;
  if (settings.leaderboard) {
    const ref = settings.leaderboard, channel = channels.find(c => c.id === ref.channel);
    const message = await rest.get(Routes.channelMessage(ref.channel, ref.message));
    leaderboard = { channel: channel?.name, message: message.id, pinned: message.pinned,
      images: message.components.filter(c => c.type === 12).reduce((n, c) => n + c.items.length, 0),
      everyoneCannotPost: Boolean(channel?.permission_overwrites.find(o => o.id === guild.id && (BigInt(o.deny) & P.SendMessages))),
      url: `https://discord.com/channels/${guild.id}/${ref.channel}/${ref.message}` };
  }
  const profileRows = db.prepare('SELECT user,data FROM profiles WHERE guild=?').all(guild.id);
  let assigned = 0;
  if (settings.finalsRole) for (const p of profileRows) {
    const m = await rest.get(Routes.guildMember(guild.id, p.user)).catch(() => null);
    if (m?.roles.includes(settings.finalsRole)) assigned++;
  }
  const role = roles.find(r => r.id === settings.finalsRole);
  const version = db.prepare('PRAGMA user_version').get().user_version;
  const roleJobs = version >= 2 ? db.prepare('SELECT count(*) AS n FROM role_jobs WHERE guild=?').get(guild.id).n : null;
  const voiceRooms = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='voice_rooms'").get()
    ? db.prepare('SELECT channel,data FROM voice_rooms WHERE guild=?').all(guild.id).map(row => {
      const channel = channels.find(c => c.id === row.channel), everyone = channel?.permission_overwrites.find(o => o.id === guild.id);
      return { channel: channel?.name ?? null, visibleToEveryone: Boolean(everyone && (BigInt(everyone.allow) & P.ViewChannel)),
        teamOnlyConnect: Boolean(everyone && (BigInt(everyone.deny) & P.Connect)), accessVersion: JSON.parse(row.data).accessVersion };
    }) : [];
  const app = await rest.get(Routes.oauth2CurrentApplication());
  const communityPanels = [];
  for (const type of ['roles', 'reglas']) {
    const ref = settings.panels?.[type]; if (!ref) continue;
    const message = await rest.get(Routes.channelMessage(ref.channel, ref.message));
    const channel = channels.find(c => c.id === ref.channel), everyone = channel?.permission_overwrites.find(o => o.id === guild.id);
    communityPanels.push({ type, channel: channel?.name, message: message.id, nativeEmbed: !(message.flags & MessageFlags.IsComponentsV2),
      pinned: message.pinned, title: message.embeds[0]?.title, fields: message.embeds[0]?.fields?.length ?? 0,
      reactions: message.reactions?.map(r => r.emoji.name) ?? [], everyoneCannotPost: Boolean(everyone && (BigInt(everyone.deny) & P.SendMessages)),
      everyoneCanReact: Boolean(everyone && (BigInt(everyone.allow) & P.AddReactions)), url: `https://discord.com/channels/${guild.id}/${ref.channel}/${ref.message}` });
  }
  console.log(JSON.stringify({ bot: me.username, guild: guild.name, schemaVersion: version,
    permissions: Object.fromEntries(['ManageChannels', 'PinMessages', 'ManageRoles', 'AddReactions', 'EmbedLinks', 'ReadMessageHistory', 'AttachFiles', 'ViewChannel', 'Connect', 'Speak', 'MoveMembers'].map(p => [p, new PermissionsBitField(base).has(P[p])])),
    community: { membersIntent: hasMembersIntent(app.flags_new ?? app.flags), welcomeEnabled: settings.community?.welcomeEnabled,
      welcomeChannel: channels.find(c => c.id === settings.community?.welcomeChannel)?.name, panels: communityPanels,
      roleMappings: settings.roles?.map(r => ({ name: r.label, emoji: r.emoji ?? null })),
      savedEmbeds: version >= 3 ? db.prepare('SELECT count(*) AS n FROM managed_embeds WHERE guild=?').get(guild.id).n : 0 },
    panels, leaderboard, voiceRooms, teamsChannel: channels.find(c => c.id === settings.teamsChannel)?.name ?? null,
    finalsRole: role ? { name: role.name, permissions: role.permissions, mentionable: role.mentionable, position: role.position } : null,
    profiles: profileRows.length, profilesNeedingCompletion: profileRows.filter(p => JSON.parse(p.data).needsCompletion).length,
    profilesWithPlayerCard: profileRows.filter(p => JSON.parse(p.data).cardImage?.key).length,
    profilesWithRole: assigned, pendingRoleJobs: roleJobs,
    searches: db.prepare('SELECT status,count(*) AS count FROM searches WHERE guild=? GROUP BY status').all(guild.id),
    activeSearchesOutsideTeams: db.prepare("SELECT count(*) AS n FROM searches WHERE guild=? AND status='open' AND channel<>?").get(guild.id, settings.teamsChannel ?? '').n,
    commands: (await rest.get(Routes.applicationGuildCommands(me.id, guild.id))).map(c => c.name),
  }, null, 2));
} finally { db.close(); }
