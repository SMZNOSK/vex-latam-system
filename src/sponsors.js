import { readFileSync } from 'node:fs';

export const sponsors = [
  { id: 'ospuze', label: 'OSPUZE', file: 'OSPUZE_Logo.svg', color: '#f8bc2c', motto: 'ENERGÍA SIN LÍMITES', motif: 'pulse' },
  { id: 'iseul-t', label: 'ISEUL-T', file: 'ISEUL-T_Logo.svg', color: '#0094df', motto: 'ESTILO EN MOVIMIENTO', motif: 'fashion' },
  { id: 'volpe', label: 'VOLPE', file: 'VOLPE_Logo.svg', color: '#d90526', motto: 'EL FUTURO ES AHORA', motif: 'vector' },
  { id: 'holtow', label: 'HOLTOW', file: 'HOLTOW_Logo.svg', color: '#f36b00', motto: 'PREPARADO PARA LO IMPOSIBLE', motif: 'insurance' },
  { id: 'vaiiya', label: 'VAIIYA', file: 'VAIIYA_Logo.svg', color: '#ed0f35', motto: 'PRECISIÓN. CONTROL. CONFIANZA.', motif: 'system' },
  { id: 'engimo', label: 'ENGIMO', file: 'ENGIMO_Logo.svg', color: '#4d8e96', motto: 'SIEMPRE CONECTADOS', motif: 'network' },
  { id: 'dissun', label: 'DISSUN', file: 'DISSUN_Logo.svg', color: '#d21f3c', motto: 'PODER EN CADA JUGADA', motif: 'reactor' },
  { id: 'alfa-acta', label: 'ALFA ACTA', file: 'ALFA_ACTA_Logo.svg', color: '#e70f3d', motto: 'DEJA TU HUELLA', motif: 'defense' },
  { id: 'ivada', label: 'IVADA', file: 'IVADA_Logo.svg', color: '#f1f2f4', motto: 'MÁS ALLÁ DE LO CONOCIDO', motif: 'minimal' },
  { id: 'trentila', label: 'TRENTILA', file: 'Trentila_Logo.svg', color: '#a7d825', motto: 'CRECEMOS SOBRE LO IMPOSIBLE', motif: 'harvest' },
  { id: 'cometa', label: 'COMETA', file: '300px-THE-FINALS_COMETA-logo.png.webp', color: '#ff8a00', motto: 'HAZ QUE BRILLE TU JUEGO', motif: 'orbit' },
  { id: 'cns', label: 'CNS', file: 'CNS_Logo.png', color: '#009dff', motto: 'LA VERDAD TRAS LOS MUROS', motif: 'glitch' },
];
const byId = new Map(sponsors.map(s => [s.id, Object.freeze(s)]));
const assets = new Map();
export const getSponsor = id => byId.get(id) ?? null;
export const sponsorLabel = id => getSponsor(id)?.label ?? 'Elige tu patrocinador';
export function sponsorLogo(id) {
  const item = getSponsor(id);
  if (!item) return null;
  if (!assets.has(id)) {
    try {
      let bytes, mime = 'image/png';
      try { bytes = readFileSync(new URL(`../assets/sponsors/normalized/${id}.png`, import.meta.url)); }
      catch {
        bytes = readFileSync(new URL(`../assets/sponsors/${item.file}`, import.meta.url));
        mime = item.file.endsWith('.svg') ? 'image/svg+xml' : item.file.endsWith('.png') ? 'image/png' : 'image/webp';
      }
      assets.set(id, `data:${mime};base64,${bytes.toString('base64')}`);
    } catch { assets.set(id, null); }
  }
  return assets.get(id);
}

const backgrounds = new Map();
export function sponsorBackground(id) {
  if (!getSponsor(id)) return null;
  if (!backgrounds.has(id)) {
    try {
      const bytes = readFileSync(new URL(`../assets/sponsors/backgrounds/${id}-v2.webp`, import.meta.url));
      backgrounds.set(id, `data:image/webp;base64,${bytes.toString('base64')}`);
    } catch { backgrounds.set(id, null); } // El color mate sigue disponible si falta el archivo.
  }
  return backgrounds.get(id);
}

export function completeProfile(profile) {
  return Boolean(profile && !profile.needsCompletion && getSponsor(profile.sponsorId));
}
