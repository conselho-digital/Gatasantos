import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { limparColisores, pontoLivre, registrar, type Caixa } from './collision';
import type { Cidade } from './city';

/** Mapa da Paulista: modelo do dono (`public/models/mapa-paulista.glb`, já em metros, 250 x 198 m). */
const URL_MAPA = '/models/mapa-paulista.glb?v=1';

const CELULA = 0.5; // m: resolução da grade de colisão
const PASSO_MIN = 0.9; // obstáculos mais baixos que isso (meio-fio) o jogador sobe andando
const CORPO_MAX = 1.9; // só conta o que atrapalha a altura do corpo

/**
 * Colisores a partir da geometria: paredes (triângulos quase verticais) entre 0,9 e 1,9 m de altura
 * viram células de 0,5 m; células vizinhas são fundidas em retângulos. Vale para instâncias também.
 */
function gerarColisores(raiz: THREE.Object3D): number {
  limparColisores();
  const celulas = new Map<number, number>(); // célula → altura máxima da parede
  const K = 100000;
  const marcar = (x: number, z: number, h: number) => {
    const ix = Math.floor(x / CELULA), iz = Math.floor(z / CELULA);
    const k = (ix + 2000) * K + (iz + 2000);
    if ((celulas.get(k) ?? 0) < h) celulas.set(k, h);
  };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  const m = new THREE.Matrix4(), w = new THREE.Matrix4();

  const triangulos = (mesh: THREE.Mesh, mundo: THREE.Matrix4) => {
    const g = mesh.geometry, pos = g.attributes.position, idx = g.index;
    const total = idx ? idx.count : pos.count;
    for (let i = 0; i < total; i += 3) {
      const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(mundo);
      b.fromBufferAttribute(pos, i1).applyMatrix4(mundo);
      c.fromBufferAttribute(pos, i2).applyMatrix4(mundo);
      const yMin = Math.min(a.y, b.y, c.y), yMax = Math.max(a.y, b.y, c.y);
      if (yMax < PASSO_MIN || yMin > CORPO_MAX) continue;
      n.crossVectors(t1.subVectors(b, a), t2.subVectors(c, a));
      const len = n.length();
      if (len < 1e-9 || Math.abs(n.y / len) > 0.8) continue; // chão e telhado não bloqueiam
      for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
        const passos = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / (CELULA * 0.5)));
        for (let s = 0; s <= passos; s++) {
          const f = s / passos;
          marcar(p.x + (q.x - p.x) * f, p.z + (q.z - p.z) * f, Math.max(p.y, q.y));
        }
      }
    }
  };

  raiz.updateMatrixWorld(true);
  raiz.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const inst = o as THREE.InstancedMesh;
    if (inst.isInstancedMesh) {
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, m);
        triangulos(mesh, w.multiplyMatrices(mesh.matrixWorld, m));
      }
    } else triangulos(mesh, mesh.matrixWorld);
  });

  // Funde em retângulos: corridas em X, estendidas em Z quando iguais.
  const porLinha = new Map<number, number[]>();
  for (const k of celulas.keys()) {
    const iz = (k % K) - 2000;
    (porLinha.get(iz) ?? porLinha.set(iz, []).get(iz)!).push(Math.floor(k / K) - 2000);
  }
  type Ret = { x0: number; x1: number; z0: number; z1: number; h: number };
  let abertos = new Map<string, Ret>();
  const prontos: Ret[] = [];
  for (const iz of [...porLinha.keys()].sort((p, q) => p - q)) {
    const xs = porLinha.get(iz)!.sort((p, q) => p - q);
    const novos = new Map<string, Ret>();
    let i = 0;
    while (i < xs.length) {
      let j = i;
      while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
      let h = 0;
      for (let x = xs[i]; x <= xs[j]; x++) h = Math.max(h, celulas.get((x + 2000) * K + (iz + 2000))!);
      const chave = `${xs[i]}:${xs[j]}`;
      const ant = abertos.get(chave);
      if (ant && ant.z1 === iz - 1) { ant.z1 = iz; ant.h = Math.max(ant.h, h); novos.set(chave, ant); abertos.delete(chave); }
      else novos.set(chave, { x0: xs[i], x1: xs[j], z0: iz, z1: iz, h });
      i = j + 1;
    }
    for (const r of abertos.values()) prontos.push(r);
    abertos = novos;
  }
  for (const r of abertos.values()) prontos.push(r);
  for (const r of prontos) {
    const caixa: Caixa = { minX: r.x0 * CELULA, maxX: (r.x1 + 1) * CELULA, minZ: r.z0 * CELULA, maxZ: (r.z1 + 1) * CELULA, h: Math.max(r.h, 2.5) };
    registrar(caixa);
  }
  return prontos.length;
}

/** Carrega o mapa da Paulista (GLB do dono) e gera colisores. `progresso` recebe 0..1. */
export function criarPaulista(progresso?: (p: number) => void): Promise<Cidade & { colisores: number }> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      URL_MAPA,
      (gltf) => {
        const grupo = new THREE.Group();
        grupo.name = 'paulista';
        grupo.add(gltf.scene);
        gltf.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.castShadow = false; // a sombra do sol só vale para o que está perto (próxima etapa)
          m.receiveShadow = false;
          m.matrixAutoUpdate = false; // mapa parado
        });
        const colisores = gerarColisores(grupo);
        const p = pontoLivre(-6, 6, -6, 6, 1.0) ?? { x: 0, z: 0 };
        resolve({
          grupo,
          spawn: new THREE.Vector3(p.x, 0, p.z),
          validate: () => (colisores > 0 ? [] : ['Nenhum colisor gerado']),
          colisores,
        });
      },
      (e) => { if (e.total) progresso?.(Math.min(1, e.loaded / e.total)); },
      reject,
    );
  });
}
