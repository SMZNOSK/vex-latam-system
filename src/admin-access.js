import { PermissionFlagsBits as P } from 'discord.js';
import { config } from './config.js';
import { UserError } from './domain.js';

export const restrictedOperators = guild => config.operatorUserIds?.[guild?.id] ?? null;
export function operatorIds(guild) {
  return [...new Set([...(restrictedOperators(guild) ?? []), guild?.ownerId].filter(Boolean))];
}
export function canOperate(i) {
  if (restrictedOperators(i.guild)) return operatorIds(i.guild).includes(i.user.id);
  return i.memberPermissions?.has(P.Administrator) === true;
}
export function requireOperator(i) {
  if (!canOperate(i)) throw new UserError(restrictedOperators(i.guild)
    ? 'La administración del bot está reservada al propietario y a las cuentas autorizadas.'
    : 'Necesitas el permiso Administrador para usar esta función.');
}
export function securePrivateChannel(channel, guild, botId) {
  if (!channel?.permissionOverwrites.cache.get(guild.id)?.deny.has(P.ViewChannel)) return false;
  const users = new Set([botId, ...operatorIds(guild)]);
  return [...channel.permissionOverwrites.cache.values()].every(o => !o.allow.has(P.ViewChannel)
    || o.type === 1 && users.has(o.id)
    || !restrictedOperators(guild) && o.type === 0 && guild.roles.cache.get(o.id)?.permissions.has(P.Administrator, false));
}
