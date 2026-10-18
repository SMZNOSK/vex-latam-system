import { PermissionFlagsBits as P } from 'discord.js';
import { UserError } from './domain.js';

export const dangerousPermissions = [P.Administrator, P.ManageGuild, P.ManageRoles, P.ManageChannels,
  P.ManageMessages, P.ManageWebhooks, P.BanMembers, P.KickMembers, P.ModerateMembers,
  P.MentionEveryone, P.ManageEvents, P.ManageThreads, P.MuteMembers, P.DeafenMembers, P.MoveMembers,
  P.ViewAuditLog, P.ManageNicknames, P.ManageGuildExpressions];
export function assertAssignable(role, me) {
  if (!role || role.id === role.guild.id || role.managed || dangerousPermissions.some(p => role.permissions.has(p))) {
    throw new UserError('Ese rol no es apto para autoasignación. Usa un rol sin permisos administrativos o de moderación.');
  }
  if (!me.permissions.has(P.ManageRoles) || role.position >= me.roles.highest.position) {
    throw new UserError('El bot necesita Administrar roles y su rol debe estar por encima del rol que quieras asignar.');
  }
}

