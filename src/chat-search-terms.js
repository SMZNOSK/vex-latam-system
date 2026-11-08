// Frases de intención explícita: no convertir menciones sueltas de modos en búsquedas.
const modes = ['jugar', 'ranked', 'rankeds', 'ranks', 'rankear', 'rápidas', 'casuales', 'partidas', 'the finals', 'finals'];
const people = ['equipo', 'team', 'squad', 'dúo', 'trío', 'compañero', 'compañeros', 'jugadores'];
export const CHAT_TERMS_MAX_LENGTH = 4000;
export const CHAT_TERMS_MAX_COUNT = 250;
export const DEFAULT_CHAT_SEARCH_TERMS = Object.freeze([
  'quién juega', 'quién se conecta', 'quién se apunta', 'quién le entra', 'quién jala',
  'alguien juega', 'alguien se conecta', 'alguien se apunta', 'alguien le entra', 'alguien jala',
  'alguien disponible', 'buscamos un compañero', 'busco un compañero', 'necesito un equipo',
  'se arma equipo', 'se arma team', 'se arma squad', 'armamos equipo', 'armamos team', 'armamos squad',
  'formar equipo', 'formar team', 'formar squad', 'se busca uno', 'se buscan dos', 'falta uno', 'faltan dos',
  '+1', '+2', 'lfg', 'lf1m', 'lf2m', 'looking for group', 'looking for team', 'looking for squad', 'need one', 'need two',
  ...['quién', 'alguien', 'alguno'].flatMap(who => ['para', 'pa'].flatMap(link => modes.map(mode => `${who} ${link} ${mode}`))),
  ...['busco', 'buscamos', 'buscando', 'necesito', 'necesitamos'].flatMap(verb => people.map(person => `${verb} ${person}`)),
  ...['me falta', 'nos falta', 'les falta', 'a quién le falta'].flatMap(phrase => ['uno', '1'].map(n => `${phrase} ${n}`)),
  ...['me faltan', 'nos faltan', 'les faltan', 'a quién le faltan'].flatMap(phrase => ['dos', '2'].map(n => `${phrase} ${n}`)),
]);

// Mantener el embed dentro de 4096 caracteres incluso al escapar Markdown.
// La lista completa sigue disponible en el editor administrativo.
export function termsDescription(terms, escape) {
  const description = terms.map(escape).join(', ');
  return description.length <= 3900 ? description
    : `${description.slice(0, 3800)}\n… Consulta la lista completa en el editor de palabras.`;
}
