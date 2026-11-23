import { describe, expect, it } from '../../../pruebas/ejecutor.js';
import { correctStroke, templatesFromGlyphs } from './correccion.js';
import { fitCircle, signedArea, pathLength } from './trazo.js';
import { createGlyph, placeGlyph } from '../glifos/modelo-glifo.js';
import { ReconocedorGlifos } from '../reconocimiento/reconocedor-glifos.js';
import { STARTER_GLYPHS } from '../../glifos/glifos-iniciales.js';
import { drawGlyphLike, seededRandom } from '../../sinteticos/glifo-sintetico.js';

/** @typedef {{ x: number, y: number }} Point */

/** Añade temblor a unos puntos. */
const shaky = (/** @type {Point[]} */ points, amount = 0.006, seed = 1) => {
  const random = seededRandom(seed);
  return points.map((p) => ({ x: p.x + (random() - 0.5) * 2 * amount, y: p.y + (random() - 0.5) * 2 * amount }));
};
const circle = (cx = 0.5, cy = 0.5, r = 0.3, turns = 1, n = 80) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2 * turns;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
const polygon = (/** @type {[number, number][]} */ corners) => {
  /** @type {Point[]} */
  const out = [];
  const closedCorners = [...corners, corners[0]];
  for (let i = 1; i < closedCorners.length; i++) {
    const [ax, ay] = closedCorners[i - 1];
    const [bx, by] = closedCorners[i];
    for (let s = 0; s < 20; s++) out.push({ x: ax + ((bx - ax) * s) / 20, y: ay + ((by - ay) * s) / 20 });
  }
  out.push({ x: corners[0][0], y: corners[0][1] });
  return out;
};
const glyphs = STARTER_GLYPHS.map(createGlyph);
const byId = (/** @type {string} */ id) => /** @type {import('../glifos/modelo-glifo.js').Glyph} */ (glyphs.find((g) => g.id === id));

describe('correctStroke · figuras', () => {
  it('ignora entradas degeneradas', () => {
    expect(correctStroke([])).toBeNull();
    expect(correctStroke([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }])).toBeNull();
    // @ts-expect-error
    expect(correctStroke('trazo')).toBeNull();
  });

  it('convierte un círculo tembloroso en una circunferencia perfecta', () => {
    const result = correctStroke(shaky(circle(), 0.01));
    expect(result?.kind).toBe('circle');
    const fit = /** @type {import('./trazo.js').CircleFit} */ (fitCircle(/** @type {Point[]} */ (result?.points)));
    expect(fit.residual).toBeLessThan(0.002);
    expect(fit.r).toBeCloseTo(0.3, 1);
  });

  it('un círculo con ondulaciones (pulso irregular) sigue siendo un círculo, no un polígono', () => {
    for (const [lobes, amount] of [[9, 0.025], [5, 0.03], [4, 0.04], [12, 0.02]]) {
      const wavy = circle().map((p, i, all) => {
        const t = (i / (all.length - 1)) * Math.PI * 2;
        const k = 1 + (amount / 0.3) * Math.sin(t * lobes);
        return { x: 0.5 + (p.x - 0.5) * k, y: 0.5 + (p.y - 0.5) * k };
      });
      expect(correctStroke(wavy)?.kind, `${lobes} ondulaciones`).toBe('circle');
    }
  });

  it('cierra un círculo al que le falta un trozo', () => {
    const open = circle().slice(0, 70);
    const result = /** @type {import('./correccion.js').StrokeCorrection} */ (correctStroke(shaky(open)));
    expect(result.kind).toBe('circle');
    const [first, last] = [result.points[0], result.points[result.points.length - 1]];
    expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeLessThan(0.01);
  });

  it('endereza una línea casi recta y la deja horizontal si casi lo es', () => {
    const line = Array.from({ length: 30 }, (_, i) => ({ x: 0.2 + i * 0.02, y: 0.5 + i * 0.0006 }));
    const result = /** @type {import('./correccion.js').StrokeCorrection} */ (correctStroke(shaky(line, 0.004)));
    expect(result.kind).toBe('line');
    expect(result.points[0].y).toBeCloseTo(result.points[result.points.length - 1].y, 5);
  });

  it('regulariza un triángulo y un hexágono', () => {
    const triangle = correctStroke(shaky(polygon([[0.5, 0.2], [0.78, 0.7], [0.21, 0.68]]), 0.006));
    expect(triangle?.kind).toBe('polygon');
    expect(triangle?.vertices).toBe(3);
    expect(triangle?.regular).toBe(true);
    const hexagon = correctStroke(
      shaky(polygon(Array.from({ length: 6 }, (_, i) => /** @type {[number, number]} */ ([0.5 + 0.3 * Math.cos(-Math.PI / 2 + (i * Math.PI) / 3), 0.5 + 0.3 * Math.sin(-Math.PI / 2 + (i * Math.PI) / 3)]))), 0.005),
    );
    expect(hexagon?.kind).toBe('polygon');
    expect(hexagon?.vertices).toBe(6);
  });

  it('reconoce espirales, ondas y zigzags', () => {
    const [, spiral] = placeGlyph(byId('ventus'));
    const [, wave] = placeGlyph(byId('aqua'));
    const [, bolt] = placeGlyph(byId('fulgur'));
    expect(correctStroke(shaky(spiral, 0.004))?.kind).toBe('spiral');
    expect(correctStroke(shaky(wave, 0.004))?.kind).toBe('wave');
    expect(correctStroke(shaky(bolt, 0.004))?.kind).toBe('polyline');
  });

  it('una figura curva que no es ninguna de las anteriores solo se suaviza', () => {
    const [, moon] = placeGlyph(byId('umbra'));
    expect(correctStroke(shaky(moon, 0.004))?.kind).toBe('smooth');
  });

  it('conserva el inicio y el sentido del trazo', () => {
    const reversed = [...circle()].reverse();
    for (const input of [circle(), reversed]) {
      const result = /** @type {import('./correccion.js').StrokeCorrection} */ (correctStroke(shaky(input)));
      expect(Math.sign(signedArea(result.points))).toBe(Math.sign(signedArea(input)));
      expect(Math.hypot(result.points[0].x - input[0].x, result.points[0].y - input[0].y)).toBeLessThan(0.03);
    }
  });

  it('devuelve el número de puntos pedido', () => {
    expect(correctStroke(circle(), { samples: 40 })?.points).toHaveLength(40);
  });
});

describe('correctStroke · con el reconocedor', () => {
  it('corregir los trazos no empeora (en conjunto) la nota de ningún glifo', () => {
    const recognizer = new ReconocedorGlifos();
    for (const glyph of glyphs) {
      let before = 0;
      let after = 0;
      for (let seed = 1; seed <= 4; seed++) {
        const strokes = drawGlyphLike(glyph, { seed, wobble: 0.05 });
        const corrected = strokes.map((s) => ({ points: correctStroke(s.points)?.points ?? s.points }));
        before += recognizer.evaluate(strokes, glyph).score;
        after += recognizer.evaluate(corrected, glyph).score;
        expect(recognizer.classify(corrected, glyphs)[0].glyph.id, glyph.id).toBe(glyph.id);
        expect(pathLength(corrected[0].points)).toBeGreaterThan(0);
      }
      expect(after, glyph.id).toBeGreaterThan(before - 25);
    }
  });
});

describe('correctStroke · símbolos del grimorio', () => {
  const templates = templatesFromGlyphs(glyphs);

  it('templatesFromGlyphs: trazos interiores sin líneas ni círculos', () => {
    const ids = templates.map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(['ignis:1', 'umbra:1', 'fulgur:1', 'ventus:1', 'aqua:1']));
    expect(ids.some((id) => id.startsWith('glacies'))).toBe(false); // solo líneas y círculo
    expect(ids.some((id) => id.endsWith(':0'))).toBe(false); // nunca el círculo exterior
  });

  it('una luna «pocha» se vuelve exactamente la luna de Umbra, donde se dibujó', () => {
    const umbra = byId('umbra');
    for (let seed = 1; seed <= 4; seed++) {
      const [, moon] = drawGlyphLike(umbra, { cx: 0.4, cy: 0.6, r: 0.25, wobble: 0.12, seed });
      const result = /** @type {import('./correccion.js').StrokeCorrection} */ (correctStroke(moon.points, { templates }));
      expect(result.kind, `semilla ${seed}`).toBe('template');
      expect(result.template).toBe('umbra:1');
      // Es la luna del glifo: coincide con su trazo modelo colocado en ese sitio.
      const [, ideal] = placeGlyph(umbra, { cx: 0.4, cy: 0.6, r: 0.25 });
      const far = Math.max(...result.points.map((p) => Math.min(...ideal.map((q) => Math.hypot(p.x - q.x, p.y - q.y)))));
      expect(far).toBeLessThan(0.05); // misma forma; la posición sale de la caja de lo dibujado
    }
  });

  it('el rayo, las ondas y los polígonos se ajustan al símbolo de su glifo', () => {
    for (const [id, index] of [['fulgur', 1], ['aqua', 1], ['ignis', 1], ['aegis', 1], ['lux', 1], ['ventus', 1]]) {
      const [stroke] = drawGlyphLike(byId(/** @type {string} */ (id)), { wobble: 0.06, seed: 2 }).slice(/** @type {number} */ (index));
      expect(correctStroke(stroke.points, { templates })?.template, /** @type {string} */ (id)).toMatch(new RegExp(`^${id}:`));
    }
  });

  it('los círculos y las líneas no se convierten en símbolos', () => {
    expect(correctStroke(shaky(circle(), 0.01), { templates })?.kind).toBe('circle');
    const line = Array.from({ length: 30 }, (_, i) => ({ x: 0.5 + Math.sin(i) * 0.006, y: 0.2 + i * 0.02 }));
    expect(correctStroke(line, { templates })?.kind).toBe('line');
  });

  it('strength: 0,5 deja el trazo a medio camino; 0, tal cual', () => {
    const input = shaky(circle(), 0.02, 3);
    const full = /** @type {import('./correccion.js').StrokeCorrection} */ (correctStroke(input, { samples: 48 }));
    const half = /** @type {import('./correccion.js').StrokeCorrection} */ (correctStroke(input, { samples: 48, strength: 0.5 }));
    const none = /** @type {import('./correccion.js').StrokeCorrection} */ (correctStroke(input, { samples: 48, strength: 0 }));
    const fit = (/** @type {Point[]} */ pts) => /** @type {import('./trazo.js').CircleFit} */ (fitCircle(pts)).residual;
    expect(fit(full.points)).toBeLessThan(fit(half.points));
    expect(fit(half.points)).toBeLessThan(fit(none.points));
  });
});
