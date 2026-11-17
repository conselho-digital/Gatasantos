import { COLLIDERS, type Caixa } from './collision';

/** Distância t em que o raio (o + t·d) entra na caixa (altura 0..h), ou Infinity. */
export function raioCaixa(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: Caixa, max: number): number {
  let t0 = 0, t1 = max;
  const eixo = (o: number, d: number, mn: number, mx: number): boolean => {
    if (Math.abs(d) < 1e-9) return o >= mn && o <= mx;
    let a = (mn - o) / d, c = (mx - o) / d;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
    return t0 <= t1;
  };
  if (!eixo(ox, dx, b.minX, b.maxX)) return Infinity;
  if (!eixo(oz, dz, b.minZ, b.maxZ)) return Infinity;
  if (!eixo(oy, dy, 0, b.h ?? 1e6)) return Infinity;
  return t0;
}

/** Primeira batida do raio no cenário: prédios, muros e chão. Infinity = nada até `max`. */
export function raioMundo(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): number {
  let melhor = max < 1e8 ? max + 1e-6 : Infinity;
  let achou = Infinity;
  for (const b of COLLIDERS) {
    const t = raioCaixa(ox, oy, oz, dx, dy, dz, b, max);
    if (t < melhor) { melhor = t; achou = t; }
  }
  if (dy < -1e-9) {
    const t = -oy / dy; // chão
    if (t >= 0 && t <= max && t < melhor) achou = t;
  }
  return achou;
}

/** Raio × cilindro vertical (centro cx,cz; raio r; y0..y1). */
export function raioCilindro(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cz: number, r: number, y0: number, y1: number, max: number): number {
  const fx = ox - cx, fz = oz - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-12) return Infinity;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return Infinity;
  const s = Math.sqrt(disc);
  for (const t of [(-b - s) / (2 * a), (-b + s) / (2 * a)]) {
    if (t < 0 || t > max) continue;
    const y = oy + dy * t;
    if (y >= y0 && y <= y1) return t;
  }
  return Infinity;
}

/** Raio × esfera. */
export function raioEsfera(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, r: number, max: number): number {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return Infinity;
  const thc = Math.sqrt(r * r - d2);
  const t = tca - thc > 0 ? tca - thc : tca + thc;
  return t >= 0 && t <= max ? t : Infinity;
}
