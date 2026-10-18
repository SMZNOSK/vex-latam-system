import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Only catalog IDs can resolve local files. Never accept a path from a profile.
export const specializationAssets = Object.freeze({
  cloaking_device: 'ligero/T_UI_Ability_Invisibility.webp',
  evasive_dash: 'ligero/T_UI_Ability_EvasiveDash.webp',
  grappling_hook: 'ligero/T_UI_Ability_GrappleHook.webp',
  dematerializer: 'mediano/T_UI_Ability_Dematerialize.webp',
  guardian_turret: 'mediano/T_UI_Ability_Turret.webp',
  healing_beam: 'mediano/T_UI_Ability_Healing.webp',
  shockwave: 'mediano/T_UI_Ability_Shockwave.webp',
  charge_n_slam: 'pesado/T_UI_Ability_Charge.webp',
  goo_gun: 'pesado/T_UI_Ability_GooGun_Image.webp',
  mesh_shield: 'pesado/T_UI_Ability_MeshShield.webp',
  winch_claw: 'pesado/T_UI_Ability_Harpoon.webp',
});
const cache = new Map();
export function specializationIcon(id) {
  const asset = Object.hasOwn(specializationAssets, id) ? specializationAssets[id] : null;
  if (!asset) return null;
  if (!cache.has(id)) {
    try {
      const file = fileURLToPath(new URL(`../especializaciones/${asset}`, import.meta.url));
      cache.set(id, `data:image/webp;base64,${readFileSync(file).toString('base64')}`);
    } catch { return null; } // A missing asset must not prevent rendering the card.
  }
  return cache.get(id);
}
