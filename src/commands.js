import { SlashCommandBuilder, PermissionFlagsBits as P, ChannelType } from 'discord.js';

const admin = command => command.setDefaultMemberPermissions(P.Administrator);
const tournamentAdmin = command => command.setDefaultMemberPermissions(P.Administrator);
const tournamentOption = o => o.setName('torneo').setDescription('Selecciona el torneo por nombre o ID').setAutocomplete(true);
const channel = option => option.setName('canal').setDescription('Canal de texto donde publicar').addChannelTypes(ChannelType.GuildText).setRequired(true);
export const commands = [
  ...['vxtg','vxltm'].map(clan=>admin(new SlashCommandBuilder().setName(`clan-${clan}-numero-miembros`).setDescription(`Actualiza manualmente el total real de ${clan.toUpperCase()} en THE FINALS`))
    .addIntegerOption(o=>o.setName('total').setDescription('Total real de miembros dentro del juego').setRequired(true).setMinValue(0).setMaxValue(1000))),
  admin(new SlashCommandBuilder().setName('clan').setDescription('Administra solicitudes y miembros de VXTG y VXLTM'))
    .addSubcommand(s=>s.setName('agregar').setDescription('Da de alta un integrante y publica su bienvenida con mención')
      .addStringOption(o=>o.setName('clan').setDescription('Clan').setRequired(true).addChoices({name:'VXTG',value:'vxtg'},{name:'VXLTM',value:'vxltm'}))
      .addUserOption(o=>o.setName('usuario').setDescription('Miembro de Discord').setRequired(true))
      .addStringOption(o=>o.setName('embark-id').setDescription('Opcional: Jugador#1234; usa su perfil si existe').setMaxLength(70))
      .addIntegerOption(o=>o.setName('rs').setDescription('RS actuales opcionales; usa su perfil si existe').setMinValue(0).setMaxValue(999999)))
    .addSubcommand(s=>s.setName('ranking').setDescription('Abre el acceso al panel para cargar jugadores y RS sin perfiles')
      .addStringOption(o=>o.setName('clan').setDescription('Clan').setRequired(true).addChoices({name:'VXTG',value:'vxtg'},{name:'VXLTM',value:'vxltm'})))
    .addSubcommand(s=>s.setName('miembros').setDescription('Consulta usuarios Discord, Embark ID y RS de todos los integrantes')
      .addStringOption(o=>o.setName('clan').setDescription('Clan').setRequired(true).addChoices({name:'VXTG',value:'vxtg'},{name:'VXLTM',value:'vxltm'})))
    .addSubcommand(s=>s.setName('solicitudes').setDescription('Lista solicitudes pendientes ordenadas por RS')
      .addStringOption(o=>o.setName('clan').setDescription('Clan').setRequired(true).addChoices({name:'VXTG',value:'vxtg'},{name:'VXLTM',value:'vxltm'})))
    .addSubcommand(s=>s.setName('quitar').setDescription('Retira un miembro del registro y del rol de Discord')
      .addStringOption(o=>o.setName('clan').setDescription('Clan').setRequired(true).addChoices({name:'VXTG',value:'vxtg'},{name:'VXLTM',value:'vxltm'}))
      .addUserOption(o=>o.setName('usuario').setDescription('Miembro de Discord').setRequired(true))
      .addStringOption(o=>o.setName('motivo').setDescription('Motivo de la retirada').setMaxLength(250))),
  tournamentAdmin(new SlashCommandBuilder().setName('torneo').setDescription('Administración de torneos VEX LATAM'))
    .addSubcommand(s => s.setName('crear').setDescription('Asistente privado para crear y publicar un torneo'))
    .addSubcommand(s => s.setName('editar').setDescription('Modifica calendario, cupos, acceso y reglas de un torneo').addStringOption(o => tournamentOption(o).setRequired(true)))
    .addSubcommand(s => s.setName('revisar').setDescription('Lista torneos o consulta uno').addStringOption(tournamentOption))
    .addSubcommandGroup(g => g.setName('cerrar').setDescription('Cierra la convocatoria sin terminar el torneo')
      .addSubcommand(s => s.setName('convocatoria').setDescription('Bloquea nuevas inscripciones; conserva equipos y salas de voz').addStringOption(o => tournamentOption(o).setRequired(true))))
    .addSubcommand(s => s.setName('terminar').setDescription('Finaliza el torneo y programa eliminar sus canales en 7 días').addStringOption(o => tournamentOption(o).setRequired(true))),
  tournamentAdmin(new SlashCommandBuilder().setName('torneos').setDescription('Administración de torneos VEX LATAM'))
    .addSubcommand(s => s.setName('crear').setDescription('Asistente privado para crear y publicar un torneo'))
    .addSubcommand(s => s.setName('editar').setDescription('Modifica un torneo publicado').addStringOption(o => tournamentOption(o).setRequired(true)))
    .addSubcommand(s => s.setName('revisar').setDescription('Lista torneos o consulta uno').addStringOption(tournamentOption))
    .addSubcommand(s => s.setName('cerrar').setDescription('Cierra la convocatoria; el torneo continúa activo').addStringOption(o => tournamentOption(o).setRequired(true))),
  ...[['torneo-formar-equipo', 'Forma equipos de tres balanceados por RS'], ['torneo-chat-de-voz-general', 'Crea la sala general y traslada a los participantes conectados'], ['torneo-chat-de-voz-equipos', 'Crea salas por equipo y distribuye a los jugadores conectados']]
    .map(([name, description]) => tournamentAdmin(new SlashCommandBuilder().setName(name).setDescription(description)).addStringOption(o => tournamentOption(o).setRequired(true))),
  admin(new SlashCommandBuilder().setName('ping').setDescription('Comprueba si VEX LATAM SYSTEM está conectado')),
  new SlashCommandBuilder().setName('ayuda').setDescription('Cómo usar VEX LATAM SYSTEM y VLS Find Squad'),
  new SlashCommandBuilder().setName('perfil').setDescription('Consulta tu perfil privado'),
  new SlashCommandBuilder().setName('buscar').setDescription('VLS Find Squad · Busca compañeros para jugar'),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Consulta el top 10 por RS registrados en esta comunidad'),
  admin(new SlashCommandBuilder().setName('panel').setDescription('Publica o actualiza una tarjeta del bot'))
    .addStringOption(o => o.setName('tipo').setDescription('Tipo de tarjeta').setRequired(true)
      .addChoices(...['registro','buscar','leaderboard','roles','reglas'].map(name => ({name,value:name}))))
    .addChannelOption(channel),
  admin(new SlashCommandBuilder().setName('roles').setDescription('Configura roles por reacciones con emojis'))
    .addSubcommand(s => s.setName('agregar').setDescription('Vincula un emoji con un rol seguro')
      .addRoleOption(o => o.setName('rol').setDescription('Rol de autoasignación').setRequired(true))
      .addStringOption(o => o.setName('emoji').setDescription('Un emoji Unicode o personalizado de este servidor').setRequired(true).setMaxLength(100))
      .addStringOption(o => o.setName('etiqueta').setDescription('Texto del menú').setMaxLength(100)))
    .addSubcommand(s => s.setName('quitar').setDescription('Desvincula un rol; conserva los roles ya asignados')
      .addRoleOption(o => o.setName('rol').setDescription('Rol que quieres retirar').setRequired(true)))
    .addSubcommand(s => s.setName('listar').setDescription('Muestra los roles configurados'))
    .addSubcommand(s => s.setName('editar').setDescription('Edita el texto, color e imagen del panel de roles')),
  admin(new SlashCommandBuilder().setName('avisos').setDescription('Consulta el rol THE FINALS y su límite de notificaciones')),
  admin(new SlashCommandBuilder().setName('busqueda-chat').setDescription('Ayuda automática para quienes buscan equipo por mensaje'))
    .addSubcommand(s => s.setName('estado').setDescription('Consulta las palabras, el canal, los roles y la espera por usuario'))
    .addSubcommand(s => s.setName('activar').setDescription('Activa las respuestas; requiere Message Content Intent'))
    .addSubcommand(s => s.setName('desactivar').setDescription('Desactiva las respuestas automáticas'))
    .addSubcommand(s => s.setName('palabras').setDescription('Abre un formulario para editar la lista de palabras o frases'))
    .addSubcommand(s => s.setName('restablecer').setDescription('Restaura las palabras predeterminadas; conserva activado o desactivado'))
    .addSubcommand(s => s.setName('configurar').setDescription('Cambia el canal, los roles sugeridos o la espera')
      .addChannelOption(o => o.setName('canal').setDescription('Canal donde se detectan búsquedas').addChannelTypes(ChannelType.GuildText))
      .addRoleOption(o => o.setName('juego').setDescription('Rol general de THE FINALS'))
      .addRoleOption(o => o.setName('ranks').setDescription('Rol de partidas competitivas'))
      .addRoleOption(o => o.setName('rapidas').setDescription('Rol de partidas rápidas o casuales'))
      .addIntegerOption(o => o.setName('espera').setDescription('Segundos entre respuestas al mismo usuario').setMinValue(30).setMaxValue(3600))),
  tournamentAdmin(new SlashCommandBuilder().setName('anuncio').setDescription('Abre el formulario para publicar un anuncio')).addChannelOption(channel),
  admin(new SlashCommandBuilder().setName('privadas').setDescription('Crea un anuncio para una partida privada')).addChannelOption(channel),
  admin(new SlashCommandBuilder().setName('privadas-editar').setDescription('Edita una tarjeta de partida privada publicada'))
    .addStringOption(o => o.setName('enlace').setDescription('Enlace del mensaje de la tarjeta').setRequired(true)),
  admin(new SlashCommandBuilder().setName('reglas').setDescription('Abre el formulario para publicar las reglas')).addChannelOption(channel),
  admin(new SlashCommandBuilder().setName('embed').setDescription('Crea y administra embeds nativos guardados'))
    .addSubcommand(s => s.setName('crear').setDescription('Crea un embed con un nombre para editarlo después')
      .addStringOption(o => o.setName('nombre').setDescription('Identificador: letras minúsculas, números y guiones').setRequired(true).setMaxLength(40))
      .addChannelOption(channel))
    .addSubcommand(s => s.setName('editar').setDescription('Edita la misma publicación guardada')
      .addStringOption(o => o.setName('nombre').setDescription('Identificador mostrado en /embed listar').setRequired(true).setMaxLength(40)))
    .addSubcommand(s => s.setName('listar').setDescription('Muestra los embeds y enlaces guardados'))
    .addSubcommand(s => s.setName('emojis').setDescription('Consulta los emojis del servidor y sus códigos para tus mensajes'))
    .addSubcommand(s => s.setName('retirar').setDescription('Retira un embed guardado y su mensaje')
      .addStringOption(o => o.setName('nombre').setDescription('Identificador del embed').setRequired(true).setMaxLength(40))),
  admin(new SlashCommandBuilder().setName('bienvenida').setDescription('Configura la bienvenida automática'))
    .addSubcommand(s => s.setName('editar').setDescription('Edita texto, secciones, imagen y canal de bienvenida')
      .addChannelOption(o => o.setName('canal').setDescription('Opcional: cambia el canal de destino').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s => s.setName('estado').setDescription('Consulta el canal, el estado y el intent requerido'))
    .addSubcommand(s => s.setName('activar').setDescription('Activa las bienvenidas al entrar miembros'))
    .addSubcommand(s => s.setName('desactivar').setDescription('Desactiva las bienvenidas'))
    .addSubcommand(s => s.setName('probar').setDescription('Muestra una bienvenida de prueba solo para ti')),
  admin(new SlashCommandBuilder().setName('despedida').setDescription('Configura las tarjetas automáticas al salir miembros'))
    .addSubcommand(s => s.setName('editar').setDescription('Edita texto y canal de despedida')
      .addChannelOption(o => o.setName('canal').setDescription('Opcional: cambia el canal de destino').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s => s.setName('estado').setDescription('Consulta el canal y el estado de las despedidas'))
    .addSubcommand(s => s.setName('activar').setDescription('Activa las despedidas automáticas'))
    .addSubcommand(s => s.setName('desactivar').setDescription('Desactiva las despedidas automáticas'))
    .addSubcommand(s => s.setName('probar').setDescription('Muestra tu tarjeta de despedida solo para ti')),
  admin(new SlashCommandBuilder().setName('moderacion').setDescription('Configura el filtro de palabras del servidor'))
    .addSubcommand(s => s.setName('activar').setDescription('Activa el filtro; requiere Message Content Intent'))
    .addSubcommand(s => s.setName('desactivar').setDescription('Desactiva el filtro'))
    .addSubcommand(s => s.setName('palabras').setDescription('Abre un formulario para editar la lista de palabras altisonantes'))
    .addSubcommand(s => s.setName('estado').setDescription('Muestra la configuración del filtro')),
].map(command => command.setDMPermission(false).toJSON());
