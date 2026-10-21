import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { UserError } from './domain.js';
import { assertAssignable } from './roles.js';
import { card, deliverCard } from './ui.js';
import { reconcileIdentityRoles } from './access-gate.js';
import { boundRole, assertPermanentRoleCreation } from './role-provisioning.js';

export async function ensureFinalsRole(bot, guild) {
  return bot.queue(`role-setup:${guild.id}`, async () => {
    const settings = bot.store.settings(guild.id), me = await guild.members.fetchMe();
    await guild.roles.fetch();
    let role = boundRole(guild, 'finals') ?? (settings.finalsRole ? guild.roles.cache.get(settings.finalsRole) : null);
    if (!role) {
      const matches = guild.roles.cache.filter(r => r.name === 'THE FINALS' && !r.managed);
      if (matches.size > 1) throw new UserError('Hay varios roles THE FINALS. Vincula el correcto por ID.');
      role = matches.first();
    }
    if (!role) {
      assertPermanentRoleCreation(guild, 'THE FINALS');
      role = await guild.roles.create({ name: 'THE FINALS', permissions: [], mentionable: true, colors: { primaryColor: 0xed243b }, reason: 'Jugadores registrados en VEX LATAM SYSTEM' });
      await guild.roles.fetch();
    }
    assertAssignable(role, me);
    if (role.permissions.bitfield !== 0n) throw new UserError('THE FINALS debe ser un rol sin permisos. Retira sus permisos o configura un rol seguro.');
    const latest = bot.store.settings(guild.id);
    latest.finalsRole = role.id;
    bot.store.saveSettings(guild.id, latest);
    return role;
  });
}
export async function processRoleJobs(bot, guild) {
  const settings = bot.store.settings(guild.id);
  if (!settings.finalsRole) return;
  for (const job of bot.store.roleJobs(guild.id)) await bot.queue(`member-role:${guild.id}:${job.user}`, async () => {
    try {
      const role = await guild.roles.fetch(bot.store.settings(guild.id).finalsRole);
      assertAssignable(role, await guild.members.fetchMe());
      if (role.permissions.bitfield !== 0n) throw new UserError('THE FINALS tiene permisos; no se asignará hasta corregirlos.');
      const member = await guild.members.fetch(job.user);
      const updatedAt = bot.store.profile(guild.id, job.user)?.updatedAt;
      const desired = Boolean(bot.store.profile(guild.id, job.user)) || bot.store.reactionChoice(guild.id, job.user, role.id);
      if (desired && !member.roles.cache.has(role.id)) await member.roles.add(role.id, 'Perfil THE FINALS guardado');
      if (!desired && member.roles.cache.has(role.id) && !bot.store.settings(guild.id).integration?.preserveExternalGrants) await member.roles.remove(role.id, 'Perfil THE FINALS eliminado');
      await reconcileIdentityRoles(bot, guild, member);
      if (bot.store.profile(guild.id, job.user)?.updatedAt === updatedAt
        && (Boolean(bot.store.profile(guild.id, job.user)) || bot.store.reactionChoice(guild.id, job.user, role.id)) === desired) bot.store.finishRole(guild.id, job.user);
      else bot.store.queueRole(guild.id, job.user);
    } catch (error) {
      if (error.code === 10007) { bot.store.finishRole(guild.id, job.user); return; }
      bot.store.retryRole(guild.id, job.user);
      bot.accessGate?.pending.add(guild.id);
      if (job.attempts === 0) bot.log(error, 'Roles del perfil pendientes; se reintentará');
    }
  });
}
export async function ensureTeamsChannel(bot, guild) {
  const saved = bot.store.settings(guild.id);
  let channel = saved.teamsChannel ? await guild.channels.fetch(saved.teamsChannel).catch(() => null) : null;
  if (!channel) {
    const matches = guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.name === 'equipos');
    if (matches.size > 1) throw new UserError('Hay varios canales #equipos. Conserva uno con ese nombre.');
    channel = matches.first();
  }
  const me = await guild.members.fetchMe();
  if (!channel) {
    if (!me.permissions.has(P.ManageChannels)) throw new UserError('El bot necesita Administrar canales para crear #equipos.');
    channel = await guild.channels.create({ name: 'equipos', type: ChannelType.GuildText,
      topic: 'Solicitudes de THE FINALS. Usa Buscar compañeros en #buscar-equipo.',
      permissionOverwrites: [{ id: me.id, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles, P.ReadMessageHistory] }],
      reason: 'Separar solicitudes de los paneles de controles' });
  }
  await bot.channel(guild, channel.id);
  const latest = bot.store.settings(guild.id); latest.teamsChannel = channel.id; bot.store.saveSettings(guild.id, latest);
  return channel;
}
export async function lockControlChannel(guild, channel) {
  const me = await guild.members.fetchMe();
  if (!channel.permissionsFor(me)?.has(P.ManageChannels)) throw new UserError(`Falta Administrar canales en #${channel.name}.`);
  // Un permiso concedido a otro rol prevalece sobre @everyone. Retirar también esas excepciones.
  for (const overwrite of channel.permissionOverwrites.cache.values()) {
    if (overwrite.id === me.id || overwrite.id === me.roles.botRole?.id) continue;
    if (overwrite.allow.has([P.SendMessages], false) || overwrite.allow.has(P.SendMessagesInThreads) || overwrite.allow.has(P.CreatePublicThreads) || overwrite.allow.has(P.CreatePrivateThreads)) {
      await overwrite.edit({ SendMessages: false, SendMessagesInThreads: false, CreatePublicThreads: false, CreatePrivateThreads: false }, { reason: 'Canal de controles VEX LATAM SYSTEM' });
    }
  }
  await channel.permissionOverwrites.edit(guild.id, { SendMessages: false, SendMessagesInThreads: false,
    CreatePublicThreads: false, CreatePrivateThreads: false, AddReactions: false }, { reason: 'Solo controles del bot; administradores conservan acceso' });
  await channel.permissionOverwrites.edit(me.id, { ViewChannel: true, SendMessages: true, EmbedLinks: true,
    AttachFiles: true, ReadMessageHistory: true, PinMessages:me.permissions?.has(P.PinMessages)?true:null }, { reason: 'Publicar y fijar controles VEX LATAM SYSTEM' });
}
export async function relocateSearches(bot, guild, channel) {
  for (const item of bot.store.searches(guild.id)) {
    if (item.status !== 'open' || !item.message) continue;
    await bot.queue(`search:${item.id}`, async () => {
      let s = bot.store.search(item.id);
      if (s.channel !== channel.id) {
        const payload = await bot.searchCard(s, false);
        const message = await deliverCard(p => channel.send({ ...p, nonce: `move:${s.id.slice(0, 20)}`, enforceNonce: true }), payload);
        // Releer después del envío para conservar pulsaciones simultáneas.
        s = bot.store.search(s.id);
        s.relocations ??= [];
        s.relocations.push({ channel: s.channel, message: s.message });
        s.channel = channel.id; s.message = message.id; bot.store.updateSearch(s);
      }
      for (const old of [...(s.relocations ?? [])]) {
        try {
          const previous = await guild.channels.fetch(old.channel);
          await previous.messages.edit(old.message, { ...card('Equipo trasladado',
            `La solicitud continúa aquí: https://discord.com/channels/${guild.id}/${s.channel}/${s.message}`), attachments: [] });
          s = bot.store.search(s.id); s.relocations = s.relocations.filter(p => p.message !== old.message); bot.store.updateSearch(s);
        } catch (error) {
          if ([10008, 10003].includes(error.code)) {
            s = bot.store.search(s.id); s.relocations = s.relocations.filter(p => p.message !== old.message); bot.store.updateSearch(s);
          } else bot.log(error, 'Enlace de traslado pendiente');
        }
      }
    });
  }
}
