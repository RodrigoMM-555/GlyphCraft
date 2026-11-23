import { computeHandFeatures } from './rasgos-mano.js';
import { FiltroPunto } from '../filtros/filtro-un-euro.js';
import { clamp } from '../geometria/vector.js';

/** @typedef {import('./rasgos-mano.js').TrackedHand} TrackedHand */
/** @typedef {import('./rasgos-mano.js').HandFeatures} HandFeatures */

/**
 * Fotograma con las manos detectadas.
 *
 * @typedef {object} HandFrame
 * @property {number} timestamp Milisegundos (monótono).
 * @property {number} [imageWidth] Ancho de la imagen analizada en píxeles.
 * @property {number} [imageHeight] Alto de la imagen analizada en píxeles.
 * @property {TrackedHand[]} hands
 */

/** @typedef {'idle' | 'drawing' | 'erasing' | 'sealing' | 'pointing'} HandGestureState */
/** @typedef {'none' | HandGestureState} GestureState */
/** @typedef {'any' | 'Left' | 'Right'} WritingHand */
/** @typedef {'point' | 'pinch'} DrawGesture */

/**
 * @typedef {object} GestureConfig
 * @property {DrawGesture} drawGesture Gesto para dibujar: `point` (índice levantado, resto recogido) o `pinch` (pinza).
 * @property {number} pointKeep Extensión mínima del índice para **seguir** dibujando (más permisiva que para empezar).
 * @property {number} curlKeep Extensión máxima del resto de dedos para seguir dibujando.
 * @property {number} pinchStart (Modo pinza) Proporción pulgar-índice/palma por debajo de la cual empieza.
 * @property {number} pinchEnd (Modo pinza) Proporción por encima de la cual termina (histéresis: > pinchStart).
 * @property {number} framesToStart Fotogramas seguidos con el gesto para empezar a dibujar.
 * @property {number} framesToEnd Fotogramas seguidos sin el gesto para terminar el trazo.
 * @property {number} lostGraceMs Tiempo que se tolera perder la mano sin cortar el trazo.
 * @property {number} eraseHoldMs Tiempo con la palma abierta para borrar.
 * @property {number} sealHoldMs Tiempo con el puño cerrado para sellar.
 * @property {number} commandCooldownMs Pausa tras borrar o sellar antes de aceptar otra orden.
 * @property {number} minScore Confianza mínima de lateralidad (izquierda/derecha). MediaPipe ya filtra la presencia de la mano; por defecto 0 (no se filtra).
 * @property {number} ratioSmoothing Suavizado de la medida de la pinza (0 = ninguno, 0,9 = mucho).
 * @property {WritingHand} writingHand Mano que puede dibujar (`any` = cualquiera).
 * @property {{ minCutoff: number, beta: number }} smoothing Parámetros del filtro One Euro.
 */

/** Configuración predeterminada. */
export const DEFAULT_GESTURE_CONFIG = Object.freeze({
  drawGesture: /** @type {DrawGesture} */ ('point'),
  pointKeep: 1.02,
  curlKeep: 1.08,
  pinchStart: 0.3,
  pinchEnd: 0.55,
  framesToStart: 2,
  framesToEnd: 4,
  lostGraceMs: 350,
  eraseHoldMs: 800,
  sealHoldMs: 600,
  commandCooldownMs: 1000,
  minScore: 0,
  ratioSmoothing: 0.4,
  writingHand: /** @type {WritingHand} */ ('any'),
  smoothing: Object.freeze({ minCutoff: 1.5, beta: 6 }),
});

/** Prioridad para resumir varias manos en un único estado. */
const PRIORITY = /** @type {const} */ (['none', 'idle', 'pointing', 'sealing', 'erasing', 'drawing']);

/**
 * @typedef {object} HandRecord
 * @property {string} id
 * @property {'Left' | 'Right'} handedness
 * @property {HandGestureState} state
 * @property {number} lastSeen
 * @property {number} startFrames
 * @property {number} releaseFrames
 * @property {number | null} holdStart
 * @property {number} progress
 * @property {'erasing' | 'sealing' | null} latched Orden ya ejecutada; no se repite hasta soltar el gesto.
 * @property {{ x: number, y: number } | null} point
 * @property {FiltroPunto} filter
 * @property {HandFeatures | null} features
 * @property {number | null} ratio Medida de la pinza suavizada (modo pinza).
 * @property {{ x: number, y: number } | null} palm Último centro de la palma (para seguir la mano).
 * @property {number} frameIndex Posición de la mano en el último fotograma (-1 si no está).
 * @property {{ x: number, y: number } | null} lastTip Última punta aceptada (sin filtrar) mientras dibuja.
 * @property {{ x: number, y: number } | null} lastTipPalm Centro de la palma cuando se aceptó `lastTip`.
 * @property {number} glitches Fotogramas seguidos descartados por saltos imposibles.
 * @property {{ point: { x: number, y: number }, timestamp: number }[]} pending Puntos retenidos mientras el gesto parece soltarse.
 */

/** Distancia máxima (normalizada) que puede saltar una palma entre fotogramas y seguir siendo la misma mano. */
const MAX_PALM_JUMP = 0.25;
/**
 * Salto máximo de la punta del índice entre dos fotogramas, en palmas,
 * **además** de lo que se haya movido la palma. Más que eso no es un
 * movimiento real del dedo sino un error del detector.
 */
const MAX_TIP_JUMP = 0.6;
/** Fotogramas seguidos que se descartan como error antes de aceptar que el dedo de verdad está ahí. */
const MAX_GLITCH_FRAMES = 3;

/**
 * Convierte fotogramas de manos en gestos.
 *
 * No sabe nada de cámaras ni de dibujo: recibe {@link HandFrame} con
 * `update()` y emite eventos. Por eso se puede probar con datos simulados y
 * reutilizar con cualquier fuente de manos.
 *
 * Gestos:
 * - **Índice levantado** (resto de dedos recogidos): dibujar con la punta
 *   del índice. `draw-start` → `draw-move`… → `draw-end`.
 *   (Con `drawGesture: 'pinch'` se dibuja con la pinza y señalar mueve un cursor: `pointer-move`.)
 * - **Mano bien abierta** mantenida: borrar. `erase-progress` → `erase`.
 * - **Puño bien cerrado** mantenido: sellar el glifo. `seal-progress` → `seal`.
 *
 * Protecciones contra activaciones accidentales:
 * - Histéresis: empezar a dibujar exige un gesto más claro que seguir dibujando.
 * - Varios fotogramas seguidos para empezar y terminar un trazo.
 * - Si la mano se pierde menos de `lostGraceMs`, el trazo continúa.
 * - Borrar y sellar exigen mantener el gesto; se cancelan al soltarlo.
 * - Nadie puede borrar ni sellar mientras alguna mano dibuja.
 * - Tras una orden hay una pausa y hay que deshacer el gesto para repetirla.
 *
 * Protecciones contra saltos del índice (errores del detector):
 * - Si la punta del índice no encaja con el resto del dedo, se estima
 *   prolongando el dedo (`stableIndexTip`).
 * - Si la punta salta de golpe más de lo que permite el movimiento de la
 *   palma, ese fotograma se descarta (hasta `MAX_GLITCH_FRAMES` seguidos).
 * - Al soltar el gesto, los puntos de los fotogramas en que el dedo se está
 *   doblando no se dibujan (si no, el trazo acaba con un «gancho»).
 * - Las manos se emparejan con las del fotograma anterior por cercanía,
 *   todas a la vez (la pareja más cercana primero): una detección falsa no
 *   puede «robar» la mano que dibuja.
 *
 * @fires gesture-changed - `{ hand, state, previous, overall }`
 * @fires draw-start - `{ hand, point, timestamp }`
 * @fires draw-move - `{ hand, point, timestamp }`
 * @fires draw-end - `{ hand, point, timestamp, reason: 'released' | 'lost' | 'reset' }`
 * @fires erase-progress - `{ hand, progress, timestamp }` (progress 0 = cancelado)
 * @fires erase - `{ hand, timestamp, outline, palm }` · `outline`: contorno de la mano (coordenadas de imagen) para borrar solo lo que cubre.
 * @fires erase-move - `{ hand, timestamp, outline, palm }` · Después de borrar, mientras la mano sigue abierta: «esponja» para borrar más.
 * @fires seal-progress - `{ hand, progress, timestamp }`
 * @fires seal - `{ hand, timestamp }`
 * @fires pointer-move - `{ hand, point, timestamp }`
 * @fires hands-changed - `{ count, hands }`
 */
export class MotorGestos extends EventTarget {
  /** @type {GestureConfig} */
  #config;
  /** @type {Map<string, HandRecord>} */
  #hands = new Map();
  #cooldownUntil = -Infinity;
  #lastTimestamp = -Infinity;

  /** @param {Partial<GestureConfig>} [config] */
  constructor(config = {}) {
    super();
    this.#config = MotorGestos.validateConfig({ ...DEFAULT_GESTURE_CONFIG, ...config });
  }

  /**
   * Comprueba una configuración completa y la devuelve congelada.
   * @param {GestureConfig} config
   * @returns {GestureConfig}
   * @throws {RangeError}
   */
  static validateConfig(config) {
    const positive = ['pointKeep', 'curlKeep', 'pinchStart', 'pinchEnd', 'framesToStart', 'framesToEnd', 'eraseHoldMs', 'sealHoldMs'];
    for (const key of positive) {
      const value = /** @type {Record<string, unknown>} */ (config)[key];
      if (typeof value !== 'number' || !(value > 0)) throw new RangeError(`MotorGestos: "${key}" debe ser un número > 0.`);
    }
    for (const key of ['lostGraceMs', 'commandCooldownMs', 'minScore', 'ratioSmoothing']) {
      const value = /** @type {Record<string, unknown>} */ (config)[key];
      if (typeof value !== 'number' || !(value >= 0)) throw new RangeError(`MotorGestos: "${key}" debe ser un número >= 0.`);
    }
    if (!['point', 'pinch'].includes(config.drawGesture)) {
      throw new RangeError('MotorGestos: "drawGesture" debe ser "point" o "pinch".');
    }
    if (config.pinchEnd <= config.pinchStart) {
      throw new RangeError('MotorGestos: "pinchEnd" debe ser mayor que "pinchStart" (histéresis).');
    }
    if (config.ratioSmoothing >= 1) throw new RangeError('MotorGestos: "ratioSmoothing" debe ser < 1.');
    if (!['any', 'Left', 'Right'].includes(config.writingHand)) {
      throw new RangeError('MotorGestos: "writingHand" debe ser "any", "Left" o "Right".');
    }
    const { minCutoff, beta } = config.smoothing ?? {};
    if (!(minCutoff > 0) || !(beta >= 0)) throw new RangeError('MotorGestos: "smoothing" no es válido.');
    return Object.freeze({ ...config, smoothing: Object.freeze({ minCutoff, beta }) });
  }

  /** Configuración actual (inmutable). */
  get config() {
    return this.#config;
  }

  /**
   * Cambia parte de la configuración.
   * @param {Partial<GestureConfig>} partial
   */
  configure(partial) {
    this.#config = MotorGestos.validateConfig({ ...this.#config, ...partial });
    for (const record of this.#hands.values()) record.filter = this.#createFilter();
  }

  /** Estado combinado de todas las manos. @returns {GestureState} */
  get state() {
    let best = 0;
    for (const record of this.#hands.values()) best = Math.max(best, PRIORITY.indexOf(record.state));
    return PRIORITY[best];
  }

  /** Copia del estado de cada mano, para visualizarlo. */
  getSnapshot() {
    return {
      state: this.state,
      hands: [...this.#hands.values()].map((r) => ({
        id: r.id,
        handedness: r.handedness,
        state: r.state,
        progress: r.progress,
        point: r.point ? { ...r.point } : null,
        frameIndex: r.frameIndex,
      })),
    };
  }

  /**
   * Procesa un fotograma.
   * @param {HandFrame} frame
   * @throws {TypeError} si el fotograma no tiene el formato esperado.
   */
  update(frame) {
    if (!frame || !Number.isFinite(frame.timestamp) || !Array.isArray(frame.hands)) {
      throw new TypeError('MotorGestos.update necesita { timestamp: number, hands: [] }.');
    }
    const t = frame.timestamp;
    if (t < this.#lastTimestamp) return; // fotograma desordenado: se ignora
    this.#lastTimestamp = t;

    const before = this.#hands.size;
    const aspect = frame.imageWidth && frame.imageHeight ? frame.imageWidth / frame.imageHeight : undefined;
    /** @type {Set<string>} */
    const seen = new Set();
    for (const record of this.#hands.values()) record.frameIndex = -1;

    const candidates = frame.hands
      .map((hand, index) => ({ hand, index, features: computeHandFeatures(hand, { aspect }) }))
      .filter(({ hand }) => (hand.score ?? 1) >= this.#config.minScore);

    const assigned = this.#assign(candidates.map((c) => c.features.palmCenter));
    for (const [k, { hand, index, features }] of candidates.entries()) {
      const record = assigned[k] ?? this.#newRecord(hand.handedness, seen);
      seen.add(record.id);
      record.handedness = hand.handedness;
      record.palm = features.palmCenter;
      record.frameIndex = index;
      record.lastSeen = t;
      record.features = features;
      this.#process(record, features, t, aspect ?? 4 / 3);
    }

    for (const record of [...this.#hands.values()]) {
      if (seen.has(record.id) || t - record.lastSeen <= this.#config.lostGraceMs) continue;
      if (record.state === 'drawing') {
        this.#emit('draw-end', { hand: record.id, point: record.point, timestamp: t, reason: 'lost' });
      }
      this.#cancelHold(record, t);
      this.#hands.delete(record.id);
      this.#emit('gesture-changed', { hand: record.id, state: 'none', previous: record.state, overall: this.state });
    }

    if (this.#hands.size !== before) {
      this.#emit('hands-changed', { count: this.#hands.size, hands: [...this.#hands.keys()] });
    }
  }

  /** Termina cualquier trazo en curso y olvida todas las manos. */
  reset() {
    const t = this.#lastTimestamp;
    for (const record of this.#hands.values()) {
      if (record.state === 'drawing') {
        this.#emit('draw-end', { hand: record.id, point: record.point, timestamp: t, reason: 'reset' });
      }
    }
    const had = this.#hands.size;
    this.#hands.clear();
    this.#cooldownUntil = -Infinity;
    this.#lastTimestamp = -Infinity;
    if (had) this.#emit('hands-changed', { count: 0, hands: [] });
  }

  // ── Interno ───────────────────────────────────────────────

  #createFilter() {
    return new FiltroPunto(this.#config.smoothing);
  }

  /**
   * @param {string} id
   * @param {'Left' | 'Right'} handedness
   * @returns {HandRecord}
   */
  #createRecord(id, handedness) {
    return {
      id,
      handedness,
      ratio: null,
      palm: null,
      frameIndex: -1,
      lastTip: null,
      lastTipPalm: null,
      glitches: 0,
      pending: [],
      state: 'idle',
      lastSeen: 0,
      startFrames: 0,
      releaseFrames: 0,
      holdStart: null,
      progress: 0,
      latched: null,
      point: null,
      filter: this.#createFilter(),
      features: null,
    };
  }

  /**
   * Empareja las manos del fotograma con las manos conocidas.
   *
   * Se sigue por **continuidad de posición** (la palma más cercana a donde
   * estaba), no por la etiqueta izquierda/derecha: MediaPipe a veces cambia
   * esa etiqueta durante un fotograma y, si se usara como identificador, el
   * trazo se cortaría.
   *
   * Se resuelven todas las parejas a la vez, de la más cercana a la más
   * lejana. Así, si aparece una detección falsa cerca de la mano que dibuja,
   * la mano de verdad (más cercana) conserva su registro.
   *
   * @param {{ x: number, y: number }[]} palms Centros de palma del fotograma.
   * @returns {(HandRecord | undefined)[]} Registro de cada palma (`undefined` = mano nueva).
   */
  #assign(palms) {
    const records = [...this.#hands.values()].filter((r) => r.palm);
    const pairs = [];
    for (const [i, palm] of palms.entries()) {
      for (const record of records) {
        const d = Math.hypot(/** @type {any} */ (record.palm).x - palm.x, /** @type {any} */ (record.palm).y - palm.y);
        if (d < MAX_PALM_JUMP) pairs.push({ i, record, d });
      }
    }
    pairs.sort((a, b) => a.d - b.d);
    /** @type {(HandRecord | undefined)[]} */
    const result = palms.map(() => undefined);
    const used = new Set();
    for (const { i, record } of pairs) {
      if (result[i] || used.has(record)) continue;
      result[i] = record;
      used.add(record);
    }
    return result;
  }

  /**
   * @param {'Left' | 'Right'} handedness
   * @param {Set<string>} taken Manos ya asignadas en este fotograma.
   * @returns {HandRecord}
   */
  #newRecord(handedness, taken) {
    /** @type {string} */
    let id = handedness;
    for (let n = 2; this.#hands.has(id) || taken.has(id); n++) id = `${handedness}#${n}`;
    const record = this.#createRecord(id, handedness);
    this.#hands.set(id, record);
    return record;
  }

  /**
   * ¿Es creíble que la punta del índice esté ahora en `tip`?
   * Compara su salto con lo que se ha movido la palma desde el último punto aceptado.
   * @param {HandRecord} record
   * @param {HandFeatures} f
   * @param {{ x: number, y: number }} tip
   * @param {number} aspect
   */
  #plausibleTip(record, f, tip, aspect) {
    if (!record.lastTip || !record.lastTipPalm) return true;
    const dist = (/** @type {{ x: number, y: number }} */ a, /** @type {{ x: number, y: number }} */ b) =>
      Math.hypot((a.x - b.x) * aspect, a.y - b.y);
    const jump = dist(tip, record.lastTip);
    const palmMove = dist(f.palmCenter, record.lastTipPalm);
    return jump <= palmMove * 1.5 + MAX_TIP_JUMP * f.imagePalmSize;
  }

  /**
   * @param {HandRecord} record
   * @param {HandFeatures} f
   * @param {number} t
   * @param {number} aspect Ancho/alto de la imagen.
   */
  #process(record, f, t, aspect) {
    const cfg = this.#config;
    const seconds = t / 1000;
    const pointMode = cfg.drawGesture === 'point';
    // Media móvil de la pinza (solo modo pinza): un pico de ruido no la suelta.
    const k = cfg.ratioSmoothing;
    record.ratio = record.ratio === null ? f.pinchRatio : record.ratio * k + f.pinchRatio * (1 - k);
    const drawPoint = pointMode ? f.indexTip : f.pinchPoint;
    const othersMax = Math.max(f.fingerRatios.middle, f.fingerRatios.ring, f.fingerRatios.pinky);

    if (record.state === 'drawing') {
      // Para SEGUIR dibujando basta un gesto menos estricto que para empezar.
      const keeps = pointMode
        ? f.fingerRatios.index > cfg.pointKeep && othersMax < cfg.curlKeep
        : /** @type {number} */ (record.ratio) <= cfg.pinchEnd;
      record.releaseFrames = keeps ? 0 : record.releaseFrames + 1;
      if (record.releaseFrames >= cfg.framesToEnd) {
        // Los puntos retenidos son del dedo doblándose: se descartan.
        record.pending = [];
        this.#emit('draw-end', { hand: record.id, point: record.point, timestamp: t, reason: 'released' });
        record.startFrames = 0;
        record.releaseFrames = 0;
        this.#setState(record, 'idle');
        return;
      }
      // Salto imposible de la punta: se ignora este fotograma (unos pocos como máximo).
      if (!this.#plausibleTip(record, f, drawPoint, aspect) && record.glitches < MAX_GLITCH_FRAMES) {
        record.glitches++;
        return;
      }
      record.glitches = 0;
      record.lastTip = drawPoint;
      record.lastTipPalm = f.palmCenter;
      const point = record.filter.filter(drawPoint, seconds);
      if (record.releaseFrames > 0) {
        // Parece que se suelta: se retiene el punto hasta saber si sigue dibujando.
        record.pending.push({ point, timestamp: t });
        return;
      }
      for (const held of record.pending) {
        record.point = held.point;
        this.#emit('draw-move', { hand: record.id, point: held.point, timestamp: held.timestamp });
      }
      record.pending = [];
      record.point = point;
      this.#emit('draw-move', { hand: record.id, point, timestamp: t });
      return;
    }

    // 1. Dibujar tiene prioridad sobre las órdenes.
    const canDraw = cfg.writingHand === 'any' || cfg.writingHand === record.handedness;
    const starts = pointMode ? f.isPointing : f.pinchRatio < cfg.pinchStart && !f.isFist;
    record.startFrames = canDraw && starts ? record.startFrames + 1 : 0;
    if (record.startFrames >= cfg.framesToStart) {
      this.#cancelHold(record, t);
      record.filter.reset();
      record.releaseFrames = 0;
      record.glitches = 0;
      record.pending = [];
      record.lastTip = drawPoint;
      record.lastTipPalm = f.palmCenter;
      record.point = record.filter.filter(drawPoint, seconds);
      this.#setState(record, 'drawing');
      this.#emit('draw-start', { hand: record.id, point: record.point, timestamp: t });
      return;
    }

    // 2. Órdenes mantenidas (borrar / sellar).
    // Después de borrar, mientras la mano siga abierta hace de «esponja».
    if (record.latched === 'erasing' && f.isOpenPalm) {
      this.#setState(record, 'erasing');
      this.#emit('erase-move', { hand: record.id, timestamp: t, outline: f.outline, palm: f.palmCenter });
      return;
    }
    if (record.latched === 'erasing' && !f.isOpenPalm) record.latched = null;
    if (record.latched === 'sealing' && !f.isFist) record.latched = null;
    const someoneDrawing = [...this.#hands.values()].some((r) => r.state === 'drawing');
    const blocked = someoneDrawing || t < this.#cooldownUntil;

    if (!blocked && f.isOpenPalm && record.latched !== 'erasing') {
      this.#hold(record, 'erasing', cfg.eraseHoldMs, 'erase', t, { outline: f.outline, palm: f.palmCenter });
      return;
    }
    if (!blocked && f.isFist && record.latched !== 'sealing') {
      this.#hold(record, 'sealing', cfg.sealHoldMs, 'seal', t);
      return;
    }

    // 3. Reposo (o cursor al señalar, en modo pinza).
    this.#cancelHold(record, t);
    if (!pointMode && f.isPointing) {
      if (record.state !== 'pointing') record.filter.reset();
      record.point = record.filter.filter(f.indexTip, seconds);
      this.#setState(record, 'pointing');
      this.#emit('pointer-move', { hand: record.id, point: record.point, timestamp: t });
    } else {
      this.#setState(record, 'idle');
    }
  }

  /**
   * @param {HandRecord} record
   * @param {'erasing' | 'sealing'} state
   * @param {number} duration
   * @param {'erase' | 'seal'} eventName
   * @param {number} t
   * @param {object} [extra] Datos que se añaden al evento final.
   */
  #hold(record, state, duration, eventName, t, extra = {}) {
    if (record.state !== state) {
      this.#cancelHold(record, t);
      record.holdStart = t;
      this.#setState(record, state);
    }
    record.progress = clamp((t - /** @type {number} */ (record.holdStart)) / duration, 0, 1);
    this.#emit(`${eventName}-progress`, { hand: record.id, progress: record.progress, timestamp: t });
    if (record.progress >= 1) {
      this.#emit(eventName, { hand: record.id, timestamp: t, ...extra });
      this.#cooldownUntil = t + this.#config.commandCooldownMs;
      record.latched = state;
      record.holdStart = null;
      record.progress = 0;
      this.#setState(record, state === 'erasing' ? 'erasing' : 'idle');
    }
  }

  /**
   * Cancela una orden a medias y avisa con progreso 0.
   * @param {HandRecord} record
   * @param {number} t
   */
  #cancelHold(record, t) {
    if (record.state !== 'erasing' && record.state !== 'sealing') return;
    const eventName = record.state === 'erasing' ? 'erase-progress' : 'seal-progress';
    record.holdStart = null;
    record.progress = 0;
    this.#emit(eventName, { hand: record.id, progress: 0, timestamp: t });
    this.#setState(record, 'idle');
  }

  /**
   * @param {HandRecord} record
   * @param {HandGestureState} state
   */
  #setState(record, state) {
    if (record.state === state) return;
    const previous = record.state;
    record.state = state;
    this.#emit('gesture-changed', { hand: record.id, state, previous, overall: this.state });
  }

  /**
   * @param {string} type
   * @param {object} detail
   */
  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
