import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeRank } from './domain.js';

const directory = fileURLToPath(new URL('../rangos/', import.meta.url));
const cache = new Map();
const tiers = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum', diamond: 'Diamond' };
export function rankAssetName(rank) {
  const normalized = normalizeRank(rank);
  if (normalized === 'ruby') return 'League_Ruby.png';
  const match = /^(bronze|silver|gold|platinum|diamond) ([1-4])$/.exec(normalized);
  return match ? `League_${tiers[match[1]]}_${match[2]}.png` : null;
}
function image(relative, mime = 'image/png') {
  if (!cache.has(relative)) {
    try { cache.set(relative, `data:${mime};base64,${readFileSync(path.join(directory, relative)).toString('base64')}`); }
    catch { cache.set(relative, null); }
  }
  return cache.get(relative);
}
export const rankIcon = rank => { const filename = rankAssetName(rank); return filename ? image(filename) : null; };
export const finalsLogo = (tone='white') => image(`logos/the finals/${tone==='red'?'thefinals.svg':'thefinals-dark.svg'}`, 'image/svg+xml');
export const vexLogo = () => image('logos/VEX LATAM/WhatsApp Image 2026-10-13 at 3.49.43 PM.jpeg', 'image/jpeg');
