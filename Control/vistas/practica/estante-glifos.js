import { glyphLibrary } from 'glyphcraft-kit/nucleo';
import { progressStore } from '../../servicios/servicios-app.js';

/** @typedef {import('glyphcraft-kit').GcGlifo} GcGlifo */
/** @typedef {import('glyphcraft-kit/nucleo').Glyph} Glyph */

/**
 * Estante de glifos (`<gc-glyph-shelf>`): columna con los glifos en pequeño
 * para tener a la vista la forma que hay que dibujar.
 *
 * Dos modos (atributo `mode`):
 * - `reference` (Practicar magia y Laboratorio): solo los glifos practicados
 *   al menos una vez en el grimorio. Pulsar uno lo marca (`aria-pressed`) y
 *   reproduce su trazado; la vista muestra su guía sobre el círculo.
 * - `navigate` (práctica guiada): todos los glifos; pulsar uno cambia de
 *   glifo sin salir de la práctica. El actual se marca con `current`.
 *
 * No sabe qué hacer con la elección: emite `glyph-pick` (`{ glyphId, selected }`)
 * y la vista decide.
 *
 * @fires glyph-pick - `{ glyphId: string, selected: boolean }`
 */
export class EstanteGlifos extends HTMLElement {
  /** @type {string | null} */
  #selected = null;
  /** @type {AbortController | null} */
  #listeners = null;

  connectedCallback() {
    this.#listeners = new AbortController();
    const { signal } = this.#listeners;
    this.addEventListener('click', this.#onClick, { signal });
    progressStore.addEventListener('change', () => this.#render(), { signal });
    glyphLibrary.addEventListener('change', () => this.#render(), { signal });
    this.#render();
  }

  disconnectedCallback() {
    this.#listeners?.abort();
  }

  /** @returns {'reference' | 'navigate'} */
  get mode() {
    return this.getAttribute('mode') === 'navigate' ? 'navigate' : 'reference';
  }

  /** Glifo actual (modo `navigate`). */
  get current() {
    return this.getAttribute('current');
  }
  set current(value) {
    if (value) this.setAttribute('current', value);
    else this.removeAttribute('current');
    this.#syncState();
  }

  /** Glifo marcado como referencia (modo `reference`), o `null`. */
  get selected() {
    return this.#selected;
  }
  set selected(value) {
    this.#selected = value;
    this.#syncState();
  }

  /** Glifos que se muestran según el modo. */
  #glyphs() {
    const all = glyphLibrary.list();
    if (this.mode === 'navigate') return all;
    return all.filter((g) => progressStore.get(g.id).attempts > 0 || progressStore.isLearned(g.id));
  }

  #render() {
    const glyphs = this.#glyphs();
    const navigate = this.mode === 'navigate';
    this.className = 'shelf';
    this.setAttribute('role', 'region');
    this.setAttribute('aria-label', navigate ? 'Cambiar de glifo' : 'Formas de los glifos');
    if (this.#selected && !glyphs.some((g) => g.id === this.#selected)) this.#selected = null;

    const title = navigate ? 'Glifos' : 'Tus glifos';
    if (!glyphs.length) {
      this.innerHTML = `
        <h2 class="shelf__title">${title}</h2>
        <p class="shelf__empty">Aquí aparecerán los glifos que practiques en el <a href="#/grimoire">grimorio</a>.</p>`;
      return;
    }
    this.innerHTML = `
      <h2 class="shelf__title">${title}</h2>
      <p class="shelf__hint">${navigate ? 'Elige otro para practicarlo.' : 'Pulsa uno para ver su forma en el círculo.'}</p>
      <ul class="shelf__list"></ul>`;
    const list = /** @type {HTMLElement} */ (this.querySelector('.shelf__list'));
    for (const glyph of glyphs) {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'shelf__item';
      button.dataset.glyph = glyph.id;
      button.innerHTML = '<gc-glyph size="46" aria-hidden="true"></gc-glyph><span class="shelf__name"></span><span class="shelf__status"></span>';
      /** @type {GcGlifo} */ (button.querySelector('gc-glyph')).glyph = glyph;
      /** @type {HTMLElement} */ (button.querySelector('.shelf__name')).textContent = glyph.name;
      const learned = progressStore.isLearned(glyph.id);
      const status = /** @type {HTMLElement} */ (button.querySelector('.shelf__status'));
      status.textContent = learned ? '✦' : '';
      status.title = learned ? 'Aprendido' : '';
      button.setAttribute('aria-label', `${glyph.name}${learned ? ', aprendido' : ''}`);
      li.append(button);
      list.append(li);
    }
    this.#syncState();
  }

  #syncState() {
    for (const button of /** @type {NodeListOf<HTMLButtonElement>} */ (this.querySelectorAll('.shelf__item'))) {
      const id = button.dataset.glyph;
      if (this.mode === 'navigate') {
        const current = id === this.current;
        button.classList.toggle('is-current', current);
        if (current) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      } else {
        const pressed = id === this.#selected;
        button.setAttribute('aria-pressed', String(pressed));
        button.classList.toggle('is-current', pressed);
      }
    }
  }

  /** @param {MouseEvent} event */
  #onClick = (event) => {
    const button = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('.shelf__item'));
    const id = button?.dataset.glyph;
    if (!button || !id) return;
    if (this.mode === 'navigate') {
      if (id === this.current) return;
      this.dispatchEvent(new CustomEvent('glyph-pick', { detail: { glyphId: id, selected: true }, bubbles: true }));
      return;
    }
    this.#selected = this.#selected === id ? null : id;
    this.#syncState();
    if (this.#selected) /** @type {GcGlifo} */ (button.querySelector('gc-glyph')).playTrace?.();
    this.dispatchEvent(new CustomEvent('glyph-pick', { detail: { glyphId: id, selected: this.#selected === id }, bubbles: true }));
  };
}
