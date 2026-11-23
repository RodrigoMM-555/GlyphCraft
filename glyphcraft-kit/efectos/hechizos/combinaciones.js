import { Efecto, particles, amount, rand, inDisk, onSphere } from '../efecto.js';
import { iceMaterial, rockMaterial, facetedMaterial } from '../materiales.js';
import {
  at, flick, bolt, glow, shockRing, column, cloud, precipitation, rim, rays, sphere, darkDisc, shards, sparks,
} from './piezas.js';

/**
 * Hechizos combinados.
 *
 * Cuando se combinan dos símbolos en un mismo círculo no se superponen sus
 * dos efectos: la mezcla tiene **su propio hechizo**. Cada uno se construye
 * con las piezas de `piezas.js` (columnas, rayos, nubes, esquirlas…) con
 * parámetros propios.
 *
 * `fusion` es el hechizo genérico de las combinaciones que no tienen nombre:
 * una trenza de energía de los colores de cada elemento.
 */

/** @typedef {import('../efecto.js').SpellContext} SpellContext */
/** @typedef {[number, number, number]} RGB */

/** @type {Record<string, RGB[]>} */
const PALETTE = {
  fire: [[1, 0.95, 0.75], [1, 0.45, 0.08], [0.45, 0.04, 0.02]],
  ember: [[1, 0.85, 0.4], [1, 0.4, 0.05], [0.6, 0.1, 0]],
  water: [[0.85, 0.97, 1], [0.35, 0.75, 1], [0.15, 0.4, 0.9]],
  steam: [[0.95, 0.95, 0.98], [0.82, 0.85, 0.9], [0.65, 0.68, 0.75]],
  snow: [[1, 1, 1], [0.85, 0.95, 1], [0.6, 0.8, 1]],
  wind: [[0.95, 1, 0.95], [0.7, 0.95, 0.85], [0.4, 0.75, 0.7]],
  light: [[1, 1, 0.95], [1, 0.92, 0.6], [1, 0.8, 0.4]],
  arcane: [[0.9, 0.85, 1], [0.65, 0.5, 1], [0.35, 0.2, 0.8]],
  storm: [[0.32, 0.32, 0.4], [0.2, 0.2, 0.27], [0.1, 0.1, 0.15]],
  volt: [[1, 1, 1], [0.8, 0.85, 1], [0.5, 0.5, 1]],
  dust: [[0.85, 0.7, 0.45], [0.7, 0.55, 0.32], [0.45, 0.35, 0.22]],
  shadow: [[0.14, 0.06, 0.22], [0.07, 0.02, 0.12], [0.02, 0, 0.05]],
  ghost: [[0.75, 1, 0.85], [0.5, 0.35, 1], [0.25, 0.05, 0.45]],
  aurora: [[0.6, 1, 0.75], [0.35, 0.85, 0.9], [0.55, 0.35, 1]],
};

// ── Fuego + viento: tornado de fuego ──────────────────────────
/** @param {SpellContext} ctx */
function firestorm(ctx) {
  const e = new Efecto();
  column(e, ctx, { count: 1600, colors: PALETTE.fire, height: 3.2, width: 0.5, swirl: 7, spread: -0.4, size: [0.12, 0.26], life: [0.9, 1.5], growth: 0.5 });
  column(e, ctx, { count: 260, colors: PALETTE.ember, height: 3.8, width: 0.9, swirl: 4, spread: 1.6, size: [0.025, 0.05], life: [1.2, 2] });
  [0.2, 1, 1.8].forEach((start) => shockRing(e, ctx, { color: [1, 0.6, 0.25], start, spin: 3, to: 2.6 }));
  return e;
}

// ── Agua + fuego: velo de vapor ───────────────────────────────
/** @param {SpellContext} ctx */
function steamVeil(ctx) {
  const e = new Efecto();
  const r = ctx.radius;
  cloud(e, ctx, { count: 220, colors: PALETTE.steam, area: [0.9, 0.3], drift: [0, 0.9, 0], size: [0.35, 0.6], growth: 3, opacity: 0.35, until: 2.6, life: [1.6, 2.4] });
  // Burbujas que hierven en la base
  const [ox, oy, oz] = at(ctx);
  e.addParticles(
    particles(ctx, {
      count: amount(ctx, 260),
      emit: () => {
        const [dx] = inDisk(r * 0.8);
        return { position: [ox + dx, oy - r * 0.5, oz], velocity: [0, r * rand(0.6, 1.4), 0], delay: rand(0, 2.6), life: rand(0.3, 0.6), size: r * rand(0.04, 0.08) };
      },
      colors: [[0.9, 0.98, 1], [0.5, 0.85, 1], [1, 0.6, 0.3]],
      turbulence: r * 0.2,
      flicker: 0.4,
    }),
  );
  glow(e, ctx, { colors: [[1, 0.8, 0.6], [1, 0.5, 0.3], [0.6, 0.3, 0.2]], size: 1.6, life: 2.6, flicker: 0.3 });
  return e;
}

// ── Agua + hielo: ventisca ────────────────────────────────────
/** @param {SpellContext} ctx */
function blizzard(ctx) {
  const e = new Efecto();
  precipitation(e, ctx, { count: 1400, colors: PALETTE.snow, speed: 1.6, wind: 2.6, width: 1.8, size: [0.02, 0.05], turbulence: 0.25, swirl: 0.8 });
  shards(e, ctx, { material: iceMaterial(), count: 10, length: [0.25, 0.45], width: [0.1, 0.16], from: 'rim', rimRadius: 0.7, orbit: 1.6, tilt: [-0.4, 0.6] });
  cloud(e, ctx, { count: 90, colors: [[0.85, 0.92, 1], [0.7, 0.82, 0.95], [0.6, 0.7, 0.85]], area: [1.2, 0.8], drift: [1.4, 0, 0], opacity: 0.18, blending: 'additive' });
  return e;
}

// ── Agua + viento: tempestad ──────────────────────────────────
/** @param {SpellContext} ctx */
function tempest(ctx) {
  const e = new Efecto();
  const r = ctx.radius;
  const [ox, oy, oz] = at(ctx);
  cloud(e, ctx, { count: 160, colors: PALETTE.storm, at: [ox, oy + r * 1.2, oz], area: [1.5, 0.35], drift: [0.15, 0, 0], size: [0.45, 0.8], opacity: 0.6, growth: 1.3, until: 1.8, life: [1.8, 2.6] });
  precipitation(e, ctx, { count: 1100, colors: [[0.85, 0.95, 1], [0.55, 0.8, 1], [0.3, 0.55, 0.95]], speed: 5, wind: 1.2, top: 1.1, size: [0.015, 0.03] });
  [0.3, 1, 1.7, 2.4].forEach((start) => shockRing(e, ctx, { color: [0.5, 0.85, 1], start, at: [ox, oy - r * 0.6, oz], to: 1.8, duration: 0.8 }));
  bolt(e, ctx, [ox - r * 0.2, oy + r * 1.1, oz], [ox + r * 0.3, oy - r * 0.6, oz], { start: 1.4, branches: 2 });
  return e;
}

// ── Escudo + luz: égida solar ─────────────────────────────────
/** @param {SpellContext} ctx */
function solarAegis(ctx) {
  const e = new Efecto();
  rays(e, ctx, { colors: [[1, 0.9, 0.5], [1, 0.75, 0.35]], count: 16, length: [1.8, 2.8], spin: 0.25, duration: 3.6 });
  sphere(e, ctx, { color: [0.6, 0.45, 0.15], rim: [1, 0.88, 0.5], size: 1.2, hex: true, impacts: true, duration: 3.6 });
  rim(e, ctx, { count: 300, colors: PALETTE.light, radius: 1.2, rise: 0.2, size: [0.03, 0.07], flicker: 0.8 });
  return e;
}

// ── Hielo + luz: prisma helado ────────────────────────────────
/** @param {SpellContext} ctx */
function icePrism(ctx) {
  const e = new Efecto();
  const rainbow = /** @type {RGB[]} */ ([[1, 0.35, 0.35], [1, 0.65, 0.3], [1, 0.95, 0.4], [0.45, 1, 0.5], [0.4, 0.75, 1], [0.6, 0.45, 1], [0.95, 0.45, 1]]);
  rays(e, ctx, { colors: rainbow, count: 14, length: [1.8, 3], width: [0.08, 0.14], spin: -0.2, start: 0.25 });
  shards(e, ctx, { material: iceMaterial(), count: 6, length: [0.7, 1], width: [0.3, 0.4], tilt: [0.8, 2], sides: 6, grow: 0.15 });
  sparks(e, ctx, { count: 260, colors: [[1, 1, 1], [0.8, 0.9, 1], [0.7, 0.6, 1]], until: 2.6, speed: [0.4, 1.6], drag: 1 });
  return e;
}

// ── Fuego + luz: sol naciente ─────────────────────────────────
/** @param {SpellContext} ctx */
function risingSun(ctx) {
  const e = new Efecto();
  const r = ctx.radius;
  const [ox, oy, oz] = at(ctx);
  const rise = r * 0.45; // unidades por segundo
  glow(e, ctx, { colors: [[1, 1, 0.9], [1, 0.75, 0.3], [1, 0.4, 0.1]], size: 2.4, at: [ox, oy - r * 0.6, oz], velocity: [0, rise, 0], life: 3.2, flicker: 0.1 });
  // Corona: llamas que brotan del sol mientras sube
  e.addParticles(
    particles(ctx, {
      count: amount(ctx, 900),
      emit: () => {
        const delay = rand(0, 2.8);
        const a = Math.random() * Math.PI * 2;
        const d = r * 0.42;
        const cy = oy - r * 0.6 + rise * delay;
        return {
          position: [ox + Math.cos(a) * d, cy + Math.sin(a) * d, oz + 0.05],
          velocity: [Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6 + rise, 0],
          delay,
          life: rand(0.4, 0.8),
          size: r * rand(0.08, 0.16),
        };
      },
      colors: PALETTE.fire,
      turbulence: r * 0.1,
      fadeOut: 0.6,
      flicker: flick(ctx),
    }),
  );
  rays(e, ctx, { colors: [[1, 0.85, 0.45]], count: 10, length: [1.4, 2.2], start: 1.2, duration: 2, spin: 0.15, at: [ox, oy + r * 0.0, oz] });
  shockRing(e, ctx, { color: [1, 0.75, 0.35], start: 1.2, to: 3 });
  return e;
}

// ── Hielo + viento: aliento boreal (aurora) ───────────────────
/** @param {SpellContext} ctx */
function borealBreath(ctx) {
  const e = new Efecto();
  const r = ctx.radius;
  const [ox, oy, oz] = at(ctx);
  // Tres cintas de aurora: partículas en bandas onduladas que se mecen.
  [0.55, 0.15, -0.25].forEach((band, k) => {
    e.addParticles(
      particles(ctx, {
        count: amount(ctx, 420),
        emit: () => {
          const u = rand(-1.5, 1.5);
          const y = oy + r * (band + 0.22 * Math.sin(u * 2.4 + k * 1.3));
          return {
            position: [ox + u * r, y + rand(-0.06, 0.25) * r, oz - 0.05],
            velocity: [r * 0.25, r * rand(0.05, 0.2), 0],
            delay: rand(0, 2.6),
            life: rand(0.8, 1.4),
            size: r * rand(0.08, 0.16),
          };
        },
        colors: PALETTE.aurora,
        turbulence: r * 0.06,
        opacity: 0.55,
        fadeIn: 0.3,
        fadeOut: 0.5,
      }),
      k * 0.25,
    );
  });
  precipitation(e, ctx, { count: 300, colors: PALETTE.snow, speed: 0.9, wind: 0.8, size: [0.015, 0.035], turbulence: 0.2 });
  return e;
}

// ── Escudo + fuego: muralla de brasas ─────────────────────────
/** @param {SpellContext} ctx */
function emberWall(ctx) {
  const e = new Efecto();
  rim(e, ctx, { count: 1500, colors: PALETTE.fire, radius: 1.05, rise: 1.6, size: [0.14, 0.26], life: [0.5, 0.9], flicker: flick(ctx) + 0.2 });
  rim(e, ctx, { count: 200, colors: PALETTE.ember, radius: 1.05, rise: 3, out: 0.5, size: [0.02, 0.05], life: [0.8, 1.4] });
  sphere(e, ctx, { color: [0.4, 0.1, 0.02], rim: [1, 0.45, 0.15], size: 1.1, hex: true, duration: 3.4 });
  return e;
}

// ── Escudo + agua: burbuja abisal ─────────────────────────────
/** @param {SpellContext} ctx */
function abyssalBubble(ctx) {
  const e = new Efecto();
  const r = ctx.radius;
  sphere(e, ctx, { color: [0.05, 0.25, 0.6], rim: [0.45, 0.85, 1], size: 1.15, wobble: 0.06, duration: 3.6 });
  column(e, ctx, { count: 260, colors: [[0.9, 1, 1], [0.6, 0.9, 1], [0.3, 0.6, 1]], height: 1.6, width: 0.85, size: [0.03, 0.08], life: [1, 1.8], base: [ctx.origin.x, ctx.origin.y - r * 0.8, ctx.origin.z], turbulence: 0.15 });
  [0.2, 0.9, 1.6, 2.3].forEach((start) => shockRing(e, ctx, { color: [0.3, 0.7, 1], start, from: 0.2, to: 1.1, duration: 1 }));
  return e;
}

// ── Rayo + viento: tormenta eléctrica ─────────────────────────
/** @param {SpellContext} ctx */
function thunderstorm(ctx) {
  const e = new Efecto();
  const r = ctx.radius;
  const [ox, oy, oz] = at(ctx);
  cloud(e, ctx, { count: 200, colors: PALETTE.storm, area: [1.2, 1.2], drift: [0, 0, 0], swirl: 1.8, size: [0.45, 0.75], opacity: 0.55, growth: 1.2, until: 2 });
  for (let i = 0; i < 9; i++) {
    const a = rand(0, Math.PI * 2);
    const [dx, dy] = inDisk(r * 0.8);
    bolt(e, ctx, [ox + Math.cos(a) * r * 1.2, oy + Math.sin(a) * r * 1.2, oz], [ox + dx, oy + dy, oz], { start: 0.2 + i * 0.3, branches: 2, colors: PALETTE.volt });
  }
  column(e, ctx, { count: 600, colors: PALETTE.wind, height: 0.4, width: 1, swirl: 5, spread: 0.6, size: [0.02, 0.04] });
  return e;
}

// ── Agua + rayo: marea voltaica ───────────────────────────────
/** @param {SpellContext} ctx */
function voltaicTide(ctx) {
  const e = new Efecto();
  const r = ctx.radius;
  const [ox, oy, oz] = at(ctx);
  const size = 0.6;
  sphere(e, ctx, { color: [0.05, 0.3, 0.7], rim: [0.5, 0.9, 1], size, wobble: 0.1, duration: 3.2, pulse: 0.04 });
  for (let i = 0; i < 12; i++) {
    const [ax, ay, az] = onSphere(r * size, true);
    const [bx, by, bz] = onSphere(r * size, true);
    bolt(e, ctx, [ox + ax, oy + ay, oz + az], [ox + bx, oy + by, oz + bz], { start: rand(0.3, 2.8), branches: 0, width: 0.6, flash: false, roughness: 0.3 });
  }
  sparks(e, ctx, { count: 260, colors: [[0.9, 1, 1], [0.4, 0.8, 1], [0.2, 0.4, 1]], start: 2.9, speed: [2, 4], gravity: -3 });
  shockRing(e, ctx, { color: [0.45, 0.85, 1], start: 2.9 });
  return e;
}

// ── Fuego + rayo: plasma ──────────────────────────────────────
/** @param {SpellContext} ctx */
function plasma(ctx) {
  const e = new Efecto();
  const r = ctx.radius;
  const [ox, oy, oz] = at(ctx);
  glow(e, ctx, { colors: [[1, 0.9, 1], [1, 0.4, 0.85], [0.5, 0.1, 0.8]], size: 1.8, life: 3.2, flicker: 0.4 });
  sphere(e, ctx, { color: [0.6, 0.1, 0.5], rim: [1, 0.55, 0.95], size: 0.45, wobble: 0.15, pulse: 0.08, duration: 3.2 });
  const plasmaColors = /** @type {RGB[]} */ ([[1, 1, 1], [1, 0.55, 0.95], [0.6, 0.2, 1]]);
  for (let i = 0; i < 14; i++) {
    const a = rand(0, Math.PI * 2);
    bolt(e, ctx, [ox, oy, oz], [ox + Math.cos(a) * r * 1.15, oy + Math.sin(a) * r * 1.15, oz], { start: 0.15 + i * 0.2, colors: plasmaColors, branches: 1, width: 0.8 });
  }
  rim(e, ctx, { count: 400, colors: [[1, 0.8, 0.95], [1, 0.4, 0.6], [0.6, 0.1, 0.4]], radius: 0.5, rise: 0.4, out: 0.8, size: [0.04, 0.08] });
  return e;
}

// ── Fuego + tierra: erupción ──────────────────────────────────
/** @param {SpellContext} ctx */
function eruption(ctx) {
  const e = new Efecto();
  const r = ctx.radius;
  const [ox, oy, oz] = at(ctx);
  const base = /** @type {[number, number, number]} */ ([ox, oy - r * 0.3, oz]);
  shards(e, ctx, { material: rockMaterial({ rim: [1, 0.35, 0.1] }), count: 12, length: [0.5, 0.9], width: [0.3, 0.45], from: 'rim', rimRadius: 0.35, tilt: [1, 2.5], sides: 4, grow: 0.3 });
  // Fuente de lava: sube y cae con gravedad
  e.addParticles(
    particles(ctx, {
      count: amount(ctx, 900),
      emit: () => {
        const v = r * rand(2.6, 4.2);
        const a = Math.PI / 2 + rand(-0.45, 0.45);
        return {
          position: base,
          velocity: [Math.cos(a) * v, Math.sin(a) * v, rand(0, 0.5) * r],
          delay: rand(0.3, 2.8),
          life: rand(1, 1.6),
          size: r * rand(0.06, 0.12),
        };
      },
      colors: [[1, 0.95, 0.6], [1, 0.4, 0.05], [0.4, 0.05, 0]],
      gravity: [0, -r * 5.5, 0],
      drag: 0.2,
      fadeOut: 0.4,
      flicker: flick(ctx),
    }),
  );
  column(e, ctx, { count: 120, colors: [[0.3, 0.25, 0.25], [0.18, 0.15, 0.15], [0.08, 0.07, 0.08]], base: [ox, oy + r * 0.4, oz - 0.1], height: 1.8, width: 0.4, size: [0.35, 0.55], growth: 2.4, blending: 'normal', opacity: 0.4, life: [1.6, 2.4], until: 2.4 });
  shockRing(e, ctx, { color: [1, 0.45, 0.15], start: 0.3, to: 2.6 });
  return e;
}

// ── Agua + tierra: géiser ─────────────────────────────────────
/** @param {SpellContext} ctx */
function geyser(ctx) {
  const e = new Efecto();
  const r = ctx.radius;
  const [ox, oy, oz] = at(ctx);
  const base = /** @type {[number, number, number]} */ ([ox, oy - r * 0.5, oz]);
  e.addParticles(
    particles(ctx, {
      count: amount(ctx, 1500),
      emit: () => {
        const v = r * rand(4, 5.5);
        const a = Math.PI / 2 + rand(-0.12, 0.12);
        return { position: base, velocity: [Math.cos(a) * v, Math.sin(a) * v, rand(-0.1, 0.4) * r], delay: rand(0.4, 2.6), life: rand(1.1, 1.6), size: r * rand(0.05, 0.1) };
      },
      colors: PALETTE.water,
      gravity: [0, -r * 6, 0],
      drag: 0.15,
      turbulence: r * 0.05,
      fadeOut: 0.4,
    }),
  );
  cloud(e, ctx, { count: 120, colors: PALETTE.steam, at: [ox, oy + r * 0.9, oz], area: [0.6, 0.6], drift: [0, 0.4, 0], start: 0.6, until: 2, opacity: 0.22, blending: 'additive' });
  shards(e, ctx, { material: rockMaterial(), count: 8, length: [0.3, 0.6], width: [0.2, 0.3], from: 'rim', rimRadius: 0.4, tilt: [0.6, 1.6], sides: 4, grow: 0.3 });
  shockRing(e, ctx, { color: [0.4, 0.8, 1], start: 0.4, at: base, to: 1.8 });
  return e;
}

// ── Escudo + tierra: bastión de piedra ────────────────────────
/** @param {SpellContext} ctx */
function stoneBastion(ctx) {
  const e = new Efecto();
  shards(e, ctx, { material: rockMaterial({ light: [0.7, 0.65, 0.6], shadow: [0.2, 0.18, 0.18], rim: [0.75, 0.65, 1] }), count: 12, length: [1, 1.4], width: [0.3, 0.38], from: 'rim', rimRadius: 1.05, upward: true, sides: 4, grow: 0.6, duration: 3.8 });
  sphere(e, ctx, { color: [0.25, 0.2, 0.5], rim: [0.7, 0.6, 1], size: 1.3, hex: true, start: 0.6, duration: 3.2 });
  cloud(e, ctx, { count: 90, colors: PALETTE.dust, area: [1.3, 0.3], drift: [0, 0.2, 0], until: 1.2, opacity: 0.3 });
  return e;
}

// ── Luz + sombra: eclipse ─────────────────────────────────────
/** @param {SpellContext} ctx */
function eclipse(ctx) {
  const e = new Efecto();
  rays(e, ctx, { colors: [[1, 0.95, 0.75], [1, 0.85, 0.55]], count: 20, length: [1.1, 1.8], width: [0.05, 0.1], spin: 0.08, duration: 3.6 });
  rim(e, ctx, { count: 700, colors: [[1, 1, 0.95], [1, 0.85, 0.5], [0.8, 0.4, 0.9]], radius: 0.78, rise: 0, out: 0.5, size: [0.03, 0.08], life: [0.6, 1.1], flicker: 0.5, until: 3 });
  darkDisc(e, ctx, { rim: [1, 0.9, 0.7], size: 0.85, start: 0.2, duration: 3.4 });
  shockRing(e, ctx, { color: [1, 0.9, 0.7], start: 2.8, to: 3 });
  return e;
}

// ── Hielo + sombra: noche polar ───────────────────────────────
/** @param {SpellContext} ctx */
function polarNight(ctx) {
  const e = new Efecto();
  darkDisc(e, ctx, { rim: [0.5, 0.8, 1], size: 1.1, duration: 3.6 });
  shards(e, ctx, { material: facetedMaterial({ shadow: [0.2, 0.25, 0.5], light: [0.75, 0.85, 1], rim: [0.6, 0.5, 1], alpha: 0.7 }), count: 14, length: [0.3, 0.55], width: [0.1, 0.16], from: 'rim', rimRadius: 0.75, orbit: -1.2, tilt: [-0.3, 0.5], duration: 3.6 });
  precipitation(e, ctx, { count: 500, colors: PALETTE.snow, speed: 0.8, size: [0.015, 0.035], swirl: -1.5, turbulence: 0.2 });
  return e;
}

// ── Rayo + hielo: rayo cristalino ─────────────────────────────
/** @param {SpellContext} ctx */
function crystalBolt(ctx) {
  const e = new Efecto();
  const r = ctx.radius;
  const [ox, oy, oz] = at(ctx);
  const colors = /** @type {RGB[]} */ ([[1, 1, 1], [0.7, 0.95, 1], [0.4, 0.7, 1]]);
  for (let i = 0; i < 5; i++) {
    bolt(e, ctx, [ox + rand(-0.6, 0.6) * r, oy + r * 2.4, oz], [ox + rand(-0.15, 0.15) * r, oy, oz], { start: 0.1 + i * 0.35, colors, branches: 3 });
  }
  shards(e, ctx, { material: iceMaterial(), count: 22, length: [0.6, 1.4], width: [0.1, 0.18], start: 0.15, grow: 1.6, duration: 3.4 });
  sparks(e, ctx, { count: 300, colors, until: 2, speed: [0.6, 2.2], drag: 1.2 });
  return e;
}

// ── Tierra + viento: tormenta de arena ────────────────────────
/** @param {SpellContext} ctx */
function sandstorm(ctx) {
  const e = new Efecto();
  const r = ctx.radius;
  const [ox, oy, oz] = at(ctx);
  e.addParticles(
    particles(ctx, {
      count: amount(ctx, 1800),
      emit: () => {
        const a = Math.random() * Math.PI * 2;
        const d = r * rand(0.2, 1.3);
        return { position: [ox + Math.cos(a) * d, oy + Math.sin(a) * d, oz + rand(-0.1, 0.2)], delay: rand(0, 2.6), life: rand(0.8, 1.4), size: r * rand(0.03, 0.07) };
      },
      colors: PALETTE.dust,
      swirl: 5.5,
      center: [ox, oy, oz],
      turbulence: r * 0.2,
      fadeIn: 0.2,
      fadeOut: 0.5,
      blending: 'normal',
      opacity: 0.85,
    }),
  );
  cloud(e, ctx, { count: 110, colors: PALETTE.dust, area: [1.2, 1.2], drift: [0, 0, 0], swirl: 3, opacity: 0.25, until: 2.4 });
  shards(e, ctx, { material: rockMaterial(), count: 9, length: [0.15, 0.25], width: [0.12, 0.2], from: 'rim', rimRadius: 0.9, orbit: 2.4, sides: 4, tilt: [-0.5, 0.5] });
  return e;
}

// ── Fuego + sombra: fuego fatuo ───────────────────────────────
/** @param {SpellContext} ctx */
function willOWisp(ctx) {
  const e = new Efecto();
  const r = ctx.radius;
  const [ox, oy, oz] = at(ctx);
  darkDisc(e, ctx, { rim: [0.45, 1, 0.7], size: 0.7, duration: 3.4 });
  // Fuegos que flotan en órbita lenta
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const d = r * 0.85;
    e.addParticles(
      particles(ctx, {
        count: amount(ctx, 180),
        emit: () => ({
          position: [ox + Math.cos(a) * d + rand(-0.04, 0.04) * r, oy + Math.sin(a) * d, oz + 0.05],
          velocity: [0, r * rand(0.4, 0.8), 0],
          delay: rand(0, 2.8),
          life: rand(0.5, 0.9),
          size: r * rand(0.08, 0.15),
        }),
        colors: PALETTE.ghost,
        swirl: 0.9,
        center: [ox, oy, oz],
        turbulence: r * 0.08,
        fadeOut: 0.6,
        flicker: 0.5,
      }),
    );
  }
  cloud(e, ctx, { count: 80, colors: PALETTE.shadow, area: [1, 1], drift: [0, 0.2, 0], opacity: 0.45, until: 2.4 });
  return e;
}

// ── Fusión: combinaciones sin nombre ──────────────────────────
/** @param {SpellContext} ctx */
function fusion(ctx) {
  const e = new Efecto();
  const r = ctx.radius;
  const [ox, oy, oz] = at(ctx);
  // Trenza de tres hebras que gira y se abre
  for (let k = 0; k < 3; k++) {
    e.addParticles(
      particles(ctx, {
        count: amount(ctx, 360),
        emit: () => {
          const delay = rand(0, 2.4);
          const a = (k / 3) * Math.PI * 2 + delay * 4;
          const d = r * (0.2 + delay * 0.3);
          return { position: [ox + Math.cos(a) * d, oy + Math.sin(a) * d, oz], velocity: [Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2, 0], delay, life: rand(0.5, 0.9), size: r * rand(0.05, 0.09) };
        },
        colors: [[1, 1, 1], k === 0 ? ctx.color : k === 1 ? ctx.accent : [0.7, 0.55, 1], [0.3, 0.2, 0.6]],
        fadeOut: 0.6,
        flicker: flick(ctx),
      }),
    );
  }
  glow(e, ctx, { colors: PALETTE.arcane, size: 1.5, life: 2.8, flicker: 0.3 });
  shockRing(e, ctx, { color: [0.7, 0.55, 1], start: 2.4, to: 2.8 });
  return e;
}

/**
 * Hechizos combinados (se registran con `registerSpell` en `registro.js`).
 * @type {Readonly<Record<string, import('../registro.js').SpellDefinition>>}
 */
export const COMBINED_SPELLS = Object.freeze({
  'tormenta-ignea': { label: 'Tormenta ígnea', color: [1, 0.55, 0.2], accent: [0.9, 1, 0.85], create: firestorm },
  'velo-vapor': { label: 'Velo de vapor', color: [0.9, 0.9, 0.95], accent: [1, 0.6, 0.35], create: steamVeil },
  ventisca: { label: 'Ventisca', color: [0.85, 0.95, 1], accent: [0.5, 0.75, 1], create: blizzard },
  tempestad: { label: 'Tempestad', color: [0.45, 0.75, 1], accent: [0.8, 0.95, 1], create: tempest },
  'egida-solar': { label: 'Égida solar', color: [1, 0.85, 0.45], accent: [0.8, 0.7, 1], create: solarAegis },
  'prisma-helado': { label: 'Prisma helado', color: [0.75, 0.9, 1], accent: [1, 0.7, 1], create: icePrism },
  'sol-naciente': { label: 'Sol naciente', color: [1, 0.7, 0.3], accent: [1, 0.95, 0.7], create: risingSun },
  'aliento-boreal': { label: 'Aliento boreal', color: [0.5, 1, 0.8], accent: [0.6, 0.45, 1], create: borealBreath },
  'muralla-brasas': { label: 'Muralla de brasas', color: [1, 0.45, 0.15], accent: [1, 0.85, 0.5], create: emberWall },
  'burbuja-abisal': { label: 'Burbuja abisal', color: [0.25, 0.6, 1], accent: [0.6, 0.95, 1], create: abyssalBubble },
  'tormenta-electrica': { label: 'Tormenta eléctrica', color: [0.65, 0.7, 1], accent: [0.9, 1, 0.95], create: thunderstorm },
  'marea-voltaica': { label: 'Marea voltaica', color: [0.4, 0.8, 1], accent: [0.85, 0.9, 1], create: voltaicTide },
  plasma: { label: 'Plasma', color: [1, 0.45, 0.9], accent: [1, 0.85, 1], create: plasma },
  erupcion: { label: 'Erupción', color: [1, 0.4, 0.1], accent: [1, 0.8, 0.4], create: eruption },
  geiser: { label: 'Géiser', color: [0.4, 0.8, 1], accent: [0.85, 0.7, 0.5], create: geyser },
  'bastion-piedra': { label: 'Bastión de piedra', color: [0.75, 0.65, 0.55], accent: [0.7, 0.6, 1], create: stoneBastion },
  eclipse: { label: 'Eclipse', color: [1, 0.9, 0.7], accent: [0.5, 0.3, 0.9], create: eclipse },
  'noche-polar': { label: 'Noche polar', color: [0.5, 0.75, 1], accent: [0.45, 0.3, 0.85], create: polarNight },
  'rayo-cristalino': { label: 'Rayo cristalino', color: [0.7, 0.9, 1], accent: [1, 1, 1], create: crystalBolt },
  'tormenta-arena': { label: 'Tormenta de arena', color: [0.85, 0.7, 0.45], accent: [1, 0.9, 0.7], create: sandstorm },
  'fuego-fatuo': { label: 'Fuego fatuo', color: [0.5, 1, 0.75], accent: [0.6, 0.35, 1], create: willOWisp },
  fusion: { label: 'Fusión arcana', color: [0.7, 0.55, 1], accent: [1, 0.85, 0.6], create: fusion },
});
