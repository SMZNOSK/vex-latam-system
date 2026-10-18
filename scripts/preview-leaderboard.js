// A local snapshot of the current leaderboard. Read-only SQLite, no Discord messages.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { dataDir } from '../src/config.js';
import { topPlayers } from '../src/leaderboard.js';
import { CardRenderer } from '../src/renderer.js';
import { PlayerCards } from '../src/player-cards.js';

const db = new DatabaseSync(path.join(dataDir, 'vex.sqlite'), { readOnly: true });
const renderer = new CardRenderer(), cards = new PlayerCards(path.join(dataDir, 'player-cards'));
try {
  const guilds = db.prepare('SELECT DISTINCT guild FROM profiles').all();
  const guild = process.env.DISCORD_GUILD_ID || (guilds.length === 1 ? guilds[0].guild : null);
  if (!guild) throw new Error('Indica DISCORD_GUILD_ID para elegir el servidor.');
  const rows = db.prepare('SELECT user,data FROM profiles WHERE guild=?').all(guild).map(r => ({ user: r.user, ...JSON.parse(r.data) }));
  const players = await Promise.all(topPlayers(rows).map(async p => ({ ...p, cardImageData: await cards.dataURI(p.cardImage) })));
  const dir = path.join(dataDir, 'preview'); mkdirSync(dir, { recursive: true });
  for (const width of [720, 390]) {
    const file = path.join(dir, `leaderboard-live-${width}.png`);
    writeFileSync(file, await renderer.render('leaderboard', { players }, width)); console.log(file);
  }
} finally { db.close(); await renderer.close(); }
