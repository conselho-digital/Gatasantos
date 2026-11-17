import * as THREE from 'three';

/** Ossos nomeados (estilo GTA) para a etapa 4 animar. */
export interface Personagem {
  raiz: THREE.Group; // origem nos pés, olhando para +Z
  osso: Record<string, THREE.Object3D>;
}

const ALTURA = 1.8;

function peca(geo: THREE.BufferGeometry, cor: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: cor })); // sem luz
  m.position.set(x, y, z);
  return m;
}

/** Boneco low-poly gerado por código (~700 triângulos). */
export function criarPersonagem(roupa = 0x2e6fbd, calca = 0x2b2f3a, pele = 0xe0b48f): Personagem {
  const raiz = new THREE.Group();
  raiz.name = 'personagem';
  const osso: Record<string, THREE.Object3D> = {};
  const junta = (nome: string, pai: THREE.Object3D, x: number, y: number, z = 0) => {
    const o = new THREE.Object3D();
    o.name = nome;
    o.position.set(x, y, z);
    pai.add(o);
    osso[nome] = o;
    return o;
  };

  const pelvis = junta('Pelvis', raiz, 0, 0.95);
  pelvis.add(peca(new THREE.BoxGeometry(0.34, 0.2, 0.2), calca, 0, 0.02));

  const spine = junta('Spine', pelvis, 0, 0.1);
  spine.add(peca(new THREE.BoxGeometry(0.4, 0.5, 0.22), roupa, 0, 0.28));
  const neck = junta('Neck', spine, 0, 0.56);
  neck.add(peca(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8), pele, 0, 0.04));
  const head = junta('Head', neck, 0, 0.1);
  head.add(peca(new THREE.SphereGeometry(0.11, 12, 10), pele, 0, 0.11));
  head.add(peca(new THREE.SphereGeometry(0.115, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), 0x2a1d14, 0, 0.12, -0.005));

  for (const [lado, sx] of [['L', 1], ['R', -1]] as const) {
    const ombro = junta(`${lado}_UpperArm`, spine, sx * 0.26, 0.5);
    ombro.add(peca(new THREE.CapsuleGeometry(0.055, 0.2, 3, 6), roupa, 0, -0.14));
    const cot = junta(`${lado}_ForeArm`, ombro, 0, -0.3);
    cot.add(peca(new THREE.CapsuleGeometry(0.048, 0.2, 3, 6), pele, 0, -0.13));
    junta(`${lado}_Hand`, cot, 0, -0.3).add(peca(new THREE.SphereGeometry(0.05, 6, 5), pele));

    const coxa = junta(`${lado}_Thigh`, pelvis, sx * 0.1, -0.05);
    coxa.add(peca(new THREE.CapsuleGeometry(0.075, 0.3, 3, 6), calca, 0, -0.22));
    const canela = junta(`${lado}_Calf`, coxa, 0, -0.45);
    canela.add(peca(new THREE.CapsuleGeometry(0.06, 0.3, 3, 6), calca, 0, -0.22));
    const pe = junta(`${lado}_Foot`, canela, 0, -0.45);
    pe.add(peca(new THREE.BoxGeometry(0.11, 0.07, 0.26), 0x1a1a1a, 0, -0.02, 0.05));
  }

  // Sombra projetada por malha simples (círculo escuro no chão)
  const sombra = new THREE.Mesh(
    new THREE.CircleGeometry(0.45, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  sombra.rotation.x = -Math.PI / 2;
  sombra.position.y = 0.03;
  sombra.renderOrder = 5;
  raiz.add(sombra);
  return { raiz, osso };
}

export const ALTURA_PERSONAGEM = ALTURA;
