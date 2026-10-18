import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sponsors } from '../src/sponsors.js';

const destination = new URL('../assets/sponsors/normalized/', import.meta.url);
mkdirSync(destination, { recursive: true });
for (const s of sponsors) {
  const source = new URL(`../assets/sponsors/${s.file}`, import.meta.url);
  await sharp(fileURLToPath(source), { density: 144 }).trim().resize({ width: 600, height: 240, fit: 'inside' }).png()
    .toFile(fileURLToPath(new URL(`${s.id}.png`, destination)));
}
console.log('11 logos preparados, sin modificar los originales.');
