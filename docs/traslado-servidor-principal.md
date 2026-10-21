# Preparación para VEX LATAM SQUAD

Estado actualizado (21 de octubre de 2026): el bot ya está instalado en el principal. La revisión real de sus 39 canales, 64 roles y 52 emojis está en [auditoria-servidor-principal.md](auditoria-servidor-principal.md), y el mapa de IDs propuesto en [integracion-principal.json](integracion-principal.json). Las secciones siguientes conservan la propuesta anterior basada en capturas; el inventario real tiene prioridad. El bot sigue ejecutando sus funciones en VLS´ EXPERIMENTS.

## Canales candidatos según las capturas

Los nombres están simplificados para omitir sus adornos. Falta comprobar IDs, tipos y permisos desde el servidor principal.

| Función | Canal candidato | Uso propuesto |
| --- | --- | --- |
| Bienvenida automática | BIENVENIDOS | Publicar nuevas entradas en el canal existente. |
| Reglas | REGLAS | Conservar las reglas e historial actuales; revisar el texto antes de añadir un cartel del bot. |
| Roles por reacciones | SELECCIÓN-DE-ROLES | Reutilizar el canal; revisar roles y otros sistemas de autoasignación existentes. |
| Anuncios de torneos | ANUNCIOS-TORNEOS | Publicar los nuevos torneos en el mismo canal. Los canales de cada torneo irán en sus propias categorías. |
| Respuestas automáticas a búsquedas de equipo | BUSCO-SQUAD-RANKS | Candidato inicial para la detección por palabras, sin convertir el chat en canal de solo lectura. Confirmar que es el chat principal de búsquedas. |
| Panel de búsqueda y tarjetas de equipos | BUSCO-SQUAD-RANKS / BUSCO-EQUIPO-MODOS… | Revisar qué canal se usa para conversar y cuál puede alojar las tarjetas. La configuración actual admite un canal para detección por texto y un destino para las tarjetas. |
| Salas de voz existentes | RANKS 1–3 y SQUAD 1–3 | Mantener sus usos actuales. Las salas temporales de búsquedas y torneos son independientes y se limpian automáticamente. |

## Canales que faltan en las capturas

Primero se buscarán equivalentes reales; se crearán únicamente los necesarios:

- Categoría privada ADMIN PANEL: admin-bot, buzon-feedback, buzon-reportes. Acceso con permiso Administrador. El canal pruebas-bot pertenece solo al servidor de pruebas.
- Categoría pública BUZONES: feedback y reportes, con carteles y formularios.
- configurar-perfil / registro-de-datos, comandos-del-bot, leaderboard y despedidas, si no hay destinos equivalentes.
- Categorías de los nuevos torneos. Los torneos de prueba se quedan en su servidor.
- Categoría CLANES: unete-a-vxtg, unete-a-vxltm, ranking-vxtg y ranking-vxltm; receptor solicitudes-clanes y editor privado rankings-clanes dentro de ADMIN PANEL. Las tablas de cada clan se cargan manualmente sin exigir perfiles. Revisar los roles existentes VXTG y VXLTM y su jerarquía. Las membresías, solicitudes, evidencias, publicaciones y totales manuales se configuran por servidor; los registros de pruebas no se copian.

## Pasos para el traslado

1. Instalar esta misma aplicación en VEX LATAM SQUAD con los ámbitos bot y applications.commands. Obtener el ID del servidor y leer sus canales, categorías y roles.
2. Preparar un mapa explícito de IDs para los paneles, bienvenida, despedida, reglas, reacciones, búsquedas, leaderboard y anuncios de torneos. No basta cambiar el nombre del servidor ni confiar en coincidencias de nombres con adornos.
3. Revisar permisos por canal y jerarquía de roles: administrar canales y roles, publicar mensajes y archivos, leer historial, insertar enlaces, reaccionar y fijar mensajes; conectar, hablar y mover miembros para voz. Administrar mensajes solo es necesario para el filtro de palabras. El rol del bot debe estar por encima de los roles que asignará. Comprobar también los permisos de quienes configurarán el bot.
4. Revisar los roles existentes THE FINALS, juegos, Verificado, patrocinadores y clan; reutilizar únicamente los compatibles. Los roles autoasignables de esta implementación deben carecer de permisos globales. Un rol existente que otorgue acceso o permisos necesita revisión antes de vincularlo.
5. Conservar las reglas, los mensajes, las categorías y los permisos ajenos al bot. Preparar los textos finales y la lista de palabras; elegir el chat donde funcionarán las búsquedas automáticas. Remapear los códigos de emojis de las plantillas a los IDs reales del servidor principal; los cuatro emojis de ejemplo de Experimentos no identifican los del principal. `/embed emojis` permite consultar el catálogo del servidor de destino. Mantener Server Members Intent y Message Content Intent en la aplicación para los eventos y la lectura de mensajes que ya se usan en pruebas.
6. Respaldar SQLite y la configuración. Guardar ajustes nuevos por el ID del servidor principal, remapeando referencias y sin IDs de mensajes del servidor de pruebas. Iniciar perfiles, búsquedas, torneos, cuotas de feedback y recibos de eventos independientes en el principal. Los envíos privados de prueba no se trasladan.
7. Con el mapa revisado, cambiar DISCORD_GUILD_ID al servidor principal y reiniciar. La instalación reutilizará los destinos configurados y publicará sus carteles. Revisar con un administrador y un miembro normal: visibilidad, formularios privados, tres feedbacks diarios, comandos, roles y voz.

## Herramienta de migración existente

`scripts/migrate-server.js` está diseñado como clonación amplia de otro servidor: recorre sus canales y copia perfiles. Ese flujo no corresponde a este traslado selectivo, porque también podría crear canales de pruebas o categorías de torneos de prueba. Para este caso se necesita preparar una configuración específica de producción con el mapa de destinos y conservar los datos de cada servidor separados.

## Cambio aplicado antes del traslado

`/ping` es administrativo y solo funciona en #admin-bot. La guía pública conserva `/ayuda`, `/perfil`, `/buscar` y `/leaderboard`.
