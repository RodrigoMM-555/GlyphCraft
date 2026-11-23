import { NAMED_COMBINATIONS, combinationId } from './logros.js';

/**
 * Qué hechizo se lanza y con cuánta fuerza.
 *
 * Funciones puras compartidas por «Practicar magia» y el laboratorio.
 */

/** @typedef {import('glyphcraft-kit/nucleo').Glyph} Glyph */

/** Radio (relativo al lienzo) de un glifo de tamaño normal: potencia 1. */
export const REFERENCE_RADIUS = 0.3;
export const MIN_POWER = 0.4;
export const MAX_POWER = 1.8;

/**
 * Potencia según el tamaño del círculo dibujado: cuanto más grande el
 * glifo, más fuerte el hechizo. Crece algo más deprisa que el radio.
 *
 * | Radio en el lienzo | 0,15 | 0,2  | 0,3 | 0,4  | 0,48 |
 * |--------------------|------|------|-----|------|------|
 * | Potencia           | 0,4  | 0,61 | 1   | 1,41 | 1,76 |
 *
 * @param {number} radius Radio del círculo, relativo al lado del lienzo (0-0,5).
 */
export function glyphPower(radius) {
  if (!Number.isFinite(radius) || radius <= 0) return MIN_POWER;
  return Math.min(MAX_POWER, Math.max(MIN_POWER, (radius / REFERENCE_RADIUS) ** 1.2));
}

/**
 * Nombre de la potencia para mostrarla.
 * @param {number} power
 */
export function powerLabel(power) {
  if (power < 0.6) return 'Chispa';
  if (power < 0.9) return 'Menor';
  if (power < 1.2) return 'Normal';
  if (power < 1.5) return 'Mayor';
  return 'Suprema';
}

/**
 * Hechizos que hay que lanzar para unos glifos.
 *
 * - Un glifo: su propio hechizo.
 * - Una combinación con nombre: **su hechizo combinado** (único).
 * - Cualquier otra mezcla: los hechizos de cada glifo unidos por la «fusión arcana».
 *
 * @param {Glyph[]} glyphs
 * @returns {{ spells: string[], combo: { id: string, name: string, text: string, spell: string } | null }}
 */
export function spellsFor(glyphs) {
  const own = glyphs.map((g) => g.effect?.spell).filter((id) => typeof id === 'string');
  if (glyphs.length < 2) return { spells: /** @type {string[]} */ (own), combo: null };
  const id = combinationId(glyphs.map((g) => g.id));
  const named = NAMED_COMBINATIONS[id];
  if (named) return { spells: [named.spell], combo: { id, ...named } };
  return { spells: [.../** @type {string[]} */ (own), 'fusion'], combo: null };
}
