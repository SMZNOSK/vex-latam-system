// Prueba explícita: crea una sala vacía solo para el bot y la elimina.
// No publica mensajes, mueve personas ni modifica los perfiles reales.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Client, Events, GatewayIntentBits, PermissionFlagsBits as P } from 'discord.js';
import { Store } from '../src/store.js';
import { VexBot } from '../src/bot.js';
import { NEW_VOICE_GRACE } from '../src/voice-rooms.js';
import { config } from '../src/config.js';

if (!process.argv.includes('--live')) throw new Error('Usa --live para autorizar la prueba de creación de sala.');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
const store = new Store(':memory:');
let bot, guild, search;
try {
  await store.migrate();
  const ready = once(client, Events.ClientReady, { signal: AbortSignal.timeout(30000) });
  await client.login(process.env.DISCORD_TOKEN); await ready;
  guild = process.env.DISCORD_GUILD_ID ? await client.guilds.fetch(process.env.DISCORD_GUILD_ID)
    : client.guilds.cache.find(g => g.name === config.guildName);
  assert.ok(guild);
  bot = new VexBot(client, store, {}); bot.guilds.add(guild.id);
  const me = await guild.members.fetchMe();
  store.saveProfile(guild.id, me.id, { embarkId: 'Prueba#0000', score: 0, searchable: true });
  search = store.createSearch(guild.id, me.id, guild.id, { mode: 'Chill', teammates: 1 }, 600000, 0);
  search.status = 'open'; store.updateSearch(search);
  let responses = 0;
  bot.replyCard = async (_i, payload) => { assert.match(JSON.stringify(payload), /Abrir sala de voz/); responses++; };
  const interaction = { guild, guildId: guild.id, user: { id: me.id } };
  await Promise.all([bot.voiceRooms.access(interaction, search.id), bot.voiceRooms.access(interaction, search.id)]);
  assert.equal(responses, 2); assert.equal(store.voiceRooms(guild.id).length, 1);
  const room = store.voiceRoom(search.id), channel = await guild.channels.fetch(room.channel, { force: true });
  assert.equal(channel.userLimit, 2);
  assert.ok(channel.permissionOverwrites.cache.get(guild.id).allow.has(P.ViewChannel));
  assert.ok(channel.permissionOverwrites.cache.get(guild.id).deny.has(P.Connect));
  assert.equal(channel.members.size, 0);
  room.emptySince = Date.now() - NEW_VOICE_GRACE; store.saveVoiceRoom(room);
  await bot.voiceRooms.reconcile(guild);
  assert.equal(store.voiceRoom(search.id), null);
  assert.equal(await bot.voiceRooms.channel(guild, channel.id), null);
  console.log('Discord: sala visible con conexión restringida, acceso reutilizado y sala vacía eliminada.');
} finally {
  if (bot && guild && search) {
    const room = store.voiceRoom(search.id);
    if (room) {
      const channel = await bot.voiceRooms.channel(guild, room.channel);
      if (channel && !channel.members.size) await channel.delete('Finalizar prueba de voz de VEX BOT');
      else if (channel) console.error(`La sala de prueba ${room.channel} está ocupada y no se eliminó.`);
    }
  }
  client.destroy(); store.close();
}
