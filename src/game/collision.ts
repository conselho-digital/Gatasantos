/** Caixa de colisão alinhada aos eixos (plano XZ). */
export interface Caixa {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Altura da caixa (m). Sem valor = infinita. */
  h?: number;
  /** Marca de consulta (evita repetir a caixa numa busca). */
  q?: number;
}

/** Lista de colisores do mapa atual (jogador, veículos, balas, câmera). */
export const COLLIDERS: Caixa[] = [];

/** Grade espacial: milhares de caixas (mapa da Paulista) sem varrer todas a cada consulta. */
const CELULA = 8;
const grade = new Map<number, Caixa[]>();
const chave = (cx: number, cz: number) => (cx + 4096) * 8192 + (cz + 4096);
let marca = 0;

export function limparColisores(): void {
  COLLIDERS.length = 0;
  grade.clear();
}

/** Registra uma caixa na lista e na grade. */
export function registrar(b: Caixa): void {
  COLLIDERS.push(b);
  const x0 = Math.floor(b.minX / CELULA), x1 = Math.floor(b.maxX / CELULA);
  const z0 = Math.floor(b.minZ / CELULA), z1 = Math.floor(b.maxZ / CELULA);
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const k = chave(x, z);
      const l = grade.get(k);
      if (l) l.push(b);
      else grade.set(k, [b]);
    }
  }
}

const _res: Caixa[] = [];
/** Caixas que tocam o retângulo (sem repetir). O vetor devolvido é reutilizado. */
export function perto(minX: number, maxX: number, minZ: number, maxZ: number): Caixa[] {
  _res.length = 0;
  marca++;
  const x0 = Math.floor(minX / CELULA), x1 = Math.floor(maxX / CELULA);
  const z0 = Math.floor(minZ / CELULA), z1 = Math.floor(maxZ / CELULA);
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const l = grade.get(chave(x, z));
      if (!l) continue;
      for (const b of l) if (b.q !== marca) { b.q = marca; _res.push(b); }
    }
  }
  return _res;
}

/** Caixas nas células que o raio (no plano XZ) atravessa até `max` m (DDA). */
export function aoLongoDoRaio(ox: number, oz: number, dx: number, dz: number, max: number, f: (b: Caixa) => void): void {
  marca++;
  let cx = Math.floor(ox / CELULA), cz = Math.floor(oz / CELULA);
  const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = Math.abs(dx) < 1e-9 ? Infinity : Math.abs(CELULA / dx), tdz = Math.abs(dz) < 1e-9 ? Infinity : Math.abs(CELULA / dz);
  let tx = Math.abs(dx) < 1e-9 ? Infinity : ((dx > 0 ? (cx + 1) * CELULA - ox : ox - cx * CELULA) / Math.abs(dx));
  let tz = Math.abs(dz) < 1e-9 ? Infinity : ((dz > 0 ? (cz + 1) * CELULA - oz : oz - cz * CELULA) / Math.abs(dz));
  for (let i = 0; i < 2000; i++) {
    const l = grade.get(chave(cx, cz));
    if (l) for (const b of l) if (b.q !== marca) { b.q = marca; f(b); }
    if (Math.min(tx, tz) > max) break;
    if (tx < tz) { cx += sx; tx += tdx; } else { cz += sz; tz += tdz; }
  }
}

export function caixaCentro(cx: number, cz: number, larg: number, prof: number, h?: number): Caixa {
  return { minX: cx - larg / 2, maxX: cx + larg / 2, minZ: cz - prof / 2, maxZ: cz + prof / 2, h };
}

/** Empurra um círculo (x,z,raio) para fora de todas as caixas. Devolve a posição corrigida. */
export function empurrarCirculo(x: number, z: number, raio: number, out = { x: 0, z: 0 }) {
  for (let it = 0; it < 3; it++) {
    for (const b of perto(x - raio, x + raio, z - raio, z + raio).slice()) {
      const px = Math.max(b.minX, Math.min(x, b.maxX));
      const pz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - px, dz = z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= raio * raio) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        x = px + (dx / d) * raio;
        z = pz + (dz / d) * raio;
      } else {
        // centro dentro da caixa: sai pelo lado mais perto
        const e = x - b.minX, d = b.maxX - x, n = z - b.minZ, s = b.maxZ - z;
        const m = Math.min(e, d, n, s);
        if (m === e) x = b.minX - raio;
        else if (m === d) x = b.maxX + raio;
        else if (m === n) z = b.minZ - raio;
        else z = b.maxZ + raio;
      }
    }
  }
  out.x = x;
  out.z = z;
  return out;
}

export function dentroDeCaixa(x: number, z: number, raio = 0): boolean {
  return perto(x - raio, x + raio, z - raio, z + raio).some((b) => x > b.minX - raio && x < b.maxX + raio && z > b.minZ - raio && z < b.maxZ + raio);
}

/** Sorteia um ponto livre (fora de prédios, dentro dos limites). `rnd` devolve 0..1. */
export function pontoLivre(
  minX: number, maxX: number, minZ: number, maxZ: number,
  raio = 0.6, rnd: () => number = Math.random,
): { x: number; z: number } | null {
  for (let i = 0; i < 40; i++) {
    const x = minX + rnd() * (maxX - minX), z = minZ + rnd() * (maxZ - minZ);
    if (!dentroDeCaixa(x, z, raio)) return { x, z };
  }
  return null;
}
