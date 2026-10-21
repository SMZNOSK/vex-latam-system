import { config } from './config.js';

// Custom Discord emoji markup is for messages; channel names use Unicode.
const names = Object.freeze({
  'ADMIN PANEL': '🔐・ADMIN PANEL',
  'SISTEMA DEL BOT': '🤖・SISTEMA DEL BOT',
  'CLANES': '🏆・CLANES',
  'admin-bot': '🤖・admin-bot',
  'buzon-feedback': '📥・buzon-feedback',
  'buzon-reportes': '🚨・buzon-reportes',
  'solicitudes-clanes': '📋・solicitudes-clanes',
  'rankings-clanes': '📊・rankings-clanes',
  'configurar-perfil': '🎮・configurar-perfil',
  'buscar-equipo': '🔎・buscar-equipo',
  'equipos-del-bot': '👥・equipos-del-bot',
  'comandos-del-bot': '🤖・comandos-del-bot',
  'leaderboard': '🏅・leaderboard',
  'unete-a-vxtg': '🥇・unete-a-vxtg',
  'unete-a-vxltm': '🌎・unete-a-vxltm',
  'ranking-vxtg': '🏆・ranking-vxtg',
  'ranking-vxltm': '📈・ranking-vxltm',
  'reportes': '🚩・reportes',
  'despedidas': '👋・despedidas',
});

export function channelDisplayName(guildId, name) {
  return guildId === config.productionGuildId ? names[name] ?? name : name;
}
