import { ReconocedorGlifos, glyphLibrary, detectElements } from 'glyphcraft-kit/nucleo';
import { viewHeader } from '../marco-vista.js';
import { settings, progressStore, audio, sigmaFromTolerance } from '../../servicios/servicios-app.js';
import { glyphPower, powerLabel, spellsFor } from '../../servicios/hechizos.js';
import { NAMED_COMBINATIONS } from '../../servicios/logros.js';

/** @typedef {import('./estacion-lanzamiento.js').EstacionLanzamiento} EstacionLanzamiento */
/** @typedef {import('glyphcraft-kit').GcGlifo} GcGlifo */
/** @typedef {import('glyphcraft-kit').GcMedidorArcano} GcMedidorArcano */
/** @typedef {import('glyphcraft-kit').GcSusurro} GcSusurro */

/**
 * Practicar magia: lanzamiento libre.
 *
 * Se dibuja sin guía; al sellar, el reconocedor busca cuál de los glifos
 * del grimorio se ha trazado. Solo se pueden lanzar los glifos aprendidos.
 *
 * Si el dibujo no es un glifo suelto, se busca una **combinación**: dos o
 * tres símbolos aprendidos dentro del mismo círculo lanzan su hechizo
 * combinado (como en el laboratorio).
 *
 * La potencia depende del tamaño del círculo: cuanto más grande, más fuerte.
 */
export class VistaPractica extends HTMLElement {
  /** @type {EstacionLanzamiento} */ #station = /** @type {any} */ (null);
  /** @type {AbortController | null} */ #listeners = null;

  connectedCallback() {
    if (!this.childElementCount) this.#render();
    this.#listeners = new AbortController();
    const { signal } = this.#listeners;
    this.#station.addEventListener('glyph-sealed', this.#onSealed, { signal });
    progressStore.addEventListener('change', () => this.#renderKnown(), { signal });
    this.#renderKnown();
  }

  disconnectedCallback() {
    this.#listeners?.abort();
  }

  #render() {
    this.className = 'view view--practice';
    this.innerHTML = `
      ${viewHeader({
        kicker: 'Círculo de lanzamiento',
        title: 'Practicar magia',
        intro:
          'Traza de memoria un glifo aprendido —o combina dos dentro del mismo círculo— y séllalo. Cuanto más grande el círculo, más poderoso el hechizo.',
      })}
      <gc-casting-station></gc-casting-station>`;
    this.#station = /** @type {EstacionLanzamiento} */ (this.querySelector('gc-casting-station'));
    this.#station.extras.innerHTML = `
      <section class="cast-result" hidden aria-label="Resultado del lanzamiento">
        <gc-glyph class="cast-result__glyph" size="72"></gc-glyph>
        <div>
          <p class="kicker cast-result__kicker"></p>
          <p class="cast-result__name"></p>
          <p class="cast-result__message"></p>
        </div>
        <gc-arcane-meter class="cast-result__score" label="Precisión"></gc-arcane-meter>
        <p class="cast-result__power" hidden></p>
      </section>
      <div class="cast-known"></div>`;
  }

  /** Lista de glifos que se pueden lanzar. */
  #renderKnown() {
    const known = /** @type {HTMLElement} */ (this.querySelector('.cast-known'));
    const learned = glyphLibrary.list().filter((g) => progressStore.isLearned(g.id));
    if (!learned.length) {
      known.innerHTML = `
        <p>Aún no has aprendido ningún glifo. Estúdialos en el grimorio: cada uno queda aprendido tras trazarlo bien tres veces.</p>
        <gc-rune-button rune="grimoire" size="sm" data-nav="/grimoire">Abrir el grimorio</gc-rune-button>`;
      return;
    }
    known.innerHTML = `<p class="kicker">Glifos que dominas</p><ul class="cast-known__list"></ul>`;
    const list = /** @type {HTMLElement} */ (known.querySelector('ul'));
    for (const glyph of learned) {
      const li = document.createElement('li');
      li.innerHTML = '<gc-glyph size="34"></gc-glyph><span></span>';
      /** @type {GcGlifo} */ (li.querySelector('gc-glyph')).glyphId = glyph.id;
      /** @type {HTMLElement} */ (li.querySelector('span')).textContent = glyph.name;
      list.append(li);
    }

    // Combinaciones con nombre que ya se pueden lanzar (todos sus glifos aprendidos).
    const learnedIds = new Set(learned.map((g) => g.id));
    const combos = Object.entries(NAMED_COMBINATIONS).filter(([id]) => id.split('+').every((g) => learnedIds.has(g)));
    if (!combos.length) return;
    const details = document.createElement('details');
    details.className = 'cast-combos';
    details.innerHTML = `<summary>Combinaciones disponibles (${combos.length})</summary><ul></ul>`;
    const ul = /** @type {HTMLElement} */ (details.querySelector('ul'));
    for (const [id, combo] of combos) {
      const li = document.createElement('li');
      const parts = id.split('+').map((g) => glyphLibrary.get(g)?.name ?? g).join(' + ');
      li.innerHTML = '<strong></strong> <span></span>';
      /** @type {HTMLElement} */ (li.querySelector('strong')).textContent = combo.name;
      /** @type {HTMLElement} */ (li.querySelector('span')).textContent = `· ${parts}`;
      ul.append(li);
    }
    known.append(details);
  }

  /** @param {Event} event */
  #onSealed = async (event) => {
    const { strokes } = /** @type {CustomEvent} */ (event).detail;
    const recognizer = new ReconocedorGlifos({ sigma: sigmaFromTolerance(settings.get('recognition.tolerance')) });
    const [best] = recognizer.classify(strokes, glyphLibrary.list());
    if (!best) return;
    const { glyph, result } = best;
    const panel = /** @type {HTMLElement} */ (this.querySelector('.cast-result'));
    const $ = (/** @type {string} */ s) => /** @type {HTMLElement} */ (panel.querySelector(s));
    const meter = /** @type {GcMedidorArcano} */ ($('.cast-result__score'));
    panel.hidden = false;
    $('.cast-result__power').hidden = true;

    if (!result.passed) {
      // ¿Es una combinación de varios símbolos en el mismo círculo?
      const combination = detectElements(strokes, glyphLibrary.list());
      if (combination.elements.length >= 2 && combination.transform) {
        await this.#castCombination(combination.elements, combination.transform);
        return;
      }
      audio.play('fail');
      panel.dataset.outcome = 'fail';
      /** @type {GcGlifo} */ ($('.cast-result__glyph')).glyph = null;
      $('.cast-result__kicker').textContent = 'Sin respuesta';
      $('.cast-result__name').textContent = 'El círculo permanece en silencio';
      $('.cast-result__message').textContent =
        result.score > 35 ? `Se parece un poco a ${glyph.name}. ${result.summary}` : result.summary;
      meter.setValue(result.score);
      this.#station.announce(`Sin respuesta. ${$('.cast-result__message').textContent}`);
      return;
    }

    /** @type {GcGlifo} */ ($('.cast-result__glyph')).glyph = glyph;
    $('.cast-result__name').textContent = glyph.name;
    meter.setValue(result.score);

    if (!progressStore.isLearned(glyph.id)) {
      panel.dataset.outcome = 'unlearned';
      $('.cast-result__kicker').textContent = 'Glifo reconocido';
      $('.cast-result__message').innerHTML = '';
      $('.cast-result__message').append(
        `Reconozco ${glyph.name}, pero aún no lo has aprendido. `,
        Object.assign(document.createElement('a'), { href: `#/grimoire/${glyph.id}`, textContent: 'Estúdialo en el grimorio.' }),
      );
      this.#station.setFeedback(result.strokes.map((s) => s.grade));
      this.#station.announce(`Reconozco ${glyph.name}, pero aún no lo has aprendido.`);
      return;
    }

    panel.dataset.outcome = 'cast';
    $('.cast-result__kicker').textContent = 'Hechizo lanzado';
    $('.cast-result__message').textContent = result.summary;
    progressStore.recordCast(glyph.id);
    if (!result.transform) return;
    const power = glyphPower(result.transform.r);
    this.#showPower(power);
    this.#station.announce(`${glyph.name} lanzado. Precisión ${result.score}. Potencia ${powerLabel(power).toLowerCase()}.`);
    await this.#station.activate(glyph, result.transform, { score: result.score, power });
  };

  /**
   * Lanza una combinación de glifos (solo si todos están aprendidos).
   * @param {import('glyphcraft-kit/nucleo').Glyph[]} glyphs
   * @param {{ cx: number, cy: number, r: number }} transform
   */
  async #castCombination(glyphs, transform) {
    const panel = /** @type {HTMLElement} */ (this.querySelector('.cast-result'));
    const $ = (/** @type {string} */ s) => /** @type {HTMLElement} */ (panel.querySelector(s));
    const names = glyphs.map((g) => g.name).join(' + ');
    const { spells, combo } = spellsFor(glyphs);
    /** @type {GcGlifo} */ ($('.cast-result__glyph')).glyph = glyphs[0];
    /** @type {GcMedidorArcano} */ ($('.cast-result__score')).setValue(85);
    $('.cast-result__name').textContent = combo?.name ?? names;

    const missing = glyphs.filter((g) => !progressStore.isLearned(g.id));
    if (missing.length) {
      audio.play('fail');
      panel.dataset.outcome = 'unlearned';
      $('.cast-result__kicker').textContent = 'Combinación reconocida';
      $('.cast-result__message').textContent = `Para lanzarla aquí, aprende antes ${missing.map((g) => g.name).join(' y ')}. En el laboratorio puedes probarla sin aprender.`;
      this.#station.announce(`Combinación ${names} reconocida, pero falta aprender ${missing.map((g) => g.name).join(' y ')}.`);
      return;
    }

    panel.dataset.outcome = 'cast';
    $('.cast-result__kicker').textContent = combo ? 'Hechizo combinado' : 'Fusión arcana';
    $('.cast-result__message').textContent = combo ? `${names}. ${combo.text}` : `${names}: una mezcla sin nombre.`;
    glyphs.forEach((g) => progressStore.recordCast(g.id));
    if (combo) progressStore.recordDiscovery(combo.id);
    const power = glyphPower(transform.r);
    this.#showPower(power);
    this.#station.announce(`${combo?.name ?? 'Fusión arcana'} lanzado: ${names}. Potencia ${powerLabel(power).toLowerCase()}.`);
    await this.#station.activate(glyphs, transform, { score: 85, spells, power });
  }

  /** @param {number} power */
  #showPower(power) {
    const label = /** @type {HTMLElement} */ (this.querySelector('.cast-result__power'));
    label.hidden = false;
    label.textContent = `Potencia ${powerLabel(power).toLowerCase()} · ${Math.round(power * 100)} %`;
    label.dataset.level = power >= 1.5 ? 'high' : power < 0.9 ? 'low' : 'normal';
  }
}
