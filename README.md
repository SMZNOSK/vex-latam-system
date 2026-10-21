# VEX LATAM SYSTEM · VLS Find Squad

Bot de Discord con perfiles privados, búsqueda de compañeros, roles, anuncios, reglas y moderación configurable.

## V1 · Servidor principal

La V1 se ejecuta en **VΞX LΛTΛM SQUΛD** (`1316232884117311558`). Reutiliza los canales y roles definidos por ID en `bot.config.json`; prepara únicamente los recursos que faltan y mantiene los datos de **VLS´ EXPERIMENTS** separados. El estado de despliegue y las limitaciones están en [docs/v1/RELEASE.md](docs/v1/RELEASE.md). Las secciones de traslado a EXPERIMENTS que aparecen más abajo documentan la etapa anterior.

En producción, los controles administrativos están reservados a la cuenta autorizada en `operatorUserIds` y al propietario actual del servidor. Se ejecutan desde **#admin-bot**. Discord permite a otros miembros con **Administrador** ver cualquier canal, pero el bot rechaza sus operaciones administrativas. En pruebas se conserva la comprobación de Administrador.

**Inicio:** abre `iniciar-bot.cmd`, que comprueba Node.js 24, dependencias, navegador, sintaxis y configuración antes de conectar. `iniciar-bot.cmd --pruebas` selecciona EXPERIMENTS sin cambiar `.env`; `--preparar` prepara el entorno sin conectar. Una sola instancia puede usar la carpeta `data`. Desde terminal: `npm start` o `npm run start:test`.

La configuración inicial de producción deja las bienvenidas y despedidas pausadas para coordinar el cambio desde Koya y Carl-bot. Tras desactivar sus mensajes duplicados, los operadores pueden habilitar `/bienvenida activar` y `/despedida activar` en #admin-bot. También se debe retirar en Carl-bot la reacción que autoasigna CLUB VXTG; no se eliminan el rol ni sus miembros actuales.

La guía HTML/CSS está en `docs/v1/index.html` y `docs/v1/guia.css`. `node --env-file=.env scripts/publish-v1.js` la renderiza sin publicar; añadir `--publish` crea o actualiza la publicación del canal de actualizaciones, la guía administrativa y los enlaces de clanes. Discord recibe solo las imágenes, instrucciones y botones; el HTML/CSS se conserva en el proyecto. Añadir `--guide-only` junto con `--publish` actualiza únicamente la guía pública. Los IDs publicados quedan guardados para actualizar sin duplicar.

El permiso **Fijar mensajes** es opcional: si falta, los carteles y botones funcionan y se publican sin fijar. Los canales de reglas y selección de roles existentes siguen bajo su sistema actual. El rol THE FINALS compartido con otros bots se conserva al eliminar un perfil en producción.

Si está activa la incorporación de comunidad de Discord, al iniciar se añaden los canales públicos del bot a los canales predeterminados. Se conservan las preguntas y los canales previos existentes; solo se retiran referencias a canales eliminados, tras guardar un respaldo local. ADMIN PANEL queda fuera de esa lista. La selección personal de canales de un miembro antiguo puede requerir activar **Mostrar todos los canales** o añadirlos desde **Canales y roles**. Los rankings vacíos esperan la carga manual de integrantes y los buzones/equipos muestran actividad cuando se reciben envíos o búsquedas.

## Panel administrativo y buzones

Al iniciar, el bot prepara la categoría **ADMIN PANEL** con **#admin-bot**, **#buzon-feedback** y **#buzon-reportes**. Solo el dueño y los miembros con el permiso real **Administrador** pueden verlos; el bot conserva su acceso. En el servidor indicado por `testGuildId` en `bot.config.json` también prepara **#pruebas-bot**. Ese canal no se crea en otros servidores.

Todos los comandos administrativos, incluidos torneos y anuncios, requieren ahora **Administrador** y deben ejecutarse en **#admin-bot**. Tener únicamente Administrar servidor no basta. Los comandos de jugadores siguen disponibles en sus canales habituales. **#pruebas-bot** permite revisar publicaciones y flujos; los comandos administrativos también se ejecutan desde **#admin-bot** durante las pruebas.

La categoría pública **BUZONES** contiene **#feedback** y **#reportes**, de lectura con un cartel fijado y botón. El bot guarda los IDs por servidor y actualiza los mismos mensajes al reiniciar. Si falta un canal o cartel, lo recupera sin tocar canales homónimos fuera de estas categorías. Necesita Administrar canales, Ver canales, Enviar mensajes, Leer historial, Insertar enlaces y Fijar mensajes. Las preparaciones pendientes se reintentan cada minuto.

**Feedback** pide asunto, mensaje y una casilla opcional **Enviar anónimamente**. Sin marcar, el buzón privado identifica al autor. Marcada, no publica su nombre ni su ID, y no guarda su identidad o contenido en SQLite. La asociación temporal necesaria para proteger el formulario vive solo en memoria hasta enviar o caducar en veinte minutos. El anonimato no elimina información identificable que el propio usuario escriba en el mensaje.

Cada miembro puede enviar **3 feedbacks por día y servidor**, contando juntos los anónimos y los identificados, incluidos administradores. El día se calcula en `America/Mexico_City` y se renueva a las **00:00, hora de CDMX**. El cuarto intento recibe una respuesta privada; abrir o cancelar el formulario no consume cupo. La cuota se comprueba también al enviar, se reserva antes de entregar y se libera si falla la entrega. Los formularios simultáneos de una persona se procesan en serie. Las confirmaciones indican cuántos mensajes quedan. Esta cuota no se aplica a reportes.

El contador sobrevive a reinicios en la configuración SQLite por servidor. Para conservar el anonimato, guarda únicamente una clave HMAC que cambia por día/servidor y un número, sin nombres, IDs de Discord, texto ni enlaces al mensaje recibido. La clave secreta está en `data/feedback-quota.key`, separada de SQLite; conserva toda la carpeta `data` al trasladar el bot para no reiniciar los contadores. Los contadores del día anterior se reemplazan al reservar el primer envío del día nuevo.

**Reportes** pide un miembro mediante el selector nativo de Discord, la descripción y un enlace HTTP/HTTPS opcional a evidencia. El buzón privado recibe al reportante, al reportado y el contenido. No notifica al reportado, no publica reportes en canales públicos ni aplica sanciones. Los formularios no exigen registrar perfil, y las confirmaciones y errores son privados. Los enlaces se guardan como texto, sin descargarlos.

Antes de cada entrega se comprueban nuevamente los permisos de la categoría y del buzón. Si hay acceso explícito para alguien sin Administrador o falta el bloqueo público, el bot no envía el contenido y deja pendiente reparar los permisos. Los mensajes confirmados quedan guardados en Discord, con menciones desactivadas. Los borradores sin enviar no sobreviven al reinicio.

La instalación inicial y la revisión se hacen en **VLS´ EXPERIMENTS**. Para promover el cambio después de revisar las pruebas, configura `DISCORD_GUILD_ID` con el servidor oficial y reinicia; los IDs y buzones se preparan por separado para ese servidor. No copies los envíos de prueba. Conserva `testGuildId` apuntando a VLS´ EXPERIMENTS para que #pruebas-bot siga limitado allí.

Verificación local y auditoría de Discord de solo lectura:

```
node --test test/mailboxes.test.js
node --env-file=.env scripts/audit-mailboxes.js --assert-test
```

Una aplicación y un token para **VEX LATAM SYSTEM**. **VLS Find Squad** es su módulo de perfiles y búsqueda, no otro usuario de bot. La ejecución está limitada al servidor seleccionado: `DISCORD_GUILD_ID` en `.env` para el principal o `testGuildId` al iniciar con `--pruebas`.

## Traslado a VLS´ EXPERIMENTS

La configuración, los cinco perfiles con sus imágenes y el historial interno de búsquedas se copiaron desde el servidor anterior. Se prepararon los roles de juegos, modos, Verificado y patrocinadores, adaptando las referencias a los IDs nuevos. Las búsquedas aún vigentes de organizadores presentes en el destino se publican con su caducidad original y sin avisar a los roles. Las conversaciones históricas permanecen en el servidor de origen.

Los paneles utilizan los canales que se organizaron en el destino: **🎮・『configurar-perfil』**, **🔎・『buscar-equipo』**, **🏆・『leaderboards』**, **📢・『bienvenida』**, **📜・『normativa』** y **🎭・『selección-de-roles』**. La ayuda por chat funciona en **#equipos**. El bot usa los IDs guardados para reutilizarlos aunque cambie su nombre.

`scripts/migrate-server.js` permite revisar una migración sin modificar Discord:

```
node --env-file=.env scripts/migrate-server.js --source ID_ORIGEN --target ID_DESTINO
```

Con el proceso del bot detenido, añadir `--apply` crea un respaldo coherente de SQLite, prepara el destino y fija el ID del servidor en `.env`. `--layout archivo.json` permite usar canales existentes mediante un mapa de IDs de origen a destino, conservando sus nombres y categorías. Los avances y el respaldo se registran en `data/server-migrations/` para reanudar una operación interrumpida. Se conservan los datos del origen. El script copia roles sin permisos y no reproduce roles administrativos ni sus asignaciones. El propietario del nuevo servidor conserva su acceso; los demás administradores o moderadores se configuran en Discord.

## Bienvenida, reglas y roles por reacción

Las bienvenidas y despedidas incorporan una tarjeta hecha en HTML/CSS y renderizada a PNG localmente. Ambas muestran el avatar del miembro en este servidor (o su avatar normal de Discord), el nombre y el número de miembros disponible. La bienvenida usa marfil/rojo y la despedida carbón/rojo, con tipografías locales de THE FINALS y la marca VEX LATAM. El avatar se descarga únicamente del CDN de Discord, con límite de tamaño y tiempo, y se normaliza en memoria; si falla, se muestran iniciales. Los nombres se escapan y el navegador del renderizador no puede cargar recursos externos.

Las entradas llegan al canal de bienvenida ya configurado y las salidas a **#despedidas**, creado automáticamente como canal de lectura. No se anuncia a bots ni se reproducen salidas pasadas. La despedida usa «Hasta pronto» con sarcasmo discreto: «Te deseamos un equipo a tu altura. El nuestro seguirá creciendo.», sin atribuir una causa de salida ni indicar expulsiones o baneos. No menciona ni notifica al usuario que salió. Los dos textos predeterminados anteriores se actualizan; los textos personalizados se conservan. Server Members Intent habilita ambos eventos. Si fallan el navegador o los permisos de adjuntos, se conserva el mensaje nativo de texto con enlaces y controles de bienvenida.

En **#admin-bot** puedes usar `/bienvenida probar` y `/despedida probar` para ver tu propia tarjeta en una respuesta privada. `/despedida editar canal:#canal` cambia el canal y el texto que acompaña a la imagen. También existen `/despedida estado`, `/despedida activar` y `/despedida desactivar`. El editor modifica el texto nativo; la composición visual se mantiene en `src/member-card-design.js`. Las imágenes personalizadas de cada miembro se generan al ocurrir el evento y no se guardan en disco.

SQLite v6 respalda la base antes de añadir los recibos de despedida y conserva los perfiles, torneos y recibos de bienvenida. Las salidas se deduplican por ingreso conocido, incluso tras reiniciar. Si Discord entrega un miembro parcial sin fecha de ingreso, se evita repetir su salida durante un minuto. La configuración y los recibos pertenecen al servidor; no se copian mensajes de prueba al cambiar de servidor.

Para generar y revisar los HTML y PNG autocontenidos, ejecuta `node --env-file=.env scripts/preview-members.js --discord`. La muestra utiliza el avatar del dueño del servidor configurado, y se guarda en `data/preview-members/`. El script verifica desbordamientos con nombres largos en 300, 390, 720 y 1080 px. Sin `--discord`, reutiliza la muestra local o emplea iniciales.

Al iniciar prepara los canales públicos **#bienvenidos**, **#reglas** y **#seleccion-de-roles**, conserva sus IDs y reutiliza los mensajes fijados de reglas y roles. Solo el bot y el staff (Administrar servidor o Administrar mensajes) publican; los miembros pueden reaccionar en selección de roles. Puedes mover los paneles con `/panel tipo:reglas` y `/panel tipo:roles`, y la bienvenida con `/bienvenida editar canal:#canal`.

La bienvenida menciona únicamente al miembro nuevo, con juegos e instrucciones de las capturas. No publica saludos retroactivos ni saluda a bots. Usa **Server Members Intent** en Developer Portal → aplicación → Bot; quedó habilitado en esta instalación mediante la API oficial. El inicio comprueba ese permiso: si no está habilitado, las demás funciones siguen conectadas y `/bienvenida estado` informa del pendiente. Habilitarlo después requiere reiniciar. El intent no necesita Message Content Intent.

```
/bienvenida editar
/bienvenida probar
/bienvenida estado
/bienvenida activar
/bienvenida desactivar
/reglas canal:#reglas
```

La prueba es privada. En el título, descripción y secciones de bienvenida se admiten `{usuario}`, `{servidor}`, `{reglas}`, `{roles}` y `{buscar}`. Al guardar se valida el contenido que recibirá Discord. Las diez reglas iniciales proceden de la captura y pueden editarse.

El panel usa **reacciones** en lugar del menú anterior. Se preparan roles seguros para THE FINALS (🔺), HELLDIVERS 2 (🪖) y ARC RAIDERS (🤖). Si un rol ya estaba configurado sin emoji, se conserva pendiente para que lo completes con `/roles agregar`. Se pueden elegir varios juegos: agregar la reacción asigna el rol y quitarla lo retira. El bot necesita Añadir reacciones, Leer historial y Administrar roles, con su rol por encima de los roles configurados. Admite emojis Unicode y emojis personalizados de este servidor, hasta veinte vínculos. `/roles editar` cambia el texto, las secciones, el color y la imagen; los vínculos activos se añaden automáticamente.

**THE FINALS** combina ambos orígenes: se mantiene mientras exista un perfil o una reacción activa. Por eso retirar la reacción de un jugador registrado no le quita el rol, y eliminar el perfil de alguien que conserva la reacción tampoco. Los fallos de roles quedan pendientes para reintentar; al reiniciar se consultan las reacciones del mensaje guardado para recuperar cambios ocurridos mientras el bot estaba apagado.

## Guía pública de comandos

Al iniciar, el bot publica o actualiza una guía fijada en el canal existente cuyo nombre contiene `comandos-del-bot`. Si falta, crea uno. La guía enumera `/ayuda`, `/perfil`, `/buscar` y `/leaderboard`, con enlaces a los paneles de perfil, búsquedas, torneos, feedback y reportes. `/ping` queda reservado a administradores en #admin-bot. Solo incluye comandos sin restricción administrativa y sus respuestas son privadas. El canal queda de lectura para miembros. Se guarda la referencia del mensaje y se recupera por su pie de página para evitar duplicados.

## Organización de canales de torneos

Cada torneo agrupa sus canales de inscripciones, equipos y voz en una categoría `🏆 TORNEO · nombre · bloque · ID`. Cada miembro puede plegarla o desplegarla con la flecha de Discord. Al terminar con `/torneo terminar`, pasa a `🏁 FINALIZADO` y queda debajo de las categorías normales y de los torneos activos. Cerrar la convocatoria conserva su categoría activa. Se organizan también los canales existentes al reiniciar y se conservan sus IDs, mensajes y permisos individuales; las voces privadas no heredan los permisos públicos de la categoría.

Para torneos grandes se crean bloques adicionales de hasta 50 canales, el límite por categoría de Discord. Las categorías se reutilizan al reiniciar. Tras los 7 días de conservación ya configurados se elimina también cada categoría vacía; si alguien añadió canales ajenos al torneo, su categoría se conserva.

## RS actual y récord del perfil

El campo `score` guarda únicamente el **RS actual**. `peakScore` conserva el mayor RS registrado para el mismo Embark ID; nunca se usa como sustituto del actual. Una bajada actualiza el rango, las búsquedas y el top 10 de perfiles sin bajar el récord. Subir por encima de la marca actualiza ambos. El récord comienza con el valor ya guardado al migrar y no reconstruye máximos anteriores desconocidos. Es una marca global registrada por el bot, no un récord oficial ni separado por temporada. Cambiar a otro Embark ID inicia la marca de esa identidad; diferencias solo de mayúsculas no crean otra identidad.

En `/perfil`, el panel de configurar perfil y los carteles de clanes está **Actualizar RS actual**. Este formulario guarda directamente al enviar, permite bajar los puntos y conserva clase, especializaciones, patrocinador y foto. Una actualización manual invalida la posición global consultada: Ruby no se conserva por un récord antiguo. La caché de la consulta anterior se invalida al cambiar RS para no reutilizarla después de editar manualmente.

La edición completa sigue siendo un borrador hasta pulsar **Guardar cambios** o **Guardar perfil**. Para un perfil ya completo, Guardar cambios está disponible después de enviar identidad/RS, sin volver a elegir especializaciones. El asistente y la ficha muestran si hay cambios sin guardar; se pueden retomar desde `/perfil → Continuar cambios`. Una solicitud de clan no se abre ni se aprueba con un Embark ID o RS pendientes de guardar.

VXTG recomienda **20,000 RS actuales (Oro 4)**. Con menos puntos se permite abrir, enviar y aprobar la solicitud: el formulario y el receptor privado muestran una advertencia, y el botón del staff dice Aprobar con RS bajo. El récord no elimina esa advertencia. Los formularios muestran actual y récord por separado. El bot no lee automáticamente cambios dentro del juego: el usuario debe guardar sus puntos actuales o consultar el tracker. Una consulta fallida no cambia los puntos ni el récord. Los rankings manuales de clanes conservan los valores cargados por el staff.

SQLite v9 agrega la marca a los perfiles existentes con respaldo previo. Las membresías, evidencias, anuncios anteriores y rankings manuales se conservan.

## Clanes VXTG y VXLTM

Al iniciar se reutiliza o crea la categoría pública `CLANES` con `unete-a-vxtg`, `unete-a-vxltm`, `ranking-vxtg` y `ranking-vxltm`. Los canales de ingreso sirven para el cartel, los formularios y los anuncios de integrantes aprobados. Los rankings y carteles son de solo lectura. En `ADMIN PANEL` se prepara `solicitudes-clanes`, privado para administradores reales, con la evidencia y los botones de aprobación y rechazo. También se prepara `rankings-clanes`, un editor privado para el staff. VXTG usa blanco y negro; VXLTM, negro y rojo.

Ambos clanes requieren un perfil completo con Embark ID y RS, además de una captura obligatoria de hasta 8 MB en PNG/JPG/WebP. El formulario toma los datos del perfil y permite añadir horario, zona y un comentario de forma opcional. VXTG recomienda Oro 4 (20,000 RS), según la escala ya usada por el bot, y admite solicitudes con menos RS para revisión del staff. VXLTM admite cualquier RS, también 0. Las solicitudes pendientes se pueden consultar por RS descendente: un RS mayor da prioridad de revisión, sin aprobación automática. Un mismo Discord o Embark ID no puede tener dos membresías activas, y cada usuario puede tener una sola solicitud pendiente. El solicitante puede consultar o cancelar la suya desde el cartel.

La evidencia se conserva en `data/clan-evidence` y se adjunta solo al receptor privado. La revisión es humana: el bot no verifica el contenido de una captura ni cambia membresías dentro de THE FINALS. Aprobar crea el registro, asigna un rol sin permisos globales, envía un mensaje directo y anuncia el ingreso en el canal del clan con una tarjeta HTML/CSS: avatar de Discord, nombre, Embark ID, RS e insignia al ingresar. Los anuncios anteriores se actualizan en su mismo mensaje, sin repetir el DM ni la aprobación. El staff coordina la invitación dentro del juego. Si los mensajes directos están bloqueados, el buzón lo indica y el solicitante puede usar Mi solicitud. Los pasos pendientes sobreviven al reinicio y se reintentan con recibos para recuperar mensajes sin crear otra aprobación. Los roles de clan no se pueden autoasignar por reacción.

Comandos administrativos, desde `#admin-bot` (Discord exige nombres en minúsculas):

```
/clan-vxtg-numero-miembros total:30
/clan-vxltm-numero-miembros total:45
/clan ranking clan:VXTG
/clan ranking clan:VXLTM
/clan miembros clan:VXTG
/clan miembros clan:VXLTM
/clan solicitudes clan:VXTG
/clan quitar clan:VXTG usuario:@persona motivo:Motivo de retirada
```

Los comandos de número guardan **manualmente** el total real dentro de THE FINALS. Aprobar, retirar o salir de Discord no cambia ese número. Se muestran dos datos distintos: total real del juego y registrados por el bot. `/clan miembros` lista de forma privada Discord ID/usuario, Embark ID y RS, con paginación. `/clan quitar` pide confirmar la retirada, elimina su registro y su rol de Discord y conserva una auditoría privada; el retiro dentro del juego lo hace el staff. Salir del servidor cancela solicitudes pendientes y retira su registro de Discord.

Los rankings se mantienen **manualmente**, sin exigir cuenta de Discord ni perfil del bot a quienes aparecen. En `ADMIN PANEL → rankings-clanes`, pulsa **Editar VXTG** o **Editar VXLTM**. Pega o edita la lista completa, una persona por línea: `Jugador#1234 | 32000` o `Nombre | 32000` (hasta 50 jugadores por clan; los 35 caben en un solo formulario). Para quitar a alguien de la tabla, borra su línea. El bot presenta un resumen de altas, bajas y cambios antes de confirmar; una lista vacía también requiere confirmar. Los RS se ordenan de mayor a menor, con desempate por nombre/Embark ID; el rango se calcula usando las insignias de `rangos/`. Ruby requiere posición global verificada y no se asigna solo por RS manuales.

Guardar reemplaza únicamente la tabla de ese clan. Las aprobaciones y los cambios de perfil no agregan jugadores ni cambian sus RS en esta lista; los perfiles siguen siendo necesarios para el formulario de solicitud y las funciones de búsqueda. El total manual del juego y las membresías/roles son independientes. Al migrar se conserva una sola vez el listado de miembros previamente aprobados; después solo lo cambia el staff. El editor detecta ediciones simultáneas para no sobrescribir cambios de otro administrador y conserva auditoría privada del antes/después. Las tablas públicas usan imágenes HTML/CSS y texto nativo, por páginas de 15, y se actualizan en sus mensajes existentes.

Los rankings manuales tienen revisión y conservan solicitudes, membresías, trabajos pendientes y auditoría de clanes, con respaldo previo y separación por servidor. No se importan solicitudes, evidencia ni miembros de prueba al servidor principal. Los carteles y los mensajes de ranking guardan sus referencias; una nueva ejecución actualiza las publicaciones existentes. Los diseños y las muestras ficticias se generan con `node scripts/preview-clans.js`; `--publish-test` publica las muestras solo en el canal privado de pruebas.

## Edición de embeds nativos

Los emojis personalizados se muestran dentro del texto nativo del mensaje: descripciones, títulos y secciones. En #admin-bot, `/embed emojis` abre un catálogo privado y paginado con los nombres y códigos de los emojis de este servidor. En `/bienvenida editar`, `/despedida editar`, `/embed crear`, `/embed editar`, reglas, roles y anuncios puedes escribir `:nombre:`; al guardar se convierte al código de Discord `<:nombre:ID>` o `<a:nombre:ID>` si es animado. Los códigos completos pegados se conservan. Los nombres desconocidos quedan como texto, y los nombres duplicados requieren el código completo. Los emojis en bloques de código o escapados no se sustituyen. Se vuelven a comprobar los límites del embed después de expandirlos.

Usa `/bienvenida probar` para ver el mensaje privado con la tarjeta y los emojis. Estos emojis están en el texto del embed, no en el PNG de la tarjeta. Para usar los del servidor principal hace falta su catálogo y acceso de la aplicación; las copias subidas a otro servidor tienen IDs distintos y deben remapearse al trasladar las plantillas.

```
/embed crear nombre:torneo canal:#general
/embed editar nombre:torneo
/embed listar
/embed retirar nombre:torneo
```

Solo miembros con Administrador pueden abrir o enviar estos formularios desde #admin-bot. El identificador usa hasta cuarenta letras minúsculas, números o guiones. El editor admite título, descripción, secciones, color hexadecimal e imagen opcional por URL HTTPS. No aloja una página web. Cada sección se escribe en una línea como `Título | Contenido`; `\\n` inserta un salto dentro del contenido y `[] Título | Contenido` permite mostrarla en columna. Discord adapta las columnas al espacio disponible.

Editar actualiza el mismo mensaje; retirar pide confirmación privada y elimina únicamente esa tarjeta. Los borradores duran veinte minutos y pertenecen a la persona que los abrió. Una edición antigua no sobrescribe otra más reciente. Los IDs y el contenido confirmado se guardan en SQLite; las menciones masivas están desactivadas. `/anuncio` permanece como publicación rápida de un embed sin identificador guardado.

La migración a **SQLite v3** genera un respaldo coherente antes de agregar tablas de embeds, reacciones pendientes y recibos de bienvenida. No recalcula ni elimina los perfiles o equipos de v2. Las antiguas tarjetas Components V2 de reglas y roles se sustituyen una vez por embeds nativos y se retiran sus mensajes anteriores.

## Inicio y permisos

Usa **Node.js 24 o superior**. Las dependencias están instaladas; en otra máquina ejecuta `npm.cmd ci`.
El token se guarda en `.env`, nunca en el código ni en mensajes. Inicia con `iniciar-bot.cmd` o `npm.cmd start`.

En una laptop Windows con Node.js y npm instalados, abre `iniciar-bot.cmd`: comprueba las dependencias y sus versiones, instala las que falten con `npm.cmd ci` y prueba que el navegador pueda generar imágenes. Reutiliza Chrome, Edge o Chromium; si ninguno funciona, descarga Chromium automáticamente. Si configuraste `VEX_BROWSER_PATH`, debes corregir o retirar esa ruta si apunta a un navegador de la otra laptop. Necesita internet para las descargas y para conectar a Discord. No requiere permisos de administrador.

Si falta `.env`, el iniciador lo crea desde `.env.example` y se detiene para que completes la configuración; nunca reemplaza un `.env` existente. Para trasladar el bot, detén primero la copia anterior y luego copia el proyecto con `.env`, `bot.config.json`, toda la carpeta `data` y sus recursos gráficos. Puedes omitir `node_modules`. Ejecuta el bot en una sola laptop a la vez; el bloqueo local no detecta procesos de otra computadora. No copies una base de datos mientras el bot siga escribiendo en ella.

`iniciar-bot.cmd --preparar` instala y verifica lo necesario sin conectar a Discord. El inicio normal mantiene la ventana abierta para ver los mensajes y detener el proceso con Ctrl+C. No configura el inicio automático de Windows ni las opciones de suspensión.
Mantén la computadora y el proceso encendidos. Ctrl+C detiene el bot. `data/bot.lock` impide iniciar dos copias.

En **Ajustes del servidor → Roles**, VEX LATAM SYSTEM necesita **Administrar roles, Administrar canales y Fijar mensajes**.
También necesita Ver canal, Enviar mensajes, Adjuntar archivos, Insertar enlaces y Leer historial en sus canales.
Su rol debe estar por encima de THE FINALS. Activar permisos en el portal de desarrolladores no modifica por sí solo una instalación existente.

Al iniciar:
- Crea el rol seguro **THE FINALS**, sin permisos, y lo asigna a los perfiles existentes.
- Crea **#equipos** y publica allí las solicitudes.
- Prepara **#registro-de-datos** y **#buscar-equipo** como canales de controles; solo el bot y los administradores pueden publicar.
- Actualiza y fija las tarjetas guardadas por ID. Los mensajes fijados se consultan desde Discord; no hay una cabecera fija sobre el chat.
- Si falta un permiso, deja la preparación pendiente y la reintenta cada minuto sin duplicar paneles.

Puedes seleccionar canales existentes con:
```
/panel tipo:registro canal:#registro-de-datos
/panel tipo:buscar canal:#buscar-equipo
```

## Perfiles privados

Pulsa Completar / editar perfil o usa **/perfil** si aún no tienes uno:
1. Embark ID completo (`Jugador#1234`) y puntos RS obligatorios, enteros entre 0 y 999999. Puedes adjuntar una tarjeta PNG, JPG o WebP estática de hasta 8 MB.
2. Ligero, Mediano, Pesado o Todas las clases.
3. Casillas múltiples de especializaciones. Exige al menos una; Todas muestra tres grupos.
4. Revisa tu ficha y pulsa Guardar perfil.

Cambiar de clase retira las habilidades incompatibles y muestra un aviso. Los borradores caducan a los veinte minutos y se descartan al reiniciar; las fichas confirmadas se guardan en SQLite.

**Mi perfil** agrupa editar, consultar clasificación, pausar, eliminar y **Subir/Cambiar tarjeta** o **Quitar tarjeta**. Pausar conserva THE FINALS; eliminar retira el rol si no conservas su reacción, quita al jugador de los equipos y cierra las búsquedas que organiza. Las operaciones de rol que fallen quedan guardadas para reintentar, incluso después de reiniciar.

El rango se calcula por RS: Bronce desde 0, Plata desde 10000, Oro desde 20000, Platino desde 30000 y Diamante desde 40000. Cada división abarca 2500 puntos; Diamante 1 comienza en 47500. **Ruby exige una posición conocida del 1 al 500 en la consulta**, nunca se concede solo por puntos.

### Consulta de clasificación

Consultar clasificación envía el Embark ID a [FINALSTRACKER](https://finalstracker.net/api.html), fuente comunitaria no oficial. Solo acepta puntuaciones actuales `onBoard` y descarta estimaciones. La posición se toma de `standing.rank`; el rango se calcula usando nuestra tabla de RS. La caché dura al menos diez minutos. Cambiar manualmente el ID o RS invalida la posición consultada.

Si no hay datos o la API falla, el perfil conserva sus datos. El registro no verifica la propiedad del Embark ID. No consulta habilidades ni contraseñas. Puede desactivarse con `trackerEnabled: false` en `bot.config.json`.

## Equipos

### Búsquedas escritas en el chat

La búsqueda automática escucha **#equipos** por defecto. Reconoce solicitudes como «¿quién juega?», «quién para jugar soy platino», «busco equipo», «+1», «+2» o «a quién le falta uno», ignorando acentos y mayúsculas. Crea una búsqueda real **HOT · En caliente** de **3 jugadores en total** (organizador y dos compañeros), con el diseño del patrocinador y la tarjeta del organizador si los tiene registrados. Muestra sus RS registrados, sin intervalo ni filtros de Ranked/Chill, clase o especializaciones. La ficha pública lleva únicamente **THE FINALS** como texto, más **Unirme**, **Mi equipo**, **Crear sala de voz** y **Cerrar búsqueda**. Los botones de voz y cierre comprueban la pertenencia y que quien crea o cierra sea el organizador; los integrantes recuperan sus controles privados con Mi equipo o Mis equipos. La imagen y los botones se actualizan al unirse, salir, cerrar o caducar; la búsqueda se guarda en SQLite y se recupera al reiniciar.

No exige completar un perfil: si faltan datos muestra «Sin registrar» para RS y «Perfil no disponible» en el lugar de la tarjeta. Unirse a HOT tampoco requiere perfil, a diferencia de los equipos con filtros normales. Caduca según `searchLifetimeMinutes` (60 minutos por defecto). Solo puede haber **una búsqueda activa por organizador en el servidor**, contando tanto normales como HOT y reservas pendientes de publicación. Tener el equipo lleno no libera esa búsqueda. Cerrar o caducar permite volver a publicar inmediatamente. Si ya hay una activa, las palabras clave recuperan un enlace a ella y un botón de controles, sin crear otro equipo.

Al instalar prepara los dos roles de modo sin permisos y los añade al panel de reacciones con 🏆 y ⚡. Esos roles siguen disponibles para autoasignación; no aparecen en la respuesta automática. La tarjeta muestra el rol del juego sin notificar a sus integrantes ni al autor. El ajuste `espera` limita los recordatorios cuando ya hay una búsqueda activa (cinco minutos por defecto); no impide crear una nueva tras cerrar o caducar la anterior. Ese límite se guarda en SQLite y sobrevive al reinicio. No se guarda el contenido del chat. Se omiten bots, webhooks, mensajes de sistema, citas, código, solicitudes explícitas de otros juegos y mensajes que activa el filtro de moderación.

Requiere [**Message Content Intent**](https://docs.discord.com/developers/events/gateway#message-content-intent) en Developer Portal → Bot, `ENABLE_MESSAGE_CONTENT=true` en `.env`, Ver canal, Enviar mensajes y Leer historial en el canal elegido. Para mostrar la tarjeta necesita también Adjuntar archivos y un navegador compatible con el renderizador. Habilitar la lectura de texto no activa el filtro de moderación. Reinicia después de cambiar el intent o `.env`.

Miembros con Administrador pueden consultar o cambiar la función desde #admin-bot:

```
/busqueda-chat estado
/busqueda-chat palabras
/busqueda-chat configurar canal:#equipos espera:300
/busqueda-chat configurar juego:@THE FINALS ranks:@THE FINALS RANKS rapidas:@THE FINALS RÁPIDAS
/busqueda-chat activar
/busqueda-chat desactivar
/busqueda-chat restablecer
```

`/busqueda-chat palabras` abre un formulario con la lista actual. Añade o quita entradas, una por línea o separadas por comas; al enviarlo se guarda la lista completa. Cancelar no cambia nada. La detección ignora acentos, mayúsculas y espacios repetidos, y busca palabras o frases completas. Admite hasta 100 elementos de 80 caracteres, con 1000 caracteres en toda la lista. `+1` no coincide con `+10`; puedes añadir también `1+` si quieres reconocer esa forma. No acepta expresiones regulares. La confirmación y el estado muestran la lista completa en una respuesta privada. Si otro administrador cambia la lista mientras editas, tendrás que abrir el formulario de nuevo para conservar sus cambios. Se comprueban el permiso Administrador y #admin-bot tanto al abrir como al guardar.

Cambiar las palabras conserva la función activada o desactivada. Escribir `-` vacía la lista y desactiva la ayuda; para volver a activarla, configura palabras o usa `restablecer`. `restablecer` recupera la detección original con sus variantes sin cambiar el canal, los roles, la espera ni el interruptor. Las palabras se guardan por servidor en SQLite y sobreviven al reinicio.

Los roles personalizados se añaden al panel de reacciones con `/roles agregar`, si también quieres ofrecerlos para autoasignación. Cambiar la configuración de sugerencias no modifica esos vínculos.

Pulsa Buscar compañeros o usa **/buscar** para abrir el mismo asistente privado:
- Ranked o Chill.
- Una o varias clases (por ejemplo Ligero + Mediano) en el menú multiselección. Marcar las tres equivale a Todas las clases. Las casillas de especializaciones muestran solo las clases seleccionadas y retiran las habilidades incompatibles al desmarcarlas. Coincidir con **cualquiera** de las seleccionadas es suficiente; vacío no filtra habilidades.
- De uno a cuatro compañeros mediante botones; inicialmente dos.
- Solo Ranked: mínimo y máximo RS, inicialmente tu RS ±5000, limitados a 0–999999. Botones ±2500 y formulario de valores exactos mantienen mínimo ≤ máximo.
- Mensaje adicional opcional.

Discord no ofrece sliders nativos en estos formularios. Los botones y el formulario son la alternativa acordada; no hay web ni alojamiento adicional.

La tarjeta pública muestra **únicamente Unirme**, deshabilitado si está llena o terminó. Los integrantes reciben controles privados:
- Organizador: Ver equipo, Ver compatibles, Cerrar búsqueda.
- Integrante: Ver equipo, Salir.
- Mis equipos recupera los controles; si hay varios, muestra un selector.
- Pulsar Unirme cuando ya perteneces al equipo recupera tu panel sin duplicarte.

La ficha pública muestra la tarjeta del juego de cada integrante o su Embark ID si no tiene imagen. Los controles del equipo siguen siendo privados; solo el organizador consulta sugerencias o cierra la búsqueda. Los botones antiguos siguen sujetos a esas comprobaciones. El organizador puede pedir otra clase distinta de la suya. Los perfiles pausados o incompletos no pueden iniciar ni unirse a búsquedas.

Una búsqueda activa por organizador y servidor, contando normales, HOT y publicaciones pendientes, con sesenta minutos de caducidad por defecto. Se puede abrir otra al cerrar o caducar la anterior. Los grupos confirmados conservan integrantes, estado y caducidad en SQLite después de reiniciar. Todas las solicitudes muestran **@THE FINALS**; las normales notifican al rol como máximo una vez cada diez minutos por servidor, las HOT solo muestran la mención. Editar, reiniciar o trasladar una solicitud no notifica.

## Salas de voz temporales

El organizador abre **Mis equipos → Crear sala de voz**. Se crea una sala por equipo, con el cupo de jugadores de la búsqueda. Todos pueden verla, pero solo sus integrantes pueden conectarse (los administradores del servidor conservan su acceso). Las salas existentes se actualizan sin interrumpir conversaciones. Los integrantes usan **Mis equipos → Acceder a sala de voz**. Si ya están en otra sala de este servidor, el bot intenta trasladarlos al pulsar ese botón. Discord no permite conectar desde cero a un usuario desconectado de voz: en ese caso deben pulsar **Abrir sala de voz** y después **Conectarse** dentro de Discord. Si falta Mover miembros o Discord rechaza el traslado, se conserva el acceso manual a la sala.

VEX LATAM SYSTEM necesita Administrar canales, Ver canales, Conectar y Hablar; Mover miembros permite el traslado automático y Administrar roles permite actualizar el acceso de los integrantes. El intent GuildVoiceStates está habilitado en el código y no requiere habilitar un intent privilegiado en el portal. No se conecta audio del bot ni se graban conversaciones.

Las salas se guardan en la tabla `voice_rooms` de SQLite, se recuperan al reiniciar y solo se borran cuando están vacías. Una sala nueva ofrece dos minutos para que alguien entre; tras haberse usado, se elimina después de treinta segundos vacía, con una comprobación cada diez segundos. Reconectarse cancela el borrado. Cerrar o caducar la búsqueda conserva una sala ocupada; Mis equipos permite recuperar su acceso hasta que se elimine. Los botones antiguos comprueban siempre la pertenencia al equipo. El bot solo elimina las salas que él registró, no las salas permanentes del servidor.

## Apariencia y compatibilidad

Las respuestas privadas se actualizan sobre el mismo mensaje cuando se usan sus botones o formularios. Abrir otro panel en el mismo canal retira el anterior, e incluye **Cerrar panel**. Tras diez minutos sin actividad se limpian automáticamente; el borrador sigue caducando a los veinte minutos. **Limpiar mis mensajes**, en ambos paneles principales, retira las respuestas privadas recientes del usuario en este servidor y no borra perfiles, equipos ni mensajes públicos. Los avisos de error se retiran tras un minuto sin cerrar el asistente.

Discord permite editar y borrar respuestas efímeras con tokens de interacción durante quince minutos. Esos tokens solo se conservan en memoria. Las respuestas de antes de reiniciar, cuyos tokens ya no están disponibles, se descartan desde **Eliminar este mensaje** en Discord; no se pueden enumerar ni limpiar desde el historial público del canal.

Las fichas se generan localmente con **HTML/CSS + Playwright** y se adjuntan como imágenes. Chrome o Edge instalados bastan en Windows; en otro entorno puedes instalar Chromium con `npx.cmd playwright install chromium`. Opcionalmente configura `VEX_BROWSER_PATH` en `.env`.

La foto del jugador es opcional tanto en el registro como en Subir / Cambiar tarjeta. Enviar el formulario sin archivo conserva la foto existente; sin foto, los equipos muestran el Embark ID. Para retirar una foto se usa Quitar tarjeta.

Las imágenes de los jugadores se descargan desde las adjuntas de Discord y se guardan localmente en **data/player-cards**, conservando la proporción. Se normalizan a PNG sin metadatos; no dependen de enlaces de Discord que caduquen. Solo se admiten PNG/JPG/WebP estáticos de hasta 20 megapíxeles; una descarga o imagen inválida conserva la tarjeta anterior. Cambiar o quitar una tarjeta actualiza los equipos abiertos sin notificar al rol. Las imágenes sin referencia se eliminan tras un día; los borradores activos y perfiles guardados las protegen. La carpeta data debe copiarse completa junto con SQLite al cambiar de máquina.

Las insignias de rango usan los 21 PNG de **rangos/**, con su división correspondiente y Ruby. Los logos de **rangos/logos/** aparecen en la cabecera de los perfiles, equipos y paneles. Conserva también esa carpeta al trasladar el bot; después de sustituir un recurso visual, reinicia para actualizar las imágenes.

La **Plantilla V1 mejorada** recupera el fondo negro/rojo original, con las fuentes de la web oficial de THE FINALS: Saira Extra Condensed para títulos y Saira Condensed para texto. Las fuentes WOFF2 y sus licencias están en **assets/fonts/**. Las 11 imágenes WebP de **especializaciones/** se muestran con marco, sin repetir clase ni nombre en la imagen. Visión verdadera usa un icono de respaldo porque falta su ilustración; las etiquetas se mantienen en el texto nativo de Discord. Conserva ambas carpetas al trasladar el bot. La plantilla está en `src/card-template.js` y los ejemplos en **plantillas/Plantilla V1 mejorada/**. Los respaldos **Plantilla V1** y **Plantilla V2** se conservan.

El renderer bloquea solicitudes externas y escapa los textos introducidos. No aloja páginas ni envía las fichas a otro servicio. El texto legible y los controles de Discord acompañan las imágenes. Si falla el navegador, la tarjeta nativa sigue funcionando.

## Datos y migración

`data/vex.sqlite` guarda perfiles, solicitudes, ajustes y operaciones de rol pendientes. Antes de actualizar al esquema 2 se genera una copia coherente en `data/backups/`. Guarda la carpeta data al cambiar de máquina.

Los perfiles anteriores se recalculan por RS válidos. Las especializaciones se conservan como referencia; solo se reconocen coincidencias exactas con el catálogo. Datos como “Daga” no se convierten a otra habilidad: el jugador debe completar su selección. Las solicitudes anteriores conservan sus filtros de referencia, integrantes y caducidad; las abiertas se trasladan a #equipos con un enlace en el mensaje anterior y sin notificar al rol.

El esquema y la migración son idempotentes. Las solicitudes interrumpidas sin mensaje se descartan al iniciar para que el organizador pueda intentarlo nuevamente. Las nuevas búsquedas guardan `playerClasses` y versión 3 en su objeto de filtros; el esquema SQLite sigue en versión 2. Las solicitudes anteriores sin esa lista conservan su comportamiento usando `playerClass`, sin modificación masiva de datos. Se creó una copia de SQLite antes de introducir multiclase y leaderboard.

## Leaderboard de la comunidad

El bot prepara **#leaderboard** como canal de controles y fija una única tarjeta pública. Muestra hasta diez perfiles de este servidor ordenados por RS guardados, mayor a menor. No usa la posición de ese top para asignar Ruby. El primer lugar lleva tarjeta mayor y marco dorado; segundo y tercero son más pequeños con marcos plata/bronce; los otros siete se muestran en una rejilla compacta. Cada jugador muestra su tarjeta del juego o su Embark ID si no tiene foto.

No es la clasificación oficial: los RS proceden del perfil, declarados o consultados por su jugador. Empates: Embark ID en orden alfabético, y después ID de Discord como desempate estable para IDs de juego idénticos. Los perfiles pausados siguen participando; eliminar el perfil lo retira del top. No se publican jugadores de otros servidores ni se menciona al rol al actualizar.

Guardar perfil, consultar clasificación y cambiar/quitar foto actualizan la misma publicación; si falla, se reintenta en el siguiente ciclo de un minuto. Reiniciar recupera los IDs guardados sin duplicar la tarjeta. El texto y los controles siguen disponibles si falla la imagen. **/leaderboard** abre una copia privada; **/panel tipo:leaderboard canal:#canal** permite al administrador escoger otro canal.

## Otras funciones

Los miembros con Administrador pueden usar en #admin-bot:
```
/roles agregar rol:@Mediano emoji:🩺 etiqueta:Mediano
/roles quitar rol:@Mediano
/roles listar
/panel tipo:roles canal:#seleccion-de-roles
/avisos
/anuncio canal:#general
/reglas canal:#general
```

El panel de reacciones modifica solo los roles configurados y rechaza permisos sensibles o roles superiores al bot. `/roles quitar` o cambiar el emoji deja intactos los roles ya otorgados y desactiva el vínculo anterior. `/avisos` informa del rol de equipos y su límite de notificaciones.

La moderación está desactivada por defecto. Para usarla, activa Message Content Intent en el portal, cambia `ENABLE_MESSAGE_CONTENT=true` en .env, concede Administrar mensajes y reinicia:
```
/moderacion palabras
/moderacion activar
/moderacion estado
/moderacion desactivar
```
`/moderacion palabras` abre el editor privado de palabras altisonantes con la lista actual. Añade o quita entradas, una por línea o con comas; guarda la lista completa al enviar. Escribir `-` vacía la lista y desactiva el filtro. Cancelar conserva los ajustes. Tiene los mismos límites y comprobaciones de permisos y edición simultánea que el editor de búsqueda por chat. Guardar palabras no activa automáticamente el filtro.

Borra mensajes con palabras o frases completas, ignorando acentos y mayúsculas. No interpreta el contexto, no aplica castigos y no conserva el contenido eliminado.

## Verificación

```
npm.cmd run check
npm.cmd test
node scripts/preview.js
node scripts/preview-player-cards.js RUTA_DE_TARJETA.png
node scripts/preview-design.js
node scripts/verify-card-design.js
```

Las pruebas cubren límites de rango/Ruby, filtros OR, selección dinámica, borradores privados y caducidad, concurrencia/cupos, privacidad, reinicios, respaldo y migración, roles pendientes y frecuencia de notificaciones. Las vistas sintéticas de escritorio y móvil se guardan en data/preview.

.env, data y node_modules están excluidos de Git. No compartas el token ni la base de datos al distribuir el código.

## Roles del servidor principal

El servidor de pruebas sigue creando los roles de demostración que le faltan. En cualquier otro servidor, el bot **no crea roles permanentes automáticamente**: primero se revisan los existentes. Si encuentra un rol homónimo, tampoco crea otro. Los roles temporales con ID propio de cada torneo se administran por separado.

Tras instalar el bot en el servidor principal, usa `node --env-file=.env scripts/audit-server-roles.js ID_DEL_SERVIDOR` para obtener un inventario de solo lectura: nombre, ID, permisos, jerarquía y si el bot puede asignar cada rol. El bot debe estar debajo de los roles administrativos y por encima de los roles que asignará; el inventario señala los que quedan fuera de su alcance. No pegues el token en el comando ni compartas `.env`.

En `bot.config.json`, `roleBindings` vincula roles existentes por ID con este formato: `"roleBindings": { "ID_DEL_SERVIDOR": { "finals": "ID_DEL_ROL", "clan.vxtg": "ID_DEL_ROL", "clan.vxltm": "ID_DEL_ROL" } }`. También se admiten `verified`, `sponsor.ospuze` (y los demás IDs de `src/sponsors.js`), `chatSearch.rankedRole`, `chatSearch.quickRole`, `game.helldivers2` y `game.arcRaiders`. Una vinculación errónea detiene esa preparación; no crea un sustituto. Para crear un rol que realmente falte, añade su nombre exacto a `roleCreationApprovedGuilds[ID_DEL_SERVIDOR]` después de la revisión. Los roles automáticos de perfiles, patrocinadores, juegos y búsqueda deben carecer de permisos globales. Los roles de clan pueden conservar permisos ordinarios, pero no permisos administrativos o de moderación. Todos deben quedar por debajo del rol del bot. El bot conserva el color y la configuración de menciones de los roles existentes.

## Torneos VEX LATAM

Solo el permiso **Administrador** permite ver por defecto y ejecutar `/anuncio` y los comandos de torneos. Tener únicamente Administrar servidor no basta. La comprobación se repite al enviar formularios, publicar y cerrar, aunque alguien modifique la visibilidad del comando en las integraciones de Discord.

1. `/torneo crear`: asistente privado de 45 minutos. Completa calendario (AAAA-MM-DD y HH:MM, siempre hora del **centro de México / CDMX**), cupos en equipos de tres (vacío = abierto), acceso público/VXTG y, en **02 · Inscripción y reglas**, la modalidad **Individual o equipo de tres** o **Solo individual · equipos después**, además de RS mínimo/máximo y clases permitidas/baneadas. Completa las especializaciones y revisa la tarjeta antes de pulsar **Publicar torneo**.
2. El anuncio va a `#torneos`. El cartel aparece tanto en el anuncio como en el panel de inscripciones, con las reglas en su descripción accesible. Muestra la fecha de referencia de México centro y horarios locales de México, Guatemala, Costa Rica, Colombia, Perú, Ecuador (Quito), Venezuela, Bolivia, Chile (Santiago), Argentina, Uruguay, Paraguay, Brasil (São Paulo / Brasília) y Estados Unidos (Los Ángeles, Chicago y Nueva York). Las conversiones usan las zonas IANA y las reglas vigentes para la fecha del evento; cualquier cambio de fecha se indica junto a la hora. Las ciudades representan su zona, no todas las zonas de cada país. Ambos paneles etiquetan al rol THE FINALS; el anuncio permite notificar al publicarse y las actualizaciones conservan la etiqueta sin volver a notificar. Cada torneo crea `inscripciones-<nombre>-<id>` y `equipos-<nombre>-<id>`, ambos de lectura con botones. El canal de equipos del buscador sigue siendo independiente.
3. En la modalidad mixta los jugadores usan **Inscribirme individualmente** o **Registrar equipo**. En **Solo individual** aparece únicamente el primer botón. Quien tenga Embark ID en Configurar perfil se inscribe de inmediato con sus datos guardados; quien no tenga perfil escribe solo su Embark ID y queda vinculado a su usuario de Discord dentro del torneo. La respuesta privada confirma el alta y ofrece **Cancelar registro**. Para inscribir un equipo, el organizador escribe su nombre y selecciona con búsqueda nativa a dos compañeros; él queda como líder. Los perfiles completan Embark ID y RS automáticamente. Si falta un Embark ID, un panel privado solicita únicamente ese dato y lo asocia al usuario seleccionado. Los participantes sin perfil aparecen con RS pendiente, sin inventar puntos. Los equipos de individuales se forman después con `/torneo-formar-equipo`; su líder es el integrante con mayor RS registrado y solo él puede cambiar el nombre desde la tarjeta. No se consulta ninguna API externa. Los torneos anteriores conservan la modalidad mixta.
4. `/torneo-formar-equipo torneo:…`: forma triples con los individuales pendientes, equilibrando sumas de RS mediante asignación y mejoras por intercambio. Desempates aleatorios; los registros más recientes sobrantes quedan pendientes. Los equipos inscritos previamente permanecen intactos. La tarjeta de cada equipo menciona únicamente a sus miembros vinculados.
5. `/torneo-chat-de-voz-general torneo:…` y `/torneo-chat-de-voz-equipos torneo:…`: crean/reutilizan salas, publican enlaces e intentan mover a quienes ya están conectados. El bot necesita Administrar canales, Administrar roles y Mover miembros; los roles del bot deben estar por encima de los roles de participantes que administra. La sala general usa un rol temporal sin permisos globales para evitar el límite de sobreescrituras; las salas de equipo permiten conectarse solo a sus miembros de Discord y a administradores, incluso si algún integrante todavía no completó Configurar perfil. Los jugadores desconectados entran manualmente.
6. `/torneo revisar` lista torneos; con `torneo:` muestra sus detalles. Los parámetros tienen autocompletado. `/torneo cerrar convocatoria torneo:…` pide confirmación y bloquea nuevas inscripciones; el torneo continúa y permite formar equipos y crear o usar voz. Este cierre no inicia la limpieza.
7. `/torneo terminar torneo:…` pide confirmación, da por terminado el torneo y programa la eliminación de sus canales de inscripciones, equipos y voz, junto con su rol temporal, **7 días (168 horas) después de confirmar**. A partir de ese momento se bloquean las inscripciones, la formación de equipos y la creación de salas. Los paneles muestran fecha y cuenta regresiva. Al vencer el plazo se eliminan también las salas de voz ocupadas. La limpieza se comprueba cada minuto y al recuperar el bot; si estaba apagado, se realiza al volver a conectarse. Los fallos de Discord se reintentan y repetir el fin no extiende el plazo. El anuncio en `#torneos` y el historial interno de inscritos/equipos se conservan; los canales compartidos y los de otros torneos no se eliminan. Los comandos anteriores `/torneos crear`, `/torneos revisar` y `/torneos cerrar` siguen disponibles como alias; el último equivale a cerrar convocatoria. Los torneos cerrados con la versión anterior también se consideran convocatorias cerradas y solo inician los 7 días al usar `/torneo terminar`.

**Edición:** `/torneo editar torneo:…` abre un panel privado para cambiar nombre, fecha, cupos, acceso, modalidad y reglas de un torneo publicado. Conserva ID, inscritos y equipos. Rechaza cupos insuficientes, reglas incompatibles con inscritos, modalidad individual cuando ya hay equipos inscritos y acceso VXTG si hay participantes sin ese rol. Los carteles y tarjetas existentes se actualizan en su lugar. Las tarjetas de equipos muestran los tres usuarios de Discord, su Embark ID, el líder y el RS registrado.

**Clan:** en el primer inicio se prepara el rol `VXTG`, vacío, sin permisos ni autoasignación. Un administrador debe asignarlo manualmente. En torneos de clan, todos necesitan ese rol. Un perfil coincidente de otra persona no puede usarse para una inscripción. Si hay varios perfiles con el mismo Embark ID, hay que corregirlos antes de inscribirlo.

**Persistencia:** SQLite v5 respalda la base anterior en `data/backups/vex-before-v5-*.sqlite` antes de migrar. Torneos, equipos, inscripciones, solicitudes de voz, referencias de canales/mensajes y fecha de eliminación sobreviven reinicios. Los nuevos estados y fechas se guardan en los registros JSON existentes y no requieren otra migración de esquema. Los borradores todavía no confirmados caducan y se pierden al reiniciar. Las publicaciones interrumpidas se reintentan; las marcas de canales y mensajes recuperan el intervalo entre enviar y guardar el ID sin duplicar publicaciones. Tras reiniciar se recuperan las salas solicitadas y los enlaces de torneos vigentes, pero no se vuelve a trasladar a nadie automáticamente. Los canales de torneos terminados nunca se recrean. Las inscripciones siguen abiertas hasta cerrar convocatoria o terminar; la fecha anunciada no cierra por sí sola el torneo.

Pruebas: `node --test test/tournaments.test.js`. Vistas gráficas y comprobación de desbordamientos: `node scripts/preview-tournaments.js`; resultados en `data/preview-tournaments`. Los casos de Discord usan dobles locales y no publican torneos de prueba en el servidor.

## Perfiles opcionales y patrocinadores

El primer formulario exige un patrocinador. Hay doce estilos para perfil y equipo, incluido **CNS** con el logo proporcionado por la comunidad; MultiCo no es una opción de registro. El equipo usa el estilo del organizador y cada integrante conserva su distintivo. CNS también tiene su rol de identidad, sin permisos ni menciones masivas, con las mismas reglas de cambio y eliminación que los demás patrocinadores.

Cada estilo usa un fondo minimalista generado con ImageGen, guardado en `assets/sponsors/backgrounds/<id>-v2.webp`: colores mate, trazos finos y elementos repartidos entre arcos, bloques, puntos, retículas y fragmentos de marca. Las composiciones son distintas para cada sponsor y no usan luces ni degradados. Son interpretaciones de la comunidad. Los logos se superponen como recursos independientes, y los datos conservan superficies sólidas oscuras. Todo se renderiza localmente, sin solicitudes externas ni generación de imágenes durante el uso del bot. Si falta un fondo, queda el color mate base. Copia `assets` al trasladar el bot y reinicia después de cambiar recursos visuales.

Los logos originales están en `assets/sponsors`; `node scripts/prepare-sponsors.js` prepara copias sin márgenes. `node scripts/preview-sponsors.js` genera 72 vistas de perfil/equipo a 720, 390 y 320 px en `data/preview-sponsors`, junto con un mosaico y la comprobación de fondos, imágenes, superficies mate y desbordamientos. Puedes revisar una sola marca con `node scripts/preview-sponsors.js cns`. Los prompts y la distribución de elementos se conservan en `assets/sponsors/backgrounds/generation-v2.json` y `assets/sponsors/backgrounds/README.md`.

Guardar un perfil completo asigna THE FINALS, el patrocinador elegido y Verificado. Cambiar patrocinador sustituye su rol; pausar búsquedas conserva sus roles. Eliminar el perfil retira el patrocinador y Verificado. Esos roles describen el perfil y no desbloquean el servidor. No pueden configurarse como auto roles por reacción y no generan pings.

Completar el perfil es **opcional para acceder al servidor**. Los miembros sin perfil pueden ver los canales públicos, conversar, usar las salas permanentes, reaccionar para elegir roles, consultar la clasificación y buscar compañeros escribiendo en #equipos. Los canales de información conservan sus restricciones de publicación y los canales privados conservan su audiencia. La búsqueda estructurada por compatibilidad usa los datos del perfil; quienes quieran usarla deben completar esos datos. La bienvenida ofrece crear o editar el perfil de forma voluntaria.

Al actualizar, el bot retira el bloqueo anterior usando `settings.accessGate.snapshots`, restaura únicamente los permisos de visibilidad y conserva permisos de escritura y conexión. Los snapshots públicos que ya contenían el bloqueo de una migración también se normalizan. La restauración se registra para reintentar fallos y no sobrescribir cambios administrativos posteriores. Los canales nuevos usan los permisos normales de Discord. Las salas temporales permiten conectarse únicamente a sus integrantes, sin exigir un perfil completo para el acceso a la sala. Los errores de roles se reintentan. El bot necesita Administrar roles y debe estar por encima de sus roles de identidad; Administrar canales permite restaurar el bloqueo anterior y Server Members Intent permite enviar la bienvenida automática.


Las tarjetas de perfil usan una composición editorial para escritorio y móvil: retrato completo junto al nombre, rango, RS actual destacado y récord secundario; clase y especializaciones cierran el bloque, y el patrocinador aparece en una franja inferior. Sin imagen se reorganizan en dos columnas. Los estados de búsqueda y el origen de los datos se muestran en el panel nativo, sin leyendas adicionales en la imagen. El encabezado utiliza el SVG blanco de THE FINALS sobre fondo oscuro; el SVG rojo está disponible para fondos claros.

Los fondos de perfil y equipo mantienen sus extremos anclados arriba y abajo, escalados por el ancho sin deformación. La zona central se adapta a la altura del contenido, sin ampliar y recortar el fondo entero con `cover`. `preview-sponsors.js` comprueba también ese ajuste.
