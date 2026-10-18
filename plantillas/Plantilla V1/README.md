# Plantilla V1 — respaldo del 14 de octubre de 2026

Diseño original de VEX BOT, guardado antes del rediseño inspirado en Apple.

- `src/renderer.js`: copia exacta del generador original (perfil, equipo y tarjetas de acceso).
- `src/branding.js`, `src/catalog.js`, `src/domain.js` y `rangos/`: dependencias y recursos originales para reproducirlo.
- `preview/`: ejemplos HTML independientes e imágenes PNG a 720 y 390 px; datos de muestra.

SHA-256 del renderer original: `616ACF8EBA265035148BB815ECDA8A0DC04EF7EB5E3D0D42DFB4E78BA0937D7E`.

Para regenerar ejemplos desde la raíz del proyecto: `node scripts/preview-design.js --v1`.
Requiere las dependencias del proyecto y Chrome/Edge/Chromium. No requiere token ni conexión a Discord.

Para volver al diseño V1, detener la instancia del bot y copiar **solo** `src/renderer.js` de este respaldo a `src/renderer.js` del proyecto, después reiniciar. Las otras copias son referencias históricas: no reemplazar la lógica actual de rangos, perfiles o equipos.

Este respaldo no incluye `.env`, tokens ni la base de datos.
