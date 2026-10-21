import { config } from './config.js';
import { UserError } from './domain.js';

const normalize = value => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('es');

// Bind an existing server role by ID when its name differs from the test server's name.
// An invalid binding must stop setup rather than fall back to creating a new role.
export function boundRole(guild, key) {
  const id = config.roleBindings?.[guild.id]?.[key];
  if (id == null) return null;
  if (!/^\d{17,20}$/.test(String(id))) throw new UserError(`La vinculación del rol ${key} tiene un ID inválido.`);
  const role = guild.roles.cache.get(String(id));
  if (!role || role.managed || role.id === guild.id) throw new UserError(`El rol configurado para ${key} no existe o está gestionado por otra integración.`);
  return role;
}

export function assertPermanentRoleCreation(guild, name) {
  const matches = guild.roles.cache.filter(role => normalize(role.name) === normalize(name));
  if (matches.size) throw new UserError(`Ya existe ${matches.size === 1 ? 'un rol' : 'más de un rol'} llamado ${name}. Vincúlalo por ID antes de crear otro.`);
  if (guild.id !== config.testGuildId && !config.roleCreationApprovedGuilds?.[guild.id]?.includes(name)) {
    throw new UserError(`Falta revisar el rol ${name} en este servidor. Vincula uno existente por ID o autoriza expresamente su creación en bot.config.json.`);
  }
}
