// Vista previa por defecto. --apply modifica únicamente el destino y la configuración local.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { DatabaseSync, backup } from 'node:sqlite';
import { REST, Routes, ChannelType, PermissionsBitField, PermissionFlagsBits as P } from 'discord.js';
import { root, dataDir } from '../src/config.js';
import { Store } from '../src/store.js';
import { CardRenderer } from '../src/renderer.js';
import { PlayerCards } from '../src/player-cards.js';
import { VexBot } from '../src/bot.js';
import { migratedSettings, remapOverwrites, remapServerText } from '../src/server-migration.js';

const aliases = { 'registro-de-datos': 'regis0itro', 'buscar-equipo': 'buscar-squad', equipos: 'crear-squad', 'SALA 1': 'General' };
const reason = 'Migración de VEX LATAM SYSTEM al servidor nuevo solicitada por su administrador';

async function migrate() {
  const args = process.argv.slice(2), option = name => args[args.indexOf(name) + 1];
  const sourceId = args.includes('--source') ? option('--source') : null;
  const targetId = args.includes('--target') ? option('--target') : null;
  if (!/^\d{17,20}$/.test(sourceId ?? '') || !/^\d{17,20}$/.test(targetId ?? '') || sourceId === targetId) {
    throw new Error('Usa --source ID --target ID distintos. Añade --apply para ejecutar.');
  }
  const apply = args.includes('--apply');
  const layout = args.includes('--layout') ? JSON.parse(readFileSync(option('--layout'), 'utf8')) : {};
  const rest = new REST({ timeout: 20000 }).setToken(process.env.DISCORD_TOKEN);
  const me = await rest.get(Routes.user());
  const load = async id => {
    const [guild, channels, roles, member] = await Promise.all([rest.get(Routes.guild(id)),
      rest.get(Routes.guildChannels(id)), rest.get(Routes.guildRoles(id)), rest.get(Routes.guildMember(id, me.id))]);
    return { guild, channels, roles, member };
  };
  const [source, target] = await Promise.all([load(sourceId), load(targetId)]);
  const read = new DatabaseSync(path.join(dataDir, 'vex.sqlite'), { readOnly: true });
  const sourceRow = read.prepare('SELECT data FROM settings WHERE guild=?').get(sourceId);
  const targetRow = read.prepare('SELECT data FROM settings WHERE guild=?').get(targetId);
  if (!sourceRow) { read.close(); throw new Error('El origen no tiene configuración guardada.'); }
  const sourceSettings = JSON.parse(sourceRow.data);
  const targetSettings = targetRow ? JSON.parse(targetRow.data) : null;
  const profileCount = read.prepare('SELECT count(*) AS n FROM profiles WHERE guild=?').get(sourceId).n;
  const transient = new Set(read.prepare('SELECT channel FROM voice_rooms WHERE guild=?').all(sourceId).map(r => r.channel));
  read.close();
  const permissions = new PermissionsBitField(target.roles.filter(r => r.id === targetId || target.member.roles.includes(r.id))
    .reduce((bits, role) => bits | BigInt(role.permissions), 0n));
  if (!permissions.has([P.ManageRoles, P.ManageChannels, P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.PinMessages])) {
    throw new Error('Faltan permisos del bot para preparar roles, canales, imágenes o paneles.');
  }
  const cloneRoles = source.roles.filter(r => r.id !== sourceId && !r.managed && r.permissions === '0');
  const skippedRoles = source.roles.filter(r => r.id !== sourceId && !r.managed && r.permissions !== '0');
  const sourceChannels = source.channels.filter(c => !transient.has(c.id) && [ChannelType.GuildCategory, ChannelType.GuildText, ChannelType.GuildVoice].includes(c.type));
  const preview = { source: source.guild.name, target: target.guild.name, targetOwner: target.guild.owner_id,
    channels: sourceChannels.map(c => c.name), roles: cloneRoles.map(r => r.name), profiles: profileCount,
    skippedPrivilegedRoles: skippedRoles.map(r => r.name), moveMembers: permissions.has(P.MoveMembers) };
  console.log(JSON.stringify(preview, null, 2));
  if (!apply) return;
  if (targetSettings && targetSettings.migration?.sourceGuild !== sourceId) throw new Error('El destino ya tiene otra configuración; no se sobrescribirá.');
  const lockFile = path.join(dataDir, 'bot.lock');
  if (existsSync(lockFile)) {
    const lock = JSON.parse(readFileSync(lockFile, 'utf8'));
    let alive = false;
    try { process.kill(lock.pid, 0); alive = true; } catch (error) { if (error.code !== 'ESRCH') throw error; }
    if (alive) throw new Error('Detén el proceso del bot antes de aplicar la migración.');
  }
  const directory = path.join(dataDir, 'server-migrations'); mkdirSync(directory, { recursive: true });
  const stateFile = path.join(directory, `${sourceId}-to-${targetId}.json`);
  const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8'))
    : { sourceId, targetId, roleMap: {}, channelMap: {}, searchMap: {}, createdAt: Date.now(), preview };
  if (state.sourceId !== sourceId || state.targetId !== targetId) throw new Error('El registro de migración no coincide.');
  const save = () => writeFileSync(stateFile, JSON.stringify(state, null, 2));
  const store = new Store(path.join(dataDir, 'vex.sqlite'));
  const renderer = new CardRenderer();
  try {
    if (!state.backup) {
      const backupDir = path.join(dataDir, 'backups'); mkdirSync(backupDir, { recursive: true });
      state.backup = path.join(backupDir, `vex-before-server-migration-${Date.now()}.sqlite`);
      await backup(store.db, state.backup);
      state.snapshot = { source, target, sourceSettings };
      save();
    }
    state.roleMap[sourceId] = targetId;
    const sourceBotRole = source.roles.find(r => r.tags?.bot_id === me.id);
    const targetBotRole = target.roles.find(r => r.tags?.bot_id === me.id);
    if (sourceBotRole && targetBotRole) state.roleMap[sourceBotRole.id] = targetBotRole.id;
    for (const role of cloneRoles) {
      let next = target.roles.find(r => r.id === state.roleMap[role.id]);
      if (!next) next = target.roles.find(r => r.name === role.name && !r.managed && r.permissions === '0');
      if (!next) {
        next = await rest.post(Routes.guildRoles(targetId), { body: { name: role.name, permissions: '0',
          color: role.colors?.primary_color ?? role.color, hoist: role.hoist, mentionable: role.mentionable }, reason });
        target.roles.push(next);
      }
      state.roleMap[role.id] = next.id; save();
    }
    console.log(`Roles de juegos, modos e identidad listos: ${cloneRoles.length}.`);
    const memberIds = new Set([me.id, target.guild.owner_id]);
    const profileUsers = store.db.prepare('SELECT user FROM profiles WHERE guild=?').all(sourceId).map(r => r.user);
    for (const id of new Set([...profileUsers, ...source.channels.flatMap(c => c.permission_overwrites.filter(o => o.type === 1).map(o => o.id))])) {
      if (memberIds.has(id)) continue;
      try { await rest.get(Routes.guildMember(targetId, id)); memberIds.add(id); }
      catch (error) { if (error.code !== 10007) throw error; }
    }
    const used = new Set(Object.values(state.channelMap));
    for (const channel of [...sourceChannels].sort((a, b) => (a.type === 4 ? 0 : 1) - (b.type === 4 ? 0 : 1) || a.position - b.position)) {
      let next = target.channels.find(c => c.id === (layout[channel.id] ?? state.channelMap[channel.id]));
      if (layout[channel.id] && (!next || next.type !== channel.type)) throw new Error('El canal seleccionado para el diseño no existe o tiene otro tipo.');
      if (layout[channel.id] && state.channelMap[channel.id] && state.channelMap[channel.id] !== next.id) {
        if (state.databaseCopied) throw new Error('La base de datos ya se copió; no se pueden sustituir sus canales automáticamente.');
        state.redundantChannels ??= [];
        if (!state.redundantChannels.includes(state.channelMap[channel.id])) state.redundantChannels.push(state.channelMap[channel.id]);
      }
      if (!next) next = target.channels.find(c => !used.has(c.id) && c.type === channel.type && c.name === channel.name);
      if (!next && aliases[channel.name]) next = target.channels.find(c => !used.has(c.id) && c.type === channel.type && c.name === aliases[channel.name]);
      const body = { name: layout[channel.id] ? next.name : channel.name,
        parent_id: layout[channel.id] ? next.parent_id : channel.parent_id ? state.channelMap[channel.parent_id] : null,
        permission_overwrites: remapOverwrites(channel.permission_overwrites, state.roleMap, memberIds) };
      if (channel.type === ChannelType.GuildText) Object.assign(body, { topic: remapServerText(channel.topic, state.channelMap, state.roleMap),
        nsfw: channel.nsfw, rate_limit_per_user: channel.rate_limit_per_user ?? 0 });
      if (channel.type === ChannelType.GuildVoice) Object.assign(body, { bitrate: Math.min(channel.bitrate, 96000),
        user_limit: channel.user_limit, rtc_region: channel.rtc_region, video_quality_mode: channel.video_quality_mode ?? 1 });
      if (next) next = await rest.patch(Routes.channel(next.id), { body, reason });
      else { next = await rest.post(Routes.guildChannels(targetId), { body: { ...body, type: channel.type }, reason }); target.channels.push(next); }
      state.channelMap[channel.id] = next.id; used.add(next.id); save();
    }
    // Los padres ya se asignaron individualmente; Discord rechaza cambios de varios padres en esta operación.
    await rest.patch(Routes.guildChannels(targetId), { body: sourceChannels.filter(c => !layout[c.id])
      .map(c => ({ id: state.channelMap[c.id], position: c.position })), reason });
    console.log(`Canales preparados con categorías y permisos: ${sourceChannels.length}.`);
    if (!state.databaseCopied) {
      const searches = store.db.prepare('SELECT * FROM searches WHERE guild=?').all(sourceId);
      for (const row of searches) state.searchMap[row.id] ??= { id: randomUUID() };
      save();
      store.db.exec('BEGIN IMMEDIATE');
      try {
        store.saveSettings(targetId, migratedSettings(sourceSettings, sourceId, state.channelMap, state.roleMap, memberIds));
        store.db.prepare('INSERT INTO profiles(guild,user,data) SELECT ?,user,data FROM profiles WHERE guild=? ON CONFLICT(guild,user) DO NOTHING')
          .run(targetId, sourceId);
        for (const row of searches) {
          const data = JSON.parse(row.data), active = row.status === 'open' && row.expires > Date.now() && memberIds.has(row.host);
          const id = state.searchMap[row.id].id;
          if (!store.search(id)) store.insertSearch({ ...row, id, guild: targetId, channel: state.channelMap[row.channel] ?? state.channelMap[sourceSettings.teamsChannel],
            message: null, status: active ? 'open' : row.status === 'open' || row.status === 'pending' ? 'expired' : row.status,
            filters: data.filters, members: active ? data.members.filter(user => memberIds.has(user)) : data.members, relocations: [] });
        }
        for (const profile of store.profiles(targetId)) store.queueRole(targetId, profile.user);
        store.db.exec('COMMIT');
        state.databaseCopied = true; save();
      } catch (error) { store.db.exec('ROLLBACK'); throw error; }
    }
    // Restaurar roles de juegos de miembros que ya están en el destino. Las reacciones nuevas tienen su propio registro.
    for (const user of memberIds) {
      if (user === me.id) continue;
      let old;
      try { old = await rest.get(Routes.guildMember(sourceId, user)); }
      catch (error) { if (error.code === 10007) continue; throw error; }
      for (const id of old.roles.filter(id => cloneRoles.some(role => role.id === id))) {
        await rest.put(Routes.guildMemberRole(targetId, user, state.roleMap[id]), { reason });
      }
    }
    const bot = new VexBot({ user: { id: me.id } }, store, {}, renderer, new PlayerCards(path.join(dataDir, 'player-cards')));
    for (const [oldId, ref] of Object.entries(state.searchMap)) {
      const search = store.search(ref.id);
      if (search.status !== 'open' || search.expires <= Date.now() || search.message) continue;
      if (!ref.message) {
        const payload = await bot.searchCard(search, false);
        const { files = [], allowedMentions, ...body } = payload;
        body.components = body.components.map(component => component.toJSON());
        body.allowed_mentions = { parse: [], users: [], roles: [], replied_user: false };
        body.attachments = files.map((file, id) => ({ id, filename: file.name }));
        body.nonce = createHash('sha256').update(`migrate:${targetId}:${oldId}`).digest('hex').slice(0, 25); body.enforce_nonce = true;
        const message = await rest.post(Routes.channelMessages(search.channel), { body,
          files: files.map(file => ({ name: file.name, data: file.attachment })) });
        ref.message = message.id; save();
      }
      search.message = ref.message; store.updateSearch(search);
    }
    const envFile = path.join(root, '.env'), env = readFileSync(envFile, 'utf8');
    writeFileSync(envFile, /^DISCORD_GUILD_ID\s*=/m.test(env) ? env.replace(/^DISCORD_GUILD_ID\s*=.*$/m, `DISCORD_GUILD_ID=${targetId}`)
      : `${env}\nDISCORD_GUILD_ID=${targetId}\n`);
    const configFile = path.join(root, 'bot.config.json'), config = JSON.parse(readFileSync(configFile, 'utf8'));
    config.guildName = target.guild.name; writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
    state.completedAt = Date.now(); save();
    console.log(JSON.stringify({ migratedTo: target.guild.name, id: targetId, profiles: store.profiles(targetId).length,
      sourceUnchanged: true, checkpoint: stateFile, missingMoveMembers: !permissions.has(P.MoveMembers),
      skippedPrivilegedRoles: skippedRoles.map(r => r.name) }, null, 2));
  } finally { await renderer.close(); store.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) migrate().catch(error => {
  console.error(`Migración detenida: ${error.code ?? error.message}`); process.exitCode = 1;
});
