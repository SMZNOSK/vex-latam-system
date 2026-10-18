export const classes = ['Ligero', 'Mediano', 'Pesado'];
export const ALL_CLASSES = 'Todas las clases';
export const classChoices = [...classes, ALL_CLASSES];
export const specializations = [
  ['cloaking_device', 'Ligero', 'Dispositivo de camuflaje', 'Cloaking Device'],
  ['evasive_dash', 'Ligero', 'Impulso evasivo', 'Evasive Dash'],
  ['grappling_hook', 'Ligero', 'Gancho de agarre', 'Grappling Hook'],
  ['true_sight', 'Ligero', 'Visión verdadera', 'True Sight'],
  ['dematerializer', 'Mediano', 'Desmaterializador', 'Dematerializer'],
  ['guardian_turret', 'Mediano', 'Torreta guardiana', 'Guardian Turret'],
  ['healing_beam', 'Mediano', 'Rayo curativo', 'Healing Beam'],
  ['shockwave', 'Mediano', 'Onda de choque', 'Shockwave'],
  ['charge_n_slam', 'Pesado', 'Embestida y golpe', "Charge'n'Slam"],
  ['goo_gun', 'Pesado', 'Pistola de espuma', 'Goo Gun'],
  ['mesh_shield', 'Pesado', 'Escudo de malla', 'Mesh Shield'],
  ['winch_claw', 'Pesado', 'Garra de arrastre', 'Winch Claw'],
].map(([id, playerClass, label, english]) => ({ id, playerClass, label, english }));
export function selectedClasses(value) {
  const chosen = Array.isArray(value) ? value : Array.isArray(value?.playerClasses) ? value.playerClasses : value?.playerClass ?? value;
  if (Array.isArray(chosen)) return classes.filter(c => chosen.includes(c));
  return chosen === ALL_CLASSES || !chosen ? [...classes] : classes.includes(chosen) ? [chosen] : [];
}
export const classLabel = value => {
  const chosen = selectedClasses(value);
  return chosen.length === classes.length ? ALL_CLASSES : chosen.join(' + ') || 'Selecciona clases';
};
export const availableSkills = value => specializations.filter(s => selectedClasses(value).includes(s.playerClass));
export const skillLabels = ids => specializations.filter(s => (ids ?? []).includes(s.id)).map(s => s.label);
export const pruneSkills = (ids, value) => [...new Set(ids ?? [])].filter(id => availableSkills(value).some(s => s.id === id));
