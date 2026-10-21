import sharp from 'sharp';

export function discordAvatarURL(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)
    || !/^\/(?:avatars\/\d+\/[^/]+\.(?:png|webp|jpg)|guilds\/\d+\/users\/\d+\/avatars\/[^/]+\.(?:png|webp|jpg)|embed\/avatars\/\d+\.png)$/.test(url.pathname)) return null;
  return url.href;
}

export class MemberCards {
  constructor(renderer, fetcher = fetch) { this.renderer = renderer; this.fetcher = fetcher; this.avatars = new Map(); }
  async avatar(member) {
    const options = { extension: 'png', size: 512, forceStatic: true };
    const url = discordAvatarURL(member.displayAvatarURL?.(options) ?? member.user?.displayAvatarURL?.(options));
    if (!url) return null;
    if (this.avatars.has(url)) return this.avatars.get(url);
    try {
      const response = await this.fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(8000) });
      if (!response.ok || !response.body || Number(response.headers.get('content-length') ?? 0) > 2 * 1024 * 1024) return null;
      const reader = response.body.getReader(), chunks = []; let size = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read(); if (done) break;
          size += value.byteLength; if (size > 2 * 1024 * 1024) return null;
          chunks.push(Buffer.from(value));
        }
      } finally { await reader.cancel().catch(() => {}); }
      const png = await sharp(Buffer.concat(chunks), { limitInputPixels: 4000000, failOn: 'error' })
        .rotate().resize(512, 512, { fit: 'cover' }).png().toBuffer();
      const uri = `data:image/png;base64,${png.toString('base64')}`;
      this.avatars.set(url, uri); if (this.avatars.size > 32) this.avatars.delete(this.avatars.keys().next().value);
      return uri;
    } catch { return null; }
  }
  async data(member) {
    return { displayName: member.displayName ?? member.user?.globalName ?? member.user?.username ?? 'Jugador',
      username: member.user?.username, serverName: member.guild.name, memberCount: member.guild.memberCount,
      avatarData: await this.avatar(member) };
  }
  async render(kind, member) { return this.renderer.render(kind, await this.data(member), 1080); }
}
