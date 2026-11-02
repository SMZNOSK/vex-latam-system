import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/update-repository.js', import.meta.url));
function run(cwd, program, ...args) {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  return result;
}
function git(cwd, ...args) {
  const result = run(cwd, 'git', ...args);
  assert.equal(result.status, 0, result.stderr);
}

test('actualiza una copia limpia y protege cambios locales', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'vex-update-test-'));
  try {
    const source = path.join(root, 'source');
    const clone = path.join(root, 'clone');
    git(root, 'init', source);
    git(source, 'config', 'user.email', 'test@example.invalid');
    git(source, 'config', 'user.name', 'Test');
    writeFileSync(path.join(source, 'file.txt'), 'one');
    git(source, 'add', 'file.txt');
    git(source, 'commit', '-m', 'initial');
    git(root, 'clone', source, clone);
    assert.equal(run(clone, process.execPath, script).status, 0);
    writeFileSync(path.join(source, 'file.txt'), 'two');
    git(source, 'commit', '-am', 'update');
    writeFileSync(path.join(clone, 'local.txt'), 'keep');
    assert.match(run(clone, process.execPath, script).stdout, /cambios locales/);
    rmSync(path.join(clone, 'local.txt'));
    assert.equal(run(clone, process.execPath, script).status, 10);
    assert.equal(run(clone, 'git', 'rev-parse', 'HEAD').stdout.trim(), run(source, 'git', 'rev-parse', 'HEAD').stdout.trim());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
