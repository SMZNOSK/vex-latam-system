# Plan completo de integración: VΞX LΛTΛM SQUΛD

Propuesta para revisión, basada en la consulta real del 21 de octubre de 2026. **No aplicada al servidor principal.** Servidor: `1316232884117311558`. Inventario actual: 39 canales, 65 roles, 52 emojis. El proceso sigue ejecutando las funciones del servidor de pruebas.

## 1. Administración y permisos

Los comandos, botones de aprobación, edición de rankings y controles administrativos quedarán limitados por ID a la cuenta del usuario `709461658602569758` y al propietario real del servidor (`905678811255955517` en la revisión). Se comprobará el propietario actual desde Discord. Tener un rol llamado STAFF o incluso Administrador no sustituirá esta lista para operar el bot. Esta restricción todavía requiere adaptación del código y configuración de comandos de producción.

ADMIN PANEL se preparará con acceso explícito para esas dos cuentas y para el bot. Discord permite que otras cuentas o bots con Administrador vean canales privados; la lista de IDs protege las operaciones, pero no elimina esa excepción de visibilidad. No se retirarán permisos de otros administradores como parte de este plan.

El bot ya tiene el rol BOTS (`1562574079419089037`), con Administrar canales, Administrar roles, Enviar mensajes, Insertar enlaces, Adjuntar archivos, Leer historial, Administrar mensajes, Añadir reacciones, Conectar, Hablar y Mover miembros. **Falta Fijar mensajes.** No necesita Administrador. La posición recomendada es debajo del personal y encima de CLUB VXTG/CLUB VXLTM; ahora BOTS está en la parte superior.

## 2. Canales existentes y cambios concretos

Se conservarán IDs, nombres decorados, ubicaciones e historial de los canales reutilizados. Se ajustarán únicamente los permisos necesarios para las funciones nuevas; no se aplicará a ciegas la configuración de Experimentos.

| Destino actual | Integración propuesta |
| --- | --- |
| BIENVENIDOS | Publicar bienvenida personalizada con avatar, nombre y emojis del servidor. Accesos a reglas, roles, búsqueda y crear/completar perfil. |
| REGLAS | Enlazar el reglamento actual. No sustituir el contenido de Carl-bot por reglas genéricas. |
| SELECCIÓN-DE-ROLES | Mantener las selecciones actuales de país, plataforma y juegos. Revisar referencias a roles borrados. Retirar la autoasignación de clan si está activa. |
| ANUNCIOS-TORNEOS | Publicar los carteles de nuestros torneos con enlaces a sus inscripciones. |
| CLUBES-VXTG-VXLTM | Conservar como portada de clanes y añadir enlaces a los dos formularios y rankings. |
| SUGERENCIAS | Mantener nombre, posición e historial; añadir formulario de feedback privado. Las nuevas entregas se hacen por el botón y el canal queda como cartel de solo lectura para miembros. Los mensajes públicos anteriores no se convierten en privados. |
| BUSCO-SQUAD-RANKS | Conservar el chat y añadir detección de búsquedas escritas de Ranked. |
| BUSCO-EQUIPO-MODOS-RÁPIDOS | Conservar el chat y añadir detección de búsquedas casuales con THE FINALS CHILL. |
| BUSCO-EQUIPO-COBRO | Mantener su función actual. No activar interpretaciones de Ranked sobre este chat. |
| REGISTRO-DE-EQUIPOS | Conservar historial y usar como referencia para localizar las convocatorias nuevas. |
| MARCADORES y CLASIFICACION | Conservar sus usos para torneos; no convertirlos en rankings RS de perfiles o clanes. |
| Salas de voz actuales, generales y de torneos | Conservar nombres y funcionamiento; no registrarlas para eliminación automática. |
| GENERAL, noticias, actualizaciones, memes, promo, streams, clips y links | Conservar sus usos actuales y enlazarlos cuando corresponda. |

La detección por texto en Ranked y Rápidas necesita ampliar el ajuste actual de un solo canal. Los chats seguirán permitiendo conversar; los paneles estructurados tendrán destinos propios.

## 3. Canales y categorías nuevos

```text
ADMIN PANEL                         [acceso explícito a ustedes dos]
  #admin-bot                        comandos y configuración
  #buzon-feedback                   entregas privadas de sugerencias
  #buzon-reportes                   reportes privados
  #solicitudes-clanes               evidencias y aprobación de ingresos
  #rankings-clanes                  acceso al editor de tablas manuales

SISTEMA DEL BOT                     [paneles públicos]
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

Total fijo propuesto: **3 categorías y 16 canales de texto nuevos**. No se crea `pruebas-bot`. SUGERENCIAS funciona como feedback, por lo que no se duplica con otro `#feedback` ni hace falta BUZONES. Las categorías de torneos y salas temporales se crean a medida que haya actividad real.

## 4. Roles y sistemas actuales

Se vincularán por ID los roles existentes THE FINALS, CLUB VXTG, CLUB VXLTM, THE FINALS RANKS y THE FINALS CHILL. CHILL reemplaza el nombre THE FINALS RÁPIDAS usado en pruebas. PC, PLAY STATION, XBOX, países, rangos y equipos existentes se conservan. No se activará una nueva asignación automática de rangos o países por esta integración.

Para la función de patrocinadores se agregarían los roles que faltan: Verificado, OSPUZE, ISEUL-T, VOLPE, HOLTOW, VAIIYA, ENGIMO, DISSUN, ALFA ACTA, IVADA, TRENTILA, COMETA y CNS: **13 roles nuevos**. Verificado indica perfil completo y no será requisito para acceder al servidor. El rol operativo BOTS ya existe. No hace falta crear otro administrador.

Se registrará el origen de las asignaciones del bot para que eliminar un perfil no quite un THE FINALS que ya hubiera asignado Carl-bot u otro sistema. Los miembros actuales de los clanes conservarán sus roles. Sus Embark ID no pueden deducirse del rol; las tablas manuales podrán incluirlos sin exigir registro de perfil.

Se desactivarán únicamente las funciones solicitadas de terceros: bienvenidas de Koya y Carl-bot, despedidas de Carl-bot y la asociación por reacción que ofrece CLUB VXTG, si continúa activa. Esto está pendiente de ejecutar y comprobar en sus paneles. Los permisos de nuestro bot no le dan acceso automático a la configuración de esos bots. Los demás módulos y paneles se conservan. Las referencias antiguas a roles de HELLDIVERS II, ARC RAIDERS y Panamá se revisarán antes de corregir los carteles; no se recrean roles sin revisar su función.

## 5. Funciones que se integran

### Perfiles y bienvenida

- Perfil voluntario para acceder al servidor: Embark ID vinculado al usuario de Discord, RS actual y récord por separado, clase, especializaciones, patrocinador y tarjeta de jugador.
- Las búsquedas y los requisitos usan RS actual guardado; el récord no reemplaza el actual cuando baja.
- Bienvenida con tarjeta personalizada, emojis reales y cuatro pasos: reglas, roles, equipo y perfil.
- Despedida en canal independiente, con el tono de sarcasmo suave acordado.
- Los 52 emojis se usan desde el principal sin importación desde Experimentos. Las referencias ambiguas se resuelven por ID.

### Feedback y reportes

- SUGERENCIAS: asunto, mensaje y anonimato opcional, con máximo de tres feedbacks por persona al día, reinicio a las 00:00 de CDMX, incluidos los anónimos.
- REPORTES: selector buscable de miembros, descripción y enlace opcional de evidencia. El equipo autorizado ve quién reportó para poder dar seguimiento.
- Confirmación privada al enviar y entrega en el receptor correspondiente. Los reportes no se anuncian al usuario reportado.

### Búsquedas, equipos y voz

- Búsqueda estructurada con filtros desde el panel; búsqueda por texto en los dos chats previstos.
- Tarjetas de equipo con acciones para unirse, salir y entrar en voz; caducidad y avisos con límite de frecuencia.
- Salas temporales administradas por el bot, independientes de las salas permanentes existentes.
- Leaderboard general de perfiles por RS actual, separado de las tablas manuales de los clanes y de la clasificación de torneos. No equivale a un ranking oficial del juego.

### Clanes

- VXTG con diseño blanco/negro y VXLTM con diseño negro/rojo.
- Perfil completo y captura de Embark ID/RS obligatorios para solicitar ingreso.
- VXTG: por debajo de 20,000 RS actuales se muestra advertencia y se permite enviar; VXLTM admite cualquier RS.
- Una persona solo puede pertenecer a un clan; aprobación o rechazo en el receptor privado.
- Aprobar registra al miembro, asigna el rol existente, intenta avisarle por DM y publica su tarjeta de bienvenida al clan. Si el DM está cerrado, se conserva el estado consultable en el sistema.
- Rankings de cada clan cargados manualmente por ustedes, sin exigir perfiles a los jugadores incluidos. Rango visual calculado desde los RS introducidos.
- Conteo manual real del clan dentro de THE FINALS, independiente del número registrado en el bot. Retirada de miembros y consulta de Discord/Embark ID desde administración.
- Aprobar en Discord no realiza una invitación dentro de THE FINALS; esa parte sigue a cargo del staff en el juego.

### Torneos

- Crear, editar y revisar torneos; cerrar convocatoria y terminar son acciones distintas.
- Inscripción individual con un clic si hay perfil; sin perfil, solo Embark ID vinculado a Discord. Confirmación privada y cancelación.
- Equipos de tres: nombre, búsqueda de dos compañeros de Discord e importación de perfiles; solo se piden los Embark ID que falten. El organizador es líder.
- Formación desde individuales equilibrada por RS registrado; el integrante con más RS actual disponible queda como líder. Los desconocidos se muestran pendientes, sin inventar puntos.
- Nombre automático y tarjetas con los tres miembros y el líder; solo el líder cambia el nombre.
- Los requisitos de RS no se pueden comprobar en participantes sin RS registrado; esto debe quedar visible al organizar un torneo con restricciones.
- Categoría desplegable por torneo; terminados al final. Limpieza de sus canales y salas propios siete días después de terminar. Los canales históricos del principal no entran en esa limpieza.
- Los marcadores de partidos y la clasificación deportiva no se actualizan por esta integración; no se añade una consulta automática de resultados del juego.

### Herramientas administrativas

- Embeds guardados que se pueden editar, anuncios, carteles, bienvenida, despedida y catálogo de emojis.
- Editor de palabras para búsquedas y filtro de palabras. El filtro se activa con una lista revisada, no con sanciones nuevas implícitas.
- Comandos administrativos y controles limitados a ustedes dos; los comandos se ejecutan en `#admin-bot`. Los botones del editor y receptor operan en sus destinos privados previstos.
- Guía pública con `/ayuda`, `/perfil`, `/buscar` y `/leaderboard`. `/ping` queda fuera de esa guía y bajo administración.
- Familias administrativas: `/torneo`, `/torneos`, `/torneo-formar-equipo`, `/torneo-chat-de-voz-general`, `/torneo-chat-de-voz-equipos`, `/clan`, `/clan-vxtg-numero-miembros`, `/clan-vxltm-numero-miembros`, `/panel`, `/roles`, `/avisos`, `/busqueda-chat`, `/anuncio`, `/reglas`, `/embed`, `/bienvenida`, `/despedida`, `/moderacion` y `/ping`.

## 6. Activación y datos

Antes del cambio se respaldan configuración y base de datos. Se preparan los destinos por ID, la lista de operadores, la preservación de permisos y asignaciones existentes y las adaptaciones indicadas en este documento. Se verifican formularios, privacidad, acceso y recuperación después de reiniciar en Experimentos.

Después se prepara el principal: permisos del bot, configuración de terceros, creación de los destinos nuevos y publicación de los paneles. Se comprueba con una cuenta autorizada y una cuenta normal. Los carteles se actualizan por referencia para evitar duplicados.

Los perfiles, envíos privados, solicitudes, cuotas, torneos, conteos y rankings ficticios de Experimentos no se copian. La configuración del principal empieza con sus propios datos y conserva los miembros y mensajes existentes. No se clona el servidor de pruebas con `migrate-server.js`.

Este documento define el alcance para revisar antes de proceder. Las adaptaciones de producción, las desactivaciones de terceros y la restricción a dos operadores aún no están aplicadas.
