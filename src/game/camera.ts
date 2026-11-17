import * as THREE from 'three';
import { COLLIDERS, perto } from './collision';

/** Câmera orbital em 3ª pessoa que não atravessa prédios (seção 6.5). */
export const CAM = {
  distancia: 2.7,
  ombro: 0.7,
  altura: 1.6, // pivô na altura da cabeça
  margem: 0.9, // caixas engordadas
  recuoMin: 0.3,
  pitchMin: THREE.MathUtils.degToRad(-34),
  pitchMax: THREE.MathUtils.degToRad(69),
  near: 0.4,
};

export interface EstadoCamera {
  yaw: number;
  pitch: number;
  perto: boolean; // tecla G
}

export function novoEstadoCamera(): EstadoCamera {
  return { yaw: 0, pitch: 0.28, perto: false };
}

/**
 * Empurra um ponto para fora de toda caixa engordada pela margem (distância 3D ao ponto mais
 * próximo da caixa). Empurrar pela direção do ponto mais próximo converge também em paredes
 * diagonais feitas de várias caixas pequenas.
 */
export function pushOutOfBoxes(p: THREE.Vector3, m = CAM.margem): THREE.Vector3 {
  for (let it = 0; it < 10; it++) {
    let mexeu = false;
    for (const b of perto(p.x - m, p.x + m, p.z - m, p.z + m).slice()) {
      const topo = b.h ?? 1e6;
      const cx = Math.min(Math.max(p.x, b.minX), b.maxX);
      const cz = Math.min(Math.max(p.z, b.minZ), b.maxZ);
      const cy = Math.min(Math.max(p.y, 0), topo);
      const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= m * m) continue;
      if (d2 > 1e-9) {
        const k = (m - Math.sqrt(d2)) / Math.sqrt(d2);
        p.x += dx * k; p.y += dy * k; p.z += dz * k;
      } else {
        // dentro da caixa: sai pela face horizontal mais perto
        const e = p.x - b.minX, d = b.maxX - p.x, n = p.z - b.minZ, s = b.maxZ - p.z;
        const menor = Math.min(e, d, n, s);
        if (menor === e) p.x = b.minX - m;
        else if (menor === d) p.x = b.maxX + m;
        else if (menor === n) p.z = b.minZ - m;
        else p.z = b.maxZ + m;
      }
      mexeu = true;
    }
    if (!mexeu) break;
  }
  return p;
}

function dentro(p: THREE.Vector3, m: number): boolean {
  for (const b of perto(p.x - m, p.x + m, p.z - m, p.z + m)) {
    if (p.y > (b.h ?? Infinity) + m) continue;
    if (p.x > b.minX - m && p.x < b.maxX + m && p.z > b.minZ - m && p.z < b.maxZ + m) return true;
  }
  return false;
}

const _piv = new THREE.Vector3();
const _des = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _suave = new THREE.Vector3();
let _temSuave = false;

/** Posição desejada da câmera, já com recuo por colisão e empurrão. */
export function posicaoDesejada(px: number, py: number, pz: number, est: EstadoCamera, mirando = false, out = new THREE.Vector3()) {
  const k = est.perto ? 0.5 : 1;
  const dist = (mirando ? 1.35 : CAM.distancia) * k;
  const ombro = (mirando ? 0.55 : CAM.ombro) * k;
  const fx = Math.sin(est.yaw), fz = Math.cos(est.yaw);
  const rx = -fz, rz = fx;
  _piv.set(px + rx * ombro, py + CAM.altura, pz + rz * ombro);
  const cp = Math.cos(est.pitch), sp = Math.sin(est.pitch);
  _dir.set(-fx * cp, sp, -fz * cp); // do pivô para a câmera
  // Recua ao longo do raio até a primeira caixa engordada.
  let t = dist;
  for (let s = 0.1; s <= dist; s += 0.1) {
    _des.copy(_piv).addScaledVector(_dir, s);
    _des.y = Math.max(0.3, _des.y);
    if (dentro(_des, CAM.margem)) {
      t = Math.max(CAM.recuoMin, s - 0.1);
      break;
    }
  }
  out.copy(_piv).addScaledVector(_dir, t);
  out.y = Math.max(0.3, out.y);
  return pushOutOfBoxes(out); // 1º empurrão (ponto desejado)
}

/** Atualiza a câmera Three. `instante` ignora a suavização (testes e voo). */
export function atualizarCamera(
  cam: THREE.PerspectiveCamera, px: number, py: number, pz: number,
  est: EstadoCamera, dt: number, mirando = false, instante = false,
): void {
  const alvo = posicaoDesejada(px, py, pz, est, mirando);
  if (!_temSuave || instante) {
    _suave.copy(alvo);
    _temSuave = true;
  } else {
    _suave.lerp(alvo, 1 - Math.exp(-dt * 18));
  }
  _suave.y = Math.max(0.3, _suave.y);
  pushOutOfBoxes(_suave); // 2º empurrão (depois do suavizado)
  cam.position.copy(_suave);
  // Olha para a frente na altura da cabeça: a mira do centro não cai sobre o personagem.
  cam.lookAt(_suave.x - _dir.x * 10, _suave.y - _dir.y * 10, _suave.z - _dir.z * 10);
  cam.near = CAM.near;
  cam.updateProjectionMatrix();
}

/** Distância (3D) de um ponto à caixa mais próxima do mapa. */
export function distanciaMinimaDeCaixas(p: THREE.Vector3): number {
  let melhor = Infinity;
  for (const b of COLLIDERS) {
    const dx = Math.max(b.minX - p.x, 0, p.x - b.maxX);
    const dz = Math.max(b.minZ - p.z, 0, p.z - b.maxZ);
    const dy = Math.max(0, p.y - (b.h ?? Infinity));
    melhor = Math.min(melhor, Math.hypot(dx, dy, dz));
  }
  return melhor;
}
