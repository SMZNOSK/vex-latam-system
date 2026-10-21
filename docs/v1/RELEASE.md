# V1 · VEX LATAM SYSTEM

## Integración

Servidor principal: **VΞX LΛTΛM SQUΛD** (`1316232884117311558`).

- Reutiliza bienvenida, reglas, selección de roles, anuncios de torneos, información de clanes, sugerencias y los chats Ranked/Rápidas.
- Vincula los cinco roles existentes de THE FINALS, clubes y modos por ID. Crea Verificado y los doce patrocinadores ausentes, sin permisos globales.
- Añade ADMIN PANEL, SISTEMA DEL BOT y CLANES, con dieciséis canales de texto. No crea #pruebas-bot en producción.
- Conserva reglas, carteles de roles externos, salas permanentes, miembros e historial. No importa perfiles, torneos ni formularios de pruebas.
- Restringe las operaciones administrativas al propietario actual y a la cuenta autorizada; los comandos se procesan en #admin-bot.
- Guarda una instantánea local de canales, permisos, roles y configuración antes de preparar producción. Los respaldos y las credenciales no se publican en Git.

## Funciones

- Perfil opcional, RS actual separado del récord, tarjetas adaptables y patrocinadores.
- Búsqueda de compañeros con filtros, detección en los chats configurados y voz temporal para los equipos.
- Feedback con anonimato opcional y tres envíos diarios por persona; reportes privados con selector de miembros.
- Solicitudes a VXTG/VXLTM, evidencia, revisión, aprobación y tarjeta de ingreso. VXTG advierte por debajo de 20,000 RS actuales sin bloquear el envío.
- Rankings de clanes cargados manualmente desde administración, totales reales independientes y baja de miembros.
- Torneos editables, inscripción individual inmediata, selector de compañeros, Embark ID pendiente, formación de equipos y cambio de nombre reservado al líder.
- Guía pública de comandos, administración de embeds con emojis del servidor y tarjetas de bienvenida/despedida preparadas.

## Inicio y publicación

`iniciar-bot.cmd` valida el entorno y ejecuta V1. `--pruebas` selecciona EXPERIMENTS y `--preparar` no conecta el bot. `scripts/start.js --check` valida la selección sin iniciar otra instancia.

La guía pública se mantiene en HTML/CSS y se renderiza a tres imágenes para Discord. `scripts/publish-v1.js --publish` actualiza las mismas publicaciones guardadas en SQLite; no menciona roles ni envía notificaciones masivas.

## Estado de activación

La integración y sus paneles están activos. La bienvenida y la despedida quedan pausadas hasta desactivar las funciones equivalentes de Koya/Carl-bot mediante la sesión de un operador. La reacción de Carl-bot que ofrece CLUB VXTG requiere revisión en su propia configuración; el token de VEX LATAM SYSTEM no permite modificarla. No se eliminan roles ni asignaciones previas.

Falta **Fijar mensajes** en el rol del bot. La ausencia de ese permiso no impide publicar ni utilizar los carteles; únicamente quedan sin fijar. Discord permite a los administradores ver canales privados aunque no estén en la lista de operadores: la lista controla las acciones del bot.

## Verificación

- `npm test`: 167 casos; 163 aprobados, cuatro omitidos por la configuración de lectura de mensajes y cero fallos.
- Con Message Content Intent activado, `node --env-file=.env --test test/chat-search.test.js`: catorce aprobados; solo se omite el caso inverso de lectura desactivada.
- `npm run check`: sintaxis correcta.
- Inicio validado sin conexión tanto para principal como para pruebas.
- Reinicio real en principal: 58 canales, 78 roles y 23 comandos, sin incremento de recursos.
- Guía revisada visualmente y sin desbordamiento horizontal a 390 y 1120 píxeles.

Las pruebas de permisos usan dobles locales; no se simuló una cuenta humana sin privilegios dentro de Discord ni se enviaron solicitudes ficticias al servidor principal.
