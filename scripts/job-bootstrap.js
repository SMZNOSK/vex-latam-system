import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Do not run application code until Windows has assigned this process to the job.
const gate = process.env.VEX_JOB_GATE;
const target = process.argv[2];
if (!gate || !target) throw new Error('Falta el control de inicio del bot.');
const wait = new Int32Array(new SharedArrayBuffer(4));
const deadline = Date.now() + 20000;
while (!existsSync(gate)) {
  if (Date.now() > deadline) throw new Error('No se pudo confirmar el control de procesos.');
  Atomics.wait(wait, 0, 0, 50);
}
try { unlinkSync(gate); } catch { /* The supervisor also cleans it up. */ }
delete process.env.VEX_JOB_GATE;
process.argv = [process.argv[0], resolve(target), ...process.argv.slice(3)];
await import(pathToFileURL(process.argv[1]).href);
