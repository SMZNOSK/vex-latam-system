import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { CardRenderer } from '../src/renderer.js';

async function checkBrowser() {
  const renderer = new CardRenderer();
  try {
    const browser = await renderer.browser();
    const page = await browser.newPage();
    try {
      await page.setContent('<p>VEX LATAM SYSTEM</p>');
      await page.screenshot({ timeout: 10000 });
    } finally {
      await page.close();
    }
  } finally {
    await renderer.close();
  }
}

async function main() {
  try {
    await checkBrowser();
    console.log('Navegador listo para generar las tarjetas.');
    return;
  } catch {
    if (process.env.VEX_BROWSER_PATH) {
      throw new Error('El navegador de VEX_BROWSER_PATH no funciona. Corrige esa ruta en .env o retira esa opcion para usar la deteccion automatica.');
    }
  }

  console.log('No hay un navegador operativo. Descargando Chromium; puede tardar unos minutos...');
  const require = createRequire(import.meta.url);
  const cli = path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js');
  const result = spawnSync(process.execPath, [cli, 'install', 'chromium'], { stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    throw new Error('No se pudo instalar Chromium. Revisa internet y el error anterior; despues vuelve a abrir iniciar-bot.cmd.');
  }
  try {
    await checkBrowser();
  } catch {
    throw new Error('Chromium se descargo pero no pudo generar una imagen. Revisa que Windows sea compatible y este actualizado.');
  }
  console.log('Chromium instalado y comprobado.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
