import test from 'node:test';
import assert from 'node:assert/strict';
import { specializations } from '../src/catalog.js';
import { specializationAssets, specializationIcon } from '../src/specialization-assets.js';
import { template } from '../src/renderer.js';

test('especializaciones resuelven solo recursos del catálogo; falta de imagen conserva la opción correcta', () => {
  for (const s of specializations) {
    const image = specializationIcon(s.id);
    if (s.id === 'true_sight') assert.equal(image, null);
    else assert.match(image, /^data:image\/webp;base64,/);
  }
  assert.equal(Object.keys(specializationAssets).length, 11);
  for (const id of ['../../.env', '__proto__', 'constructor', 'unknown']) assert.equal(specializationIcon(id), null);
  const html = template('profile', { embarkId: 'Jugador#1234', rank: 'Oro 1', score: 29000,
    playerClass: 'Ligero', specializationIds: ['true_sight', 'evasive_dash'] });
  assert.ok(html.includes('Visión verdadera')); assert.ok(html.includes('Impulso evasivo'));
  assert.ok(html.includes('skill-fallback')); assert.ok(!html.includes('Desmaterializador'));
});

test('Chill no muestra extremos RS; nombres y referencias se escapan también en el nuevo diseño', () => {
  const team = { host: 'a', members: ['a'], membersDisplay: [{ embarkId: '<script>robo</script>#1234' }],
    status: 'open', expires: Date.now() + 60000, filters: { mode: 'Chill', minScore: 12345, maxScore: 67890,
      teammates: 2, playerClass: 'Todas las clases', specializationIds: [], legacySpecialization: '<img src=https://evil.test/x>' } };
  const html = template('team', team);
  assert.ok(!html.includes('Intervalo RS')); assert.ok(!html.includes('12,345'));
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img src=https'));
  assert.ok(html.includes('Lugar disponible'));
});
