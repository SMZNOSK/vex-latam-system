import { openSync, writeFileSync, closeSync, readFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { UserError } from './domain.js';

function processAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}

// Impide atender una interacción dos veces si se abre de nuevo el iniciador.
export function acquireProcessLock(filename, alive = processAlive) {
  const content = JSON.stringify({ pid: process.pid, run: randomUUID() });
  for (let attempt = 0; attempt < 2; attempt++) {
    let fd;
    try {
      fd = openSync(filename, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const previous = readFileSync(filename, 'utf8');
      let record;
      try { record = JSON.parse(previous); }
      catch { throw new UserError('Otro inicio del bot sigue en curso. Si el problema persiste, detén el bot y revisa data/bot.lock.'); }
      if (!Number.isInteger(record.pid) || record.pid <= 0) throw new UserError('Revisa el archivo de control data/bot.lock.');
      if (alive(record.pid)) throw new UserError('VEX LATAM SYSTEM ya está ejecutándose. No hace falta abrir otra copia.');
      if (readFileSync(filename, 'utf8') === previous) unlinkSync(filename);
      continue;
    }
    try { writeFileSync(fd, content); } finally { closeSync(fd); }
    return () => {
      try { if (readFileSync(filename, 'utf8') === content) unlinkSync(filename); } catch { /* Ya eliminado. */ }
    };
  }
  throw new UserError('Hay otro proceso intentando iniciar VEX LATAM SYSTEM. Espera unos segundos.');
}
