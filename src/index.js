import path from 'node:path';
import { Client, Events, GatewayIntentBits, Partials, REST, Routes } from 'discord.js';
import { Store } from './store.js';
import { Tracker } from './tracker.js';
import { VexBot } from './bot.js';
import { config, contentIntent, dataDir } from './config.js';
import { acquireProcessLock } from './runtime.js';
import { CardRenderer } from './renderer.js';
import { PlayerCards } from './player-cards.js';
import { hasMembersIntent } from './gateway-config.js';

const token = process.env.DISCORD_TOKEN?.trim();
if (!token) {
  console.error('Falta el token. Abre .env y pega tu token después de DISCORD_TOKEN=. Guarda y vuelve a iniciar.');
  process.exit(1);
}
const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessageReactions];
let membersEnabled = false;
try {
  const app = await new REST({ timeout: 15000 }).setToken(token).get(Routes.currentApplication());
  membersEnabled = hasMembersIntent(app.flags_new ?? app.flags);
} catch { console.error('No pude comprobar Server Members Intent; la bienvenida seguirá pendiente en este inicio.'); }
if (membersEnabled) intents.push(GatewayIntentBits.GuildMembers);
else console.error('Bienvenida pendiente: activa Server Members Intent en Developer Portal → Bot y reinicia. Las demás funciones seguirán disponibles.');
if (contentIntent) intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);
const client = new Client({ intents, partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User], allowedMentions: { parse: [], repliedUser: false } });
try {
  const release = acquireProcessLock(path.join(dataDir, 'bot.lock'));
  process.on('exit', release);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const store = new Store(path.join(dataDir, 'vex.sqlite'));
const snapshot = await store.migrate();
if (snapshot) console.log(`Respaldo previo a migración: ${snapshot}`);
const renderer = new CardRenderer();
const bot = new VexBot(client, store, new Tracker(config.trackerCacheMinutes * 60000), renderer, new PlayerCards(path.join(dataDir, 'player-cards')));
bot.membersIntent = membersEnabled;
client.once(Events.ClientReady, () => bot.ready().catch(error => {
  bot.log(error, 'Inicio');
  stop(1);
}));
client.on(Events.InteractionCreate, i => bot.interaction(i));
client.on(Events.MessageCreate, message => bot.handleMessage(message));
client.on(Events.GuildMemberAdd, member => {
  if (bot.guilds.has(member.guild.id) && !member.user.bot) store.queueRole(member.guild.id, member.id);
  bot.community.welcome(member).catch(error => bot.log(error, 'Bienvenida automática'));
});
client.on(Events.GuildMemberUpdate, (before, member) => {
  if (bot.guilds.has(member.guild.id) && !member.user.bot) store.queueRole(member.guild.id, member.id);
});
client.on(Events.GuildMemberRemove, member => {
  bot.community.farewell(member).catch(error => bot.log(error, 'Despedida automática'));
  bot.clans.left(member).catch(error => bot.log(error,'Actualizar membresía de clan al salir del servidor'));
});
client.on(Events.MessageReactionAdd, (reaction, user) => bot.community.reactions.handle(reaction, user, true).catch(error => bot.log(error, 'Asignar auto rol')));
client.on(Events.MessageReactionRemove, (reaction, user) => bot.community.reactions.handle(reaction, user, false).catch(error => bot.log(error, 'Retirar auto rol')));
const reconcileReactions = message => {
  if (!message.guild || !bot.guilds.has(message.guild.id) || bot.store.settings(message.guild.id).panels?.roles?.message !== message.id) return;
  bot.community.reactions.reconcile(message.guild).catch(error => bot.log(error, 'Sincronizar reacciones'));
};
client.on(Events.MessageReactionRemoveAll, reconcileReactions);
client.on(Events.MessageReactionRemoveEmoji, reaction => reconcileReactions(reaction.message));
client.on(Events.ShardResume, () => {
  for (const id of bot.guilds) client.guilds.fetch(id).then(guild => bot.community.reactions.reconcile(guild)).catch(error => bot.log(error, 'Recuperar reacciones tras reconexión'));
});
client.on(Events.VoiceStateUpdate, (_before, after) => {
  if (bot.guilds.has(after.guild.id)) bot.voiceRooms.reconcile(after.guild).catch(error => bot.log(error, 'Estado de voz'));
});
client.on(Events.Error, error => bot.log(error, 'Conexión'));
client.on(Events.ShardError, error => bot.log(error, 'Conexión'));
client.on(Events.ShardDisconnect, event => {
  if (event.code === 4014) {
    console.error('Discord rechazó los intents. Revisa Server Members Intent y, si activaste lectura de texto, Message Content Intent en Developer Portal → Bot.');
    stop(1);
  }
});
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearInterval(bot.timer);
  bot.voiceRooms.stop();
  bot.privateReplies.stop();
  client.destroy();
  await renderer.close().catch(() => {});
  store.close();
  process.exit(code);
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
client.login(token).catch(error => {
  console.error(`No pude conectar el bot (${error.code ?? error.name}). Revisa el token y la conexión; no publiques el token.`);
  stop(1);
});
