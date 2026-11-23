# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
[versionado semántico](https://semver.org/lang/es/): un cambio en el nombre o
el significado de un atributo, propiedad, método o evento es un cambio
**mayor**; añadir uno nuevo es **menor**; corregir un fallo es un **parche**.

## [2.3.0]

### Añadido
- `correctStroke(points, { templates, strength })`: con plantillas, cada trazo
  se convierte en el símbolo **exacto** del grimorio al que se parece (la luna
  de Umbra, el rayo de Fulgur, las ondas de Aqua, el triángulo de Ignis…);
  `strength` (0-1) controla cuánto se acerca a la forma perfecta.
- `templatesFromGlyphs(glyphs)`: plantillas a partir de los glifos.
- `<gc-glyph-canvas>`: atributo `correction` (intensidad) y propiedad
  `templates`. El trazo corregido indica `shape: 'template'`.

## [2.2.0]

### Añadido
- `<gc-glyph-canvas>.eraseInside(polygon, { threshold, accumulate })` y evento
  `strokes-erased`: borra solo los trazos que quedan bajo una zona (la palma
  de la mano), con desvanecimiento y modo continuo («esponja»).
- `MotorGestos`: el evento `erase` incluye `outline` (contorno de la mano) y
  `palm`; nuevo evento `erase-move` mientras la mano sigue abierta tras borrar.
- `computeHandFeatures`: `indexTipRaw`, `imagePalmSize` y `outline`;
  utilidades `stableIndexTip` y `convexHull`.

### Corregido
- Saltos del punto de dibujo: la punta del índice incoherente con el resto
  del dedo se estima prolongando el dedo, y los saltos imposibles (más de lo
  que se ha movido la palma) se descartan durante unos fotogramas.
- El trazo ya no termina con un «gancho» al doblar el dedo para soltarlo.
- Emparejado de manos entre fotogramas por la pareja más cercana: una
  detección falsa cerca de la mano que dibuja ya no se queda con su trazo.

## [2.1.0]

### Añadido
- `correctStroke()` (`/nucleo`): corrector de trazos. Detecta la figura que se
  quería dibujar (línea, círculo, arco, polígono regular, estrella, onda,
  espiral, zigzag) y devuelve su versión perfecta conservando el inicio y el
  sentido del trazo.
- `<gc-glyph-canvas>`: atributo `auto-correct` (propiedad `autoCorrect`) y
  evento `stroke-corrected`. Cada trazo terminado se transforma en su figura
  ideal con una breve animación. Los trazos (`strokes`) indican su `shape`.
- `<gc-spell-stage>.cast()`: opción `power` (0,3-2) para hechizos más o menos
  potentes (más partículas y alcance).
- Hechizos de tres elementos nuevos: `lightning`, `earth` y `shadow`.
- 21 hechizos combinados con efecto propio (`tormenta-ignea`, `eclipse`,
  `erupcion`…) y `fusion` para las mezclas sin nombre.
- Piezas reutilizables para escribir hechizos (`efectos/hechizos/piezas.js`)
  y materiales `rockMaterial`, `facetedMaterial` y `darkDiscMaterial`.
- Glifos Fulgur (rayo), Terra (tierra) y Umbra (sombra); elementos
  `earth`, `lightning` y `shadow` en `GLYPH_ELEMENTS` y `ELEMENT_LABELS`.

## [2.0.0]

### Cambiado (incompatible)
- Sin compilación: la biblioteca se distribuye como módulos ES nativos y se
  usa directamente desde el navegador con un *import map*. Desaparecen `dist/`,
  el bundle de un solo archivo y los tipos `.d.ts` generados (los tipos siguen
  documentados con JSDoc).
- Archivos, carpetas y clases en español: `GcRuneButton` → `GcBotonRuna`,
  `GestureEngine` → `MotorGestos`, `GlyphRecognizer` → `ReconocedorGlifos`…
  Las etiquetas (`<gc-rune-button>`), atributos, propiedades, métodos y
  eventos no cambian.
- Puntos de entrada en español: `/core` → `/nucleo`, `/tracking` →
  `/seguimiento`, `/effects` → `/efectos`, `/glyphs` → `/glifos`,
  `/testing` → `/sinteticos`.
- Pruebas: `*.test.js` → `*.prueba.js`, ejecutadas con `pruebas.html` en lugar
  de Vitest.

## [1.0.0]

### Componentes
- `<gc-rune-button>`: botón rúnico con variantes, modo mantener pulsado e interruptor (`pressed`).
- `<gc-arcane-backdrop>`: fondo de partículas con ráfagas.
- `<gc-whisper>`: avisos temporales accesibles.
- `<gc-camera-preview>`: cámara con gestión de permisos y errores.
- `<gc-hand-overlay>`: visualización de manos (esqueleto, constelación, mínimo).
- `<gc-gesture-indicator>`: gesto reconocido con progreso.
- `<gc-glyph-canvas>`: lienzo de trazos con guía y corrección por trazo.
- `<gc-glyph>`: glifo SVG con animación de trazado y activación.
- `<gc-arcane-meter>`: indicador con rol ARIA `meter`.
- `<gc-glyph-card>`: tarjeta de grimorio (compone `<gc-glyph>` y `<gc-arcane-meter>`).
- `<gc-rune-toggle>` y `<gc-rune-slider>`: controles asociados a formularios.
- `<gc-spell-stage>` (`/effects`): hechizos 3D con partículas en GPU.

### Lógica
- `MotorGestos`: dibujar con el índice (o la pinza), borrar con la mano abierta, sellar con el puño.
- `ReconocedorGlifos` con niveles Aprendiz, Artesano y Maestro; `detectElements` para combinaciones.
- Fuentes de manos: `FuenteManoMediaPipe`, `FuenteManoGrabada`, `GrabadorSesion`.
- Utilidades de prueba sin cámara: manos y dibujos sintéticos.
