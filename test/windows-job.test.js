import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/windows-job.ps1', import.meta.url));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function alive(pid) { return new RegExp(`\\b${pid}\\b`).test(execFileSync('tasklist.exe', ['/FI', `PID eq ${pid}`, '/NH'], { encoding:'utf8', windowsHide:true })); }

test('al cerrar el supervisor de Windows terminan el bot y su proceso hijo', { skip: process.platform !== 'win32', timeout: 20000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'vex-job-test-'));
  writeFileSync(path.join(dir, '.env'), '');
  writeFileSync(path.join(dir, 'worker.js'), `const {spawn}=require('node:child_process');const fs=require('node:fs');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync('pids.json',JSON.stringify([process.pid,child.pid]));setInterval(()=>{},1000);`);
  const parent = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Script', 'worker.js'], { cwd: dir, stdio: 'ignore', windowsHide: true });
  let pids = [];
  try {
    for (let n=0; n<100 && !existsSync(path.join(dir,'pids.json')); n++) await delay(100);
    assert.ok(existsSync(path.join(dir,'pids.json')), 'el proceso de prueba debe arrancar');
    pids = JSON.parse(readFileSync(path.join(dir,'pids.json'), 'utf8'));
    assert.ok(pids.every(alive));
    parent.kill();
    for (let n=0; n<80 && pids.some(alive); n++) await delay(100);
    assert.ok(pids.every(pid => !alive(pid)), `procesos que siguen activos: ${pids.filter(alive).join(', ')}`);
  } finally {
    if (!parent.killed) parent.kill();
    for (const pid of pids) if (alive(pid)) try { process.kill(pid); } catch {}
    for (const name of ['.env','worker.js','pids.json']) rmSync(path.join(dir,name),{force:true});
    rmdirSync(dir);
  }
});
