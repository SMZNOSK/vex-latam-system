import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { mkdtempSync, rmSync } from 'node:fs';
import { stat, utimes, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Collection, MessageFlags } from 'discord.js';
import { PlayerCards, cardAttachmentURL, MAX_CARD_BYTES } from '../src/player-cards.js';
import { Store } from '../src/store.js';
import { VexBot } from '../src/bot.js';
import { profileModal, searchPayload } from '../src/ui.js';
import { template } from '../src/renderer.js';
import { draftId, playerCardModal, profilePrivatePayload } from '../src/wizard-ui.js';
import { validateProfile, validateSearch, UserError } from '../src/domain.js';

const photo = await sharp({ create: { width: 366, height: 570, channels: 3, background: '#ed243b' } }).png().toBuffer();
const p = validateProfile({ embarkId: 'Jugador#1234', sponsorId: 'ospuze', score: 34000, playerClass: 'Mediano', specializationIds: ['healing_beam'] });
const filters = validateSearch({ mode: 'Ranked', minScore: 0, maxScore: 999999, teammates: 2, playerClass: 'Todas las clases', specializationIds: [] });
function temp() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vex-cards-'));
  return { dir, cleanup() { assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep)); rmSync(dir, { recursive: true }); } };
}
function interaction(user, customId, extra = {}) {
  const i = { guildId: 'g', user: { id: user }, customId, replies: [], modals: [],
    inGuild: () => true, isChatInputCommand: () => false, isButton: () => true, isStringSelectMenu: () => false, isModalSubmit: () => false,
    async reply(payload) { i.replied = true; i.replies.push(payload); }, async deferReply(payload) { i.deferred = true; i.replies.push(payload); },
    async deferUpdate() { i.deferred = true; }, async editReply(payload) { i.replies.push(payload); }, async followUp(payload) { i.replies.push(payload); },
    async showModal(modal) { i.modals.push(modal.toJSON()); }, ...extra };
  return i;
}
async function setup(cards) {
  const store = new Store(':memory:'); await store.migrate(); store.saveProfile('g', 'u', p);
  const bot = new VexBot({}, store, {}, null, cards); bot.guilds.add('g'); bot.log = () => {}; return { bot, store };
}
const uploadFields = file => ({ getStringSelectValues: () => ['ospuze'], getUploadedFiles: () => file ? new Collection([['f', file]]) : null });
const modalExtra = file => ({ isButton: () => false, isModalSubmit: () => true, fields: uploadFields(file) });

test('imagen opcional tanto en el registro como al elegir Subir tarjeta', () => {
  const initial = profileModal(p).toJSON(); const upload = initial.components.find(c => c.component.type === 19).component;
  assert.equal(upload.required, false); assert.equal(upload.min_values, 0); assert.equal(upload.max_values, 1);
  assert.deepEqual(upload.file_types, ['.png', '.jpg', '.jpeg', '.webp']);
  const standalone = playerCardModal({ id: 'd', revision: 0, data: p }).toJSON();
  assert.equal(standalone.components[0].component.required, false);
  assert.equal(standalone.components[0].component.min_values, 0);
});
test('normaliza la imagen, conserva proporción, quita metadatos y funciona tras reiniciar', async () => {
  const tmp = temp();
  try {
    const cards = new PlayerCards(tmp.dir), ref = await cards.import(photo);
    assert.deepEqual([ref.width, ref.height], [366, 570]); assert.match(ref.key, /^[a-f0-9]{64}$/);
    assert.deepEqual(await cards.import(photo), ref);
    const metadata = await sharp(await readFile(cards.filename(ref.key))).metadata(); assert.equal(metadata.exif, undefined);
    assert.match(await new PlayerCards(tmp.dir).dataURI(ref), /^data:image\/png;base64,/);
    assert.equal(await cards.dataURI({ key: '../../anything' }), null);
    assert.equal(await cards.dataURI({ key: 'a'.repeat(64) }), null);
  } finally { tmp.cleanup(); }
});
test('solo PNG/JPG/WebP reales: rechaza SVG, archivos disfrazados y tamaños excesivos', async () => {
  const tmp = temp();
  try {
    const cards = new PlayerCards(tmp.dir);
    for (const buffer of [Buffer.from('<svg><script>alert(1)</script></svg>'), Buffer.from('not an image'), Buffer.alloc(MAX_CARD_BYTES + 1)]) {
      await assert.rejects(cards.import(buffer), UserError);
    }
    const jpg = await sharp(photo).jpeg().toBuffer(), webp = await sharp(photo).webp().toBuffer();
    assert.equal((await cards.import(jpg)).width, 366); assert.equal((await cards.import(webp)).height, 570);
    const large = await sharp({ create: { width: 1200, height: 1800, channels: 3, background: '#222' } }).png().toBuffer();
    const ref = await cards.import(large); assert.deepEqual([ref.width, ref.height], [600, 900]);
  } finally { tmp.cleanup(); }
});
test('descarga adjunta de Discord con tiempo límite y sin redirecciones; rechaza enlaces externos', async () => {
  const tmp = temp(); let calls = 0;
  try {
    const cards = new PlayerCards(tmp.dir, async (url, options) => {
      calls++; assert.ok(url.startsWith('https://cdn.discordapp.com/ephemeral-attachments/'));
      assert.equal(options.redirect, 'error'); assert.ok(options.signal instanceof AbortSignal);
      return new Response(photo, { headers: { 'content-length': String(photo.length) } });
    });
    await cards.upload({ size: photo.length, url: 'https://cdn.discordapp.com/ephemeral-attachments/app/file/card.png' });
    assert.equal(calls, 1);
    for (const url of ['http://cdn.discordapp.com/attachments/a/b/x.png', 'https://cdn.discordapp.com.evil.test/attachments/a/b/x.png',
      'https://localhost/attachments/a/b/x.png', 'https://name:password@cdn.discordapp.com/attachments/a/b/x.png', 'https://cdn.discordapp.com/elsewhere/card.png']) {
      assert.throws(() => cardAttachmentURL(url), UserError);
    }
    await assert.rejects(cards.upload({ size: MAX_CARD_BYTES + 1, url: 'https://cdn.discordapp.com/attachments/a/b/x.png' }), UserError);
    assert.equal(calls, 1);
  } finally { tmp.cleanup(); }
});
test('límite de descarga se comprueba también al leer el cuerpo', async () => {
  const tmp = temp(); let canceled = false;
  try {
    const cards = new PlayerCards(tmp.dir, async () => ({ ok: true, headers: new Headers(), body: { getReader: () => ({
      read: async () => ({ done: false, value: new Uint8Array(MAX_CARD_BYTES + 1) }), async cancel() { canceled = true; },
    }) } }));
    await assert.rejects(cards.upload({ size: 100, url: 'https://cdn.discordapp.com/attachments/a/b/x.png' }), UserError);
    assert.equal(canceled, true);
  } finally { tmp.cleanup(); }
});
test('subir y quitar tarjeta solo modifica el perfil propio y actualiza sus equipos sin pings', async () => {
  const tmp = temp(); const cards = new PlayerCards(tmp.dir, async () => new Response(photo)); const { bot, store } = await setup(cards);
  try {
    store.saveProfile('g', 'other', { ...p, embarkId: 'Otro#9876' });
    const s = store.createSearch('g', 'u', 'c', filters, 600000, 0); s.status = 'open'; s.message = 'm'; store.updateSearch(s);
    const updates = []; bot.refreshSearch = async id => { updates.push(id); const payload = await bot.searchCard(store.search(id)); assert.deepEqual(payload.allowedMentions.roles, []); };
    await bot.interaction(interaction('u', 'profile:image'));
    const d = [...bot.workflows.drafts.items.values()][0];
    const file = { size: photo.length, url: 'https://cdn.discordapp.com/attachments/a/b/card.png' };
    const intruder = interaction('other', draftId(d, 'photo-submit'), modalExtra(file)); await bot.interaction(intruder);
    assert.match(intruder.replies.at(-1).content, /otra persona/); assert.equal(store.profile('g', 'u').cardImage, undefined);
    const i = interaction('u', draftId(d, 'photo-submit'), modalExtra(file)); await bot.interaction(i);
    assert.match(store.profile('g', 'u').cardImage.key, /^[a-f0-9]{64}$/); assert.equal(store.profile('g', 'u').score, 34000);
    assert.equal(store.profile('g', 'other').cardImage, undefined); assert.deepEqual(updates, [s.id]);
    assert.equal(i.replies[0].flags, MessageFlags.Ephemeral);
    const remove = interaction('u', 'profile:image-remove'); await bot.interaction(remove);
    assert.equal(store.profile('g', 'u').cardImage, null); assert.deepEqual(updates, [s.id, s.id]);
    assert.ok(JSON.stringify(profilePrivatePayload(store.profile('g', 'u'))).includes('profile:image'));
  } finally { store.close(); tmp.cleanup(); }
});
test('fallo de subida y edición concurrente conservan la tarjeta anterior', async () => {
  const previous = { key: 'b'.repeat(64), width: 1, height: 1 };
  const cards = { upload: async () => { throw new UserError('Imagen rechazada'); }, dataURI: async () => null };
  const { bot, store } = await setup(cards);
  try {
    store.saveProfile('g', 'u', { cardImage: previous }); await bot.interaction(interaction('u', 'profile:image'));
    let d = [...bot.workflows.drafts.items.values()][0];
    const file = { size: 100, url: 'https://cdn.discordapp.com/attachments/a/b/x.png' };
    const bad = interaction('u', draftId(d, 'photo-submit'), modalExtra(file)); await bot.interaction(bad);
    assert.equal(store.profile('g', 'u').cardImage.key, previous.key); assert.match(bad.replies.at(-1).content, /rechazada/);
    await bot.interaction(interaction('u', 'profile:image')); d = [...bot.workflows.drafts.items.values()][0];
    cards.upload = async () => { store.deleteProfile('g', 'u'); return { key: 'c'.repeat(64), width: 1, height: 1 }; };
    await bot.interaction(interaction('u', draftId(d, 'photo-submit'), modalExtra(file))); assert.equal(store.profile('g', 'u'), null);
  } finally { store.close(); }
});
test('registro sin un archivo nuevo conserva la tarjeta y permite quitarla del borrador', async () => {
  const { bot, store } = await setup(null);
  try {
    const ref = { key: 'a'.repeat(64), width: 10, height: 20 }; store.saveProfile('g', 'u', { cardImage: ref });
    await bot.workflows.startProfile(interaction('u', 'profile:edit'));
    const d = [...bot.workflows.drafts.items.values()][0];
    const i = interaction('u', draftId(d, 'identity-submit'), { isButton: () => false, isModalSubmit: () => true,
      fields: { ...uploadFields(null), getTextInputValue: id => id === 'embarkId' ? p.embarkId : String(p.score) } });
    await bot.interaction(i); assert.deepEqual(d.data.cardImage, ref); assert.deepEqual(store.profile('g', 'u').cardImage, ref);
    d.step = 'review'; await bot.interaction(interaction('u', draftId(d, 'image-remove')));
    assert.equal(d.data.cardImage, null); assert.deepEqual(store.profile('g', 'u').cardImage, ref);
  } finally { store.close(); }
});
test('enviar Subir tarjeta vacío conserva el perfil sin descargar imágenes ni actualizar equipos', async () => {
  const cards = { upload: async () => { assert.fail('No debe descargar sin archivo'); }, dataURI: async () => null };
  const { bot, store } = await setup(cards);
  bot.refreshMemberTeams = async () => { assert.fail('No cambió la tarjeta'); };
  try {
    for (const image of [null, { key: 'a'.repeat(64), width: 10, height: 20 }]) {
      store.saveProfile('g', 'u', { cardImage: image });
      const before = store.profile('g', 'u');
      await bot.interaction(interaction('u', 'profile:image'));
      const d = [...bot.workflows.drafts.items.values()][0];
      const i = interaction('u', draftId(d, 'photo-submit'), modalExtra(null));
      await bot.interaction(i);
      assert.deepEqual(store.profile('g', 'u'), before);
      assert.equal(bot.workflows.drafts.items.has(d.id), false);
      assert.ok(JSON.stringify(i.replies.at(-1)).includes(image ? 'Conservamos tu tarjeta actual' : 'Continuaste sin foto'));
    }
  } finally { store.close(); }
});
test('archivo opcional del registro permanece en el borrador hasta guardar el perfil', async () => {
  const cards = { upload: async () => ({ key: 'f'.repeat(64), width: 366, height: 570 }), dataURI: async () => null };
  const { bot, store } = await setup(cards);
  try {
    await bot.workflows.startProfile(interaction('u', 'profile:edit'));
    const d = [...bot.workflows.drafts.items.values()][0];
    const file = { size: 100, url: 'https://cdn.discordapp.com/attachments/a/b/card.png' };
    const i = interaction('u', draftId(d, 'identity-submit'), { isButton: () => false, isModalSubmit: () => true,
      fields: { ...uploadFields(file), getTextInputValue: id => id === 'embarkId' ? p.embarkId : String(p.score) } });
    await bot.interaction(i); assert.equal(d.data.cardImage.key, 'f'.repeat(64)); assert.equal(store.profile('g', 'u').cardImage, undefined);
    assert.equal(i.replies[0].flags, MessageFlags.Ephemeral);
    // Cancelar no cambia la imagen del perfil guardado.
    await bot.interaction(interaction('u', draftId(d, 'cancel'))); assert.equal(store.profile('g', 'u').cardImage, undefined);
  } finally { store.close(); }
});
test('solo elimina archivos sin referencia tras un día; protege las imágenes de perfiles y borradores', async () => {
  const tmp = temp();
  try {
    const cards = new PlayerCards(tmp.dir), ref = await cards.import(photo), file = cards.filename(ref.key);
    const now = Date.now(); await utimes(file, new Date(now - 2 * 86400000), new Date(now - 2 * 86400000));
    await cards.collect([ref.key], now); assert.ok((await stat(file)).size);
    await cards.collect([], now); await assert.rejects(stat(file), { code: 'ENOENT' }); assert.equal(await cards.dataURI(ref), null);
  } finally { tmp.cleanup(); }
});
test('fichas usan imagen completa o Embark ID; no insertan nombres de Discord ni números de posición', async () => {
  const tmp = temp();
  try {
    const cards = new PlayerCards(tmp.dir), ref = await cards.import(photo), uri = await cards.dataURI(ref);
    const team = { host: 'u', members: ['u', 'other'], names: ['DiscordName', 'AnotherDiscordName'], status: 'open', expires: Date.now() + 60000, filters,
      membersDisplay: [{ embarkId: 'Jugador#1234', cardImageData: uri }, { embarkId: 'Otro#9876', cardImageData: null }] };
    const html = template('team', team);
    assert.ok(html.includes('data:image/png;base64,')); assert.ok(html.includes('Otro#9876'));
    assert.ok(!html.includes('DiscordName')); assert.ok(!html.includes('<span class="number">01'));
    assert.ok(html.includes('object-fit:contain')); assert.ok(template('profile', { ...p, cardImageData: uri }).includes('class="portrait"'));
    const noPhoto = template('team', { ...team, membersDisplay: team.membersDisplay.map(m => ({ ...m, cardImageData: null })) });
    assert.ok(noPhoto.includes('Jugador#1234')); assert.ok(!noPhoto.includes('class="tile-media"'));
    assert.ok(!template('profile', { ...p, cardImageData: 'https://evil.test/x.png' }).includes('class="portrait"'));
    assert.ok(JSON.stringify(searchPayload(team)).includes('Jugador#1234'));
  } finally { tmp.cleanup(); }
});
