// Solo lectura: comprueba estructura, permisos y carteles sin enviar mensajes.
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { REST, Routes, ChannelType, PermissionFlagsBits as P, PermissionsBitField } from 'discord.js';
import { config, dataDir } from '../src/config.js';
import { mailboxChannels } from '../src/mailboxes.js';

const guildId = process.env.DISCORD_GUILD_ID?.trim();
if (!guildId) throw new Error('Falta DISCORD_GUILD_ID.');
if (process.argv.includes('--assert-test')) assert.equal(guildId, config.testGuildId, 'El destino debe ser el servidor de pruebas.');
const api = new REST({ timeout: 15000 }).setToken(process.env.DISCORD_TOKEN?.trim());
const [guild, me, roles, channels] = await Promise.all([
  api.get(Routes.guild(guildId)), api.get(Routes.user()), api.get(Routes.guildRoles(guildId)), api.get(Routes.guildChannels(guildId)),
]);
const botMember = await api.get(Routes.guildMember(guildId, me.id));
const db = new DatabaseSync(path.join(dataDir, 'vex.sqlite'), { readOnly: true });
try {
  const settings = JSON.parse(db.prepare('SELECT data FROM settings WHERE guild=?').get(guildId)?.data ?? '{}').mailboxes;
  assert.ok(settings, 'Buzones sin instalar.');
  for (const key of ['adminCategory', 'publicCategory', 'adminCommands', 'feedbackInbox', 'reportInbox', 'feedbackPublic', 'reportPublic']) {
    assert.ok(settings.channels?.[key], `Falta referencia de ${key}.`);
  }
  assert.deepEqual(Object.keys(settings.panels ?? {}).sort(), ['feedback', 'report']);
  const overwrites = c => c.permission_overwrites ?? [];
  function permissions(c, roleIds, memberId) {
    let bits = roles.filter(r => r.id === guildId || roleIds.includes(r.id)).reduce((n, r) => n | BigInt(r.permissions), 0n);
    if (bits & P.Administrator) return new PermissionsBitField(PermissionsBitField.All);
    const apply = o => { if (o) bits = (bits & ~BigInt(o.deny)) | BigInt(o.allow); };
    apply(overwrites(c).find(o => o.id === guildId));
    const ownRoles = overwrites(c).filter(o => o.type === 0 && roleIds.includes(o.id));
    bits = (bits & ~ownRoles.reduce((n, o) => n | BigInt(o.deny), 0n)) | ownRoles.reduce((n, o) => n | BigInt(o.allow), 0n);
    apply(overwrites(c).find(o => o.type === 1 && o.id === memberId));
    return new PermissionsBitField(bits);
  }
  const nonAdminRoles = roles.filter(r => !(BigInt(r.permissions) & P.Administrator)).map(r => r.id);
  const adminRoles = roles.filter(r => BigInt(r.permissions) & P.Administrator).map(r => r.id);
  const result = { guild: { id: guild.id, name: guild.name }, channels: [], panels: [] };
  for (const [key, id] of Object.entries(settings.channels)) {
    const c = channels.find(c => c.id === id); assert.ok(c, `Falta ${key}.`);
    const hidden = ['adminCategory', 'adminCommands', 'feedbackInbox', 'reportInbox', 'testing'].includes(key);
    const category = key.endsWith('Category');
    assert.equal(c.type, category ? ChannelType.GuildCategory : ChannelType.GuildText);
    assert.equal(c.name, key === 'adminCategory' ? 'ADMIN PANEL' : key === 'publicCategory' ? 'BUZONES' : mailboxChannels[key]);
    if (!category) assert.equal(c.parent_id, hidden ? settings.channels.adminCategory : settings.channels.publicCategory);
    assert.equal(channels.filter(x => x.name === c.name && x.parent_id === c.parent_id && x.type === c.type).length, 1, `${c.name} duplicado.`);
    const normal = permissions(c, []), manager = permissions(c, nonAdminRoles);
    assert.equal(normal.has(P.ViewChannel), !hidden); assert.equal(manager.has(P.ViewChannel), !hidden);
    if (!hidden) assert.equal(normal.has(P.SendMessages), false);
    if (adminRoles.length) assert.equal(permissions(c, adminRoles).has(P.ViewChannel), true);
    if (hidden) for (const o of overwrites(c).filter(o => BigInt(o.allow) & P.ViewChannel)) {
      assert.ok(o.id === me.id || o.type === 0 && roles.some(r => r.id === o.id && BigInt(r.permissions) & P.Administrator), `${c.name}: acceso adicional no administrativo.`);
    }
    assert.ok(permissions(c, botMember.roles, me.id).has([P.ViewChannel, P.SendMessages, P.EmbedLinks]));
    result.channels.push({ name: c.name, private: hidden, parent: c.parent_id, url: `https://discord.com/channels/${guildId}/${id}` });
  }
  assert.equal(Boolean(settings.channels.testing), guildId === config.testGuildId, 'El canal de pruebas debe limitarse al servidor de pruebas.');
  for (const [kind, ref] of Object.entries(settings.panels)) {
    const [message, recent] = await Promise.all([
      api.get(Routes.channelMessage(ref.channel, ref.message)), api.get(Routes.channelMessages(ref.channel), { query: new URLSearchParams({ limit: '50' }) }),
    ]);
    assert.equal(message.author.id, me.id); assert.equal(message.pinned, true);
    assert.ok(JSON.stringify(message.components).includes(`mailbox:open:${kind}`));
    const copies = recent.filter(m => m.author.id === me.id && JSON.stringify(m.components).includes(`mailbox:open:${kind}`)).length;
    assert.equal(copies, 1, `Cartel ${kind} duplicado.`);
    result.panels.push({ kind, pinned: message.pinned, copies, url: `https://discord.com/channels/${guildId}/${ref.channel}/${ref.message}` });
  }
  console.log(JSON.stringify(result, null, 2));
} finally { db.close(); }
