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
export const availableSkills = playerClass => specializations.filter(s => playerClass === ALL_CLASSES || s.playerClass === playerClass);
export const skillLabels = ids => specializations.filter(s => (ids ?? []).includes(s.id)).map(s => s.label);
export const pruneSkills = (ids, playerClass) => [...new Set(ids ?? [])].filter(id => availableSkills(playerClass).some(s => s.id === id));
