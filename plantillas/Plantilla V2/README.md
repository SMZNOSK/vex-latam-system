# Plantilla V2 — diseño inspirado en Apple

Respaldo del diseño claro, reemplazado por la Plantilla V1 mejorada. Copia histórica en `src/` de esta carpeta.
Skill instalada: `C:/Users/twisy/.codex/skills/apple-design`, procedente de https://github.com/dickwu/apple-design-skill.

## Dirección de diseño

Tarjetas de Discord para que jugadores de THE FINALS puedan reconocer un perfil y elegir un equipo de un vistazo. La tarjeta del juego es el elemento protagonista; logos más pequeños, esquinas redondeadas, espacios amplios y datos alineados la acompañan. Rojo reservado para identidad, clases y pasos; verde acompañado por texto para disponibilidad. Sin animaciones ni controles ficticios dibujados en la imagen.

Se aplican los fundamentos de las HIG a imágenes HTML/CSS, no las convenciones de navegación de una aplicación nativa de Apple. Discord sigue dibujando botones, formularios y casillas; sus estilos no se modifican.

## Revisión del diseño V1

El diseño original conserva una identidad clara y la tarjeta del juego completa. Las mayúsculas, el encabezado grande y el fondo rojo compiten con el perfil; las especializaciones no aprovechan los recursos visuales del juego.

- Jerarquía: simplificar títulos y agrupar rango/RS, clase y especializaciones. `layout.md › Visual hierarchy`: “Order content by relative importance.”
- Identidad: reducir el encabezado para dar espacio a los datos. `branding.md › Best practices`: “Ensure branding always defers to content.”
- Especializaciones: fichas en rejilla con imagen y texto separado. `collections.md › Best practices`: “Use the standard row or grid layout whenever possible.”
- Materiales: superficies opacas suaves para el contenido. `materials.md › Liquid Glass`: “Don’t use Liquid Glass in the content layer.”
- Lectura: contraste medido para textos y estados. `accessibility.md › Vision`: “Strive to meet color contrast minimum standards.”

Las referencias citadas están en `C:/Users/twisy/.codex/skills/apple-design/references/hig/`. Se leyeron además typography, color, designing-for-ios, image-views y cross-platform.

## Tokens

| Rol | Claro | Oscuro |
| --- | --- | --- |
| Fondo | #f5f5f7 | #17171a |
| Panel | #ffffff | #242428 |
| Texto | #1d1d1f | #f5f5f7 |
| Texto secundario | #62626b | #b6b6bf |
| Acento | #c51b34 | #ff8092 |
| Disponibilidad | #246447 | #90d5aa |

La variante clara es la predeterminada del bot. La oscura queda disponible pasando `appearance: 'dark'` al generador; no hay detección del tema de Discord para una imagen compartida.

Tipografía: Segoe UI integrada en Windows (pila system UI en HTML); título 36/30 px, rango 29/27 px, datos 26 px, cuerpo 17 px, textos auxiliares 11–14 px; sin pesos finos. Los puntos usan cifras tabulares. Los contrastes y resultados de revisión se guardan en `preview/verification.json`.

Perfil regular: encabezado → ID/estado → [tarjeta del juego | rango y clase] → especializaciones → origen de datos.
Perfil compacto: encabezado → ID/estado → tarjeta del juego → rango/clase → especializaciones.
Equipo regular: encabezado → disponibilidad → modo/cupo/RS → clase → especializaciones → galería de integrantes.
Equipo compacto: datos en dos columnas, RS debajo, especializaciones en una columna, integrantes en dos columnas.

El texto crece en altura sin recortarse. Las imágenes PNG son estáticas y no responden a Dynamic Type; se mantiene la información en texto nativo de Discord para lectura y accesibilidad. La guía de plataformas se adapta a esta limitación.

## Recursos y verificación

`src/specialization-assets.js` relaciona los IDs existentes con 11 WebP en `especializaciones/`. Visión verdadera tiene un icono de respaldo porque su imagen no está en la carpeta. No se cambia su nombre ni se sustituye por otra especialización. Las fotos de jugador conservan proporción y siguen siendo opcionales.

Regenerar ejemplos V2: `node scripts/preview-design.js --v2 [TARJETA.png]`.
Los ejemplos incluyen perfil sin foto, nombres largos, doce especializaciones, cinco integrantes, Ranked y Chill a 720 y 390 px; la revisión también prueba 320 px.

Para recuperar el diseño anterior consulta `../Plantilla V1/README.md`.
