import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const config = JSON.parse(readFileSync(path.join(root, 'bot.config.json'), 'utf8'));
export const dataDir = path.join(root, 'data');
mkdirSync(dataDir, { recursive: true });
export const contentIntent = process.env.ENABLE_MESSAGE_CONTENT === 'true';

for (const [key, min, max] of [
  ['searchLifetimeMinutes', 5, 1440], ['searchCooldownSeconds', 10, 3600],
  ['rolePingCooldownMinutes', 1, 1440], ['trackerCacheMinutes', 10, 1440],
]) {
  if (!Number.isFinite(config[key]) || config[key] < min || config[key] > max) {
    throw new Error(`Revisa ${key} en bot.config.json: debe estar entre ${min} y ${max}.`);
  }
}
