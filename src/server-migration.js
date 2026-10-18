// Remapea referencias del bot, nunca IDs de usuario ni credenciales.
export function remapServerText(value, channels, roles) {
  if (Array.isArray(value)) return value.map(item => remapServerText(item, channels, roles));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .map(([key, item]) => [key, remapServerText(item, channels, roles)]));
  if (typeof value !== 'string') return value;
  return value.replace(/<#(\d+)>/g, (whole, id) => channels[id] ? `<#${channels[id]}>` : whole)
    .replace(/<@&(\d+)>/g, (whole, id) => roles[id] ? `<@&${roles[id]}>` : whole);
}

export function remapOverwrites(overwrites, roles, members) {
  return overwrites.flatMap(overwrite => {
    const id = overwrite.type === 0 ? roles[overwrite.id] : members.has(overwrite.id) ? overwrite.id : null;
    return id ? [{ id, type: overwrite.type, allow: String(overwrite.allow), deny: String(overwrite.deny) }] : [];
  });
}

export function migratedSettings(source, sourceGuild, channels, roles, members, now = Date.now()) {
  const text = value => remapServerText(value, channels, roles);
  const community = Object.fromEntries(Object.entries(source.community ?? {})
    .filter(([key]) => ['welcome', 'rules', 'roleEmbed', 'welcomeEnabled', 'welcomeVersion', 'rulesVersion', 'rolesVersion'].includes(key))
    .map(([key, value]) => [key, text(value)]));
  community.welcomeChannel = channels[source.community?.welcomeChannel];
  community.gamesSeeded = true;
  const settings = {
    panels: Object.fromEntries(Object.entries(source.panels ?? {}).filter(([, ref]) => channels[ref.channel])
      .map(([type, ref]) => [type, { channel: channels[ref.channel] }])),
    roles: (source.roles ?? []).filter(r => roles[r.id]).map(r => ({ ...text(r), id: roles[r.id] })),
    moderation: structuredClone(source.moderation ?? { enabled: false, terms: [] }),
    finalsRole: roles[source.finalsRole], teamsChannel: channels[source.teamsChannel],
    leaderboard: { channel: channels[source.leaderboard?.channel] }, community,
    verifiedRole: roles[source.verifiedRole],
    sponsorRoles: Object.fromEntries(Object.entries(source.sponsorRoles ?? {}).filter(([, id]) => roles[id])
      .map(([key, id]) => [key, roles[id]])),
    accessGate: { enabled: false, snapshots: Object.fromEntries(Object.entries(source.accessGate?.snapshots ?? {})
      .filter(([id]) => channels[id]).map(([id, baseline]) => [channels[id], {
        name: baseline.name, publicView: baseline.publicView,
        overwrites: remapOverwrites(baseline.overwrites, roles, members),
      }])) },
    migration: { sourceGuild, createdAt: now },
  };
  if (source.chatSearch) {
    const cfg = source.chatSearch;
    settings.chatSearch = { enabled: cfg.enabled, channel: channels[cfg.channel] ?? settings.teamsChannel,
      cooldownSeconds: cfg.cooldownSeconds ?? 300, rolesSeeded: true,
      ...(Array.isArray(cfg.terms) ? { terms: [...cfg.terms] } : {}),
      ...Object.fromEntries(['gameRole', 'rankedRole', 'quickRole'].filter(key => roles[cfg[key]])
        .map(key => [key, roles[cfg[key]]])) };
  }
  return settings;
}
