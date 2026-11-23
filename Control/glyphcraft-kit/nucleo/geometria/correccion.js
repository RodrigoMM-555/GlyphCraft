import { resample, pathLength, boundingBox, fitCircle, angularCoverage, signedArea, directedChamfer, pointwiseDistance } from './trazo.js';

/**
 * Corrección de trazos («embellecedor»).
 *
 * Averigua qué figura quería dibujar la persona y devuelve su versión bien
 * hecha: un círculo tembloroso se vuelve un círculo perfecto, un triángulo
 * torcido, un triángulo equilátero, una espiral irregular, una espiral de
 * Arquímedes…
 *
 * Figuras que reconoce (en este orden de preferencia):
 *
 * | Tipo        | Cómo se detecta                                        | Resultado                         |
 * |-------------|--------------------------------------------------------|-----------------------------------|
 * | `line`      | casi recto (distancia extremos / longitud)              | segmento (ángulo redondeado a 15°) |
 * | `spiral`    | da más de 1,25 vueltas y el radio crece o decrece       | espiral de Arquímedes             |
 * | `circle`    | cerrado o casi, y se ajusta bien a una circunferencia   | circunferencia completa           |
 * | `arc`       | abierto y se ajusta a una circunferencia                | arco                              |
 * | `polygon`   | cerrado con esquinas claras y lados rectos              | polígono (regular o estrella si lo parece) |
 * | `wave`      | abierto, avanza en una dirección y oscila               | sinusoide                         |
 * | `polyline`  | abierto con pocas esquinas y tramos rectos              | zigzag de tramos rectos           |
 * | `smooth`    | cualquier otra cosa                                     | el mismo trazo, suavizado         |
 *
 * **Símbolos del grimorio** (`templates`): si se pasan plantillas, el trazo
 * se convierte en el símbolo **exacto** al que se parece (la luna de Umbra,
 * las ondas de Aqua, el rayo de Fulgur…), colocado donde y del tamaño en que
 * se dibujó. Los polígonos se emparejan por número de vértices (un triángulo
 * se vuelve el de Ignis; un hexágono, el de Aegis) y las figuras curvas, por
 * su forma. Las líneas y los círculos se corrigen siempre geométricamente
 * (sirven para cualquier ángulo y tamaño).
 *
 * **Intensidad** (`strength`): 1 = la figura perfecta; 0,5 = a medio camino
 * entre lo dibujado y la figura perfecta; 0 = sin cambios.
 *
 * El resultado **conserva el punto de inicio y el sentido** del trazo
 * original, así se puede animar la transformación punto a punto y el
 * reconocedor sigue pudiendo comprobar el sentido de cada trazo.
 *
 * Todo es geometría pura (sin DOM). Los puntos deben estar en un sistema
 * con la misma escala en los dos ejes (p. ej. píxeles).
 */

/** @typedef {{ x: number, y: number }} Point */
/** @typedef {'line' | 'circle' | 'arc' | 'polygon' | 'polyline' | 'wave' | 'spiral' | 'smooth' | 'template'} ShapeKind */

/**
 * Plantilla de símbolo (un trazo interior de un glifo).
 * @typedef {object} SymbolTemplate
 * @property {string} id Glifo y trazo (`umbra:1`).
 * @property {readonly Point[]} points Puntos del trazo (cualquier escala).
 * @property {boolean} closed Figura cerrada.
 * @property {number} vertices Vértices si es un polígono o zigzag (0 si es curvo).
 */

/**
 * @typedef {object} StrokeCorrection
 * @property {ShapeKind} kind Figura detectada.
 * @property {Point[]} points Trazo corregido (`samples` puntos, mismo inicio y sentido).
 * @property {number} [vertices] Vértices (polígonos y zigzags).
 * @property {boolean} [regular] Polígono regular o estrella.
 * @property {string} [template] Plantilla a la que se ha ajustado (`kind: 'template'`).
 */

/** Puntos con los que se analiza el trazo. */
const ANALYSIS_SAMPLES = 64;
const TAU = Math.PI * 2;

/**
 * Corrige un trazo.
 *
 * @param {readonly Point[]} input Puntos del trazo (mínimo 3).
 * @param {{ samples?: number, templates?: readonly SymbolTemplate[], strength?: number }} [options]
 *   `samples`: puntos del resultado (96). `templates`: símbolos a los que ajustarse. `strength`: intensidad 0-1 (1).
 * @returns {StrokeCorrection | null} `null` si el trazo es demasiado pequeño o degenerado.
 */
export function correctStroke(input, { samples = 96, templates = [], strength = 1 } = {}) {
  if (!Array.isArray(input) || input.length < 3) return null;
  const raw = input.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y)).map((p) => ({ x: p.x, y: p.y }));
  if (raw.length < 3) return null;
  const pts = resample(raw, ANALYSIS_SAMPLES);
  const length = pathLength(pts);
  const box = boundingBox(pts);
  const size = Math.max(box.width, box.height);
  if (!(length > 0) || !(size > 0)) return null;

  const first = pts[0];
  const last = pts[pts.length - 1];
  const chord = dist(first, last);
  const closed = chord < size * 0.25;
  // Cuánto se separa el trazo de la recta entre sus extremos (relativo a ella).
  const deviation = chord > 0 ? Math.max(...pts.map((p) => distanceToSegment(p, first, last))) / chord : Infinity;
  const nearlyStraight = chord / length > 0.96 || deviation < 0.06;

  /** @type {(Omit<StrokeCorrection, 'points'> & { path: Point[], loop?: boolean }) | null} */
  const shape = closed
    ? asPolygon(pts, size) ?? asCircle(pts, true) ?? smooth(pts)
    : (nearlyStraight ? asLine(pts) : null) ??
      asSpiral(pts) ??
      asWave(pts, length) ??
      asCircle(pts, false) ??
      asPolyline(pts, size) ??
      smooth(pts);

  const { path, loop, ...geometric } = shape;
  /** @type {Omit<StrokeCorrection, 'points'>} */
  let info = geometric;
  let points = loop ? closedFrom(path, first, samples) : resample(path, samples);

  if (templates.length && info.kind !== 'line') {
    const snapped = snapToTemplate(pts, info, points, templates, samples);
    if (snapped) {
      info = { kind: 'template', template: snapped.id };
      points = snapped.points;
    }
  }

  const k = Math.min(1, Math.max(0, Number.isFinite(strength) ? strength : 1));
  if (k < 1) {
    // A medio camino: cada punto se acerca a la figura ideal en esa proporción.
    const drawn = resample(raw, samples);
    points = points.map((p, i) => ({ x: drawn[i].x + (p.x - drawn[i].x) * k, y: drawn[i].y + (p.y - drawn[i].y) * k }));
  }
  return { ...info, points };
}

/**
 * Plantillas de los símbolos de unos glifos: sus trazos interiores, salvo
 * líneas y círculos (esos se corrigen geométricamente, valgan para cualquier
 * ángulo y tamaño).
 *
 * @param {Iterable<import('../glifos/modelo-glifo.js').Glyph>} glyphs
 * @returns {SymbolTemplate[]}
 */
export function templatesFromGlyphs(glyphs) {
  /** @type {SymbolTemplate[]} */
  const out = [];
  for (const glyph of glyphs) {
    glyph.strokes.forEach((def, i) => {
      if (i === 0 || def.type === 'line' || def.type === 'circle') return;
      const vertices = def.type === 'polyline' && def.points.length <= 10 ? def.points.length : 0;
      out.push({ id: `${glyph.id}:${i}`, points: glyph.sampled[i], closed: glyph.closed[i], vertices });
    });
  }
  return out;
}

/** Distancia máxima (en la caja normalizada) para ajustarse a una plantilla curva. */
const TEMPLATE_THRESHOLD = 0.17;
/** Distancia máxima entre un polígono regularizado y la plantilla con sus mismos vértices. */
const POLYGON_TEMPLATE_THRESHOLD = 0.25;

/**
 * Ajusta un trazo a la plantilla más parecida (o `null` si ninguna encaja).
 * @param {Point[]} pts Trazo remuestreado.
 * @param {Omit<StrokeCorrection, 'points'>} info Figura geométrica detectada.
 * @param {Point[]} geometric Puntos de esa figura.
 * @param {readonly SymbolTemplate[]} templates
 * @param {number} samples
 * @returns {{ id: string, points: Point[] } | null}
 */
function snapToTemplate(pts, info, geometric, templates, samples) {
  /** @type {{ t: SymbolTemplate, d: number } | null} */
  let best = null;
  const glyphOf = (/** @type {SymbolTemplate} */ t) => t.id.split(':')[0];
  if (info.kind === 'polygon') {
    // Polígonos: misma cantidad de vértices; se compara la figura ya regularizada.
    for (const t of templates) {
      if (!t.closed || t.vertices !== info.vertices) continue;
      const d = shapeDistance(geometric, t.points);
      if (d < POLYGON_TEMPLATE_THRESHOLD && (!best || d < best.d)) best = { t, d };
    }
  }
  if (!best && info.kind !== 'circle' && info.kind !== 'polygon') {
    const ranked = templates
      .filter((t) => similarProportions(pts, t.points))
      .map((t) => ({ t, d: shapeDistance(pts, t.points) }))
      .sort((a, b) => a.d - b.d);
    const [first] = ranked;
    const rival = ranked.find((r) => glyphOf(r.t) !== glyphOf(first.t));
    // Debe parecerse bastante y, si hay duda con otro símbolo, claramente más.
    if (first && first.d < TEMPLATE_THRESHOLD && (!rival || first.d < 0.1 || rival.d > first.d * 1.2)) best = first;
  }
  // Figuras cerradas (círculo o polígono sin pareja clara): ¿se parecen
  // claramente más a un símbolo cerrado que a una circunferencia perfecta?
  // Así un hexágono tembloroso se vuelve el de Aegis y no un círculo, y un
  // círculo tembloroso sigue siendo un círculo.
  if (!best && (info.kind === 'circle' || info.kind === 'polygon')) {
    const ring = Array.from({ length: 65 }, (_, i) => ({ x: Math.cos((i / 64) * Math.PI * 2), y: Math.sin((i / 64) * Math.PI * 2) }));
    const toCircle = shapeDistance(pts, ring);
    const ranked = templates
      .filter((t) => t.closed)
      .map((t) => ({ t, d: shapeDistance(pts, t.points) }))
      .sort((a, b) => a.d - b.d);
    const [first] = ranked;
    const rival = ranked.find((r) => glyphOf(r.t) !== glyphOf(first.t));
    if (first && first.d < POLYGON_TEMPLATE_THRESHOLD && first.d < toCircle * 0.7 && (!rival || rival.d > first.d * 1.15)) best = first;
  }
  if (!best) return null;

  // Coloca la plantilla en la caja de lo dibujado (sin deformarla).
  const box = boundingBox(pts);
  const half = Math.max(box.width, box.height) / 2;
  const center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  let placed = normalizeBox(resample(best.t.points, 240)).map((p) => ({ x: center.x + p.x * half, y: center.y + p.y * half }));

  if (best.t.closed) {
    if (Math.sign(signedArea(placed)) !== Math.sign(signedArea(pts))) placed = placed.reverse();
    return { id: best.t.id, points: closedFrom(placed, pts[0], samples) };
  }
  const user = resample(pts, 64);
  const forward = resample(placed, 64);
  if (pointwiseDistance(user, [...forward].reverse()) < pointwiseDistance(user, forward)) placed = placed.reverse();
  return { id: best.t.id, points: resample(placed, samples) };
}

/**
 * ¿Tienen sus cajas proporciones parecidas? (al normalizar por el lado
 * mayor, una línea casi recta y un zigzag estrecho se parecen demasiado;
 * así se distinguen).
 * @param {readonly Point[]} a
 * @param {readonly Point[]} b
 */
function similarProportions(a, b) {
  const ratio = (/** @type {readonly Point[]} */ p) => {
    const box = boundingBox(p);
    return Math.min(box.width, box.height) / (Math.max(box.width, box.height) || 1) + 0.1;
  };
  const r = ratio(a) / ratio(b);
  return r > 1 / 1.8 && r < 1.8;
}

/**
 * Distancia de forma entre dos trazos, cada uno normalizado a su caja
 * (no depende de la posición ni del tamaño; sí de la orientación).
 * @param {readonly Point[]} a
 * @param {readonly Point[]} b
 */
function shapeDistance(a, b) {
  const A = normalizeBox(resample(a, 64));
  const B = normalizeBox(resample(b, 64));
  return Math.max(directedChamfer(A, B), directedChamfer(B, A));
}

/**
 * Centra en (0, 0) y escala para que el lado mayor de la caja vaya de -1 a 1.
 * @param {readonly Point[]} points
 */
function normalizeBox(points) {
  const box = boundingBox(points);
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const half = Math.max(box.width, box.height) / 2 || 1;
  return points.map((p) => ({ x: (p.x - cx) / half, y: (p.y - cy) / half }));
}

// ── Figuras ─────────────────────────────────────────────────

/**
 * Segmento recto con el ángulo redondeado a múltiplos de 15° si está cerca.
 * @param {Point[]} pts
 */
function asLine(pts) {
  const a = pts[0];
  const b = pts[pts.length - 1];
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const half = dist(a, b) / 2;
  const angle = snapAngle(Math.atan2(b.y - a.y, b.x - a.x), Math.PI / 12, (5 * Math.PI) / 180);
  const dx = Math.cos(angle) * half;
  const dy = Math.sin(angle) * half;
  return { kind: /** @type {const} */ ('line'), path: [{ x: mid.x - dx, y: mid.y - dy }, { x: mid.x + dx, y: mid.y + dy }] };
}

/**
 * Circunferencia completa (si recorre casi toda la vuelta) o arco.
 * @param {Point[]} pts
 * @param {boolean} closed
 */
function asCircle(pts, closed) {
  const fit = fitCircle(pts);
  // Cerrado se tolera más deformación: los polígonos ya se han descartado antes.
  if (!fit || fit.residual > (closed ? 0.1 : 0.075)) return null;
  const coverage = angularCoverage(pts, fit.cx, fit.cy);
  const sweep = unwrappedAngles(pts, fit.cx, fit.cy);
  const total = sweep[sweep.length - 1] - sweep[0];
  const turns = Math.abs(total) / TAU;
  if (turns > 1.25) return null; // varias vueltas: eso es una espiral
  const center = { x: fit.cx, y: fit.cy };
  if ((closed && coverage >= 0.8) || (coverage >= 0.85 && turns >= 0.8)) {
    const dir = Math.sign(total) || 1;
    const start = sweep[0];
    const path = Array.from({ length: 129 }, (_, i) => polar(center, fit.r, start + (dir * TAU * i) / 128));
    return { kind: /** @type {const} */ ('circle'), path, loop: true };
  }
  if (closed || turns < 0.2) return null;
  const path = Array.from({ length: 65 }, (_, i) => polar(center, fit.r, sweep[0] + (total * i) / 64));
  return { kind: /** @type {const} */ ('arc'), path };
}

/**
 * Espiral de Arquímedes: ρ = a + b·θ.
 * Prueba como centro el inicio, el final y el centroide, y se queda con el que mejor ajusta.
 * @param {Point[]} pts
 */
function asSpiral(pts) {
  const n = pts.length;
  const centroid = mean(pts);
  /** @type {{ error: number, center: Point, a: number, b: number, theta: number[] } | null} */
  let best = null;
  for (const center of [pts[0], pts[n - 1], centroid, mean(pts.slice(0, 6)), mean(pts.slice(-6))]) {
    const theta = unwrappedAngles(pts, center.x, center.y);
    const turns = Math.abs(theta[n - 1] - theta[0]) / TAU;
    if (turns < 1.25) continue;
    const rho = pts.map((p) => dist(p, center));
    const { a, b, error } = linearFit(theta, rho);
    const maxRho = Math.max(...rho);
    const relative = error / maxRho;
    const growth = Math.abs(b * (theta[n - 1] - theta[0])) / maxRho;
    if (growth < 0.45 || relative > 0.09) continue;
    if (!best || relative < best.error) best = { error: relative, center, a, b, theta };
  }
  if (!best) return null;
  const { center, a, b, theta } = best;
  const t0 = theta[0];
  const t1 = theta[n - 1];
  const path = Array.from({ length: 161 }, (_, i) => {
    const t = t0 + ((t1 - t0) * i) / 160;
    return polar(center, Math.max(0, a + b * t), t);
  });
  return { kind: /** @type {const} */ ('spiral'), path };
}

/**
 * Polígono cerrado. Si parece regular (o una estrella regular), se
 * regulariza y se endereza hacia arriba cuando está casi derecho.
 * @param {Point[]} pts
 * @param {number} size
 */
function asPolygon(pts, size) {
  const loop = pts.slice(0, -1);
  const vertices = closedCorners(loop, size * 0.08);
  if (vertices.length < 3 || vertices.length > 10) return null;
  const error = meanDistanceToPath(loop, [...vertices, vertices[0]]) / size;
  // Un círculo también se aproxima bien con un octógono: solo es polígono si
  // los lados rectos explican el trazo claramente mejor que una circunferencia.
  const circle = fitCircle(loop);
  // Con muchos lados un polígono se parece aún más a un círculo: se exige más.
  if (circle && error > circle.residual * 0.5) return null;

  const dir = Math.sign(signedArea(loop)) || 1;
  // Un polígono convexo de muchos lados es, casi siempre, un círculo tembloroso.
  if (vertices.length > 6 && isConvex(vertices, dir)) return null;
  const regular = regularize(vertices, dir);
  // Uno irregular solo se acepta si sus lados son muy rectos, y más aún si
  // tiene muchos (si no, suele ser una figura curva, como una luna, que no
  // conviene llenar de esquinas).
  if (regular ? error > 0.04 : error > (vertices.length <= 5 ? 0.022 : 0.012)) return null;
  const ideal = regular ?? vertices;
  return {
    kind: /** @type {const} */ ('polygon'),
    vertices: vertices.length,
    regular: Boolean(regular),
    path: densifyPolyline([...ideal, ideal[0]]),
    loop: true,
  };
}

/**
 * Onda: avanza en una dirección y cruza su eje varias veces.
 * @param {Point[]} pts
 * @param {number} length
 */
function asWave(pts, length) {
  const a = pts[0];
  const b = pts[pts.length - 1];
  const chord = dist(a, b);
  if (chord < length * 0.45) return null;
  const ux = (b.x - a.x) / chord;
  const uy = (b.y - a.y) / chord;
  const u = pts.map((p) => (p.x - a.x) * ux + (p.y - a.y) * uy);
  const forward = u.slice(1).filter((value, i) => value >= u[i]).length / (u.length - 1);
  if (forward < 0.85) return null;
  const v = movingAverage(
    pts.map((p) => -(p.x - a.x) * uy + (p.y - a.y) * ux),
    3,
  );
  // Cruces con el eje, ignorando los del principio y el final.
  let crossings = 0;
  for (let i = 4; i < v.length - 4; i++) if (Math.sign(v[i]) !== Math.sign(v[i + 1]) && v[i + 1] !== 0) crossings++;
  if (crossings < 1 || crossings > 6) return null;
  const periods = (crossings + 1) / 2;
  const s = u.map((value) => Math.sin((TAU * periods * value) / chord));
  const amplitude = v.reduce((sum, value, i) => sum + value * s[i], 0) / (s.reduce((sum, value) => sum + value * value, 0) || 1);
  if (Math.abs(amplitude) < chord * 0.06) return null;
  const residual = Math.sqrt(v.reduce((sum, value, i) => sum + (value - amplitude * s[i]) ** 2, 0) / v.length);
  if (residual / Math.abs(amplitude) > 0.5) return null;
  const path = Array.from({ length: 121 }, (_, i) => {
    const along = (chord * i) / 120;
    const off = amplitude * Math.sin((TAU * periods * i) / 120);
    return { x: a.x + ux * along - uy * off, y: a.y + uy * along + ux * off };
  });
  return { kind: /** @type {const} */ ('wave'), path };
}

/**
 * Trazo abierto de pocos tramos rectos (zigzag, uve, rayo…).
 * @param {Point[]} pts
 * @param {number} size
 */
function asPolyline(pts, size) {
  const corners = douglasPeucker(pts, size * 0.07);
  if (corners.length < 3 || corners.length > 7) return null;
  if (meanDistanceToPath(pts, corners) / size > 0.025) return null;
  // Esquinas de verdad: giros claros y tramos de un tamaño apreciable.
  for (let i = 1; i < corners.length - 1; i++) {
    if (turnAngle(corners[i - 1], corners[i], corners[i + 1]) < (25 * Math.PI) / 180) return null;
  }
  const total = pathLength(corners);
  for (let i = 1; i < corners.length; i++) if (dist(corners[i - 1], corners[i]) < total * 0.1) return null;
  return { kind: /** @type {const} */ ('polyline'), vertices: corners.length, path: densifyPolyline(corners) };
}

/**
 * Cualquier otra figura: se conserva, pero sin temblor.
 * @param {Point[]} pts
 */
function smooth(pts) {
  const xs = movingAverage(pts.map((p) => p.x), 2);
  const ys = movingAverage(pts.map((p) => p.y), 2);
  const path = pts.map((p, i) => (i === 0 || i === pts.length - 1 ? p : { x: xs[i], y: ys[i] }));
  return { kind: /** @type {const} */ ('smooth'), path };
}

// ── Polígonos ───────────────────────────────────────────────

/**
 * Esquinas de una figura cerrada (en el orden en que se recorrió).
 * @param {Point[]} loop Sin repetir el primer punto al final.
 * @param {number} epsilon
 */
function closedCorners(loop, epsilon) {
  const n = loop.length;
  const c = mean(loop);
  // Se parte por los dos puntos más alejados: seguro que son esquinas o casi.
  let i0 = 0;
  loop.forEach((p, i) => {
    if (dist(p, c) > dist(loop[i0], c)) i0 = i;
  });
  let i1 = i0;
  loop.forEach((p, i) => {
    if (dist(p, loop[i0]) > dist(loop[i1], loop[i0])) i1 = i;
  });
  const [lo, hi] = i0 < i1 ? [i0, i1] : [i1, i0];
  const chainA = loop.slice(lo, hi + 1);
  const chainB = [...loop.slice(hi), ...loop.slice(0, lo + 1)];
  let corners = [...douglasPeucker(chainA, epsilon).slice(0, -1), ...douglasPeucker(chainB, epsilon).slice(0, -1)];
  // Quita vértices casi alineados con sus vecinos.
  let changed = true;
  while (changed && corners.length > 3) {
    changed = false;
    for (let i = 0; i < corners.length; i++) {
      const prev = corners[(i - 1 + corners.length) % corners.length];
      const next = corners[(i + 1) % corners.length];
      if (turnAngle(prev, corners[i], next) < (22 * Math.PI) / 180) {
        corners.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  if (n < 3) corners = [];
  return corners;
}

/**
 * Si los vértices forman (casi) un polígono regular o una estrella regular,
 * devuelve sus vértices ideales en el mismo orden; si no, `null`.
 * @param {Point[]} vertices
 * @param {number} dir Sentido de recorrido (signo del área).
 * @returns {Point[] | null}
 */
function regularize(vertices, dir) {
  const k = vertices.length;
  if (k > 10) return null;
  const c = mean(vertices);
  const rho = vertices.map((p) => dist(p, c));
  const phi = vertices.map((p) => Math.atan2(p.y - c.y, p.x - c.x));
  // Huecos angulares entre vértices consecutivos, en el sentido del recorrido.
  const gaps = phi.map((value, i) => wrap(dir * (phi[(i + 1) % k] - value)));
  const step = TAU / k;
  if (gaps.some((g) => Math.abs(g - step) > step * 0.4)) return null;

  const isStar = k >= 8 && k % 2 === 0;
  /** @type {number[]} */
  let radii;
  if (isStar) {
    const even = avg(rho.filter((_, i) => i % 2 === 0));
    const odd = avg(rho.filter((_, i) => i % 2 === 1));
    if (Math.min(even, odd) / Math.max(even, odd) > 0.75) return null; // no alterna: no es estrella
    if (rho.some((r, i) => Math.abs(r - (i % 2 ? odd : even)) / (i % 2 ? odd : even) > 0.35)) return null;
    radii = rho.map((_, i) => (i % 2 ? odd : even));
  } else {
    if (k > 8) return null;
    const r = avg(rho);
    if (rho.some((value) => Math.abs(value - r) / r > 0.25)) return null;
    radii = rho.map(() => r);
  }

  // Giro que mejor encaja (media circular) y enderezado si está cerca.
  const offsets = phi.map((value, i) => value - dir * step * i);
  let rotation = Math.atan2(avg(offsets.map(Math.sin)), avg(offsets.map(Math.cos)));
  // Posiciones "derechas": un vértice (exterior) arriba o, en polígonos, un lado plano arriba.
  const up = -Math.PI / 2;
  const outerIndex = isStar && radii[1] > radii[0] ? 1 : 0;
  const candidates = [];
  for (let m = 0; m < k; m++) {
    candidates.push(up - dir * step * (outerIndex + m));
    if (!isStar) candidates.push(up + step / 2 - dir * step * m);
  }
  const tolerance = (12 * Math.PI) / 180;
  for (const candidate of candidates) {
    if (Math.abs(wrap(candidate - rotation)) < tolerance) {
      rotation = candidate;
      break;
    }
  }
  return radii.map((r, i) => polar(c, r, rotation + dir * step * i));
}

/**
 * `true` si todos los giros van hacia el mismo lado (sin entrantes).
 * @param {Point[]} vertices
 * @param {number} dir Sentido de recorrido.
 */
function isConvex(vertices, dir) {
  const k = vertices.length;
  return vertices.every((b, i) => {
    const a = vertices[(i - 1 + k) % k];
    const c = vertices[(i + 1) % k];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    return Math.sign(cross) === dir || Math.abs(cross) < 1e-12;
  });
}

// ── Utilidades ──────────────────────────────────────────────

/**
 * Simplificación de Douglas-Peucker: conserva los puntos que se separan
 * más de `epsilon` de la recta entre los extremos.
 * @param {Point[]} pts
 * @param {number} epsilon
 * @returns {Point[]}
 */
function douglasPeucker(pts, epsilon) {
  if (pts.length < 3) return [...pts];
  const a = pts[0];
  const b = pts[pts.length - 1];
  let index = -1;
  let max = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distanceToSegment(pts[i], a, b);
    if (d > max) {
      max = d;
      index = i;
    }
  }
  if (max <= epsilon) return [a, b];
  const left = douglasPeucker(pts.slice(0, index + 1), epsilon);
  const right = douglasPeucker(pts.slice(index), epsilon);
  return [...left.slice(0, -1), ...right];
}

/**
 * Remuestrea un camino cerrado empezando en el punto más cercano a `start`
 * y lo cierra (el último punto repite el primero).
 * @param {Point[]} path Camino cerrado (el último punto puede repetir el primero).
 * @param {Point} start
 * @param {number} samples
 */
function closedFrom(path, start, samples) {
  const closedPath = dist(path[0], path[path.length - 1]) < 1e-9 ? path : [...path, path[0]];
  const dense = resample(closedPath, 720).slice(0, -1);
  let index = 0;
  dense.forEach((p, i) => {
    if (dist(p, start) < dist(dense[index], start)) index = i;
  });
  const rotated = [...dense.slice(index), ...dense.slice(0, index)];
  return resample([...rotated, rotated[0]], samples);
}

/** @param {Point[]} corners */
function densifyPolyline(corners) {
  /** @type {Point[]} */
  const out = [corners[0]];
  for (let i = 1; i < corners.length; i++) {
    const a = corners[i - 1];
    const b = corners[i];
    for (let s = 1; s <= 16; s++) out.push({ x: a.x + ((b.x - a.x) * s) / 16, y: a.y + ((b.y - a.y) * s) / 16 });
  }
  return out;
}

/**
 * Ángulos de los puntos alrededor de un centro, sin saltos de ±π.
 * @param {Point[]} pts
 * @param {number} cx
 * @param {number} cy
 */
function unwrappedAngles(pts, cx, cy) {
  /** @type {number[]} */
  const out = [];
  let previous = 0;
  pts.forEach((p, i) => {
    const angle = Math.atan2(p.y - cy, p.x - cx);
    if (i === 0) out.push(angle);
    else out.push(out[i - 1] + wrap(angle - previous));
    previous = angle;
  });
  return out;
}

/**
 * Recta por mínimos cuadrados y = a + b·x.
 * @param {number[]} xs
 * @param {number[]} ys
 */
function linearFit(xs, ys) {
  const mx = avg(xs);
  const my = avg(ys);
  let sxy = 0;
  let sxx = 0;
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i] - my);
    sxx += (x - mx) ** 2;
  });
  const b = sxx ? sxy / sxx : 0;
  const a = my - b * mx;
  const error = Math.sqrt(avg(xs.map((x, i) => (ys[i] - (a + b * x)) ** 2)));
  return { a, b, error };
}

/**
 * Distancia media de los puntos a un camino poligonal.
 * @param {Point[]} pts
 * @param {Point[]} path
 */
function meanDistanceToPath(pts, path) {
  let sum = 0;
  for (const p of pts) {
    let best = Infinity;
    for (let i = 1; i < path.length; i++) best = Math.min(best, distanceToSegment(p, path[i - 1], path[i]));
    sum += best;
  }
  return sum / pts.length;
}

/**
 * @param {Point} p
 * @param {Point} a
 * @param {Point} b
 */
function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** Ángulo de giro (0 = recto) en el vértice `b`. */
function turnAngle(/** @type {Point} */ a, /** @type {Point} */ b, /** @type {Point} */ c) {
  const a1 = Math.atan2(b.y - a.y, b.x - a.x);
  const a2 = Math.atan2(c.y - b.y, c.x - b.x);
  return Math.abs(wrap(a2 - a1));
}

/**
 * Media móvil (ventana 2·radius + 1), con los extremos recortados.
 * @param {number[]} values
 * @param {number} radius
 */
function movingAverage(values, radius) {
  return values.map((_, i) => {
    const lo = Math.max(0, i - radius);
    const hi = Math.min(values.length - 1, i + radius);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += values[j];
    return sum / (hi - lo + 1);
  });
}

/** Redondea un ángulo al múltiplo de `step` más cercano si está a menos de `tolerance`. */
function snapAngle(/** @type {number} */ angle, /** @type {number} */ step, /** @type {number} */ tolerance) {
  const snapped = Math.round(angle / step) * step;
  return Math.abs(snapped - angle) < tolerance ? snapped : angle;
}

/** Lleva un ángulo a (-π, π]. */
const wrap = (/** @type {number} */ a) => Math.atan2(Math.sin(a), Math.cos(a));
const dist = (/** @type {Point} */ a, /** @type {Point} */ b) => Math.hypot(a.x - b.x, a.y - b.y);
const avg = (/** @type {number[]} */ values) => values.reduce((sum, v) => sum + v, 0) / (values.length || 1);
const mean = (/** @type {Point[]} */ pts) => ({ x: avg(pts.map((p) => p.x)), y: avg(pts.map((p) => p.y)) });
const polar = (/** @type {Point} */ c, /** @type {number} */ r, /** @type {number} */ a) => ({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
