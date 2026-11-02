import { spawnSync } from 'node:child_process';

// Never prompt for credentials from the launcher or wait indefinitely for Git.
const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' };
function git(...args) {
  return spawnSync('git', args, { encoding: 'utf8', env, timeout: 30000, windowsHide: true });
}
function output(result) { return result.stdout?.trim() ?? ''; }
function skip(message) { console.log(`${message} Se iniciara la version local.`); }

const inside = git('rev-parse', '--is-inside-work-tree');
if (inside.status !== 0 || output(inside) !== 'true') {
  skip('Git no esta disponible o esta carpeta no es un repositorio clonado.');
} else {
  const branch = git('symbolic-ref', '--quiet', '--short', 'HEAD');
  const upstream = git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}');
  const status = git('status', '--porcelain', '--untracked-files=normal');
  if (branch.status !== 0 || upstream.status !== 0 || status.status !== 0) {
    skip('No se pudo determinar la rama o su repositorio remoto.');
  } else if (output(status)) {
    skip('Hay cambios locales; no se actualizara automaticamente para protegerlos.');
  } else if (git('fetch', '--quiet').status !== 0) {
    skip('No se pudo consultar el repositorio remoto. Revisa la conexion o el acceso a Git.');
  } else {
    const local = git('rev-parse', 'HEAD');
    const remote = git('rev-parse', '@{upstream}');
    if (local.status !== 0 || remote.status !== 0) {
      skip('No se pudo comprobar la version remota.');
    } else if (output(local) === output(remote)) {
      console.log('El repositorio ya esta actualizado.');
    } else if (git('merge-base', '--is-ancestor', 'HEAD', '@{upstream}').status !== 0) {
      skip('La rama local y la remota tienen diferencias que requieren revision manual.');
    } else {
      const update = git('merge', '--ff-only', '@{upstream}');
      if (update.status !== 0) {
        skip('No se pudo aplicar la actualizacion automaticamente.');
      } else {
        console.log('Actualizacion aplicada correctamente.');
        process.exitCode = 10;
      }
    }
  }
}
