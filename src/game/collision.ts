/** Caixa de colisão alinhada aos eixos (plano XZ). */
export interface Caixa {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Lista de colisores do mapa atual (jogador, veículos, balas, câmera). */
export const COLLIDERS: Caixa[] = [];

export function limparColisores(): void {
  COLLIDERS.length = 0;
}

export function caixaCentro(cx: number, cz: number, larg: number, prof: number): Caixa {
  return { minX: cx - larg / 2, maxX: cx + larg / 2, minZ: cz - prof / 2, maxZ: cz + prof / 2 };
}

/** Empurra um círculo (x,z,raio) para fora de todas as caixas. Devolve a posição corrigida. */
export function empurrarCirculo(x: number, z: number, raio: number, out = { x: 0, z: 0 }) {
  for (let it = 0; it < 3; it++) {
    for (const b of COLLIDERS) {
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
  return COLLIDERS.some((b) => x > b.minX - raio && x < b.maxX + raio && z > b.minZ - raio && z < b.maxZ + raio);
}
