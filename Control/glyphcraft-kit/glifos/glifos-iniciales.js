/**
 * Grimorio inicial: nueve glifos originales.
 *
 * Todos comparten un círculo exterior que se traza desde arriba en sentido
 * horario. Las coordenadas están en el espacio del glifo (radio exterior 1,
 * y hacia abajo). El orden de `strokes` es el orden de trazado.
 */

/** Círculo exterior común. */
/** @type {import('../nucleo/glifos/modelo-glifo.js').StrokeDef} */
const OUTER = { type: 'circle', r: 1, start: -90, dir: 'cw' };
const OUTER_HINT = 'Traza el círculo exterior desde arriba, en el sentido de las agujas del reloj.';

/** @type {import('../nucleo/glifos/modelo-glifo.js').GlyphDef[]} */
export const STARTER_GLYPHS = [
  {
    id: 'ignis',
    name: 'Ignis',
    element: 'fire',
    difficulty: 1,
    description: 'Invoca una llama que brota del centro del círculo.',
    lore: 'El primer sello de todo aprendiz. El triángulo apunta al cielo, como la llama que busca el aire.',
    strokes: [
      OUTER,
      { type: 'polyline', points: [[0, -0.62], [0.54, 0.31], [-0.54, 0.31]], closed: true },
    ],
    strokeHints: [OUTER_HINT, 'Dibuja el triángulo de un solo trazo, empezando por el vértice superior.'],
    effect: { spell: 'fire' },
  },
  {
    id: 'aqua',
    name: 'Aqua',
    element: 'water',
    difficulty: 2,
    description: 'Condensa el agua del aire en una esfera ondulante.',
    lore: 'Tres corrientes que nunca se tocan: la lluvia, el río y el mar.',
    strokes: [
      OUTER,
      { type: 'wave', from: [-0.6, -0.32], to: [0.6, -0.32], amplitude: 0.1, periods: 1.5 },
      { type: 'wave', from: [-0.66, 0], to: [0.66, 0], amplitude: 0.1, periods: 1.5 },
      { type: 'wave', from: [-0.6, 0.32], to: [0.6, 0.32], amplitude: 0.1, periods: 1.5 },
    ],
    strokeHints: [
      OUTER_HINT,
      'Onda superior, de izquierda a derecha.',
      'Onda central, de izquierda a derecha.',
      'Onda inferior, de izquierda a derecha.',
    ],
    effect: { spell: 'water' },
  },
  {
    id: 'ventus',
    name: 'Ventus',
    element: 'wind',
    difficulty: 2,
    description: 'Libera una corriente de aire que gira y se expande.',
    lore: 'El viento nace en un punto quieto y se abre en espiral hasta tocar el círculo.',
    strokes: [OUTER, { type: 'spiral', r0: 0.06, r1: 0.62, turns: 1.75, start: -90, dir: 'cw' }],
    strokeHints: [OUTER_HINT, 'Empieza en el centro y abre la espiral en sentido horario.'],
    effect: { spell: 'wind' },
  },
  {
    id: 'lux',
    name: 'Lux',
    element: 'light',
    difficulty: 3,
    description: 'Enciende un destello que ilumina todo el taller.',
    lore: 'Cuatro puntas para los cuatro rumbos: la luz no elige dirección.',
    strokes: [
      OUTER,
      {
        type: 'polyline',
        points: [[0, -0.66], [0.14, -0.14], [0.66, 0], [0.14, 0.14], [0, 0.66], [-0.14, 0.14], [-0.66, 0], [-0.14, -0.14]],
        closed: true,
      },
    ],
    strokeHints: [OUTER_HINT, 'Dibuja la estrella de un solo trazo desde la punta superior, hacia la derecha.'],
    effect: { spell: 'light' },
  },
  {
    id: 'aegis',
    name: 'Aegis',
    element: 'protection',
    difficulty: 4,
    description: 'Levanta una barrera que protege a quien la traza.',
    lore: 'Las seis caras del escudo y el eje que lo sostiene.',
    strokes: [
      OUTER,
      {
        type: 'polyline',
        points: [[0, -0.6], [0.52, -0.3], [0.52, 0.3], [0, 0.6], [-0.52, 0.3], [-0.52, -0.3]],
        closed: true,
      },
      { type: 'line', from: [0, -0.6], to: [0, 0.6] },
    ],
    strokeHints: [OUTER_HINT, 'Hexágono de un trazo, desde el vértice superior hacia la derecha.', 'Eje vertical, de arriba abajo.'],
    effect: { spell: 'aegis' },
  },
  {
    id: 'glacies',
    name: 'Glacies',
    element: 'ice',
    difficulty: 4,
    description: 'Cristaliza el aire en esquirlas de hielo.',
    lore: 'Tres ejes como los de un copo de nieve, y en su centro, el corazón helado.',
    strokes: [
      OUTER,
      { type: 'line', from: [0, -0.65], to: [0, 0.65] },
      { type: 'line', from: [-0.56, -0.325], to: [0.56, 0.325] },
      { type: 'line', from: [0.56, -0.325], to: [-0.56, 0.325] },
      { type: 'circle', r: 0.2, start: -90, dir: 'cw' },
    ],
    strokeHints: [
      OUTER_HINT,
      'Eje vertical, de arriba abajo.',
      'Diagonal desde arriba a la izquierda.',
      'Diagonal desde arriba a la derecha.',
      'Pequeño círculo central, en sentido horario.',
    ],
    effect: { spell: 'ice' },
  },
  {
    id: 'fulgur',
    name: 'Fulgur',
    element: 'lightning',
    difficulty: 2,
    description: 'Descarga un relámpago que restalla dentro del círculo.',
    lore: 'El rayo nunca baja recto: quiebra el cielo dos veces antes de tocar el suelo.',
    strokes: [
      OUTER,
      { type: 'polyline', points: [[0.2, -0.66], [-0.24, 0.02], [0.24, -0.02], [-0.2, 0.66]] },
    ],
    strokeHints: [OUTER_HINT, 'Zigzag de un solo trazo, de arriba abajo, empezando por la derecha.'],
    effect: { spell: 'lightning' },
  },
  {
    id: 'terra',
    name: 'Terra',
    element: 'earth',
    difficulty: 3,
    description: 'Hace brotar del suelo columnas de roca.',
    lore: 'La montaña y su raíz, unidas por la línea del horizonte.',
    strokes: [
      OUTER,
      { type: 'polyline', points: [[0, -0.62], [0.62, 0], [0, 0.62], [-0.62, 0]], closed: true },
      { type: 'line', from: [-0.62, 0], to: [0.62, 0] },
    ],
    strokeHints: [
      OUTER_HINT,
      'Rombo de un trazo, desde el vértice superior hacia la derecha.',
      'Línea del horizonte, de izquierda a derecha.',
    ],
    effect: { spell: 'earth' },
  },
  {
    id: 'umbra',
    name: 'Umbra',
    element: 'shadow',
    difficulty: 3,
    description: 'Abre un vórtice de sombra que devora la luz.',
    lore: 'La luna menguante guarda la noche entre sus dos bordes.',
    strokes: [OUTER, { type: 'polyline', points: crescent(), closed: true }],
    strokeHints: [OUTER_HINT, 'Luna creciente de un trazo: desde la punta de arriba, borde exterior por la izquierda y vuelta por dentro.'],
    effect: { spell: 'shadow' },
  },
];

/**
 * Contorno de una luna creciente que mira a la derecha, como polilínea:
 * borde exterior (por la izquierda) y borde interior de vuelta.
 * @returns {[number, number][]}
 */
function crescent() {
  /** @type {[number, number][]} */
  const points = [];
  const round = (/** @type {number} */ v) => Math.round(v * 1000) / 1000;
  // Borde exterior: centro (0, 0), radio 0,62, de -60° a -300° (pasa por arriba, izquierda y abajo).
  for (let i = 0; i <= 20; i++) {
    const a = ((-60 - (240 * i) / 20) * Math.PI) / 180;
    points.push([round(Math.cos(a) * 0.62), round(Math.sin(a) * 0.62)]);
  }
  // Borde interior: arco más plano que vuelve por dentro hasta la punta de arriba.
  const [ex, ey] = points[points.length - 1];
  const cx = 0.52;
  const r = Math.hypot(ex - cx, ey);
  const a0 = Math.atan2(ey, ex - cx);
  const a1 = Math.atan2(-ey, ex - cx) + Math.PI * 2;
  for (let i = 1; i < 14; i++) {
    const a = a0 + ((a1 - a0) * i) / 14;
    points.push([round(cx + Math.cos(a) * r), round(Math.sin(a) * r)]);
  }
  return points;
}
