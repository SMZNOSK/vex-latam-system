import { PermissionFlagsBits as P, Routes } from 'discord.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config, dataDir } from './config.js';
import { UserError } from './domain.js';

const publicResources = ['profile', 'search', 'teams', 'guide', 'leaderboard', 'reportPublic',
  'clanJoin.vxtg', 'clanJoin.vxltm', 'clanRanking.vxtg', 'clanRanking.vxltm'];

// Channel permissions and a community member's channel list are separate settings.
export async function syncProductionVisibility(store, rest, guildId) {
  if (guildId !== config.productionGuildId) return;
  const settings = store.settings(guildId);
  if (settings.integration?.version !== '1.0.0') return;
  const endpoint = `/guilds/${guildId}/onboarding`;
  const onboarding = await rest.get(endpoint);
  if (!onboarding.enabled) return;
  const channels = await rest.get(Routes.guildChannels(guildId));
  const candidates = [...publicResources.map(key => settings.integration.resources?.[key]), config.productionChannels.suggestions].filter(Boolean);
  for (const id of candidates) {
    const channel = channels.find(c => c.id === id);
    const everyone = channel?.permission_overwrites?.find(o => o.id === guildId);
    if (!channel || channel.type !== 0 || !everyone || !(BigInt(everyone.allow) & P.ViewChannel) || (BigInt(everyone.deny) & P.ViewChannel)) {
      throw new UserError(`Revisa la visibilidad pública del canal ${id} antes de incluirlo en la incorporación.`);
    }
  }
  const existingIds = new Set(channels.map(c => c.id));
  const removedMissing = onboarding.default_channel_ids.filter(id => !existingIds.has(id));
  const defaults = [...new Set([...onboarding.default_channel_ids.filter(id => existingIds.has(id)), ...candidates])];
  const added = defaults.filter(id => !onboarding.default_channel_ids.includes(id));
  if (added.length || removedMissing.length) {
    const folder = path.join(dataDir, 'production-backups');
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, `${guildId}-onboarding-${Date.now()}.json`), JSON.stringify(onboarding, null, 2));
    const result = await rest.put(endpoint, { body: { default_channel_ids: defaults }, reason: 'Mostrar los canales públicos de VEX LATAM SYSTEM en la incorporación' });
    if (candidates.some(id => !result.default_channel_ids.includes(id))) throw new UserError('Discord no confirmó todos los canales predeterminados del bot.');
  }
  const latest = store.settings(guildId);
  latest.integration.visibility = { publicChannels: candidates, defaultChannelsSynced: true };
  store.saveSettings(guildId, latest);
  return { added, removedMissing, totalDefaultChannels: defaults.length, publicChannels: candidates };
}
