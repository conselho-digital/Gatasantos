import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DefPersonagem } from './characters';

/** Ossos nomeados (estilo GTA) animados pelo `Animador`. */
export interface Personagem {
  raiz: THREE.Group; // origem nos pés, olhando para +Z
  osso: Record<string, THREE.Object3D>;
  malha: THREE.SkinnedMesh; // 1 malha, 1 chamada de desenho
}

export const ALTURA_PERSONAGEM = 1.8;

// Sombra projetada por malha simples, compartilhada entre todos os personagens.
let sombraGeo: THREE.CircleGeometry | null = null;
let sombraMat: THREE.MeshBasicMaterial | null = null;

/**
 * Boneco low-poly gerado por código: todas as peças viram UMA malha com esqueleto
 * (cada peça presa a 1 osso, cor por vértice, material sem luz).
 */
export function criarPersonagem(def?: DefPersonagem): Personagem {
  const roupa = def?.roupa ?? 0x2e6fbd, calca = def?.calca ?? 0x2b2f3a, pele = def?.pele ?? 0xe0b48f;
  const corCabelo = def?.cabelo ?? 0x2a1d14;

  const raiz = new THREE.Group();
  raiz.name = 'personagem';
  const osso: Record<string, THREE.Object3D> = {};
  const ossos: THREE.Bone[] = [];
  const repouso = new Map<THREE.Bone, THREE.Vector3>(); // posição de repouso no espaço da malha
  const geos: THREE.BufferGeometry[] = [];

  const junta = (nome: string, pai: THREE.Bone | null, x: number, y: number, z = 0): THREE.Bone => {
    const b = new THREE.Bone();
    b.name = nome;
    b.position.set(x, y, z);
    pai?.add(b);
    const rest = (pai ? repouso.get(pai)!.clone() : new THREE.Vector3()).add(b.position);
    repouso.set(b, rest);
    b.userData.idx = ossos.length;
    ossos.push(b);
    osso[nome] = b;
    return b;
  };

  const peca = (b: THREE.Bone, geo: THREE.BufferGeometry, cor: number, x = 0, y = 0, z = 0) => {
    const r = repouso.get(b)!;
    geo.translate(x + r.x, y + r.y, z + r.z);
    geo.deleteAttribute('uv');
    geo.deleteAttribute('normal');
    const n = geo.attributes.position.count;
    const c = new THREE.Color(cor);
    const cores = new Float32Array(n * 3);
    const idx = new Uint16Array(n * 4);
    const pesos = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      cores.set([c.r, c.g, c.b], i * 3);
      idx[i * 4] = b.userData.idx;
      pesos[i * 4] = 1;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(pesos, 4));
    geos.push(geo);
  };

  const pelvis = junta('Pelvis', null, 0, 0.95);
  peca(pelvis, new THREE.BoxGeometry(0.34, 0.2, 0.2), calca, 0, 0.02);

  const spine = junta('Spine', pelvis, 0, 0.1);
  peca(spine, new THREE.BoxGeometry(0.4, 0.5, 0.22), roupa, 0, 0.28);
  const neck = junta('Neck', spine, 0, 0.56);
  peca(neck, new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8), pele, 0, 0.04);
  const head = junta('Head', neck, 0, 0.1);
  peca(head, new THREE.SphereGeometry(0.11, 12, 10), pele, 0, 0.11);
  peca(head, new THREE.SphereGeometry(0.115, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), corCabelo, 0, 0.12, -0.005);
  for (const ex of [-0.04, 0.04]) peca(head, new THREE.SphereGeometry(0.014, 6, 4), 0x151515, ex, 0.125, 0.101);
  peca(head, new THREE.BoxGeometry(0.05, 0.01, 0.01), 0x8a3b3b, 0, 0.07, 0.106);
  if (def?.cabeloLongo) peca(head, new THREE.BoxGeometry(0.22, 0.3, 0.07), corCabelo, 0, 0.0, -0.1);
  const corAc = def?.corAcessorio ?? 0x222222;
  switch (def?.acessorio) {
    case 'bone':
      peca(head, new THREE.CylinderGeometry(0.118, 0.118, 0.07, 12), corAc, 0, 0.2);
      peca(head, new THREE.BoxGeometry(0.14, 0.012, 0.09), corAc, 0, 0.18, 0.12);
      break;
    case 'quepe':
      peca(head, new THREE.CylinderGeometry(0.125, 0.135, 0.08, 12), corAc, 0, 0.215);
      peca(head, new THREE.BoxGeometry(0.16, 0.012, 0.08), 0x111111, 0, 0.18, 0.12);
      break;
    case 'chapeu':
      peca(head, new THREE.CylinderGeometry(0.11, 0.12, 0.2, 12), corAc, 0, 0.3);
      break;
    case 'bandana':
      peca(head, new THREE.CylinderGeometry(0.119, 0.119, 0.045, 12), corAc, 0, 0.19);
      break;
    default:
  }

  for (const [lado, sx] of [['L', 1], ['R', -1]] as const) {
    const ombro = junta(`${lado}_UpperArm`, spine, sx * 0.26, 0.5);
    peca(ombro, new THREE.CapsuleGeometry(0.055, 0.2, 3, 6), roupa, 0, -0.14);
    const cot = junta(`${lado}_ForeArm`, ombro, 0, -0.3);
    peca(cot, new THREE.CapsuleGeometry(0.048, 0.2, 3, 6), pele, 0, -0.13);
    const mao = junta(`${lado}_Hand`, cot, 0, -0.3);
    peca(mao, new THREE.SphereGeometry(0.05, 6, 5), pele);

    const coxa = junta(`${lado}_Thigh`, pelvis, sx * 0.1, -0.05);
    peca(coxa, new THREE.CapsuleGeometry(0.075, 0.3, 3, 6), calca, 0, -0.22);
    const canela = junta(`${lado}_Calf`, coxa, 0, -0.45);
    peca(canela, new THREE.CapsuleGeometry(0.06, 0.3, 3, 6), calca, 0, -0.22);
    const pe = junta(`${lado}_Foot`, canela, 0, -0.45);
    peca(pe, new THREE.BoxGeometry(0.11, 0.07, 0.26), 0x1a1a1a, 0, -0.02, 0.05);
  }

  const malha = new THREE.SkinnedMesh(
    mergeGeometries(geos, false),
    new THREE.MeshBasicMaterial({ vertexColors: true }), // sem luz
  );
  malha.name = 'corpo';
  malha.frustumCulled = false; // TODO: esfera da pose atual + 1,2 m (seção 6.1)
  malha.add(pelvis);
  raiz.add(malha);
  raiz.updateMatrixWorld(true);
  malha.bind(new THREE.Skeleton(ossos));

  sombraGeo ??= new THREE.CircleGeometry(0.45, 16).rotateX(-Math.PI / 2);
  sombraMat ??= new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
  const sombra = new THREE.Mesh(sombraGeo, sombraMat);
  sombra.position.y = 0.03;
  sombra.renderOrder = 5;
  sombra.name = 'sombra';
  raiz.add(sombra);
  return { raiz, osso, malha };
}
