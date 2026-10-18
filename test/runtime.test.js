import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { acquireProcessLock } from '../src/runtime.js';
import { UserError } from '../src/domain.js';

test('un segundo inicio no duplica el bot y el bloqueo se libera al detenerlo', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vex-lock-'));
  const file = path.join(dir, 'bot.lock');
  try {
    const release = acquireProcessLock(file);
    assert.throws(() => acquireProcessLock(file), UserError);
    release();
    const second = acquireProcessLock(file);
    second();
  } finally { rmSync(dir, { recursive: true }); }
});

test('un cierre inesperado permite recuperar el bloqueo cuando el proceso ya no existe', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vex-lock-'));
  const file = path.join(dir, 'bot.lock');
  try {
    writeFileSync(file, JSON.stringify({ pid: 99999999, run: 'antiguo' }));
    const release = acquireProcessLock(file, () => false);
    release();
    writeFileSync(file, '');
    assert.throws(() => acquireProcessLock(file, () => false), UserError);
  } finally { rmSync(dir, { recursive: true }); }
});
