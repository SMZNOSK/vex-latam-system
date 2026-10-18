import sharp from 'sharp';
import path from 'node:path';
import { mkdir, writeFile, readFile, stat, readdir, unlink, utimes } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { UserError } from './domain.js';

export const MAX_CARD_BYTES = 8 * 1024 * 1024;
const MAX_STORED_BYTES = 3 * 1024 * 1024;
const validKey = key => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key);
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export function isCardImage(buffer) {
  return Buffer.isBuffer(buffer) && (buffer.subarray(0, 8).equals(pngSignature)
    || (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
    || (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'));
}
export function cardAttachmentURL(value) {
  let url;
  try { url = new URL(value); } catch { throw new UserError('Vuelve a adjuntar la tarjeta desde el formulario de Discord.'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
    || !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)
    || !/^\/(?:ephemeral-)?attachments\//.test(url.pathname)) {
    throw new UserError('Adjunta una imagen desde Discord; no se admiten enlaces externos.');
  }
  return url.href;
}

export class PlayerCards {
  constructor(directory, fetcher = fetch) { this.directory = path.resolve(directory); this.fetcher = fetcher; this.cache = new Map(); }
  filename(key) {
    if (!validKey(key)) throw new UserError('La referencia a la tarjeta no es válida.');
    return path.join(this.directory, `${key}.png`);
  }
  async upload(attachment) {
    if (!attachment || !Number.isInteger(attachment.size) || attachment.size < 1 || attachment.size > MAX_CARD_BYTES) {
      throw new UserError('Sube una sola imagen PNG, JPG o WebP de hasta 8 MB.');
    }
    const url = cardAttachmentURL(attachment.url);
    let buffer;
    try {
      const response = await this.fetcher(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
      if (!response.ok || !response.body) throw new Error('Imagen no disponible');
      const declared = response.headers.get('content-length');
      if (declared && Number(declared) > MAX_CARD_BYTES) throw new UserError('La imagen supera el límite de 8 MB.');
      const parts = []; let bytes = 0;
      const reader = response.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_CARD_BYTES) throw new UserError('La imagen supera el límite de 8 MB.');
          parts.push(Buffer.from(value));
        }
      } finally { await reader.cancel().catch(() => {}); }
      buffer = Buffer.concat(parts);
    } catch (error) {
      if (error instanceof UserError) throw error;
      throw new UserError('No pude descargar la tarjeta. Adjunta la imagen de nuevo; tu perfil conserva la anterior.');
    }
    return this.import(buffer);
  }
  async import(buffer) {
    if (!buffer?.length || buffer.length > MAX_CARD_BYTES || !isCardImage(buffer)) throw new UserError('Usa una imagen PNG, JPG o WebP estática de hasta 8 MB.');
    let output;
    try {
      const image = sharp(buffer, { limitInputPixels: 20000000, failOn: 'error' });
      const metadata = await image.metadata();
      if (!['png', 'jpeg', 'webp'].includes(metadata.format) || (metadata.pages ?? 1) > 1) throw new Error('Formato no admitido');
      output = await image.rotate().resize({ width: 600, height: 1000, fit: 'inside', withoutEnlargement: true })
        .png().toBuffer({ resolveWithObject: true });
    } catch { throw new UserError('No pude leer la imagen. Sube una tarjeta PNG, JPG o WebP estática de hasta 20 megapíxeles.'); }
    if (output.data.length > MAX_STORED_BYTES) throw new UserError('La tarjeta es demasiado grande. Usa una imagen más pequeña.');
    const key = createHash('sha256').update(output.data).digest('hex');
    await mkdir(this.directory, { recursive: true });
    try { await writeFile(this.filename(key), output.data, { flag: 'wx' }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      // Una imagen reutilizada vuelve a contar como reciente, incluso antes de guardar el borrador.
      const now = new Date();
      try { await utimes(this.filename(key), now, now); }
      catch (error) { if (error.code !== 'ENOENT') throw error; await writeFile(this.filename(key), output.data, { flag: 'wx' }); }
    }
    this.remember(key, `data:image/png;base64,${output.data.toString('base64')}`);
    return { key, width: output.info.width, height: output.info.height };
  }
  remember(key, uri) {
    this.cache.set(key, uri);
    if (this.cache.size > 32) this.cache.delete(this.cache.keys().next().value);
  }
  async dataURI(ref) {
    if (!validKey(ref?.key)) return null;
    if (this.cache.has(ref.key)) return this.cache.get(ref.key);
    try {
      const file = this.filename(ref.key);
      if ((await stat(file)).size > MAX_STORED_BYTES) return null;
      const buffer = await readFile(file);
      if (!buffer.subarray(0, 8).equals(pngSignature) || createHash('sha256').update(buffer).digest('hex') !== ref.key) return null;
      const uri = `data:image/png;base64,${buffer.toString('base64')}`; this.remember(ref.key, uri); return uri;
    } catch { return null; }
  }
  async collect(referencedKeys, now = Date.now()) {
    const protectedKeys = new Set(referencedKeys);
    const entries = await readdir(this.directory).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const name of entries) {
      if (!/^[a-f0-9]{64}\.png$/.test(name)) continue;
      const key = name.slice(0, -4); if (protectedKeys.has(key)) continue;
      const file = this.filename(key);
      if ((await stat(file)).mtimeMs > now - 86400000) continue;
      await unlink(file); this.cache.delete(key);
    }
  }
}
