import { readFileSync } from 'node:fs';
const fonts = [['FinalsDisplay', 'saira-extra-condensed-700.woff2', '700 900'], ['FinalsBody', 'saira-condensed-500.woff2', '400 600']];
let cached;
export function finalsFontCSS() {
  return cached ??= fonts.map(([family, file, weight]) => {
    try {
      const data = readFileSync(new URL(`../assets/fonts/${file}`, import.meta.url)).toString('base64');
      return `@font-face{font-family:${family};font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${data}) format('woff2');font-display:block}`;
    } catch { return ''; } // System font fallback keeps cards available if fonts are missing.
  }).join('');
}
