import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

let failed = false;
for (const dir of ['src', 'scripts', 'test']) {
  for (const filename of readdirSync(dir).filter(name => name.endsWith('.js'))) {
    const result = spawnSync(process.execPath, ['--check', path.join(dir, filename)], { encoding: 'utf8' });
    if (result.status !== 0) { failed = true; console.error(result.stderr); }
  }
}
if (failed) process.exit(1);
console.log('Sintaxis de todos los archivos: correcta.');
