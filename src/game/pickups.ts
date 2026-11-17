import * as THREE from 'three';
import { dentroDeCaixa } from './collision';
import { LIMITE } from './city';

/** Itens de vida (+25% = 100 de 400) e colete (+50), em posições fixas por mapa (seção 6.7). */
export type TipoItem = 'vida' | 'colete';

const QUANTOS = 30; // de cada tipo
const DIST_MIN = 14; // m entre itens
const PEGA_A = 1.3; // m
const VOLTA_EM = 90; // s (estado local)

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Item {
  tipo: TipoItem;
  x: number;
  z: number;
  volta: number; // s restantes até reaparecer (0 = ativo)
}

/** 3 chamadas de desenho: caixas de vida, caixas de colete e o brilho no chão (todos InstancedMesh). */
export class Pickups {
  readonly itens: Item[] = [];
  private vidaMesh: THREE.InstancedMesh;
  private coleteMesh: THREE.InstancedMesh;
  private brilho: THREE.InstancedMesh;
  private t = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();

  /** `semente` por mapa: as posições são sempre as mesmas. */
  constructor(scene: THREE.Scene, semente: number) {
    const r = rng(semente);
    const lista: { x: number; z: number }[] = [];
    // sorteio com semente: em chão livre, a ≥ 14 m uma da outra
    for (let i = 0; i < QUANTOS * 2 && lista.length < QUANTOS * 2; i++) {
      for (let tent = 0; tent < 400; tent++) {
        const x = (r() * 2 - 1) * (LIMITE.halfX - 4), z = (r() * 2 - 1) * (LIMITE.halfZ - 4);
        if (dentroDeCaixa(x, z, 1.2)) continue;
        if (lista.some((o) => Math.hypot(o.x - x, o.z - z) < DIST_MIN)) continue;
        lista.push({ x, z });
        break;
      }
    }
    lista.forEach((p, i) => this.itens.push({ tipo: i % 2 === 0 ? 'vida' : 'colete', x: p.x, z: p.z, volta: 0 }));

    const caixa = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    this.vidaMesh = new THREE.InstancedMesh(caixa, new THREE.MeshBasicMaterial({ color: 0xe53935 }), QUANTOS);
    this.coleteMesh = new THREE.InstancedMesh(caixa, new THREE.MeshBasicMaterial({ color: 0x3b82f6 }), QUANTOS);
    const disco = new THREE.CircleGeometry(0.75, 20).rotateX(-Math.PI / 2);
    this.brilho = new THREE.InstancedMesh(disco, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }), QUANTOS * 2);
    for (const m of [this.vidaMesh, this.coleteMesh, this.brilho]) {
      m.frustumCulled = false;
      m.name = 'pickups';
      scene.add(m);
    }
    this.atualizarMatrizes();
  }

  /** Atualiza (giro e flutuação) e devolve os itens pegos neste quadro. */
  atualizar(dt: number, px: number, pz: number, aoPegar: (t: TipoItem) => boolean): void {
    this.t += dt;
    for (const it of this.itens) {
      if (it.volta > 0) { it.volta = Math.max(0, it.volta - dt); continue; }
      if (Math.hypot(it.x - px, it.z - pz) < PEGA_A && aoPegar(it.tipo)) it.volta = VOLTA_EM; // só pega se ajudar
    }
    this.atualizarMatrizes();
  }

  private atualizarMatrizes(): void {
    let iv = 0, ic = 0, ib = 0;
    for (const it of this.itens) {
      const ativo = it.volta <= 0;
      const mesh = it.tipo === 'vida' ? this.vidaMesh : this.coleteMesh;
      const idx = it.tipo === 'vida' ? iv++ : ic++;
      this.e.set(0, this.t * 1.6, 0);
      this.q.setFromEuler(this.e);
      this.p.set(it.x, 0.9 + Math.sin(this.t * 2 + it.x) * 0.12, it.z);
      this.s.setScalar(ativo ? 1 : 0.0001);
      this.m.compose(this.p, this.q, this.s);
      mesh.setMatrixAt(idx, this.m);
      this.p.set(it.x, 0.05, it.z);
      this.q.identity();
      this.s.setScalar(ativo ? 1 : 0.0001);
      this.m.compose(this.p, this.q, this.s);
      this.brilho.setMatrixAt(ib++, this.m);
    }
    this.vidaMesh.count = iv;
    this.coleteMesh.count = ic;
    this.brilho.count = ib;
    for (const m of [this.vidaMesh, this.coleteMesh, this.brilho]) m.instanceMatrix.needsUpdate = true;
  }

  resumo() {
    return this.itens.map((i) => ({ tipo: i.tipo, x: +i.x.toFixed(1), z: +i.z.toFixed(1), ativo: i.volta <= 0 }));
  }
}
