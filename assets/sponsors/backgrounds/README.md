# Fondos de patrocinadores · VEX LATAM

La colección activa contiene doce fondos minimalistas creados con la herramienta integrada **ImageGen**. Cada marca combina elementos distintos, colores mate, trazos finos y un centro oscuro para los datos. Son interpretaciones de la comunidad. Los logotipos originales se superponen desde `../normalized/`; CNS usa el PNG aportado por el usuario. Los fragmentos de marca de VOLPE, ALFA ACTA y CNS también usan esos recursos originales.

Los archivos activos son `<id>-v2.webp`, convertidos con Sharp a WebP sin pérdida. Los originales permanecen en la biblioteca local de imágenes generadas. Los prompts completos y la procedencia están en `generation-v2.json`. La primera colección cinematográfica se conserva como `<id>-v1.webp` con su registro `generation.json`, pero el bot usa únicamente la versión 2.

| Marca | Elementos distribuidos |
| --- | --- |
| OSPUZE | Arcos abiertos, discos y burbujas de puntos amarillos. |
| ISEUL-T | Diagonales paralelas, rombos y bloques azules con pequeños cuadrados magenta. |
| VOLPE | Triángulos abiertos, cuñas rojas, cortes diagonales y un fragmento del logo. |
| HOLTOW | Escuadras naranjas, rectángulos superpuestos y una pequeña cuadrícula. |
| VAIIYA | Rieles blancos, líneas horizontales y una retícula con marcas rojas. |
| ENGIMO | Anillos interrumpidos, nodos y curvas verde azulado. |
| DISSUN | Semicírculos, barras radiales y franjas rojas. |
| ALFA ACTA | Hexágonos incompletos, chevrones, bloques y un fragmento del logo. |
| IVADA | Cuartos de círculo, cuadrados recortados y una trama fina en blanco. |
| TRENTILA | Lentes geométricas, rombos, círculos y puntos verde lima. |
| COMETA | Elipses orbitales, discos y barras naranjas. |
| CNS | Trazos diagonales, hexágonos, bloques azules y un fragmento del logo. |

El renderer conserva los fondos originales y los presenta en dos capas CSS independientes, ancladas arriba y abajo. Ambas escalan por el ancho (`100% auto`), conservando la proporción de círculos y otros motivos; su altura se limita para que no aparezca el extremo opuesto en tarjetas largas. Una máscara suaviza la unión con el centro mate. Esto permite que las fichas y equipos cambien de altura sin el recorte de `cover` ni deformar las imágenes.

Las fichas de perfil usan una composición editorial con retrato completo, RS actual dominante, récord secundario y una franja inferior del patrocinador. Las superficies oscuras protegen la lectura sobre los motivos. Si falta un fondo, queda el color mate base. No hay solicitudes externas ni generación de imágenes durante el uso del bot.

## Referencias de historia y marca

- [THE FINALS · Season 7: CNS y VAIIYA](https://www.reachthefinals.com/patchnotes/s7teaser)
- [THE FINALS · Season 6: OSPUZE, ALFA ACTA y ENGIMO](https://www.reachthefinals.com/patchnotes/s6teaser)
- [THE FINALS · Season 8: seguros HOLTOW y cultivo TRENTILA](https://www.reachthefinals.com/patchnotes/800)
- [THE FINALS · High-Fashion Havoc: ISEUL-T](https://www.reachthefinals.com/patchnotes/wt480)
- [THE FINALS · Update 5.6: DISSUN y combustible](https://www.reachthefinals.com/patchnotes/560)
- [THE FINALS · Store 8.10: fruta y TRENTILA](https://www.reachthefinals.com/patchnotes/8100)
- [THE FINALS · Store 9.10: tecnología integrada e IVADA](https://www.reachthefinals.com/patchnotes/9100)
- [THE FINALS · Season 11: COMETA y Galaxy Estates](https://www.reachthefinals.com/patchnotes/11-00)

Las formas, colores secundarios y lemas en español son decisiones creativas para este proyecto; no se presentan como citas oficiales.
