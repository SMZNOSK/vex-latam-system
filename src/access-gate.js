import { PermissionFlagsBits as P, PermissionsBitField } from 'discord.js';
import { sponsors, completeProfile } from './sponsors.js';
import { assertAssignable } from './roles.js';
import { UserError } from './domain.js';

const staffBits = [P.Administrator, P.ManageGuild, P.ManageChannels, P.ManageMessages, P.ModerateMembers];
const staff = principal => principal?.permissions?.any(staffBits, false) === true;
const permits = (bits, overwrite) => overwrite ? (bits & ~BigInt(overwrite.deny)) | BigInt(overwrite.allow) : bits;

// Evaluate the original audience, so verification never opens private staff/game channels to everybody.
export function originalPermissions(guild, member, overwrites) {
  let bits = guild.roles.cache.get(guild.id)?.permissions.bitfield ?? 0n;
  for (const role of member?.roles.cache.values() ?? []) bits |= role.permissions.bitfield;
  if (bits & P.Administrator || member?.id === guild.ownerId) return new PermissionsBitField(PermissionsBitField.All);
  bits = permits(bits, overwrites.find(o => o.id === guild.id));
  const roleOverrides = overwrites.filter(o => o.type === 0 && member?.roles.cache.has(o.id));
  bits = (bits & ~roleOverrides.reduce((n, o) => n | BigInt(o.deny), 0n)) | roleOverrides.reduce((n, o) => n | BigInt(o.allow), 0n);
  return new PermissionsBitField(permits(bits, overwrites.find(o => o.type === 1 && o.id === member?.id)));
}

export async function reconcileIdentityRoles(bot, guild, member) {
  const settings = bot.store.settings(guild.id);
  if (!settings.verifiedRole || !settings.sponsorRoles) return;
  const profile = bot.store.profile(guild.id, member.id), verified = completeProfile(profile);
  const me = await guild.members.fetchMe();
  const checkedRole = async id => {
    const role = guild.roles.cache.get(id) ?? await guild.roles.fetch(id);
    assertAssignable(role, me);
    if (role.permissions.bitfield !== 0n) throw new UserError('Los roles de patrocinador y Verificado deben estar sin permisos.');
    return role;
  };
  const access = await checkedRole(settings.verifiedRole);
  if (!verified && member.roles.cache.has(access.id)) await member.roles.remove(access.id, 'Perfil incompleto o eliminado');
  const wanted = verified ? settings.sponsorRoles[profile.sponsorId] : null;
  for (const id of Object.values(settings.sponsorRoles)) {
    if (id !== wanted && member.roles.cache.has(id)) await member.roles.remove(id, 'Cambió el patrocinador del perfil');
  }
  if (wanted) {
    await checkedRole(wanted);
    if (!member.roles.cache.has(wanted)) await member.roles.add(wanted, 'Patrocinador elegido en el perfil');
  }
  if (verified && !wanted) throw new UserError('Falta preparar el rol del patrocinador.');
  if (verified && !member.roles.cache.has(access.id)) await member.roles.add(access.id, 'Perfil completo de THE FINALS');
}

export class AccessGate {
  constructor(bot) { this.bot = bot; this.pending = new Set(); }
  async roles(guild) {
    await guild.roles.fetch();
    const me = await guild.members.fetchMe();
    if (!me.permissions.has(P.ManageRoles)) throw new UserError('Los roles de perfil necesitan Administrar roles.');
    const targets = [{ key: 'verified', label: 'Verificado', color: '#7ac7ad' }, ...sponsors];
    for (const item of targets) {
      let settings = this.bot.store.settings(guild.id);
      const id = item.key ? settings.verifiedRole : settings.sponsorRoles?.[item.id];
      let role = id ? guild.roles.cache.get(id) : null;
      // Roles homónimos ajenos no se reutilizan: podrían tener miembros o accesos previos.
      if (!role) {
        role = await guild.roles.create({ name: item.label, permissions: [], mentionable: false,
          colors: { primaryColor: Number.parseInt(item.color.slice(1), 16) }, reason: 'Perfiles opcionales y patrocinadores de VEX LATAM' });
        settings = this.bot.store.settings(guild.id);
        if (item.key) settings.verifiedRole = role.id;
        else { settings.sponsorRoles ??= {}; settings.sponsorRoles[item.id] = role.id; }
        this.bot.store.saveSettings(guild.id, settings);
      }
      assertAssignable(role, me);
      if (role.permissions.bitfield !== 0n) throw new UserError(`${role.name} debe ser un rol sin permisos.`);
      if (role.mentionable) await role.setMentionable(false, 'Patrocinadores sin avisos masivos');
    }
  }
  async edit(channel, id, values) {
    const existing = channel.permissionOverwrites.cache.get(id);
    const same = Object.entries(values).every(([key, value]) => value === true ? existing?.allow.has(P[key])
      : value === false ? existing?.deny.has(P[key]) : !existing?.allow.has(P[key]) && !existing?.deny.has(P[key]));
    if (!same) await channel.permissionOverwrites.edit(id, values, { reason: 'Retirar el requisito de perfil para acceder al servidor' });
  }
  async setup(guild) {
    this.pending.add(guild.id);
    return this.bot.queue(`gate:${guild.id}`, async () => {
      await this.restore(guild);
      await this.roles(guild);
      this.pending.delete(guild.id);
    });
  }
  async restore(guild) {
    const settings = this.bot.store.settings(guild.id);
    const gate = settings.accessGate ??= { enabled: false, snapshots: {} };
    const needed = gate.enabled || gate.restorePending || !gate.restoredAt;
    gate.enabled = false;
    if (!needed) return;
    gate.restorePending = true;
    this.bot.store.saveSettings(guild.id, settings);
    await guild.channels.fetch();
    await guild.roles.fetch();
    const me = await guild.members.fetchMe();
    const view = overwrite => overwrite && (BigInt(overwrite.allow) & P.ViewChannel) ? true
      : overwrite && (BigInt(overwrite.deny) & P.ViewChannel) ? false : null;
    for (const [id, baseline] of Object.entries(gate.snapshots ?? {})) {
      const channel = guild.channels.cache.get(id);
      if (!channel?.permissionOverwrites || channel.isThread?.()) continue;
      if (!channel.permissionsFor(me)?.has(P.ManageChannels)) throw new UserError(`Falta Administrar canales en #${channel.name} para retirar el bloqueo anterior.`);
      const original = new Map(baseline.overwrites.map(o => [o.id, o]));
      const principals = new Set([guild.id, settings.verifiedRole, ...original.keys()]);
      // Retirar accesos que el bloqueo generaba para staff o miembros de canales privados.
      // Las excepciones nuevas ajenas al bloqueo se conservan.
      for (const overwrite of channel.permissionOverwrites.cache.values()) {
        if (overwrite.id === me.id || overwrite.id === me.roles.botRole?.id || original.has(overwrite.id)) continue;
        if (overwrite.type === 0 && staff(guild.roles.cache.get(overwrite.id))) principals.add(overwrite.id);
        else if (overwrite.type === 1 && !baseline.publicView && completeProfile(this.bot.store.profile(guild.id, overwrite.id))) {
          const member = await guild.members.fetch(overwrite.id).catch(error => { if (error.code !== 10007) throw error; return null; });
          if (member && originalPermissions(guild, member, baseline.overwrites).has(P.ViewChannel)) principals.add(overwrite.id);
        }
      }
      for (const principal of principals) {
        if (!principal || principal === me.id || principal === me.roles.botRole?.id) continue;
        if (guild.roles.cache.has(principal) === false && original.get(principal)?.type === 0) continue;
        const allowed = principal === settings.verifiedRole ? null
          : principal === guild.id && baseline.publicView ? true : view(original.get(principal));
        await this.edit(channel, principal, { ViewChannel: allowed });
      }
    }
    const latest = this.bot.store.settings(guild.id);
    latest.accessGate.enabled = false;
    latest.accessGate.restorePending = false;
    latest.accessGate.restoredAt = Date.now();
    this.bot.store.saveSettings(guild.id, latest);
  }
}
