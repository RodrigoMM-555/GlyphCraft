# GlyphCraft

Experiencia interactiva de magia gestual: dibuja glifos mágicos con el dedo
índice frente a la cámara, apréndelos en el grimorio y lanza sus hechizos en 3D.

Proyecto de la UD03 *Creación de componentes visuales* (Desarrollo de
Interfaces, 2.º DAM). Además de la aplicación, el repositorio contiene
**glyphcraft-kit**, una biblioteca de 13 Web Components documentada,
probada y empaquetada para reutilizarla en otros proyectos.

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Análisis y planificación | ✅ |
| 2 | Estructura, sistema visual, menú y navegación | ✅ |
| 3 | Cámara y reconocimiento de gestos | ✅ |
| 4 | Glifos: dibujo, grimorio y validación | ✅ |
| 5 | Efectos mágicos 3D | ✅ |
| 6 | Calidad, documentación y empaquetado | ✅ |
| 7 | Progreso, ajustes, laboratorio, sonido y despliegue | ✅ |
| 8 | Corrección de trazos, potencia por tamaño, glifos y hechizos combinados nuevos, accesibilidad | ✅ |

## Requisitos

- Un navegador reciente: Chrome, Edge o Firefox (WebGL y cámara).
- Un servidor local cualquiera. No hace falta Node.js ni instalar dependencias.

## Puesta en marcha

Con la extensión **Live Server** de VS Code: clic derecho en `index.html` →
*Open with Live Server*.

También sirve cualquier servidor en `localhost`, por ejemplo:

```bash
python3 -m http.server 8000   # y abre http://localhost:8000
```

No funciona abriendo `index.html` con doble clic (`file://`): el navegador no
carga módulos ES desde archivos locales. La cámara exige `localhost` o `https://`.

## Cómo se juega

| Gesto (frente a la cámara) | Acción |
|---|---|
| Índice levantado, resto de dedos recogidos | Dibuja con la punta del índice |
| Mano **bien** abierta, un instante, encima de un trazo | Borra los trazos que quedan bajo la palma (todos los que haya); si la mantienes abierta, pásala por encima de otros para borrarlos también |
| Puño **bien** cerrado, un instante | Sella el glifo (lo evalúa) |

La cámara se **enciende sola** al entrar en la práctica (si la apagas, se
recuerda para la próxima vez). La zona de trazado abarca por defecto **toda
la imagen de la cámara**; su tamaño se cambia en Ajustes → Cámara → «Tamaño
de la zona de trazado», con una vista previa. El botón «Borrar» sigue
borrándolo todo.

El seguimiento del índice ignora los errores típicos del detector: puntas
mal colocadas, saltos imposibles de un fotograma a otro y el «gancho» que
dejaba el dedo al doblarse para terminar el trazo. Sin cámara se puede dibujar con el ratón o el dedo y sellar con
el botón o con <kbd>S</kbd>.

- **Trazos corregidos**: al terminar cada trazo, se transforma con una breve
  animación en **el símbolo exacto del grimorio** al que se parece: una luna
  mal hecha se vuelve la luna de Umbra; un zigzag, el rayo de Fulgur; un
  triángulo torcido, el de Ignis… Las líneas y los círculos se enderezan y
  redondean a cualquier tamaño y ángulo. En Ajustes → Reconocimiento se elige
  la **intensidad** (0 % = tal cual, 100 % = forma perfecta), y cada nivel
  pone un máximo: **Aprendiz 100 %, Artesano 60 %, Maestro 30 %** (a más
  nivel, menos guía y menos ayuda).
- **Tamaño = potencia**: los glifos se pueden trazar de cualquier tamaño;
  cuanto más grande el círculo, más fuerte el hechizo (de «Chispa» al 40 % a
  «Suprema» al 180 %), con más partículas, más alcance y temblor del círculo.
- **Grimorio**: nueve glifos (Ignis, Aqua, Fulgur, Ventus, Lux, Terra, Umbra,
  Aegis y Glacies) con su animación de trazado. Cada uno se practica
  con guía y queda **aprendido tras 3 aciertos**; **dominado** tras 3 en nivel
  Maestro. Niveles: Aprendiz (orden libre, 60 puntos), Artesano (orden y número
  de trazos, 75) y Maestro (orden y sentido, 85).
- **Practicar magia**: se traza de memoria; el círculo reconoce el glifo y, si
  está aprendido, lanza su hechizo en 3D. También se pueden lanzar
  **combinaciones** de glifos aprendidos dentro del mismo círculo.
- **Laboratorio**: varios símbolos dentro del mismo círculo se combinan (sin
  necesidad de aprenderlos); hay **21 combinaciones con nombre**, cada una con
  **su propio hechizo** (Tormenta ígnea, Eclipse, Erupción, Géiser, Plasma…).
  Las mezclas sin nombre se unen con la «fusión arcana».
- **Progreso**: rango, estadísticas, glifos y diez logros.
- **Ajustes**: cámara (encender al entrar), manos (estilo, mano que dibuja,
  sensibilidad, suavizado, tiempos), reconocimiento (intensidad de la corrección,
  nivel, tolerancia), efectos, sonido, **accesibilidad**, pantalla completa,
  exportar/importar copia de seguridad.
- **Calibrar**: traza un círculo cómodo con el índice para fijar una zona de
  trazado a tu medida (mover el control de tamaño en Ajustes la sustituye).
- Atajos (<kbd>?</kbd> muestra la ayuda): <kbd>S</kbd> sellar ·
  <kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Z</kbd> deshacer · <kbd>X</kbd> borrar ·
  <kbd>C</kbd> cámara · <kbd>←</kbd> <kbd>→</kbd> páginas del grimorio ·
  <kbd>Esc</kbd> menú · <kbd>D</kbd> rendimiento · <kbd>R</kbd> grabar una sesión de manos (JSON).

## Usabilidad y accesibilidad

Resumen de cómo la interfaz atiende los criterios de diseño de componentes
(tema 3) y de usabilidad (tema 4):

| Criterio | Cómo se cumple |
|---|---|
| Menús y navegación estándar | Menú principal con descripciones; botón «Menú» en cada sección; <kbd>Esc</kbd> vuelve al menú; rutas con historial del navegador (atrás/adelante). |
| Acciones distribuidas con criterio | En la práctica, lo más usado arriba (sellar), después deshacer/borrar, después cámara y opciones. Lo destructivo (borrar todo, borrar progreso) exige mantener pulsado. |
| Control adecuado a cada dato | Interruptores para sí/no, deslizadores con valor visible para rangos, desplegables para listas, botones para acciones. |
| Teclado | Todo es accesible con <kbd>Tab</kbd>; atajos de una tecla en la práctica (anunciados con `aria-keyshortcuts` y en el título de cada botón); diálogo de ayuda con <kbd>?</kbd>; enlace «Saltar al contenido». |
| Lectores de pantalla | Región de estado (`role="status"`) que anuncia cada resultado; anuncio del cambio de sección; el foco pasa al título de cada sección; el lienzo tiene descripción (`aria-describedby`); componentes con roles ARIA (`meter`, `switch`, `slider`…). |
| Legibilidad (color y fuentes) | Tokens de color con contraste alto sobre fondo oscuro; modo **alto contraste**; **tamaño del texto** ajustable del 100 % al 150 % (todo el diseño usa `rem`). |
| Movimiento | Respeta `prefers-reduced-motion` y además ofrece **Reducir el movimiento** en Ajustes, que se aplica también a los componentes del kit. |
| Mensajes claros y breves | Cada fallo dice qué corregir («El círculo no se cierra: termina donde empezaste»); errores de cámara con la causa y la solución; opción de **leer en voz alta** los resultados. |
| Retroalimentación inmediata | El trazo se corrige al momento, el indicador de gesto muestra el progreso, la nota se muestra con un medidor y la potencia con su nombre. |
| Tolerancia a errores | Deshacer (botón, <kbd>Z</kbd>, <kbd>Ctrl</kbd>+<kbd>Z</kbd>); copia de seguridad exportable; sin cámara se puede usar el ratón, el dedo o la demostración. |
| Pruebas | 319 pruebas automáticas (`pruebas.html`), incluidas las del corrector de trazos y las de todos los hechizos en WebGL. |

## Páginas

| Página | Qué es |
|---|---|
| `index.html` | La aplicación |
| `catalogo.html` | Catálogo interactivo de los 13 componentes (generado de `custom-elements.json`) |
| `pruebas.html` | Ejecuta las 319 pruebas en el navegador y muestra el resultado |

## Pruebas

Abre `pruebas.html` con Live Server. Cada archivo `*.prueba.js` se ejecuta en
su propio `<iframe>` (aislado de los demás) y el resultado aparece en la
página. Las pruebas usan la misma API que Vitest (`describe`, `it`, `expect`,
`vi.fn`…), implementada en `pruebas/ejecutor.js`. Al crear un archivo de
pruebas nuevo, añádelo a `pruebas/lista.js`.

Las pruebas de cámara piden permiso para usarla; si se deniega, esas fallan.

## Estructura

```
index.html · catalogo.html · pruebas.html
codigo.js                  Punto de entrada: registra las vistas y arranca la app
estilo.css                 Estilos de la aplicación
nucleo/                    Aplicación (mediador), enrutador y rutas
servicios/                 Ajustes, progreso, logros, hechizos (potencia y combinaciones),
                           accesibilidad, sonido, calibración, copia de seguridad
vistas/                    Menú, práctica, grimorio, laboratorio, progreso, ajustes
catalogo/                  Lógica y estilos de catalogo.html
glyphcraft-kit/            Biblioteca reutilizable (ver su README)
  componentes/             13 Web Components, cada uno con sus pruebas
  nucleo/                  Lógica pura: gestos, filtros, geometría (y corrección de trazos), glifos, reconocimiento
  seguimiento/             Fuentes de manos (MediaPipe, reproducción, grabación)
  efectos/                 Hechizos 3D (Three.js, partículas en GPU): 9 elementos y 21 combinados
  docs/API.md              Referencia generada del JSDoc
lib/                       Librerías de terceros copiadas en el proyecto
  three/                   Three.js 0.187
  mediapipe/               MediaPipe Tasks Vision 1.2.3 + modelo de manos
  fuentes/                 Cinzel y Cormorant Garamond (licencia OFL)
pruebas/                   Ejecutor de pruebas (ejecutor.js, pagina.js, lista.js)
sesiones/demo.json         Sesión de manos grabada para el modo demostración
```

## Arquitectura en una frase

Los componentes no se conocen entre sí: se comunican por **eventos** y los
coordinan **mediadores** de la aplicación (`nucleo/aplicacion.js` y el puesto
de práctica). La lógica (gestos, reconocimiento) no toca el DOM, así que se
prueba con datos simulados sin cámara. La app importa la biblioteca por su
nombre (`glyphcraft-kit`, `glyphcraft-kit/nucleo`…) gracias al *import map*
de cada HTML, que traduce esos nombres a archivos: no hay paso de compilación.

## Despliegue en GitHub Pages

1. Crea un repositorio y sube el contenido de esta carpeta a su raíz.
2. En **Settings → Pages → Source** elige **GitHub Actions**.
3. Haz push a `main`: `.github/workflows/deploy-pages.yml` publica la carpeta
   tal cual (no hay nada que compilar). Todas las rutas son relativas, así que
   funciona en `https://<usuario>.github.io/<repo>/` sin configurar nada.

La cámara exige un contexto seguro: funciona en `https://` (GitHub Pages) y en
`http://localhost`. El modelo de manos, los archivos WebAssembly y las
tipografías van incluidos: la app no depende de servicios externos.
