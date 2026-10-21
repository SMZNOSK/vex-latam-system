// Read-only inventory. Run only after the bot joins the target guild:
// node --env-file=.env scripts/audit-server-roles.js GUILD_ID
import { Client, GatewayIntentBits, PermissionFlagsBits as P } from 'discord.js';

const guildId = process.argv[2];
if (!/^\d{17,20}$/.test(guildId ?? '')) throw new Error('Indica el ID del servidor.');
const token = process.env.DISCORD_TOKEN?.trim();
if (!token) throw new Error('Falta DISCORD_TOKEN en .env.');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
try {
  await client.login(token);
  const guild = await client.guilds.fetch(guildId);
  await guild.roles.fetch();
  const bot = await guild.members.fetchMe();
  const roles = [...guild.roles.cache.values()].sort((a, b) => b.position - a.position).map(role => ({
    id: role.id,
    name: role.name,
    position: role.position,
    managed: role.managed,
    administrator: role.permissions.has(P.Administrator),
    permissions: role.permissions.toArray(),
    botCanAssign: role.id !== guild.id && !role.managed && role.position < bot.roles.highest.position && bot.permissions.has(P.ManageRoles),
  }));
  console.log(JSON.stringify({ guild: { id: guild.id, name: guild.name }, botHighestRole: {
    id: bot.roles.highest.id, name: bot.roles.highest.name, position: bot.roles.highest.position,
  }, roles }, null, 2));
} finally {
  client.destroy();
}
