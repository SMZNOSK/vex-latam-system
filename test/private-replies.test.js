import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageFlags, MessageFlagsBitField } from 'discord.js';
import { Store } from '../src/store.js';
import { VexBot } from '../src/bot.js';
import { card, panelPayload } from '../src/ui.js';

function setup() {
  const store = new Store(':memory:');
  const bot = new VexBot({}, store, {}); bot.guilds.add('g'); bot.log = () => {};
  const messages = new Map(), calls = []; let count = 0;
  function interaction({ user = 'u', guild = 'g', channel = 'c', source = null, customId = null, modal = false } = {}) {
    let original = source;
    const i = { guildId: guild, channelId: channel, user: { id: user }, createdTimestamp: Date.now(), customId,
      message: source ? { id: source, flags: new MessageFlagsBitField(messages.get(source)?.flags ?? 0) } : null,
      inGuild: () => true, isButton: () => !modal, isModalSubmit: () => modal, isChatInputCommand: () => false,
      async deferUpdate() { i.deferred = true; calls.push(['deferUpdate', source]); },
      async deferReply() { i.deferred = true; original = `m${++count}`; messages.set(original, { flags: MessageFlags.Ephemeral }); calls.push(['deferReply', original]); },
      async reply(payload) { i.replied = true; original = `m${++count}`; messages.set(original, payload); calls.push(['reply', original]); return { resource: { message: { id: original } } }; },
      async editReply(payload) { if (!messages.has(original)) throw Object.assign(new Error('Mensaje eliminado'), { code: 10008 }); i.replied = true; messages.set(original, { ...messages.get(original), ...payload,
        flags: (messages.get(original).flags ?? 0) | (payload.flags ?? 0) }); calls.push(['edit', original]); return { id: original }; },
      async followUp(payload) { const id = `m${++count}`; messages.set(id, payload); calls.push(['followUp', id]); return { id }; },
      async deleteReply(id = original) { messages.delete(id); calls.push(['delete', id]); },
    };
    return i;
  }
  return { bot, store, messages, calls, interaction,
    close() { bot.privateReplies.stop(); store.close(); } };
}
const json = payload => JSON.stringify(payload);

test('botones y formularios de un panel privado editan el mismo mensaje y renuevan su limpieza', async () => {
  const f = setup();
  try {
    const first = f.interaction(); await f.bot.replyCard(first, card('Perfil', 'Datos'));
    const id = [...f.messages.keys()][0];
    assert.ok(json(f.messages.get(id)).includes('private:close'));
    const button = f.interaction({ source: id }); await f.bot.ackCard(button); await f.bot.replyCard(button, card('Perfil', 'Actualizado'));
    const modal = f.interaction({ source: id, modal: true }); await f.bot.ackCard(modal); await f.bot.replyCard(modal, card('Perfil', 'RS actualizados'));
    assert.equal(f.messages.size, 1); assert.equal(f.bot.privateReplies.items.size, 1);
    assert.equal(f.calls.filter(c => c[0] === 'reply').length, 1);
    assert.equal(f.calls.filter(c => c[0] === 'deferUpdate').length, 2);
    assert.equal(f.calls.filter(c => c[0] === 'delete').length, 0);
    assert.ok(json(f.messages.get(id)).includes('RS actualizados'));
  } finally { f.close(); }
});

test('desde una tarjeta pública crea una respuesta privada y conserva el mensaje público', async () => {
  const f = setup();
  try {
    f.messages.set('public', panelPayload('buscar', {}));
    const i = f.interaction({ source: 'public' }); await f.bot.replyCard(i, card('Buscar', 'Borrador'));
    assert.equal(f.messages.size, 2); assert.equal(f.calls.filter(c => c[0] === 'deferUpdate').length, 0);
    await f.bot.privateReplies.clear(i); assert.deepEqual([...f.messages.keys()], ['public']);
  } finally { f.close(); }
});

test('abrir otro panel retira el anterior; acciones simultáneas terminan con una sola respuesta', async () => {
  const f = setup();
  try {
    await Promise.all([
      f.bot.replyCard(f.interaction(), card('Perfil', 'Uno')),
      f.bot.replyCard(f.interaction(), card('Perfil', 'Dos')),
      f.bot.replyCard(f.interaction(), card('Perfil', 'Tres')),
    ]);
    assert.equal(f.messages.size, 1); assert.equal(f.bot.privateReplies.items.size, 1);
    assert.ok(json([...f.messages.values()][0]).includes('Tres'));
  } finally { f.close(); }
});

test('Cerrar panel elimina solo el mensaje privado pulsado; no permite borrar la tarjeta pública', async () => {
  const f = setup();
  try {
    await f.bot.replyCard(f.interaction(), card('Perfil', 'Datos')); const id = [...f.messages.keys()][0];
    await f.bot.interaction(f.interaction({ source: id, customId: 'private:close' }));
    assert.equal(f.messages.size, 0); assert.equal(f.bot.privateReplies.items.size, 0);
    f.messages.set('public', panelPayload('registro', {}));
    await f.bot.interaction(f.interaction({ source: 'public', customId: 'private:close' }));
    assert.ok(f.messages.has('public'));
  } finally { f.close(); }
});

test('Limpiar mis mensajes abarca ambos canales y respeta otros usuarios y servidores', async () => {
  const f = setup();
  try {
    await f.bot.replyCard(f.interaction({ channel: 'registro' }), card('Perfil', 'Datos'));
    await f.bot.replyCard(f.interaction({ channel: 'buscar' }), card('Equipo', 'Datos'));
    await f.bot.replyCard(f.interaction({ user: 'other' }), card('Otro', 'Datos'));
    await f.bot.replyCard(f.interaction({ guild: 'elsewhere' }), card('Otro servidor', 'Datos'));
    await f.bot.interaction(f.interaction({ channel: 'registro', customId: 'private:clear' }));
    assert.equal(f.bot.privateReplies.items.size, 3); // Otros dos y confirmación temporal.
    const texts = [...f.messages.values()].map(json).join('\n');
    assert.ok(!texts.includes('## Perfil')); assert.ok(!texts.includes('## Equipo'));
    assert.ok(texts.includes('Otro servidor')); assert.ok(texts.includes('Paneles privados recientes limpiados'));
  } finally { f.close(); }
});

test('limpieza automática retira respuestas y tokens; fallos transitorios se reintentan', async () => {
  const f = setup();
  try {
    const i = f.interaction(); const response = await i.reply({ content: 'Temporal', flags: MessageFlags.Ephemeral });
    await f.bot.privateReplies.remember(i, response, { ttl: 5 });
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(f.messages.size, 0); assert.equal(f.bot.privateReplies.items.size, 0);
    const retry = f.interaction(); const r = await retry.reply({ content: 'Reintentar', flags: MessageFlags.Ephemeral });
    const originalDelete = retry.deleteReply; let attempts = 0;
    retry.deleteReply = async id => { attempts++; if (attempts === 1) throw Object.assign(new Error('Red'), { code: 'ECONNRESET' }); await originalDelete(id); };
    await f.bot.privateReplies.remember(retry, r); const item = [...f.bot.privateReplies.items.values()][0];
    assert.equal(await f.bot.privateReplies.remove(item), false); assert.equal(f.messages.size, 1);
    assert.equal(await f.bot.privateReplies.remove(item), true); assert.equal(f.messages.size, 0);
  } finally { f.close(); }
});

test('los errores de una acción privada dejan el asistente disponible y su aviso se limpia aparte', async () => {
  const f = setup();
  try {
    await f.bot.replyCard(f.interaction(), card('Asistente', 'Datos')); const id = [...f.messages.keys()][0];
    const i = f.interaction({ source: id }); await f.bot.ackCard(i); await f.bot.sendPrivate(i, 'Error de validación', {}, true);
    assert.equal(f.messages.size, 2); assert.ok(json(f.messages.get(id)).includes('Asistente'));
    const error = [...f.bot.privateReplies.items.values()].find(item => item.id !== id);
    await f.bot.privateReplies.remove(error); assert.equal(f.messages.size, 1);
  } finally { f.close(); }
});
test('un formulario enviado tras la limpieza recupera el asistente en un único mensaje nuevo', async () => {
  const f = setup();
  try {
    await f.bot.replyCard(f.interaction(), card('Asistente', 'Paso uno')); const id = [...f.messages.keys()][0];
    const modal = f.interaction({ source: id, modal: true });
    await f.bot.privateReplies.clear(modal); assert.equal(f.messages.size, 0);
    await f.bot.ackCard(modal); await f.bot.replyCard(modal, card('Asistente', 'Datos conservados'));
    assert.equal(f.messages.size, 1); assert.equal(f.bot.privateReplies.items.size, 1);
    assert.ok(json([...f.messages.values()][0]).includes('Datos conservados'));
  } finally { f.close(); }
});
