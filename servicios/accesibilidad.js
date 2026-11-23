/**
 * Accesibilidad: aplica a toda la página los ajustes de la sección
 * «Accesibilidad» y ofrece lectura en voz alta.
 *
 * - `a11y.textScale`: escala el tamaño de letra (todo el diseño usa `rem`).
 * - `a11y.highContrast`: `data-contrast="high"` en `<html>` (ver estilo.css).
 * - `a11y.reduceMotion`: reduce el movimiento aunque el sistema operativo no
 *   lo pida. Los componentes del kit consultan
 *   `matchMedia('(prefers-reduced-motion: reduce)')`; esa consulta se
 *   envuelve para que también responda a este ajuste, así **todos** los
 *   componentes lo respetan sin cambiar su código.
 * - `a11y.speak`: lee en voz alta los resultados importantes (`speak()`),
 *   útil cuando se dibuja lejos de la pantalla.
 */

const MOTION_QUERY = /prefers-reduced-motion\s*:\s*reduce/;

/** @type {import('./ajustes.js').AlmacenAjustes | null} */
let store = null;
let forcedReducedMotion = false;
/** @type {Set<{ fire: () => void }>} */
const motionQueries = new Set();

/**
 * Envuelve `window.matchMedia` una sola vez: para la consulta de movimiento
 * reducido devuelve un objeto que también tiene en cuenta el ajuste.
 */
function patchMatchMedia() {
  const native = window.matchMedia.bind(window);
  window.matchMedia = (query) => {
    const list = native(query);
    if (!MOTION_QUERY.test(query)) return list;
    /** @type {Set<EventListenerOrEventListenerObject>} */
    const listeners = new Set();
    const wrapper = {
      media: list.media,
      get matches() {
        return forcedReducedMotion || list.matches;
      },
      /** @type {((this: MediaQueryList, ev: MediaQueryListEvent) => any) | null} */
      onchange: null,
      addEventListener(/** @type {string} */ type, /** @type {EventListenerOrEventListenerObject} */ fn) {
        if (type === 'change') listeners.add(fn);
      },
      removeEventListener(/** @type {string} */ type, /** @type {EventListenerOrEventListenerObject} */ fn) {
        if (type === 'change') listeners.delete(fn);
      },
      addListener(/** @type {EventListenerOrEventListenerObject} */ fn) {
        listeners.add(fn);
      },
      removeListener(/** @type {EventListenerOrEventListenerObject} */ fn) {
        listeners.delete(fn);
      },
      dispatchEvent: () => true,
      fire() {
        const event = Object.assign(new Event('change'), { matches: wrapper.matches, media: list.media });
        for (const fn of listeners) typeof fn === 'function' ? fn.call(wrapper, event) : fn.handleEvent(event);
        /** @type {any} */ (wrapper.onchange)?.call(wrapper, event);
      },
    };
    list.addEventListener('change', () => wrapper.fire());
    motionQueries.add(wrapper);
    return /** @type {MediaQueryList} */ (/** @type {unknown} */ (wrapper));
  };
}

function apply() {
  if (!store) return;
  const root = document.documentElement;
  root.style.setProperty('--gc-text-scale', String(store.get('a11y.textScale')));
  root.dataset.contrast = store.get('a11y.highContrast') ? 'high' : 'normal';
  const reduce = Boolean(store.get('a11y.reduceMotion'));
  root.dataset.motion = reduce ? 'reduce' : 'auto';
  if (reduce !== forcedReducedMotion) {
    forcedReducedMotion = reduce;
    for (const query of motionQueries) query.fire();
  }
  if (!store.get('a11y.speak')) window.speechSynthesis?.cancel();
}

/**
 * Empieza a aplicar los ajustes de accesibilidad (y a seguir sus cambios).
 * @param {import('./ajustes.js').AlmacenAjustes} settings
 */
export function startAccessibility(settings) {
  if (store) return;
  store = settings;
  patchMatchMedia();
  settings.addEventListener('change', apply);
  apply();
}

/**
 * Lee un texto en voz alta si la persona lo ha pedido en Ajustes.
 * Interrumpe la lectura anterior para no acumular mensajes.
 * @param {string} text
 */
export function speak(text) {
  if (!store?.get('a11y.speak') || !text || !('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';
  utterance.rate = 1.05;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}
