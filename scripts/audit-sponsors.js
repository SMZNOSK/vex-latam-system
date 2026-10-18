// Solo lectura: comprueba roles, audiencia y migración sin publicar ni cambiar Discord.
import { REST, Routes, PermissionFlagsBits as P } from 'discord.js';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { config, dataDir } from '../src/config.js';
import { sponsors, completeProfile } from '../src/sponsors.js';
const rest = new REST({ timeout: 15000 }).setToken(process.env.DISCORD_TOKEN);
const guilds = await rest.get(Routes.userGuilds());
const g = guilds.find(g => g.id === process.env.DISCORD_GUILD_ID || g.name === config.guildName) ?? (guilds.length === 1 ? guilds[0] : null);
if (!g) throw new Error('Configura el servidor para auditarlo.');
const [roles, channels, meta] = await Promise.all([rest.get(Routes.guildRoles(g.id)), rest.get(Routes.guildChannels(g.id)), rest.get(Routes.guild(g.id))]);
const db = new DatabaseSync(path.join(dataDir, 'vex.sqlite'), { readOnly: true });
try {
  const settings = JSON.parse(db.prepare('SELECT data FROM settings WHERE guild=?').get(g.id).data);
  const profiles = db.prepare('SELECT user,data FROM profiles WHERE guild=?').all(g.id).map(r => ({ user: r.user, ...JSON.parse(r.data) }));
  const open = new Set([settings.community?.welcomeChannel, settings.panels?.reglas?.channel, settings.panels?.registro?.channel]);
  const everyone = roles.find(r => r.id === g.id);
  const base = ids => [everyone, ...roles.filter(r => ids.includes(r.id))].reduce((n, r) => n | BigInt(r.permissions), 0n);
  function visible(c, ids = [], user = null) {
    let bits = base(ids);
    if (bits & P.Administrator || user === meta.owner_id) return true;
    const e = c.permission_overwrites.find(o => o.id === g.id);
    if (e) bits = (bits & ~BigInt(e.deny)) | BigInt(e.allow);
    const rs = c.permission_overwrites.filter(o => o.type === 0 && ids.includes(o.id));
    bits = (bits & ~rs.reduce((n, o) => n | BigInt(o.deny), 0n)) | rs.reduce((n, o) => n | BigInt(o.allow), 0n);
    const m = c.permission_overwrites.find(o => o.type === 1 && o.id === user);
    if (m) bits = (bits & ~BigInt(m.deny)) | BigInt(m.allow);
    return Boolean(bits & P.ViewChannel);
  }
  const roleAudit = sponsors.map(s => {
    const r = roles.find(r => r.id === settings.sponsorRoles?.[s.id]);
    return { sponsor: s.label, created: Boolean(r), safe: r?.permissions === '0' && r.mentionable === false };
  });
  const access = roles.find(r => r.id === settings.verifiedRole);
  const leaks = channels.filter(c => !open.has(c.id) && visible(c)).map(c => c.name);
  const missingEntry = channels.filter(c => open.has(c.id) && !visible(c)).map(c => c.name);
  const missingAccess = channels.filter(c => !open.has(c.id) && settings.accessGate?.snapshots?.[c.id]?.publicView
    && !visible(c, [settings.verifiedRole])).map(c => c.name);
  const members = [];
  let after;
  do {
    const query = new URLSearchParams({ limit: '1000', ...(after ? { after } : {}) });
    const page = await rest.get(Routes.guildMembers(g.id), { query }); members.push(...page);
    after = page.length === 1000 ? page.at(-1).user.id : null;
  } while (after);
  const memberLeaks = [];
  const staff = P.Administrator | P.ManageGuild | P.ManageChannels | P.ManageMessages | P.ModerateMembers;
  let unregistered = 0;
  for (const m of members) {
    if (m.user.bot || m.user.id === meta.owner_id || (base(m.roles) & staff) || completeProfile(profiles.find(p => p.user === m.user.id))) continue;
    unregistered++;
    for (const c of channels) if (!open.has(c.id) && visible(c, m.roles, m.user.id)) memberLeaks.push(c.name);
  }
  const report = { enabled: settings.accessGate?.enabled, schemaVersion: db.prepare('PRAGMA user_version').get().user_version,
    sponsorRoles: roleAudit, verifiedRoleSafe: access?.permissions === '0' && access.mentionable === false,
    entryChannels: channels.filter(c => open.has(c.id)).map(c => c.name), permissionSnapshots: Object.keys(settings.accessGate?.snapshots ?? {}).length,
    profiles: profiles.length, needSponsor: profiles.filter(p => !completeProfile(p)).length,
    preservedPlayerCards: profiles.filter(p => p.cardImage).length, unregisteredMembersChecked: unregistered,
    publicLeaks: leaks, memberLeaks: [...new Set(memberLeaks)], missingEntry, missingVerifiedAccess: missingAccess,
    pendingRoleJobs: db.prepare('SELECT count(*) AS n FROM role_jobs WHERE guild=?').get(g.id).n };
  console.log(JSON.stringify(report, null, 2));
  if (!report.enabled || !report.verifiedRoleSafe || roleAudit.some(r => !r.safe) || leaks.length || memberLeaks.length || missingEntry.length || missingAccess.length) process.exitCode = 1;
} finally { db.close(); }
