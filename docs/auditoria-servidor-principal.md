# Revisión de VΞX LΛTΛM SQUΛD

Actualización posterior: ya se asignó BOTS al bot; el servidor tiene 65 roles y falta Fijar mensajes. El alcance actualizado, incluida la restricción administrativa a dos cuentas solicitada después de esta auditoría inicial, está en [plan-integracion-principal.md](plan-integracion-principal.md). Los apartados siguientes conservan las observaciones del inventario inicial.

Consulta real con la API de Discord el 21 de octubre de 2026. El bot ya está instalado en el servidor `1316232884117311558`. Se revisaron canales, roles, emojis, comandos y una muestra de los carteles existentes. No se publicaron mensajes ni se cambió el servidor.

Hay **39 canales: 7 categorías, 20 de texto y 12 de voz; 64 roles; 52 emojis; 0 comandos de nuestra aplicación registrados en el principal**. El proceso del bot sigue configurado para Experimentos. El inventario completo está en `data/server-audits/1316232884117311558.json`; la propuesta de asociaciones está en `docs/integracion-principal.json` y todavía no está aplicada.

## Elementos reutilizables

Se simplifican los nombres para omitir los adornos; los enlaces identifican los destinos originales.

| Canal existente | Uso propuesto | Adaptación necesaria |
| --- | --- | --- |
| [BIENVENIDOS](https://discord.com/channels/1316232884117311558/1401339483324153866) | Nuestras tarjetas de entrada. | Resolver las bienvenidas de Koya y Carl-bot antes de activar una tercera. |
| [REGLAS](https://discord.com/channels/1316232884117311558/1401331560258474176) | Enlace «Leer las reglas». | Conservar el reglamento e historial actuales de Carl-bot; no publicar un segundo reglamento genérico. |
| [SELECCIÓN-DE-ROLES](https://discord.com/channels/1316232884117311558/1487560889065275433) | País, plataforma y juegos. | Conservar los paneles existentes y revisar sus vínculos. Evitar que dos sistemas administren las mismas asignaciones sin coordinación. |
| [ANUNCIOS-TORNEOS](https://discord.com/channels/1316232884117311558/1551375375701909514) | Anuncios y carteles de torneos. | Los canales de cada torneo nuevo permanecen en su categoría desplegable y se archivan abajo al terminar. |
| [CLUBES-VXTG-VXLTM](https://discord.com/channels/1316232884117311558/1534658508941955103) | Portada de los clanes con enlaces a formularios y rankings. | Conservar su historial; no renombrarlo ni convertirlo en uno de los dos formularios. |
| [SUGERENCIAS](https://discord.com/channels/1316232884117311558/1561609370150764674) | Cartel de feedback con entregas privadas. | Propuesta: conservar nombre y ubicación en ZONA SOCIAL; mantener historial y usar formularios para los envíos nuevos. |
| [BUSCO-SQUAD-RANKS](https://discord.com/channels/1316232884117311558/1496746059664330832) | Detectar búsquedas escritas de Ranked. | Mantenerlo como chat; no aplicar el bloqueo de escritura de los paneles. |
| [BUSCO-EQUIPO-MODOS-RÁPIDOS](https://discord.com/channels/1316232884117311558/1512713341959671931) | Detectar búsquedas casuales con el rol THE FINALS CHILL. | Ampliar la detección actual, que se configura para un solo canal. |
| BUSCO-EQUIPO-COBRO | Mantener el chat de Cobro. | No reinterpretar sus mensajes como Ranked ni bloquearlo. |
| REGISTRO-DE-EQUIPOS, MARCADORES y CLASIFICACION | Conservar información e historial de torneos; enlazar nuevas convocatorias desde REGISTRO. | La clasificación de torneos es distinta del ranking RS de perfiles y de las tablas de clan. |
| RANKS 1–3, SQUAD 1–3, partidas-privadas, REUNIÓN-TORNEO y EQUIPO | Mantener las salas actuales. | No usarlas como salas temporales que nuestro bot elimine al terminar búsquedas o torneos. |
| 52 emojis | Bienvenida y embeds del principal. | Usar sus IDs directamente. Hay dos emojis llamados `ligabronce`; el ID permite distinguirlos. |

Al reutilizar SUGERENCIAS y ubicar reportes en ZONA SOCIAL, esta propuesta no necesita una categoría BUZONES adicional.

## Lo que hace falta agregar

No encontré equivalentes de estos canales entre los 39 auditados:

```text
ADMIN PANEL                         [solo permiso Administrador]
  #admin-bot
  #buzon-feedback
  #buzon-reportes
  #solicitudes-clanes
  #rankings-clanes

SISTEMA DEL BOT
  #configurar-perfil
  #buscar-equipo
  #equipos-del-bot
  #comandos-del-bot
  #leaderboard

CLANES
  #unete-a-vxtg
  #unete-a-vxltm
  #ranking-vxtg
  #ranking-vxltm

ZONA SOCIAL                         [categoría existente]
  #reportes

INICIO                              [categoría existente]
  #despedidas
```

Son **3 categorías y 16 canales de texto nuevos**. Los paneles y las tarjetas de equipos quedan agrupados para no bloquear ni llenar los chats actuales. `pruebas-bot` pertenece únicamente a Experimentos. Las salas y categorías temporales se crean cuando haya búsquedas o torneos reales; no se trasladan las de prueba.

## Roles existentes

| Uso | Rol del principal | ID |
| --- | --- | --- |
| Jugadores de THE FINALS | THE FINALS | `1435343076120989707` |
| Clan competitivo | CLUB VXTG | `1386703912379220192` |
| Clan comunidad | CLUB VXLTM | `1559814674558619668` |
| Búsquedas Ranked | THE FINALS RANKS | `1536861782075773029` |
| Búsquedas casuales | THE FINALS CHILL | `1559814240020463676` |

Estos cinco roles no tienen permisos globales y son compatibles con las funciones previstas. No crear otro VXTG, VXLTM o THE FINALS RÁPIDAS. También se conservan PC, PLAY STATION, XBOX y los roles de rangos; esta revisión no activa la asignación automática de rangos por RS.

**LOS MEROS DEL SERVER** (`1420991588443750421`) tiene Administrador y permite acceder a ADMIN PANEL, además del acceso del propietario. **STAFF** (`1491971416759992463`) tiene Administrar servidor, Administrar roles y permisos de moderación, pero no Administrador: con la regla acordada no verá ese panel. No hace falta crear un rol humano nuevo de administrador.

No existen equivalentes de **Verificado ni los 12 patrocinadores**. Si se conserva la asignación de patrocinador del perfil, hacen falta esos 13 roles, además de un rol operativo para el bot.

El cartel de juegos de Carl-bot aún menciona los IDs `1468030102070628423` (HELLDIVERS II) y `1435343592481882132` (ARC RAIDERS), ausentes del inventario actual. El cartel de países también menciona un antiguo rol de Panamá; existe otro `panamá`. Hay que revisar esos vínculos sin recrear roles automáticamente.

## Cruces y cambios necesarios antes de activar

1. **Bienvenidas y despedidas:** el historial muestra a Koya y Carl-bot dando la bienvenida a los mismos ingresos. Carl-bot también envía despedidas en BIENVENIDOS. Al activar nuestras tarjetas se deben desactivar esas funciones concretas; no hace falta quitar los bots del servidor.
2. **Admisión de clan:** Carl-bot tiene un cartel que anuncia CLUB VXTG con una reacción. Nuestra API no muestra su configuración interna; hay que comprobar y retirar la autoasignación si sigue activa, para que el ingreso pase por aprobación.
3. **Asignaciones ajenas:** THE FINALS ya se ofrece desde Carl-bot. Nuestro sincronizador debe registrar qué roles asignó él mismo y conservar las asignaciones externas al borrar un perfil. Compartir un ID no coordina ambos sistemas por sí solo.
4. **Canales existentes:** el arranque actual fuerza nombre/categoría en los buzones y prepara permisos de solo lectura en los paneles. Hay que adaptarlo para mantener nombres, ubicaciones, reglamento, carteles y permisos ajenos al bot en los destinos reutilizados. Cambiar DISCORD_GUILD_ID por sí solo no completa esta integración.
5. **Miembros anteriores:** los roles de clan actuales deben conservarse aunque no tengan perfil del bot. No se puede deducir un Embark ID del rol. Las tablas de clan se cargan manualmente como pidió el cliente.

## Permisos actuales y siguiente paso

El bot está instalado sin rol operativo. Hereda permisos de @everyone y excepciones de algunos canales, pero no tiene **Administrar canales, Administrar roles, Mover miembros, Insertar enlaces, Fijar mensajes ni permiso general de Enviar mensajes**. Por eso todavía no puede preparar ADMIN PANEL ni gestionar las admisiones.

Para operar necesita Ver canales, Enviar mensajes, Insertar enlaces, Adjuntar archivos, Leer historial, Añadir reacciones, Fijar mensajes, Administrar canales, Administrar roles, Conectar, Hablar y Mover miembros. Administrar mensajes se usa para el filtro de palabras. Su rol operativo debe situarse **por encima de CLUB VXTG y CLUB VXLTM y por debajo de los roles de personal**. No necesita el rol humano LOS MEROS DEL SERVER.

Después se aplican las asociaciones y adaptaciones anteriores, se respalda SQLite y la configuración y se prepara el principal con datos propios. No se trasladan perfiles, formularios, evidencias ni torneos de prueba. Esta revisión no cambió el servidor activo ni publicó paneles.

`scripts/migrate-server.js` realiza una clonación amplia y copia perfiles; no corresponde a este traslado selectivo. Se usa el mapa específico de producción.
