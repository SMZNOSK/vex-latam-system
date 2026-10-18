// Importación local para una tarjeta proporcionada por el usuario; exige detener el bot.
import path from 'node:path';
import { readFileSync, mkdirSync } from 'node:fs';
import { backup } from 'node:sqlite';
import { Store } from '../src/store.js';
import { PlayerCards } from '../src/player-cards.js';
import { dataDir } from '../src/config.js';
import { normalize, UserError } from '../src/domain.js';
import { acquireProcessLock } from '../src/runtime.js';
const [embarkId, source] = process.argv.slice(2);
if (!embarkId || !source) throw new UserError('Indica el Embark ID y la ruta de la imagen.');
const release = acquireProcessLock(path.join(dataDir, 'bot.lock'));
const store = new Store(path.join(dataDir, 'vex.sqlite'));
try {
  const rows = store.db.prepare('SELECT guild,user,data FROM profiles').all()
    .filter(row => normalize(JSON.parse(row.data).embarkId) === normalize(embarkId));
  if (rows.length !== 1) throw new UserError(`Hay ${rows.length} perfiles con ese Embark ID. Usa Subir tarjeta desde tu perfil en Discord.`);
  const dir = path.join(dataDir, 'backups'); mkdirSync(dir, { recursive: true });
  const snapshot = path.join(dir, `vex-before-player-card-${Date.now()}.sqlite`); await backup(store.db, snapshot);
  const images = new PlayerCards(path.join(dataDir, 'player-cards'));
  const cardImage = await images.import(readFileSync(source));
  store.saveProfile(rows[0].guild, rows[0].user, { cardImage });
  console.log(JSON.stringify({ imported: true, embarkId, width: cardImage.width, height: cardImage.height, backup: snapshot }));
} finally { store.close(); release(); }
