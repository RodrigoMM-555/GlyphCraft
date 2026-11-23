import * as THREE from 'three';
import { particles, amount, rand, inDisk } from '../efecto.js';
import { ringMaterial, rayMaterial, shellMaterial, darkDiscMaterial } from '../materiales.js';

/**
 * Piezas reutilizables para escribir hechizos: cada una añade a un `Efecto`
 * un elemento reconocible (una onda, un rayo, una columna de partículas…).
 * Los hechizos combinados se construyen juntando piezas con parámetros
 * propios, así cada combinación tiene un aspecto único sin repetir código.
 *
 * Coordenadas del mundo: el glifo está en el plano z = 0, «y» hacia arriba
 * y «z» hacia la cámara. `ctx.radius` es el radio del círculo dibujado.
 */

/** @typedef {import('../efecto.js').SpellContext} SpellContext */
/** @typedef {import('../efecto.js').Efecto} Efecto */
/** @typedef {[number, number, number]} RGB */
/** @typedef {[number, number, number]} XYZ */

export const ease = {
  outBack: (/** @type {number} */ t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
  outCubic: (/** @type {number} */ t) => 1 - (1 - t) ** 3,
  inOut: (/** @type {number} */ t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
};

/** Centro del glifo. @param {SpellContext} ctx @returns {XYZ} */
export const at = (ctx) => [ctx.origin.x, ctx.origin.y, ctx.origin.z];

/** Parpadeo según la (in)estabilidad del trazo. @param {SpellContext} ctx */
export const flick = (ctx) => (1 - ctx.stability) * 0.7;

/** Desvanecimiento al final de una pieza (0-1 → 1 … 0). */
export const fadeTail = (/** @type {number} */ p, from = 0.75) => 1 - Math.max(0, (p - from) / (1 - from));

/**
 * Onda expansiva plana.
 * @param {Efecto} effect
 * @param {SpellContext} ctx
 * @param {{ color: RGB, start?: number, duration?: number, from?: number, to?: number, at?: XYZ, spin?: number }} options
 */
export function shockRing(effect, ctx, { color, start = 0, duration = 1, from = 0.5, to = 2.2, at: position = at(ctx), spin = 0 }) {
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ringMaterial(color));
  ring.position.set(...position);
  const r = ctx.radius;
  effect.addMesh(ring, {
    start,
    duration,
    animate: (_, p) => {
      ring.scale.setScalar(r * (from + p * (to - from)));
      ring.rotation.z = p * spin;
      /** @type {THREE.ShaderMaterial} */ (ring.material).uniforms.uProgress.value = Math.min(0.999, p);
    },
  });
}

/**
 * Resplandor: unas pocas partículas grandes superpuestas.
 * @param {Efecto} effect
 * @param {SpellContext} ctx
 * @param {{ colors: RGB[], size: number, start?: number, life?: number, at?: XYZ, velocity?: XYZ, flicker?: number, blending?: 'additive' | 'normal', opacity?: number }} options
 */
export function glow(effect, ctx, { colors, size, start = 0, life = 3, at: position = at(ctx), velocity = [0, 0, 0], flicker = 0.15, blending = 'additive', opacity = 1 }) {
  effect.addParticles(
    particles(ctx, {
      count: 3,
      emit: (i) => ({ position, velocity, delay: i * 0.06, life: life - i * 0.06, size: ctx.radius * size * (1 - i * 0.25) }),
      colors,
      fadeIn: 0.1,
      fadeOut: 0.35,
      flicker,
      blending,
      opacity,
    }),
    start,
  );
}

/**
 * Camino quebrado de un rayo entre dos puntos (desplazamiento del punto medio).
 * @param {XYZ} from
 * @param {XYZ} to
 * @param {number} roughness Desviación relativa a la longitud.
 * @returns {XYZ[]}
 */
export function jaggedPath(from, to, roughness = 0.22) {
  /** @type {XYZ[]} */
  let points = [from, to];
  for (let level = 0; level < 5; level++) {
    /** @type {XYZ[]} */
    const next = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const [ax, ay, az] = points[i - 1];
      const [bx, by, bz] = points[i];
      const len = Math.hypot(bx - ax, by - ay);
      const offset = (Math.random() - 0.5) * 2 * roughness * len;
      const nx = -(by - ay) / (len || 1);
      const ny = (bx - ax) / (len || 1);
      next.push([(ax + bx) / 2 + nx * offset, (ay + by) / 2 + ny * offset, (az + bz) / 2], points[i]);
    }
    points = next;
    roughness *= 0.55;
  }
  return points;
}

/**
 * Relámpago hecho de partículas a lo largo de un camino quebrado, con
 * ramas opcionales y un destello en el impacto.
 * @param {Efecto} effect
 * @param {SpellContext} ctx
 * @param {XYZ} from
 * @param {XYZ} to
 * @param {{ colors?: RGB[], start?: number, life?: number, width?: number, branches?: number, flash?: boolean, roughness?: number }} [options]
 */
export function bolt(effect, ctx, from, to, { colors = [[1, 1, 1], [0.75, 0.85, 1], [0.45, 0.5, 1]], start = 0, life = 0.32, width = 1, branches = 2, flash = true, roughness = 0.22 } = {}) {
  const r = ctx.radius;
  const main = jaggedPath(from, to, roughness);
  /** @type {XYZ[][]} */
  const paths = [main];
  for (let b = 0; b < branches; b++) {
    const origin = main[Math.floor(rand(0.2, 0.7) * main.length)];
    const angle = Math.atan2(to[1] - from[1], to[0] - from[0]) + rand(-1.1, 1.1);
    const len = Math.hypot(to[0] - from[0], to[1] - from[1]) * rand(0.2, 0.4);
    paths.push(jaggedPath(origin, [origin[0] + Math.cos(angle) * len, origin[1] + Math.sin(angle) * len, origin[2]], roughness));
  }
  /** @type {{ p: XYZ, main: boolean }[]} */
  const seeds = [];
  paths.forEach((path, k) => {
    for (let i = 1; i < path.length; i++) {
      const [ax, ay, az] = path[i - 1];
      const [bx, by, bz] = path[i];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (r * 0.02)));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        seeds.push({ p: [ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t], main: k === 0 });
      }
    }
  });
  effect.addParticles(
    particles(ctx, {
      count: seeds.length,
      emit: (i) => ({
        position: seeds[i].p,
        delay: rand(0, 0.03),
        life: life * rand(0.8, 1.1),
        size: r * width * (seeds[i].main ? rand(0.05, 0.08) : rand(0.025, 0.045)),
      }),
      colors,
      fadeIn: 0.02,
      fadeOut: 0.6,
      flicker: 0.8,
    }),
    start,
  );
  if (flash) glow(effect, ctx, { colors: [[1, 1, 1], colors[1], colors[2]], size: 1.4 * width, start, life: 0.35, at: to, flicker: 0.6 });
}

/**
 * Columna de partículas que sube girando (remolinos, géiseres, tornados).
 * @param {Efecto} effect
 * @param {SpellContext} ctx
 * @param {{ count: number, colors: RGB[], height?: number, width?: number, swirl?: number, size?: [number, number], life?: [number, number], spread?: number, start?: number, until?: number, gravity?: number, blending?: 'additive' | 'normal', opacity?: number, growth?: number, base?: XYZ, turbulence?: number }} options
 */
export function column(effect, ctx, {
  count, colors, height = 2.5, width = 0.35, swirl = 0, size = [0.05, 0.1], life = [0.8, 1.4], spread = 1, start = 0, until = 2.6,
  gravity = 0, blending = 'additive', opacity = 1, growth = 1, base, turbulence = 0.08,
}) {
  const r = ctx.radius;
  const [ox, oy, oz] = base ?? at(ctx);
  const [lo, hi] = life;
  effect.addParticles(
    particles(ctx, {
      count: amount(ctx, count),
      emit: () => {
        const [dx, dz] = inDisk(r * width);
        const l = rand(lo, hi);
        const up = (r * height) / l;
        return {
          position: [ox + dx, oy, oz + dz * 0.4],
          velocity: [dx * spread, up * rand(0.7, 1.15), dz * 0.3],
          delay: rand(0, until),
          life: l,
          size: r * rand(size[0], size[1]),
        };
      },
      colors,
      swirl,
      center: [ox, oy, oz],
      gravity: [0, gravity * r, 0],
      drag: 0.4,
      turbulence: r * turbulence,
      growth,
      fadeIn: 0.12,
      fadeOut: 0.5,
      blending,
      opacity,
      flicker: flick(ctx),
    }),
    start,
  );
}

/**
 * Nube: partículas grandes y suaves (humo, vapor, nubes de tormenta).
 * Con `blending: 'normal'` y colores oscuros, oscurece el fondo.
 * @param {Efecto} effect
 * @param {SpellContext} ctx
 * @param {{ count: number, colors: RGB[], at?: XYZ, area?: [number, number], drift?: XYZ, size?: [number, number], start?: number, until?: number, life?: [number, number], opacity?: number, blending?: 'additive' | 'normal', growth?: number, swirl?: number }} options
 */
export function cloud(effect, ctx, {
  count, colors, at: position = at(ctx), area = [1, 0.4], drift = [0, 0.1, 0], size = [0.4, 0.7], start = 0, until = 2.4,
  life = [1.4, 2.2], opacity = 0.35, blending = 'normal', growth = 1.8, swirl = 0,
}) {
  const r = ctx.radius;
  const [ox, oy, oz] = position;
  effect.addParticles(
    particles(ctx, {
      count: amount(ctx, count),
      emit: () => {
        const [dx, dy] = inDisk(1);
        return {
          position: [ox + dx * area[0] * r, oy + dy * area[1] * r, oz + rand(-0.05, 0.05)],
          velocity: [drift[0] * r + dx * 0.05 * r, drift[1] * r, drift[2] * r],
          delay: rand(0, until),
          life: rand(life[0], life[1]),
          size: r * rand(size[0], size[1]),
        };
      },
      colors,
      turbulence: r * 0.12,
      swirl,
      center: [ox, oy, oz],
      growth,
      opacity,
      fadeIn: 0.25,
      fadeOut: 0.55,
      blending,
    }),
    start,
  );
}

/**
 * Lluvia o nieve: partículas que caen desde arriba sobre el círculo.
 * @param {Efecto} effect
 * @param {SpellContext} ctx
 * @param {{ count: number, colors: RGB[], speed?: number, wind?: number, width?: number, top?: number, size?: [number, number], start?: number, until?: number, turbulence?: number, swirl?: number }} options
 */
export function precipitation(effect, ctx, { count, colors, speed = 3.5, wind = 0, width = 1.3, top = 1.6, size = [0.02, 0.04], start = 0, until = 2.6, turbulence = 0.03, swirl = 0 }) {
  const r = ctx.radius;
  const [ox, oy, oz] = at(ctx);
  const fall = r * (top + 1.2);
  effect.addParticles(
    particles(ctx, {
      count: amount(ctx, count),
      emit: () => {
        const v = r * speed * rand(0.8, 1.2);
        return {
          position: [ox + rand(-width, width) * r - wind * r * 0.5, oy + top * r, oz + rand(-0.2, 0.3)],
          velocity: [wind * r, -v, 0],
          delay: rand(0, until),
          life: Math.min(fall / v, 2), // la nieve lenta se desvanece antes de llegar abajo
          size: r * rand(size[0], size[1]),
        };
      },
      colors,
      turbulence: r * turbulence,
      swirl,
      center: [ox, oy, oz],
      fadeIn: 0.1,
      fadeOut: 0.25,
    }),
    start,
  );
}

/**
 * Corona de partículas en el borde de un círculo (anillos de fuego, de luz…).
 * @param {Efecto} effect
 * @param {SpellContext} ctx
 * @param {{ count: number, colors: RGB[], radius?: number, rise?: number, out?: number, size?: [number, number], life?: [number, number], start?: number, until?: number, swirl?: number, at?: XYZ, flicker?: number }} options
 */
export function rim(effect, ctx, { count, colors, radius = 1, rise = 0.8, out = 0, size = [0.08, 0.16], life = [0.5, 1], start = 0, until = 2.6, swirl = 0, at: position = at(ctx), flicker = 0.3 }) {
  const r = ctx.radius;
  const [ox, oy, oz] = position;
  effect.addParticles(
    particles(ctx, {
      count: amount(ctx, count),
      emit: () => {
        const a = Math.random() * Math.PI * 2;
        const d = r * radius * rand(0.95, 1.05);
        return {
          position: [ox + Math.cos(a) * d, oy + Math.sin(a) * d, oz],
          velocity: [Math.cos(a) * out * r, rise * r, rand(0, 0.3) * r],
          delay: rand(0, until),
          life: rand(life[0], life[1]),
          size: r * rand(size[0], size[1]),
        };
      },
      colors,
      swirl,
      center: [ox, oy, oz],
      turbulence: r * 0.08,
      fadeIn: 0.1,
      fadeOut: 0.55,
      flicker,
    }),
    start,
  );
}

/**
 * Rayos de luz que giran desde un punto.
 * @param {Efecto} effect
 * @param {SpellContext} ctx
 * @param {{ colors: RGB[], count?: number, length?: [number, number], width?: [number, number], spin?: number, start?: number, duration?: number, at?: XYZ }} options
 */
export function rays(effect, ctx, { colors, count = 12, length = [1.6, 2.6], width = [0.1, 0.22], spin = 0.35, start = 0, duration = 3.2, at: position = at(ctx) }) {
  const r = ctx.radius;
  const group = new THREE.Group();
  group.position.set(...position);
  for (let i = 0; i < count; i++) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.translate(0.5, 0, 0);
    const ray = new THREE.Mesh(geometry, rayMaterial(colors[i % colors.length]));
    const len = r * rand(length[0], length[1]) * (ctx.power ?? 1) ** 0.5;
    ray.scale.set(len, r * rand(width[0], width[1]), 1);
    ray.rotation.z = (i / count) * Math.PI * 2 + rand(-0.1, 0.1);
    ray.userData.length = len;
    group.add(ray);
  }
  effect.addMesh(group, {
    start,
    duration,
    animate: (t, p) => {
      group.rotation.z = t * spin;
      const appear = ease.outCubic(Math.min(1, t / 0.4));
      group.children.forEach((ray, i) => {
        const pulse = 0.75 + 0.25 * Math.sin(t * 5 + i * 1.7);
        ray.scale.x = /** @type {number} */ (ray.userData.length) * appear * pulse;
        /** @type {THREE.ShaderMaterial} */ (/** @type {THREE.Mesh} */ (ray).material).uniforms.uOpacity.value =
          fadeTail(p, 0.7) * (1 - flick(ctx) * 0.5 * (1 + Math.sin(t * 27 + i)));
      });
    },
  });
}

/**
 * Esfera translúcida (burbuja, escudo, núcleo de plasma).
 * @param {Efecto} effect
 * @param {SpellContext} ctx
 * @param {{ color: RGB, rim: RGB, size: number, wobble?: number, hex?: boolean, start?: number, duration?: number, at?: XYZ, impacts?: boolean, pulse?: number }} options
 */
export function sphere(effect, ctx, { color, rim: rimColor, size, wobble = 0, hex = false, start = 0, duration = 3.4, at: position = at(ctx), impacts = false, pulse = 0 }) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), shellMaterial({ color, rim: rimColor, wobble, hex }));
  mesh.position.set(...position);
  const material = /** @type {THREE.ShaderMaterial} */ (mesh.material);
  const scale = ctx.radius * size;
  effect.addMesh(mesh, {
    start,
    duration,
    animate: (t, p) => {
      const beat = 1 + pulse * Math.sin(t * 6);
      mesh.scale.setScalar(scale * Math.max(0, ease.outBack(Math.min(1, t / 0.6))) * beat);
      mesh.rotation.y = t * 0.4;
      material.uniforms.uTime.value = t;
      if (impacts) material.uniforms.uImpact.value = Math.max(0, Math.sin(t * 2.4)) ** 8 * 0.8;
      material.uniforms.uOpacity.value = fadeTail(p) * (1 - flick(ctx) * 0.4 * (1 + Math.sin(t * 25)));
    },
  });
}

/**
 * Disco oscuro que se abre (eclipses, vórtices).
 * @param {Efecto} effect
 * @param {SpellContext} ctx
 * @param {{ rim: RGB, size: number, start?: number, duration?: number, at?: XYZ }} options
 */
export function darkDisc(effect, ctx, { rim: rimColor, size, start = 0, duration = 3.4, at: position = at(ctx) }) {
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), darkDiscMaterial(rimColor));
  disc.position.set(position[0], position[1], position[2] - 0.02);
  const material = /** @type {THREE.ShaderMaterial} */ (disc.material);
  effect.addMesh(disc, {
    start,
    duration,
    animate: (t, p) => {
      disc.scale.setScalar(ctx.radius * size * ease.outBack(Math.min(1, t / 0.7)));
      material.uniforms.uTime.value = t;
      material.uniforms.uOpacity.value = fadeTail(p, 0.7);
    },
  });
}

/**
 * Esquirlas (conos facetados) que crecen desde un punto o desde el borde.
 * @param {Efecto} effect
 * @param {SpellContext} ctx
 * @param {{ material: THREE.Material, count: number, length: [number, number], width: [number, number], from?: 'center' | 'rim', tilt?: [number, number], start?: number, duration?: number, grow?: number, sides?: number, orbit?: number, rimRadius?: number, upward?: boolean }} options
 */
export function shards(effect, ctx, {
  material, count, length, width, from = 'center', tilt = [-0.6, 0.9], start = 0, duration = 3.6, grow = 0.5, sides = 5,
  orbit = 0, rimRadius = 1, upward = false,
}) {
  const r = ctx.radius;
  const geometry = new THREE.ConeGeometry(0.5, 1, sides).toNonIndexed();
  geometry.computeVertexNormals();
  geometry.translate(0, 0.5, 0);
  const total = Math.max(3, Math.round(count * Math.sqrt(ctx.power ?? 1)));
  const mesh = new THREE.InstancedMesh(geometry, material, total);
  mesh.position.set(...at(ctx));
  const specs = Array.from({ length: total }, (_, i) => {
    const a = (i / total) * Math.PI * 2 + rand(-0.15, 0.15);
    const base = from === 'rim' ? new THREE.Vector3(Math.cos(a) * r * rimRadius, Math.sin(a) * r * rimRadius, 0) : new THREE.Vector3();
    const direction = upward
      ? new THREE.Vector3(rand(-0.25, 0.25), 1, rand(-0.2, 0.6)).normalize()
      : new THREE.Vector3(Math.cos(a), Math.sin(a), rand(tilt[0], tilt[1])).normalize();
    return { base, direction, length: r * rand(length[0], length[1]), width: r * rand(width[0], width[1]), delay: rand(0, grow) };
  });
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const shader = /** @type {THREE.ShaderMaterial} */ (material);
  effect.addMesh(mesh, {
    start,
    duration,
    animate: (t, p) => {
      specs.forEach((s, i) => {
        const g = Math.max(0.001, ease.outBack(Math.min(1, Math.max(0, (t - s.delay) / 0.45))));
        quaternion.setFromUnitVectors(up, s.direction);
        scale.set(s.width * g, s.length * g, s.width * g);
        position.copy(s.base);
        if (orbit) position.applyAxisAngle(new THREE.Vector3(0, 0, 1), t * orbit);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(i, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (shader.uniforms?.uOpacity) shader.uniforms.uOpacity.value = fadeTail(p);
    },
  });
}

/**
 * Chispas que salen disparadas desde un punto.
 * @param {Efecto} effect
 * @param {SpellContext} ctx
 * @param {{ count: number, colors: RGB[], speed?: [number, number], start?: number, until?: number, at?: XYZ, gravity?: number, size?: [number, number], life?: [number, number], drag?: number }} options
 */
export function sparks(effect, ctx, { count, colors, speed = [1.5, 4], start = 0, until = 0, at: position = at(ctx), gravity = 0, size = [0.03, 0.06], life = [0.5, 1.1], drag = 2 }) {
  const r = ctx.radius;
  effect.addParticles(
    particles(ctx, {
      count: amount(ctx, count),
      emit: () => {
        const a = Math.random() * Math.PI * 2;
        const v = r * rand(speed[0], speed[1]);
        return {
          position,
          velocity: [Math.cos(a) * v, Math.sin(a) * v, rand(-0.3, 0.8) * v * 0.3],
          delay: rand(0, until),
          life: rand(life[0], life[1]),
          size: r * rand(size[0], size[1]),
        };
      },
      colors,
      gravity: [0, gravity * r, 0],
      drag,
      fadeIn: 0.02,
      fadeOut: 0.6,
      flicker: 0.3,
    }),
    start,
  );
}
