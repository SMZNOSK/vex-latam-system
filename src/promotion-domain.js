import { UserError } from './domain.js';
import { isIP } from 'node:net';

export function promotionURL(input) {
  let url;
  try { url = new URL(String(input ?? '').trim()); } catch { throw new UserError('Pega el enlace HTTPS completo del video.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.href.length > 512
    || isIP(url.hostname) || !url.hostname.includes('.') || /(?:^|\.)(?:localhost|local|internal)$/.test(url.hostname))
    throw new UserError('Usa un enlace HTTPS público, sin credenciales y de hasta 512 caracteres.');
  return url.href;
}

export function youtubeVideoId(input) {
  const url = new URL(promotionURL(input)), host = url.hostname.toLowerCase();
  let id;
  if (host === 'youtu.be') id = url.pathname.split('/')[1];
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
    id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:shorts|embed|live)\/([^/]+)/.exec(url.pathname)?.[1];
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id ?? '') ? id : null;
}

export function promotionPlatform(input) {
  const host = new URL(promotionURL(input)).hostname.replace(/^www\./, '');
  if (youtubeVideoId(input)) return 'YouTube';
  for (const [domain, name] of [['twitch.tv','Twitch'],['tiktok.com','TikTok'],['instagram.com','Instagram'],['facebook.com','Facebook'],['vimeo.com','Vimeo'],['x.com','X']]) {
    if (host === domain || host.endsWith(`.${domain}`)) return name;
  }
  return host;
}

export function promotionInput(fields) {
  const title = fields.getTextInputValue('title').trim(), description = fields.getTextInputValue('description').trim();
  if (!title || title.length > 120 || /[\r\n\p{Cc}]/u.test(title)) throw new UserError('Título: usa de 1 a 120 caracteres en una línea.');
  if (description.length > 350) throw new UserError('La descripción admite hasta 350 caracteres.');
  return {title,description,url:promotionURL(fields.getTextInputValue('url'))};
}
