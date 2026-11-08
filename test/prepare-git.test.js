import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('preparador localiza Git instalado y devuelve una ruta ejecutable sin instalar nada', {skip:process.platform!=='win32'},()=>{
  const script=fileURLToPath(new URL('../scripts/prepare-git.ps1',import.meta.url));
  const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-PrintPath'],{encoding:'utf8',windowsHide:true,timeout:15000});
  assert.equal(result.status,0,result.stderr);
  const gitPath=result.stdout.trim();
  assert.match(gitPath,/git\.exe$/i);
  const version=spawnSync(gitPath,['--version'],{encoding:'utf8',windowsHide:true});
  assert.equal(version.status,0);assert.match(version.stdout,/^git version /);
});
