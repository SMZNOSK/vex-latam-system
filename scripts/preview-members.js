import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REST, Routes, PermissionFlagsBits as P } from 'discord.js';
import { DatabaseSync } from 'node:sqlite';
import { CardRenderer } from '../src/renderer.js';
import { MemberCards } from '../src/member-cards.js';
import { template } from '../src/card-template.js';
import { config, dataDir } from '../src/config.js';

const dir = path.join(dataDir, 'preview-members'); mkdirSync(dir, { recursive: true });
const renderer = new CardRenderer(), cards = new MemberCards(renderer);
let avatarData = null, displayName = 'Vexink', serverName = 'VEX LATAM SQUAD', memberCount = 1284;
if (process.argv.includes('--discord')) {
  const api = new REST({ timeout: 15000 }).setToken(process.env.DISCORD_TOKEN?.trim());
  const guild = await api.get(Routes.guild(process.env.DISCORD_GUILD_ID.trim()), { query: new URLSearchParams({ with_counts: 'true' }) });
  const member = await api.get(Routes.guildMember(guild.id, guild.owner_id));
  const u = member.user; displayName = member.nick ?? u.global_name ?? u.username;
  serverName = guild.name; memberCount = guild.approximate_member_count;
  writeFileSync(path.join(dir, 'sample.json'), JSON.stringify({ displayName, serverName, memberCount }));
  const avatar = member.avatar ? `https://cdn.discordapp.com/guilds/${guild.id}/users/${u.id}/avatars/${member.avatar}.png?size=512`
    : u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=512`
      : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(u.id) >> 22n) % 6n)}.png`;
  avatarData = await cards.avatar({ displayAvatarURL: () => avatar });
  if (avatarData) writeFileSync(path.join(dir, 'avatar.png'), Buffer.from(avatarData.split(',')[1], 'base64'));
} else {
  try { ({ displayName, serverName, memberCount } = JSON.parse(readFileSync(path.join(dir, 'sample.json'), 'utf8'))); } catch { /* Muestra local. */ }
  try { avatarData = `data:image/png;base64,${readFileSync(path.join(dir, 'avatar.png')).toString('base64')}`; } catch { /* Iniciales sin red. */ }
}
try {
  for (const kind of ['welcome', 'farewell']) for (const width of [1080, 390]) {
    const data = { displayName, avatarData, serverName, memberCount };
    writeFileSync(path.join(dir, `${kind}-${width}.html`), template(kind, data, width));
    const file = path.join(dir, `${kind}-${width}.png`);
    writeFileSync(file, await renderer.render(kind, data, width)); console.log(file);
  }
  writeFileSync(path.join(dir, 'long-name.png'), await renderer.render('welcome', { displayName: 'UnNombreDeJugadorMuyLargoParaComprobarElDiseño', serverName }, 1080));
  const checks = [];
  const browser = await renderer.browser();
  for (const kind of ['welcome', 'farewell']) for (const width of [300, 390, 720, 1080]) {
    const page = await browser.newPage({ viewport: { width, height: 1200 } });
    try {
      await page.route('**/*', route => route.abort());
      await page.setContent(template(kind, { displayName: 'UnNombreMuyLargoConCaracteres漢字_1234567890', serverName: 'ServidorDeNombreMuyLargo'.repeat(3), avatarData, memberCount }, width));
      await page.evaluate(() => document.fonts.ready);
      const overflows = await page.evaluate(() => {
        const canvas = document.querySelector('.canvas').getBoundingClientRect();
        return [...document.querySelectorAll('.member-name,.eyebrow,h1,.portrait-heading,.avatar-caption,.route,.member-count')]
          .filter(e => { const r = e.getBoundingClientRect(); return r.left < canvas.left || r.right > canvas.right || e.scrollWidth > e.clientWidth + 1; })
          .map(e => e.className || e.tagName);
      });
      checks.push({ kind, width, overflows });
    } finally { await page.close(); }
  }
  writeFileSync(path.join(dir, 'layout-checks.json'), JSON.stringify(checks, null, 2));
  if (checks.some(c => c.overflows.length)) throw new Error(`Desbordamiento de texto: ${JSON.stringify(checks.filter(c => c.overflows.length))}`);
  console.log('Verificación de diseño: sin desbordamientos en 300, 390, 720 y 1080 px.');
  if (process.argv.includes('--publish-test')) {
    const guildId = process.env.DISCORD_GUILD_ID?.trim();
    if (guildId !== config.testGuildId) throw new Error('Las vistas previas solo se publican en el servidor de pruebas.');
    const db = new DatabaseSync(path.join(dataDir, 'vex.sqlite'), { readOnly: true });
    let ids;
    try { ids = JSON.parse(db.prepare('SELECT data FROM settings WHERE guild=?').get(guildId)?.data ?? '{}').mailboxes?.channels; }
    finally { db.close(); }
    if (!ids?.testing) throw new Error('Primero prepara #pruebas-bot.');
    const api = new REST({ timeout: 15000 }).setToken(process.env.DISCORD_TOKEN?.trim());
    const [channel, category, roles, me] = await Promise.all([api.get(Routes.channel(ids.testing)), api.get(Routes.channel(ids.adminCategory)), api.get(Routes.guildRoles(guildId)), api.get(Routes.user())]);
    if (channel.guild_id !== guildId || channel.parent_id !== ids.adminCategory) throw new Error('El canal de pruebas no corresponde a la categoría privada.');
    for (const c of [category, channel]) {
      if (!c.permission_overwrites.some(o => o.id === guildId && BigInt(o.deny) & P.ViewChannel)
        || c.permission_overwrites.some(o => BigInt(o.allow) & P.ViewChannel && o.id !== me.id
          && !(o.type === 0 && roles.some(r => r.id === o.id && BigInt(r.permissions) & P.Administrator)))) throw new Error('El canal de pruebas debe ser privado para administradores.');
    }
    let previous = {};
    try { previous = JSON.parse(readFileSync(path.join(dir, 'discord-previews.json'), 'utf8')); } catch { /* Primera publicación. */ }
    const output = { guild: guildId, channel: ids.testing, messages: {} };
    for (const kind of ['welcome', 'farewell']) {
      const name = `vex-${kind}.png`, label = kind === 'welcome' ? 'Bienvenida' : 'Despedida';
      const request = { body: { content: `**Vista previa · ${label}**\nEjemplo visual; no representa una entrada o salida real.`,
        embeds: [{ color: 0xe3273e, image: { url: `attachment://${name}` } }], allowed_mentions: { parse: [] },
        attachments: [{ id: 0, filename: name, description: `${label} personalizada · ${displayName}` }] },
      files: [{ name, data: readFileSync(path.join(dir, `${kind}-1080.png`)), contentType: 'image/png' }] };
      let old;
      if (previous.guild === guildId && previous.channel === ids.testing && previous.messages?.[kind]?.id) {
        try { old = await api.get(Routes.channelMessage(ids.testing, previous.messages[kind].id)); }
        catch (error) { if (error.code !== 10008) throw error; }
      }
      if (old && old.author.id !== me.id) throw new Error('La vista previa anterior no pertenece al bot.');
      const message = old ? await api.patch(Routes.channelMessage(ids.testing, old.id), request) : await api.post(Routes.channelMessages(ids.testing), request);
      output.messages[kind] = { id: message.id, url: `https://discord.com/channels/${guildId}/${ids.testing}/${message.id}` };
    }
    writeFileSync(path.join(dir, 'discord-previews.json'), JSON.stringify(output, null, 2));
    console.log(JSON.stringify(output, null, 2));
  }
} finally { await renderer.close(); }
