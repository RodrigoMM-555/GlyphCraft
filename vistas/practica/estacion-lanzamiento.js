import { CAMERA_ERROR_MESSAGES } from 'glyphcraft-kit';
import { glyphLibrary, templatesFromGlyphs } from 'glyphcraft-kit/nucleo';
import { effectiveCorrection, CORRECTION_LIMITS } from '../../servicios/ajustes.js';
import { EntradaMano } from '../../servicios/entrada-mano.js';
import { activeZone, calibrationToZone, calibrationFromPath, mapToCanvas } from '../../servicios/calibracion.js';
import { settings, audio, progressStore, oneEuroFromSmoothing } from '../../servicios/servicios-app.js';
import { speak } from '../../servicios/accesibilidad.js';
import { glyphPower } from '../../servicios/hechizos.js';

/** Cada cuánto se guarda el tiempo de práctica (ms). */
const PRACTICE_TICK_MS = 10000;
/** Instante en que estalla la activación (coincide con ACTIVATION_BURST de los efectos). */
const BURST_MS = 1150;

/** @typedef {import('glyphcraft-kit').GcLienzoGlifo} GcLienzoGlifo */
/** @typedef {import('glyphcraft-kit').GcCapaMano} GcCapaMano */
/** @typedef {import('glyphcraft-kit').GcVistaCamara} GcVistaCamara */
/** @typedef {import('glyphcraft-kit').GcIndicadorGesto} GcIndicadorGesto */
/** @typedef {import('glyphcraft-kit').GcSusurro} GcSusurro */
/** @typedef {import('glyphcraft-kit').GcBotonRuna} GcBotonRuna */
/** @typedef {import('glyphcraft-kit').GcGlifo} GcGlifo */
/** @typedef {import('glyphcraft-kit/efectos').GcEscenarioHechizo} GcEscenarioHechizo */
/** @typedef {import('glyphcraft-kit/nucleo').Glyph} Glyph */
/** @typedef {import('glyphcraft-kit').GcLienzoGlifo['strokes']} Strokes */

/** Milisegundos sin ver manos antes de dar consejos de iluminación. */
const NO_HANDS_HINT_MS = 6000;

/**
 * Carga diferida de los efectos 3D: Three.js solo se descarga al entrar en
 * una práctica, no al abrir la aplicación.
 * @type {Promise<unknown> | null}
 */
let effectsModule = null;
const loadEffects = () => (effectsModule ??= import('glyphcraft-kit/efectos').catch((error) => {
  console.warn('No se han podido cargar los efectos 3D:', error);
  effectsModule = null;
}));

/**
 * Puesto de lanzamiento: escenario de dibujo + cámara + gestos + controles.
 *
 * Elemento de la aplicación que reutilizan «Practicar magia» y la práctica
 * guiada del grimorio. Es el **mediador** de la entrada:
 *
 *   <gc-camera-preview> ─vídeo─► EntradaMano (MediaPipe + MotorGestos)
 *        │                          │ pinch-start/move/end, erase, seal…
 *        ▼                          ▼
 *   <gc-hand-overlay> ◄─frame─  calibración ─► <gc-glyph-canvas>
 *
 * API para las vistas que lo usan:
 * - `extras`: contenedor del panel donde la vista añade su propia interfaz.
 * - `setGuide(strokes, options)`, `setFeedback(grades)`, `clear()`, `strokes`.
 * - `activate(glyph, transform)`: animación de activación sobre lo dibujado.
 * - `announce(text)`: mensaje de estado (región viva) que también se lee en voz alta si se ha pedido.
 * - Evento `glyph-sealed` (`{ strokes }`) al sellar con el puño o el botón.
 *
 * La cámara se enciende sola al entrar (ajuste `camera.enabled`); si la
 * persona la apaga, se recuerda para la próxima vez.
 *
 * Atajos de teclado: <kbd>S</kbd> sellar · <kbd>Z</kbd> deshacer ·
 * <kbd>X</kbd> borrar · <kbd>C</kbd> cámara · <kbd>D</kbd> rendimiento ·
 * <kbd>R</kbd> grabar sesión.
 */
export class EstacionLanzamiento extends HTMLElement {
  #input = new EntradaMano();
  #zone = activeZone(settings.get('camera.calibration'), settings.get('camera.zoneSize'));
  #practiceTimer = 0;
  #lastTick = 0;
  #imageSize = { imageWidth: 640, imageHeight: 480 };
  /** @type {{ x: number, y: number }[] | null} */
  #calibrationPath = null;
  #calibrating = false;
  #lastHandsAt = 0;
  #hintShown = false;
  #statsTimer = 0;
  #defaultHint = '';
  /** @type {AbortController | null} */
  #listeners = null;

  /** @type {GcLienzoGlifo} */ #canvas = /** @type {any} */ (null);
  /** @type {GcCapaMano} */ #stageHands = /** @type {any} */ (null);
  /** @type {GcCapaMano} */ #pipHands = /** @type {any} */ (null);
  /** @type {GcVistaCamara} */ #camera = /** @type {any} */ (null);
  /** @type {GcIndicadorGesto} */ #indicator = /** @type {any} */ (null);
  /** @type {GcGlifo} */ #activation = /** @type {any} */ (null);
  /** @type {GcEscenarioHechizo} */ #spells = /** @type {any} */ (null);
  /** @type {HTMLElement} */ #status = /** @type {any} */ (null);
  /** @type {HTMLElement} */ #stats = /** @type {any} */ (null);
  /** @type {HTMLElement} */ #extras = /** @type {any} */ (null);

  connectedCallback() {
    // Los hijos se crean al conectarse: un custom element no puede crearlos en su constructor.
    if (!this.#canvas) this.#render();
    loadEffects();
    this.#listeners = new AbortController();
    const { signal } = this.#listeners;

    this.addEventListener('rune-activate', this.#onAction, { signal });
    this.#camera.addEventListener('camera-error', this.#onCameraError, { signal });
    this.#camera.addEventListener('camera-stopped', () => this.#input.stop(), { signal });
    this.#canvas.addEventListener('strokes-changed', () => this.#updateHint(), { signal });
    document.addEventListener('keydown', this.#onKey, { signal });

    this.#input.addEventListener('frame', this.#onFrame, { signal });
    this.#input.addEventListener('mode-change', () => this.#syncMode(), { signal });
    this.#input.addEventListener('demo-ended', () => this.#setStatus('Fin de la demostración.'), { signal });
    this.#input.addEventListener(
      'loading',
      (e) => {
        if (/** @type {CustomEvent} */ (e).detail.loading) this.#setStatus('Despertando el ojo arcano… (cargando el modelo de manos)');
      },
      { signal },
    );

    const engine = this.#input.engine;
    engine.addEventListener('draw-start', this.#onDrawStart, { signal });
    engine.addEventListener('draw-move', this.#onDrawMove, { signal });
    engine.addEventListener('draw-end', this.#onDrawEnd, { signal });
    engine.addEventListener('erase', (e) => this.#eraseUnderHand(/** @type {CustomEvent} */ (e).detail, false), { signal });
    engine.addEventListener('erase-move', (e) => this.#eraseUnderHand(/** @type {CustomEvent} */ (e).detail, true), { signal });
    engine.addEventListener('seal', () => {
      audio.play('seal');
      this.seal();
    }, { signal });
    this.#canvas.addEventListener('glyph-cleared', () => audio.play('erase'), { signal });
    this.#canvas.addEventListener('drawing-started', () => audio.play('stroke'), { signal });
    settings.addEventListener('change', () => this.#applySettings(), { signal });

    // Tiempo de práctica: se suma mientras la sección está abierta y visible.
    this.#lastTick = performance.now();
    this.#practiceTimer = window.setInterval(() => this.#tickPractice(), PRACTICE_TICK_MS);
    engine.addEventListener('gesture-changed', () => this.#syncGesture(), { signal });
    engine.addEventListener('erase-progress', this.#onProgress, { signal });
    engine.addEventListener('seal-progress', this.#onProgress, { signal });

    this.#applySettings();
    this.#syncMode();
    // Cámara activada por defecto: se enciende al entrar salvo que se apagara la última vez.
    if (settings.get('camera.enabled') && this.#input.mode === 'off') this.#startCamera();
  }

  disconnectedCallback() {
    this.#listeners?.abort();
    this.#input.stop();
    this.#camera.stop();
    clearInterval(this.#statsTimer);
    clearInterval(this.#practiceTimer);
    this.#tickPractice();
  }

  #tickPractice() {
    const now = performance.now();
    if (!document.hidden) progressStore.addPracticeTime(now - this.#lastTick);
    this.#lastTick = now;
  }

  // ── API pública ───────────────────────────────────────────

  /** Contenedor del panel para la interfaz propia de cada vista. */
  get extras() {
    return this.#extras;
  }

  /** Trazos dibujados (copia). */
  get strokes() {
    return this.#canvas.strokes;
  }

  /**
   * Muestra una guía bajo la tinta.
   * @param {{ x: number, y: number }[][] | null} strokes Coordenadas del lienzo (0-1).
   * @param {{ style?: 'ghost' | 'faint' | 'none', next?: boolean }} [options]
   */
  setGuide(strokes, { style = 'ghost', next = false } = {}) {
    this.#canvas.guide = strokes;
    this.#canvas.guideStyle = style;
    this.#canvas.guideNext = next;
  }

  /** @param {('good' | 'fair' | 'poor' | null)[]} grades */
  setFeedback(grades) {
    this.#canvas.feedback = grades;
  }

  /** @param {string} text Texto de ayuda sobre el lienzo vacío. */
  setHint(text) {
    this.#defaultHint = text;
    this.#updateHint();
  }

  /**
   * Muestra un mensaje de estado y, si está activada la lectura en voz alta, lo lee.
   * @param {string} text
   */
  announce(text) {
    this.#setStatus(text);
    speak(text);
  }

  /** @param {{ animated?: boolean }} [options] */
  clear(options) {
    return this.#canvas.clear(options);
  }

  /** Emite `glyph-sealed` con los trazos actuales (si hay alguno). */
  seal() {
    if (this.#canvas.isDrawing) this.#canvas.endStroke();
    const strokes = this.#canvas.strokes;
    if (!strokes.length) {
      this.#setStatus('Dibuja un glifo antes de sellarlo.');
      return false;
    }
    this.dispatchEvent(new CustomEvent('glyph-sealed', { detail: { strokes }, bubbles: true }));
    return true;
  }

  /**
   * Activación del glifo y su hechizo.
   *
   * Con WebGL: la tinta se convierte en partículas que se absorben hacia el
   * centro, estalla y se despliega el hechizo del elemento en 3D. Sin WebGL
   * (o con movimiento reducido): el glifo correcto aparece sobre lo
   * dibujado y se consume en SVG.
   *
   * @param {Glyph | Glyph[]} glyphs Glifo (o varios combinados).
   * @param {{ cx: number, cy: number, r: number }} transform Círculo dibujado (coordenadas del lienzo).
   * @param {{ score?: number, spells?: string[], power?: number }} [options]
   *   `score`: precisión 0-100 (intensidad y estabilidad). `spells`: hechizos a lanzar (por defecto, los
   *   de cada glifo). `power`: potencia; por defecto, según el tamaño del círculo dibujado.
   */
  async activate(glyphs, { cx, cy, r }, { score = 100, spells, power = glyphPower(r) } = {}) {
    const list = Array.isArray(glyphs) ? glyphs : [glyphs];
    const glyph = list[0];
    const elementSpells = list.map((g) => g.effect?.spell).filter((id) => typeof id === 'string');
    const spellIds = spells ?? elementSpells;
    audio.play('charge');
    window.setTimeout(() => {
      elementSpells.forEach((id) => audio.play(`spell:${id}`));
      this.#quake(power);
    }, BURST_MS);
    await loadEffects();
    const stage = this.#spells;
    const available = /** @type {any} */ (stage.constructor).spells ?? [];
    if (settings.get('effects.enabled') && spellIds.length && stage.ready && spellIds.every((id) => available.includes(id))) {
      const strokes = this.#canvas.strokes.map((s) => s.points);
      this.#canvas.readonly = true;
      const casting = stage.cast(spellIds, {
        x: cx,
        y: cy,
        radius: r,
        strokes,
        intensity: score / 100,
        stability: Math.min(1, Math.max(0, (score - 50) / 45)),
        power,
      });
      // La tinta se apaga mientras sus partículas toman el relevo.
      await this.#canvas.clear({ animated: true });
      this.#canvas.readonly = false;
      if (await casting) return;
    }
    const el = this.#activation;
    el.glyph = glyph;
    // El SVG de <gc-glyph> abarca 2,5 radios (viewBox -1.25 … 1.25).
    Object.assign(el.style, {
      left: `${(cx - r * 1.25) * 100}%`,
      top: `${(cy - r * 1.25) * 100}%`,
      width: `${r * 250}%`,
      height: `${r * 250}%`,
    });
    el.reset();
    el.hidden = false;
    this.#canvas.readonly = true;
    await Promise.all([el.ignite({ duration: 1600 }), this.#canvas.clear({ animated: true })]);
    el.hidden = true;
    el.reset();
    this.#canvas.readonly = false;
  }

  /**
   * Temblor del círculo al estallar un hechizo potente (glifos grandes).
   * @param {number} power
   */
  #quake(power) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (power < 1.15 || reduced) return;
    const amount = Math.min(10, (power - 1) * 12);
    const stage = /** @type {HTMLElement} */ (this.querySelector('.stage'));
    stage.animate(
      [0, 1, -1, 0.7, -0.6, 0.3, 0].map((k, i) => ({ transform: `translate(${k * amount}px, ${(i % 2 ? -k : k) * amount * 0.6}px)` })),
      { duration: 480, easing: 'ease-out' },
    );
    const rect = stage.getBoundingClientRect();
    /** @type {any} */ (document.querySelector('gc-arcane-backdrop'))?.burst?.(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  // ── Construcción ──────────────────────────────────────────

  #render() {
    this.className = 'practice';
    this.innerHTML = `
      <div class="stage">
        <div class="stage__rings" aria-hidden="true"></div>
        <gc-glyph-canvas class="stage__canvas" pointer-input line-width="5" auto-correct aria-describedby="stage-help"></gc-glyph-canvas>
        <gc-glyph class="stage__activation" hidden aria-hidden="true"></gc-glyph>
        <gc-spell-stage class="stage__spells" overflow="0.35"></gc-spell-stage>
        <gc-hand-overlay class="stage__hands" variant="constellation" fit="fill"></gc-hand-overlay>
        <p class="stage__hint" aria-hidden="true"></p>
        <p class="stage__calibrating" hidden>Levanta el índice y traza un círculo cómodo.<br>Su tamaño fijará tu zona de trazado.</p>
      </div>

      <p id="stage-help" class="visually-hidden">
        Círculo de trazado. Dibuja con el ratón, el dedo o el índice frente a la cámara.
        Atajos: S sella el glifo, Z deshace el último trazo, X borra todo y C enciende o apaga la cámara.
      </p>

      <aside class="practice__panel" aria-label="Controles de práctica">
        <gc-camera-preview class="pip" hidden>
          <gc-hand-overlay class="pip__hands" variant="skeleton"></gc-hand-overlay>
        </gc-camera-preview>
        <gc-gesture-indicator class="practice__gesture"></gc-gesture-indicator>
        <p class="practice__status" role="status"></p>

        <!-- Lo más usado arriba: sellar, deshacer y borrar -->
        <div class="practice__actions">
          <gc-rune-button rune="seal" data-action="seal" class="action-seal" aria-keyshortcuts="S" title="Sellar glifo (S)">Sellar glifo</gc-rune-button>
        </div>
        <div class="practice__actions practice__actions--row">
          <gc-rune-button rune="undo" size="sm" variant="ghost" data-action="undo" aria-keyshortcuts="Z" title="Deshacer el último trazo (Z)">Deshacer</gc-rune-button>
          <gc-rune-button rune="palm" size="sm" variant="danger" data-action="clear" hold-ms="600" aria-keyshortcuts="X" title="Mantén pulsado para borrar todo (X)">Borrar</gc-rune-button>
        </div>

        <div class="practice__extras"></div>

        <div class="practice__actions practice__actions--input">
          <gc-rune-button rune="camera" variant="ghost" data-action="camera" class="action-camera" aria-keyshortcuts="C" title="Encender o apagar la cámara (C)">Activar cámara</gc-rune-button>
          <gc-rune-button rune="play" variant="ghost" data-action="demo" class="action-demo">Ver demostración</gc-rune-button>
          <gc-rune-button rune="target" variant="ghost" data-action="calibrate" class="action-calibrate" disabled>Calibrar</gc-rune-button>
        </div>
        <div class="practice__toggles">
          <gc-rune-toggle data-setting="camera.showVideo">Ver la cámara</gc-rune-toggle>
          <gc-rune-toggle data-setting="hands.showOnCanvas">Ver la mano sobre el lienzo</gc-rune-toggle>
        </div>
        <p class="practice__correction"></p>

        <details class="practice__help">
          <summary>Gestos</summary>
          <dl>
            <div><dt>Índice levantado</dt><dd>Con el resto de dedos recogidos: dibuja con la punta del índice.</dd></div>
            <div><dt>Mano bien abierta</dt><dd>Dedos estirados y separados, un instante, encima de un trazo: borra los trazos que quedan bajo la palma. Si la mantienes abierta, puedes pasarla por encima de otros para borrarlos también.</dd></div>
            <div><dt>Puño bien cerrado</dt><dd>Todos los dedos doblados, un instante: sella el glifo.</dd></div>
          </dl>
          <p>También puedes dibujar con el ratón o el dedo. Cuanto <strong>más grande</strong> traces el círculo, más fuerte será el hechizo.</p>
          <p>Atajos: <kbd>S</kbd> sellar · <kbd>Z</kbd> deshacer · <kbd>X</kbd> borrar · <kbd>C</kbd> cámara · <kbd>D</kbd> rendimiento · <kbd>R</kbd> grabar sesión.</p>
        </details>
        <dl class="practice__stats" hidden></dl>
      </aside>`;

    const $ = (/** @type {string} */ s) => /** @type {any} */ (this.querySelector(s));
    this.#canvas = $('.stage__canvas');
    this.#stageHands = $('.stage__hands');
    this.#pipHands = $('.pip__hands');
    this.#camera = $('gc-camera-preview');
    this.#indicator = $('gc-gesture-indicator');
    this.#activation = $('.stage__activation');
    this.#spells = $('.stage__spells');
    this.#status = $('.practice__status');
    this.#stats = $('.practice__stats');
    this.#extras = $('.practice__extras');

    for (const toggle of this.querySelectorAll('gc-rune-toggle[data-setting]')) {
      toggle.addEventListener('change', (e) => {
        const target = /** @type {import('glyphcraft-kit').GcInterruptorRuna} */ (e.currentTarget);
        settings.set(/** @type {any} */ (target.dataset.setting), target.checked);
      });
    }
  }

  // ── Acciones ──────────────────────────────────────────────

  /** @param {Event} event */
  #onAction = async (event) => {
    const action = /** @type {HTMLElement} */ (event.target).dataset.action;
    switch (action) {
      case 'seal':
        this.seal();
        break;
      case 'camera':
        if (this.#input.mode === 'camera') {
          this.#stopCamera();
          settings.set('camera.enabled', false);
        } else {
          settings.set('camera.enabled', true);
          await this.#startCamera();
        }
        break;
      case 'demo':
        if (this.#input.mode === 'demo') this.#input.stop();
        else await this.#startDemo();
        break;
      case 'calibrate':
        this.#toggleCalibration();
        break;
      case 'undo':
        this.#canvas.undo();
        break;
      case 'clear':
        this.#canvas.clear();
        break;
    }
  };

  async #startCamera() {
    this.#camera.hidden = false;
    this.#setStatus('Pidiendo permiso para usar la cámara…');
    if (!(await this.#camera.start())) return; // el error llega por camera-error
    try {
      await this.#input.startCamera(this.#camera.frameSource);
      this.#lastHandsAt = performance.now();
      this.#hintShown = false;
      const whole = !settings.get('camera.calibration') && settings.get('camera.zoneSize') >= 0.99;
      this.announce(
        `Cámara activa. Levanta el índice, con el resto de dedos recogidos, para dibujar. ${
          whole ? 'Puedes moverte por toda la imagen.' : 'Mueve la mano dentro del recuadro de la cámara.'
        }`,
      );
    } catch (error) {
      console.error(error);
      this.#camera.stop();
      this.#whisper()?.show({
        type: 'error',
        title: 'El ojo arcano no despierta',
        message: 'No se ha podido cargar el reconocimiento de manos. Revisa tu conexión y vuelve a intentarlo.',
      });
      this.#setStatus('No se ha podido cargar el modelo de manos.');
    }
  }

  #stopCamera() {
    this.#input.stop();
    this.#camera.stop();
    this.announce('Cámara apagada. Puedes volver a encenderla con el botón o con la tecla C.');
  }

  async #startDemo() {
    this.#camera.stop();
    this.#canvas.clear({ animated: false });
    try {
      await this.#input.startDemo();
      this.#setStatus('Demostración: una mano simulada traza un círculo y un triángulo, sella y borra.');
    } catch (error) {
      console.error(error);
      this.#setStatus('No se ha podido cargar la demostración.');
    }
  }

  #toggleCalibration() {
    this.#calibrating = !this.#calibrating;
    this.#calibrationPath = null;
    /** @type {HTMLElement} */ (this.querySelector('.stage__calibrating')).hidden = !this.#calibrating;
    this.classList.toggle('is-calibrating', this.#calibrating);
    this.#stageHands.region = this.#calibrating ? { x: 0, y: 0, width: 1, height: 1 } : this.#zone;
    this.#setStatus(this.#calibrating ? 'Calibrando: levanta el índice y traza un círculo cómodo.' : 'Calibración cancelada.');
  }

  // ── Gestos → lienzo ───────────────────────────────────────

  /** @param {{ x: number, y: number }} point */
  #toCanvas(point) {
    return mapToCanvas(point, this.#zone, { mirror: true });
  }

  /** @param {Event} event */
  #onDrawStart = (event) => {
    const { point } = /** @type {CustomEvent} */ (event).detail;
    if (this.#calibrating) {
      this.#calibrationPath = [point];
      return;
    }
    this.#canvas.beginStroke(this.#toCanvas(point), { source: 'hand' });
  };

  /** @param {Event} event */
  #onDrawMove = (event) => {
    const { point } = /** @type {CustomEvent} */ (event).detail;
    if (this.#calibrating) {
      this.#calibrationPath?.push(point);
      return;
    }
    this.#canvas.addPoint(this.#toCanvas(point));
  };

  #onDrawEnd = () => {
    if (!this.#calibrating) {
      this.#canvas.endStroke();
      return;
    }
    if (!this.#calibrationPath) return;
    try {
      const calibration = calibrationFromPath(this.#calibrationPath, this.#imageSize);
      settings.set('camera.calibration', calibration);
      this.#zone = calibrationToZone(calibration, this.#imageSize);
      this.#toggleCalibration();
      this.#setStatus('Zona de trazado calibrada.');
      this.#whisper()?.show({ type: 'success', title: 'Calibración guardada', message: 'Tu zona de trazado se ha ajustado a tu círculo.' });
      this.#applyZone();
    } catch (error) {
      this.#calibrationPath = null;
      this.#setStatus(/** @type {Error} */ (error).message);
    }
  };

  /**
   * Borra solo los trazos que quedan bajo la mano abierta.
   *
   * El contorno de la mano (en la imagen) se lleva al lienzo con la misma
   * proyección que el dedo y se agranda un poco, para que no haga falta
   * taparlo con precisión. Con `sponge` (la mano sigue abierta después de
   * borrar) se van sumando los trozos por los que pasa.
   *
   * @param {{ outline?: { x: number, y: number }[] }} detail
   * @param {boolean} sponge
   */
  #eraseUnderHand({ outline }, sponge) {
    if (this.#calibrating || !outline || outline.length < 3) return;
    const polygon = outline.map((p) => this.#toCanvas(p));
    const cx = polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length;
    const cy = polygon.reduce((sum, p) => sum + p.y, 0) / polygon.length;
    const grown = polygon.map((p) => ({ x: cx + (p.x - cx) * 1.15, y: cy + (p.y - cy) * 1.15 }));
    const count = this.#canvas.eraseInside(grown, { accumulate: sponge });
    if (count) audio.play('erase');
    if (sponge) return;
    if (count) {
      this.announce(count === 1 ? 'Trazo borrado.' : `${count} trazos borrados.`);
    } else if (this.#canvas.strokeCount) {
      this.announce('No hay ningún trazo bajo tu mano: pon la palma abierta encima del que quieras borrar.');
    }
  }

  /** @param {Event} event */
  #onProgress = (event) => {
    this.#indicator.progress = /** @type {CustomEvent} */ (event).detail.progress;
  };

  #syncGesture() {
    const state = this.#input.engine.state;
    this.#indicator.state = state;
    this.dataset.gesture = state;
  }

  // ── Fotogramas → visualización ────────────────────────────

  /** @param {Event} event */
  #onFrame = (event) => {
    const frame = /** @type {CustomEvent} */ (event).detail;
    if (frame.imageWidth && frame.imageWidth !== this.#imageSize.imageWidth) {
      this.#imageSize = { imageWidth: frame.imageWidth, imageHeight: frame.imageHeight };
      this.#zone = activeZone(settings.get('camera.calibration'), settings.get('camera.zoneSize'), this.#imageSize);
      this.#applyZone();
    }
    const gestures = this.#input.engine.getSnapshot().hands;
    this.#stageHands.frame = frame;
    this.#stageHands.gestures = gestures;
    this.#pipHands.frame = frame;
    this.#pipHands.gestures = gestures;

    const now = performance.now();
    if (frame.hands.length) this.#lastHandsAt = now;
    else if (this.#input.mode === 'camera' && !this.#hintShown && now - this.#lastHandsAt > NO_HANDS_HINT_MS) {
      this.#hintShown = true;
      this.#whisper()?.show({
        type: 'info',
        title: 'No veo tus manos',
        message: 'Colócate a medio metro de la cámara, con la mano frente a ti y una luz que te ilumine de frente.',
        duration: 8000,
      });
    }
  };

  #applyZone() {
    if (!this.#calibrating) this.#stageHands.region = this.#zone;
    this.#pipHands.guide = this.#zone;
  }

  // ── Estado de la interfaz ─────────────────────────────────

  #syncMode() {
    const mode = this.#input.mode;
    /** @type {GcBotonRuna} */ (this.querySelector('.action-camera')).textContent = mode === 'camera' ? 'Apagar cámara' : 'Activar cámara';
    /** @type {GcBotonRuna} */ (this.querySelector('.action-demo')).textContent = mode === 'demo' ? 'Detener demostración' : 'Ver demostración';
    /** @type {GcBotonRuna} */ (this.querySelector('.action-calibrate')).disabled = mode !== 'camera';
    this.dataset.input = mode;
    if (mode === 'off') {
      this.#stageHands.clear();
      this.#pipHands.clear();
      this.#indicator.state = 'none';
      if (this.#calibrating) this.#toggleCalibration();
    }
    this.#applySettings();
    this.#updateHint();
  }

  /** Aplica los ajustes guardados (se llama también cada vez que cambian). */
  #applySettings() {
    for (const toggle of /** @type {NodeListOf<import('glyphcraft-kit').GcInterruptorRuna>} */ (
      this.querySelectorAll('gc-rune-toggle[data-setting]')
    )) {
      toggle.checked = Boolean(settings.get(/** @type {any} */ (toggle.dataset.setting)));
    }
    this.#camera.hidden = this.#input.mode !== 'camera';
    this.#camera.videoHidden = !settings.get('camera.showVideo');
    const deviceId = settings.get('camera.deviceId');
    if (deviceId !== this.#camera.deviceId) this.#camera.deviceId = deviceId;
    this.#stageHands.hidden = !settings.get('hands.showOnCanvas');
    this.#applyCorrection();
    this.#stageHands.variant = settings.get('hands.style');
    this.#spells.quality = settings.get('effects.quality');
    this.#input.engine.configure({
      writingHand: settings.get('hands.writingHand'),
      eraseHoldMs: settings.get('hands.eraseHoldMs'),
      sealHoldMs: settings.get('hands.sealHoldMs'),
      smoothing: oneEuroFromSmoothing(settings.get('hands.smoothing')),
    });
    this.#input.setDetection(settings.get('hands.detection'));
    if (!this.#calibrating) this.#zone = activeZone(settings.get('camera.calibration'), settings.get('camera.zoneSize'), this.#imageSize);
    this.#applyZone();
  }

  /**
   * Corrección de los trazos: la intensidad elegida en Ajustes, limitada por
   * el nivel (Aprendiz 100 %, Artesano 60 %, Maestro 30 %). Los trazos se
   * ajustan a los símbolos del grimorio.
   */
  #applyCorrection() {
    const level = settings.get('recognition.level');
    const chosen = settings.get('drawing.correction');
    const amount = effectiveCorrection(chosen, level);
    this.#canvas.autoCorrect = amount > 0;
    this.#canvas.correction = amount;
    this.#canvas.templates = templatesFromGlyphs(glyphLibrary.list());
    const label = { apprentice: 'Aprendiz', artisan: 'Artesano', master: 'Maestro' }[/** @type {'apprentice'} */ (level)];
    const limited = chosen > CORRECTION_LIMITS[/** @type {'apprentice'} */ (level)];
    /** @type {HTMLElement} */ (this.querySelector('.practice__correction')).textContent =
      amount === 0
        ? 'Corrección de los trazos: desactivada (Ajustes).'
        : `Corrección de los trazos: ${Math.round(amount * 100)} %${limited ? ` (máximo del nivel ${label})` : ''}.`;
  }

  #updateHint() {
    const hint = /** @type {HTMLElement} */ (this.querySelector('.stage__hint'));
    const empty = this.#canvas.strokeCount === 0 && !this.#canvas.isDrawing;
    hint.hidden = !empty || this.#input.mode === 'demo' || Boolean(this.#canvas.guide && this.#canvas.guideStyle !== 'none');
    hint.textContent =
      this.#defaultHint ||
      (this.#input.mode === 'camera'
        ? 'Levanta el índice y traza en el aire: más grande, más fuerte'
        : 'Dibuja aquí con el ratón o el dedo, o activa la cámara');
  }

  /** @param {string} text */
  #setStatus(text) {
    this.#status.textContent = text;
  }

  /** @returns {GcSusurro | null} */
  #whisper() {
    return document.querySelector('gc-whisper');
  }

  // ── Herramientas de desarrollo ────────────────────────────

  /** @param {KeyboardEvent} event */
  #onKey = (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
    if (target?.isContentEditable || event.altKey || event.metaKey || event.repeat) return;
    const key = event.key.toLowerCase();
    // Ctrl+Z también deshace, como en cualquier editor.
    if (event.ctrlKey) {
      if (key === 'z') {
        event.preventDefault();
        this.#canvas.undo();
      }
      return;
    }
    switch (key) {
      case 's':
        if (this.seal()) audio.play('seal');
        break;
      case 'z':
        if (this.#canvas.undo()) this.announce('Último trazo deshecho.');
        break;
      case 'x':
      case 'delete':
        this.#canvas.clear().then((done) => done && this.announce('Lienzo borrado.'));
        break;
      case 'c':
        /** @type {HTMLElement} */ (this.querySelector('.action-camera')).dispatchEvent(
          new CustomEvent('rune-activate', { bubbles: true, composed: true }),
        );
        break;
      case 'd':
        this.#toggleStats();
        break;
      case 'r':
        this.#toggleRecording();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  #toggleStats() {
    this.#stats.hidden = !this.#stats.hidden;
    clearInterval(this.#statsTimer);
    if (this.#stats.hidden) return;
    const update = () => {
      const { fps, inferenceMs, backend } = this.#input.stats;
      this.#stats.innerHTML = `
        <div><dt>Fuente</dt><dd>${this.#input.mode}${backend ? ` · ${backend}` : ''}</dd></div>
        <div><dt>Análisis</dt><dd>${fps.toFixed(0)} fps</dd></div>
        <div><dt>Inferencia</dt><dd>${inferenceMs.toFixed(1)} ms</dd></div>
        <div><dt>Gesto</dt><dd>${this.#input.engine.state}</dd></div>`;
    };
    update();
    this.#statsTimer = window.setInterval(update, 500);
  }

  #toggleRecording() {
    if (this.#input.mode !== 'camera') return;
    const session = this.#input.toggleRecording();
    if (!session) {
      this.#setStatus('● Grabando la sesión de manos… pulsa R para terminar.');
      return;
    }
    const blob = new Blob([JSON.stringify(session)], { type: 'application/json' });
    const link = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `glyphcraft-sesion-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`,
    });
    link.click();
    URL.revokeObjectURL(link.href);
    this.#setStatus(`Sesión guardada (${session.frames.length} fotogramas).`);
  }

  /** @param {Event} event */
  #onCameraError = (event) => {
    const { reason, message } = /** @type {CustomEvent} */ (event).detail;
    this.#camera.hidden = true;
    // Si no hay permiso o no hay cámara, no se vuelve a intentar al entrar.
    if (['denied', 'notfound', 'insecure'].includes(reason)) settings.set('camera.enabled', false);
    this.#setStatus(message ?? CAMERA_ERROR_MESSAGES.unknown);
    this.#whisper()?.show({
      type: 'error',
      title: reason === 'denied' ? 'Permiso de cámara denegado' : 'Cámara no disponible',
      message: `${message} Mientras tanto puedes dibujar con el ratón o ver la demostración.`,
      duration: 9000,
    });
  };
}
