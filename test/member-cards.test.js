import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { MemberCards, discordAvatarURL } from '../src/member-cards.js';
import { template } from '../src/card-template.js';
import { Store } from '../src/store.js';

const avatarURL = 'https://cdn.discordapp.com/avatars/123/abcdef.png?size=512';
test('avatares solo aceptan el CDN de Discord y las rutas de avatar o imagen predeterminada', () => {
  assert.equal(discordAvatarURL(avatarURL), avatarURL);
  assert.ok(discordAvatarURL('https://cdn.discordapp.com/guilds/1/users/2/avatars/hash.png?size=512'));
  assert.ok(discordAvatarURL('https://cdn.discordapp.com/embed/avatars/0.png'));
  for (const url of ['https://example.com/avatar.png', 'http://cdn.discordapp.com/avatars/1/hash.png',
    'https://name:password@cdn.discordapp.com/avatars/1/hash.png', 'https://cdn.discordapp.com/attachments/1/2/card.png',
    'https://cdn.discordapp.com:444/avatars/1/hash.png', 'file:///C:/photo.png', 'data:image/png;base64,eA==']) assert.equal(discordAvatarURL(url), null);
});

test('normaliza avatar, usa la imagen del servidor y reutiliza la descarga por URL sin archivos persistentes', async () => {
  const input = await sharp({ create: { width: 80, height: 110, channels: 3, background: '#e3273e' } }).png().toBuffer();
  let requests = 0, options;
  const cards = new MemberCards({}, async (url, o) => { requests++; options = o; assert.equal(url, avatarURL); return new Response(input); });
  const member = { displayAvatarURL: opts => { assert.equal(opts.forceStatic, true); return avatarURL; }, user: { displayAvatarURL: () => 'https://example.com/ignored.png' } };
  const result = await cards.avatar(member); assert.match(result, /^data:image\/png;base64,/);
  assert.equal(await cards.avatar(member), result); assert.equal(requests, 1); assert.equal(options.redirect, 'error');
  const metadata = await sharp(Buffer.from(result.split(',')[1], 'base64')).metadata();
  assert.equal(metadata.width, 512); assert.equal(metadata.height, 512); assert.equal(metadata.exif, undefined);
});

test('avatar no disponible, respuesta inválida o descarga excesiva usan iniciales sin peticiones externas', async () => {
  const member = { displayAvatarURL: () => avatarURL };
  for (const response of [() => new Response('invalid image'), () => new Response(null, { status: 404 }),
    () => new Response('x', { headers: { 'content-length': String(3 * 1024 * 1024) } }),
    () => new Response(new Uint8Array(2 * 1024 * 1024 + 1))]) {
    const cards = new MemberCards({}, async () => response()); assert.equal(await cards.avatar(member), null);
  }
  const blocked = new MemberCards({}, () => assert.fail('No descargar URLs externas'));
  assert.equal(await blocked.avatar({ displayAvatarURL: () => 'https://example.com/photo.png' }), null);
  assert.equal(await blocked.avatar({ user: {} }), null);
  const failing = new MemberCards({}, async () => { throw new Error('timeout'); }); assert.equal(await failing.avatar(member), null);
});

test('HTML de ambas tarjetas escapa nombres, evita URLs externas y conserva encabezados accesibles', () => {
  for (const kind of ['welcome', 'farewell']) {
    const html = template(kind, { displayName: '<script>alert(1)</script>', serverName: 'Servidor & equipo', avatarData: 'https://example.com/leak.png' }, 390);
    assert.ok(!html.includes('<script>')); assert.ok(!html.includes('https://example.com'));
    assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('Servidor &amp; equipo'));
    assert.ok(html.includes('aria-label="Iniciales')); assert.ok(html.includes('font-src data:; img-src data:'));
    assert.equal((html.match(/<h1>/g) ?? []).length, 1);
  }
  assert.throws(() => template('welcome', {}, 0), RangeError);
});

test('migración v5 a v6 conserva perfiles y bienvenida, y las despedidas se deduplican al reabrir SQLite', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vex-member-events-')), file = path.join(dir, 'bot.sqlite');
  let store = new Store(file);
  try {
    await store.migrate(); store.saveProfile('g', 'u', { score: 12345 }); store.saveWelcome('g', 'u', 1000, 'welcome');
    store.db.exec('DROP TABLE farewell_events; PRAGMA user_version=5');
    const before = store.profile('g', 'u'), snapshot = await store.migrate(); assert.ok(existsSync(snapshot));
    const backup = new DatabaseSync(snapshot, { readOnly: true }); assert.equal(backup.prepare('PRAGMA user_version').get().user_version, 5); backup.close();
    assert.deepEqual(store.profile('g', 'u'), before); assert.equal(store.welcomed('g', 'u', 1000), true);
    store.saveFarewell('g', 'u', 1000, 'goodbye', 2000);
    store.saveFarewell('g', 'partial', null, 'partial-goodbye', 2000); store.close(); store = new Store(file);
    assert.equal(store.schemaVersion, 9); assert.equal(await store.migrate(), null);
    assert.equal(store.farewelled('g', 'u', 1000), true); assert.equal(store.farewelled('g', 'u', 1001), false);
    assert.equal(store.farewelled('other-guild', 'u', 1000), false);
    assert.equal(store.farewelled('g', 'partial', null, 3000), true); assert.equal(store.farewelled('g', 'partial', null, 62001), false);
  } finally { store.close(); assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep)); rmSync(dir, { recursive: true }); }
});
