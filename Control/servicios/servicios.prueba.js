import { describe, expect, it } from '../pruebas/ejecutor.js';
import {
  calibrationToZone,
  calibrationFromPath,
  mapToCanvas,
  isCalibration,
  DEFAULT_CALIBRATION,
  zoneFromSize,
  activeZone,
} from './calibracion.js';
import { effectiveCorrection, CORRECTION_LIMITS, migrate } from './ajustes.js';
import { glyphPower, powerLabel, spellsFor, REFERENCE_RADIUS, MIN_POWER, MAX_POWER } from './hechizos.js';
import { NAMED_COMBINATIONS, combinationId } from './logros.js';
import { createGlyph } from '../glyphcraft-kit/nucleo/glifos/modelo-glifo.js';
import { STARTER_GLYPHS } from '../glyphcraft-kit/glifos/glifos-iniciales.js';

describe('calibración', () => {
  it('la zona predeterminada abarca toda la cámara y es un cuadrado real', () => {
    const zone = calibrationToZone(DEFAULT_CALIBRATION, { imageWidth: 640, imageHeight: 480 });
    expect(zone.x).toBe(0);
    expect(zone.width).toBe(1);
    expect(zone.width * 640).toBeCloseTo(zone.height * 480); // mismo lado en píxeles
    expect(zone.y + zone.height / 2).toBeCloseTo(0.5);
    // Toda la imagen cae dentro del lienzo.
    expect(mapToCanvas({ x: 0, y: 0 }, zone).y).toBeGreaterThan(0);
    expect(mapToCanvas({ x: 1, y: 1 }, zone).y).toBeLessThan(1);
  });

  it('zoneFromSize: cuadrado centrado de la fracción del ancho elegida', () => {
    const half = zoneFromSize(0.5, { imageWidth: 640, imageHeight: 480 });
    expect(half.width).toBeCloseTo(0.5);
    expect(half.width * 640).toBeCloseTo(half.height * 480);
    expect(half.x + half.width / 2).toBeCloseTo(0.5);
    expect(half.y + half.height / 2).toBeCloseTo(0.5);
    // 1 = toda la cámara, igual que la zona predeterminada
    expect(zoneFromSize(1)).toEqual(calibrationToZone(DEFAULT_CALIBRATION));
    expect(zoneFromSize(Number.NaN).width).toBe(1);
  });

  it('activeZone usa la calibración si existe y, si no, el tamaño elegido', () => {
    const calibration = { cx: 0.3, cy: 0.5, size: 0.5 };
    expect(activeZone(calibration, 0.4)).toEqual(calibrationToZone(calibration));
    expect(activeZone(null, 0.4)).toEqual(zoneFromSize(0.4));
  });

  it('una calibración manual es un cuadrado centrado en el círculo trazado', () => {
    const zone = calibrationToZone({ cx: 0.5, cy: 0.5, size: 0.85 }, { imageWidth: 640, imageHeight: 480 });
    expect(zone.height).toBeCloseTo(0.85);
    expect(zone.width * 640).toBeCloseTo(zone.height * 480);
    expect(zone.x + zone.width / 2).toBeCloseTo(0.5);
  });

  it('desplaza la zona para que no se salga de la imagen', () => {
    const zone = calibrationToZone({ cx: 0.05, cy: 0.95, size: 0.6 });
    expect(zone.x).toBe(0);
    expect(zone.y + zone.height).toBeCloseTo(1);
  });

  it('mapToCanvas lleva la zona al lienzo completo, en espejo', () => {
    const zone = { x: 0.25, y: 0.2, width: 0.5, height: 0.6 };
    expect(mapToCanvas({ x: 0.25, y: 0.2 }, zone)).toEqual({ x: 1, y: 0 });
    const corner = mapToCanvas({ x: 0.75, y: 0.8 }, zone, { mirror: false });
    expect(corner.x).toBeCloseTo(1);
    expect(corner.y).toBeCloseTo(1);
    expect(mapToCanvas({ x: 0.5, y: 0.5 }, zone).x).toBeCloseTo(0.5);
  });

  it('calibrationFromPath centra la zona en el círculo trazado y añade margen', () => {
    const circle = Array.from({ length: 40 }, (_, i) => {
      const a = (i / 40) * Math.PI * 2;
      return { x: 0.6 + Math.cos(a) * 0.15, y: 0.45 + Math.sin(a) * 0.2 }; // círculo en píxeles 4:3
    });
    const calibration = calibrationFromPath(circle);
    expect(calibration.cx).toBeCloseTo(0.6, 2);
    expect(calibration.cy).toBeCloseTo(0.45, 2);
    expect(calibration.size).toBeCloseTo(0.4 * 1.5, 2);
  });

  it('rechaza recorridos cortos o diminutos', () => {
    expect(() => calibrationFromPath([{ x: 0.5, y: 0.5 }])).toThrow(RangeError);
    const tiny = Array.from({ length: 20 }, (_, i) => ({ x: 0.5 + i * 0.001, y: 0.5 }));
    expect(() => calibrationFromPath(tiny)).toThrow(RangeError);
  });

  it('isCalibration valida el formato guardado', () => {
    expect(isCalibration(DEFAULT_CALIBRATION)).toBe(true);
    expect(isCalibration({ cx: 0.5, cy: 0.5 })).toBe(false);
    expect(isCalibration(null)).toBe(false);
  });
});


describe('hechizos: potencia y combinaciones', () => {
  it('cuanto más grande el glifo, más potencia (con límites)', () => {
    expect(glyphPower(REFERENCE_RADIUS)).toBeCloseTo(1);
    expect(glyphPower(0.4)).toBeGreaterThan(glyphPower(0.3));
    expect(glyphPower(0.3)).toBeGreaterThan(glyphPower(0.2));
    expect(glyphPower(0.01)).toBe(MIN_POWER);
    expect(glyphPower(5)).toBe(MAX_POWER);
    expect(glyphPower(NaN)).toBe(MIN_POWER);
    expect(powerLabel(0.5)).toBe('Chispa');
    expect(powerLabel(1)).toBe('Normal');
    expect(powerLabel(1.7)).toBe('Suprema');
  });

  it('una combinación con nombre lanza su propio hechizo; otra mezcla, los suyos más la fusión', () => {
    const glyphs = STARTER_GLYPHS.map(createGlyph);
    const byId = (/** @type {string} */ id) => /** @type {any} */ (glyphs.find((g) => g.id === id));
    expect(spellsFor([byId('ignis')])).toEqual({ spells: ['fire'], combo: null });
    const named = spellsFor([byId('ventus'), byId('ignis')]);
    expect(named.spells).toEqual(['tormenta-ignea']);
    expect(named.combo?.name).toBe('Tormenta ígnea');
    const triple = spellsFor([byId('ignis'), byId('aqua'), byId('lux')]);
    expect(triple.combo).toBeNull();
    expect(triple.spells).toEqual(['fire', 'water', 'light', 'fusion']);
  });

  it('cada combinación con nombre usa glifos que existen y un hechizo distinto', () => {
    const ids = new Set(STARTER_GLYPHS.map((g) => g.id));
    const spells = Object.values(NAMED_COMBINATIONS).map((c) => c.spell);
    expect(new Set(spells).size).toBe(spells.length);
    for (const key of Object.keys(NAMED_COMBINATIONS)) {
      expect(key).toBe(combinationId(key.split('+')));
      for (const id of key.split('+')) expect(ids.has(id), `${key}: ${id}`).toBe(true);
    }
  });
});

describe('corrección de los trazos por nivel', () => {
  it('cada nivel limita la corrección: más nivel, menos ayuda', () => {
    expect(CORRECTION_LIMITS.apprentice).toBeGreaterThan(CORRECTION_LIMITS.artisan);
    expect(CORRECTION_LIMITS.artisan).toBeGreaterThan(CORRECTION_LIMITS.master);
    expect(effectiveCorrection(1, 'apprentice')).toBe(1);
    expect(effectiveCorrection(1, 'artisan')).toBe(0.6);
    expect(effectiveCorrection(1, 'master')).toBe(0.3);
    expect(effectiveCorrection(0.2, 'master')).toBe(0.2); // por debajo del máximo, se respeta
    expect(effectiveCorrection(0, 'apprentice')).toBe(0);
  });

  it('migra el antiguo interruptor «corregir los trazos»', () => {
    expect(migrate({ values: { 'drawing.autoCorrect': false } }, null)['drawing.correction']).toBe(0);
    expect(migrate({ values: { 'drawing.autoCorrect': true } }, null)['drawing.correction']).toBe(1);
    expect(migrate({ values: {} }, null)['drawing.correction']).toBe(1);
  });
});
