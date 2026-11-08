import { readFileSync } from 'node:fs';
const fonts = [['FinalsDisplay', 'SairaExtraCondensed-ExtraBold.ttf', '700 900'], ['FinalsBody', 'saira-condensed-500.woff2', '400 600']];
let cached;
export function finalsFontCSS() {
  return cached ??= fonts.map(([family, file, weight]) => {
    try {
      const data = readFileSync(new URL(`../assets/fonts/${file}`, import.meta.url)).toString('base64');
      const ttf = file.endsWith('.ttf');
      return `@font-face{font-family:${family};font-style:normal;font-weight:${weight};src:url(data:font/${ttf?'ttf':'woff2'};base64,${data}) format('${ttf?'truetype':'woff2'}');font-display:block}`;
    } catch { return ''; } // System font fallback keeps cards available if fonts are missing.
  }).join('');
}
