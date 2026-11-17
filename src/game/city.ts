import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { caixaCentro, COLLIDERS, limparColisores } from './collision';
import { texAsfalto, texCalcada, texFachada, texGrama, texTelhado, type TipoFachada } from './textures';

/** Medidas do mapa 1 (metros). */
export const CIDADE = {
  quadrasX: 220, // largura de quadras e prédios
  quadrasZ: 168,
  ruaPerimetral: 12,
  muro: 4,
  avenidaMeia: 12, // avenida de z=-12 a z=12
  calcada: 6, // calçada larga
} as const;

/** Limite jogável (metade em X e Z), dentro do muro. */
export const LIMITE = {
  halfX: CIDADE.quadrasX / 2 + CIDADE.ruaPerimetral,
  halfZ: CIDADE.quadrasZ / 2 + CIDADE.ruaPerimetral,
};

interface Predio {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  tipo: TipoFachada;
}

/** 6 prédios da etapa 2: 3 ao norte e 3 ao sul da avenida. */
const PREDIOS: Predio[] = [
  { x: -70, z: -55, w: 48, d: 36, h: 14, tipo: 'creme' },
  { x: 0, z: -55, w: 36, d: 36, h: 24, tipo: 'vidro' },
  { x: 70, z: -55, w: 48, d: 36, h: 12, tipo: 'ocre' },
  { x: -70, z: 55, w: 48, d: 36, h: 18, tipo: 'concreto' },
  { x: 0, z: 55, w: 36, d: 36, h: 12, tipo: 'ocre' },
  { x: 70, z: 55, w: 48, d: 36, h: 30, tipo: 'vidro' },
];

/**
 * Caixa com UV em metros: laterais repetem a fachada (12 m x 3 m),
 * topo usa a textura de telhado. Grupos: 0 = laterais, 1 = topo/base.
 */
function geoCaixa(p: Predio): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(p.w, p.h, p.d);
  g.translate(p.x, p.h / 2, p.z);
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (Math.abs(nor.getY(i)) > 0.5) uv.setXY(i, x / 6, z / 6);
    else if (Math.abs(nor.getX(i)) > 0.5) uv.setXY(i, z / 12, y / 3);
    else uv.setXY(i, x / 12, y / 3);
  }
  // BoxGeometry: grupos px,nx,py,ny,pz,nz -> laterais = 0, topo/base = 1
  g.groups.forEach((gr, i) => (gr.materialIndex = i === 2 || i === 3 ? 1 : 0));
  return g;
}

function plano(cx: number, cz: number, w: number, d: number, y: number, mat: THREE.Material, uvM: number): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv, pos = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / uvM, pos.getZ(i) / uvM);
  const m = new THREE.Mesh(g, mat);
  m.position.set(cx, y, cz);
  m.receiveShadow = true;
  return m;
}

export interface Cidade {
  grupo: THREE.Group;
  spawn: THREE.Vector3;
  validate(): string[];
}

/** Monta o mapa 1 simples (etapa 2) e registra os colisores. */
export function criarCidade(): Cidade {
  limparColisores();
  const grupo = new THREE.Group();
  grupo.name = 'cidade';
  const { quadrasX: QX, quadrasZ: QZ, avenidaMeia: AM, calcada: CAL, muro: MURO } = CIDADE;
  const halfX = LIMITE.halfX, halfZ = LIMITE.halfZ;

  const matGrama = new THREE.MeshLambertMaterial({ map: texGrama() });
  const matCalcada = new THREE.MeshLambertMaterial({
    map: texCalcada(), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const asf = texAsfalto(4, AM * 2);
  const matAsfalto = new THREE.MeshLambertMaterial({
    map: asf, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });

  // Chão: grama grande e calçada em todo o miolo (quadras), ruas por cima.
  grupo.add(plano(0, 0, halfX * 2 + 40, halfZ * 2 + 40, 0, matGrama, 8));
  grupo.add(plano(0, 0, QX, QZ, 0, matCalcada, 4));

  // Avenida no eixo X (z de -12 a 12): textura em U ao longo da rua.
  const avGeo = new THREE.PlaneGeometry(halfX * 2, AM * 2);
  avGeo.rotateX(-Math.PI / 2);
  const avUv = avGeo.attributes.uv, avPos = avGeo.attributes.position;
  for (let i = 0; i < avUv.count; i++) avUv.setXY(i, avPos.getX(i) / 12, (avPos.getZ(i) + AM) / (AM * 2));
  const av = new THREE.Mesh(avGeo, matAsfalto);
  av.receiveShadow = true;
  grupo.add(av);

  // Rua perimetral (4 tiras)
  const per = CIDADE.ruaPerimetral;
  const tira = (cx: number, cz: number, w: number, d: number) => {
    const m = plano(cx, cz, w, d, 0, matAsfalto, 12);
    grupo.add(m);
  };
  tira(0, -(QZ / 2 + per / 2), halfX * 2, per);
  tira(0, QZ / 2 + per / 2, halfX * 2, per);
  tira(-(QX / 2 + per / 2), 0, per, QZ);
  tira(QX / 2 + per / 2, 0, per, QZ);

  // Calçadas largas ao longo da avenida (mais claras, já cobertas pelo piso de calçada)
  // Parede de limite: muro preto de 4 m
  const matMuro = new THREE.MeshLambertMaterial({ color: 0x15171a });
  const muro = (cx: number, cz: number, w: number, d: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, MURO, d), matMuro);
    m.position.set(cx, MURO / 2, cz);
    grupo.add(m);
    COLLIDERS.push(caixaCentro(cx, cz, w, d));
  };
  const esp = 1;
  muro(0, -halfZ - esp / 2, halfX * 2 + esp * 2, esp);
  muro(0, halfZ + esp / 2, halfX * 2 + esp * 2, esp);
  muro(-halfX - esp / 2, 0, esp, halfZ * 2);
  muro(halfX + esp / 2, 0, esp, halfZ * 2);

  // Prédios: geometria fundida por tipo de fachada.
  const matTopo = new THREE.MeshLambertMaterial({ map: texTelhado() });
  const porTipo = new Map<TipoFachada, THREE.BufferGeometry[]>();
  for (const p of PREDIOS) {
    (porTipo.get(p.tipo) ?? porTipo.set(p.tipo, []).get(p.tipo)!).push(geoCaixa(p));
    COLLIDERS.push(caixaCentro(p.x, p.z, p.w, p.d));
  }
  for (const [tipo, geos] of porTipo) {
    const merged = mergeGeometries(geos, true);
    const m = new THREE.Mesh(merged, [
      new THREE.MeshLambertMaterial({ map: texFachada(tipo) }),
      matTopo,
    ]);
    m.castShadow = true;
    m.receiveShadow = true;
    grupo.add(m);
  }
  void CAL;

  const validate = (): string[] => {
    const av: string[] = [];
    for (const p of PREDIOS) {
      const zMin = Math.abs(p.z) - p.d / 2;
      if (zMin < AM + CAL * 0.5) av.push(`Prédio em (${p.x},${p.z}) invade a avenida/calçada`);
      if (Math.abs(p.x) + p.w / 2 > QX / 2) av.push(`Prédio em (${p.x},${p.z}) sai da quadra`);
      for (const q of PREDIOS) {
        if (q === p) continue;
        if (Math.abs(p.x - q.x) < (p.w + q.w) / 2 && Math.abs(p.z - q.z) < (p.d + q.d) / 2) {
          av.push(`Prédios ${p.x},${p.z} e ${q.x},${q.z} se sobrepõem`);
        }
      }
    }
    return av;
  };
  if (import.meta.env.DEV) {
    const erros = validate();
    if (erros.length) console.warn('[cidade] problemas:', erros);
  }

  return { grupo, spawn: new THREE.Vector3(0, 0, 0), validate };
}
