# Plantilla V1 mejorada

Diseño activo desde el 14 de octubre de 2026: se recupera V1 conservando negro, rojo, imágenes de jugador, insignias de rango y logos; se añaden especializaciones con marco sin texto repetido y un leaderboard.

La web oficial https://www.reachthefinals.com/ declara `Saira Extra Condensed` como familia de encabezados y `Saira Condensed` para texto; se usa Extra Condensed 700 para títulos y Condensed 500 para datos legibles. Fuentes locales, referencias y licencias en `assets/fonts/`. No se requiere conexión al sitio al generar tarjetas. La página oficial también usa fondos oscuros, mayúsculas y rejillas de imágenes; se aplican estos recursos a la distribución de V1.

- Implementación: `src/card-template.js`, `src/finals-fonts.js`, `src/specialization-assets.js`.
- Especializaciones: ilustración completa con borde y acento rojo. Se mantienen etiquetas alternativas y texto nativo de Discord. Visión verdadera tiene un símbolo de respaldo.
- Perfiles: tarjeta opcional, rango/RS, clase y habilidades.
- Equipos: una o varias clases y habilidades dinámicas; ficha pública con controles privados conservados.
- Leaderboard: primer lugar protagonista, segundo/tercero en paneles intermedios, siete restantes con fotos más pequeñas. Datos locales, no ranking oficial.

Los filtros nuevos añaden `playerClasses` y `schemaVersion: 3` dentro de JSON; los filtros anteriores siguen funcionando sin conversión masiva. La versión del esquema SQLite sigue siendo 2.

Los ejemplos usan datos sintéticos y, cuando se proporciona, una tarjeta local de muestra. No cambian la base de datos ni publican mensajes.

```
node scripts/preview-design.js [TARJETA.png]
node scripts/verify-card-design.js
npm.cmd run check
npm.cmd test
```

Verificación: 33 combinaciones a 320, 390 y 720 px, incluyendo doce especializaciones, cinco integrantes, varias clases, top 10, una entrada y ninguna entrada. Resultado y contrastes en `preview/verification.json`.

V1 original permanece intacta en `../Plantilla V1/`; el diseño claro se conserva en `../Plantilla V2/`.
