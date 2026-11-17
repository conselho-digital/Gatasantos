import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { empurrarCirculo } from './collision';
import { LIMITE } from './city';

/** Veículos gerados por código (seção 6.8): 3 carros, 2 motos e 1 viatura. */
export type TipoVeiculo = 'carro' | 'moto' | 'viatura';

export interface ModeloVeiculo {
  id: string;
  nome: string;
  tipo: TipoVeiculo;
  comprimento: number;
  largura: number;
  altura: number;
  corInicial: number; // índice em CORES
  vmax: number; // m/s (carro 120 km/h = 33,3; moto 130 km/h = 36,1)
  entreEixos: number;
}

/** 5 cores iguais para todos: azul escuro, vinho, branco fosco, cinza, amarelo. */
export const CORES: { nome: string; cor: number }[] = [
  { nome: 'Azul escuro', cor: 0x1c2f6b },
  { nome: 'Vinho', cor: 0x6b1c2f },
  { nome: 'Branco fosco', cor: 0xe3e3dc },
  { nome: 'Cinza', cor: 0x6b7078 },
  { nome: 'Amarelo', cor: 0xe6b800 },
];

export const MODELOS: ModeloVeiculo[] = [
  { id: 'gol', nome: 'Gol', tipo: 'carro', comprimento: 3.9, largura: 1.65, altura: 1.4, corInicial: 2, vmax: 33.3, entreEixos: 2.45 },
  { id: 'buffalo', nome: 'Buffalo', tipo: 'carro', comprimento: 4.8, largura: 1.9, altura: 1.35, corInicial: 3, vmax: 33.3, entreEixos: 2.9 },
  { id: 'opala', nome: 'Opala', tipo: 'carro', comprimento: 4.6, largura: 1.8, altura: 1.3, corInicial: 1, vmax: 33.3, entreEixos: 2.75 },
  { id: 'cruiser', nome: 'Cruiser', tipo: 'moto', comprimento: 2.2, largura: 0.8, altura: 1.2, corInicial: 3, vmax: 36.1, entreEixos: 1.5 },
  { id: 'esportiva', nome: 'Esportiva', tipo: 'moto', comprimento: 2.0, largura: 0.7, altura: 1.15, corInicial: 4, vmax: 36.1, entreEixos: 1.4 },
  { id: 'viatura', nome: 'Viatura', tipo: 'viatura', comprimento: 4.7, largura: 1.85, altura: 1.4, corInicial: 2, vmax: 33.3, entreEixos: 2.8 },
];

export const modeloPorId = (id: string) => MODELOS.find((m) => m.id === id) ?? MODELOS[0];

const RAIO_RODA = 0.33;
const matRoda = new THREE.MeshLambertMaterial({ color: 0x15171a });
const geoRoda = new THREE.CylinderGeometry(RAIO_RODA, RAIO_RODA, 0.24, 14).rotateZ(Math.PI / 2);
const geoRodaMoto = new THREE.CylinderGeometry(RAIO_RODA, RAIO_RODA, 0.14, 14).rotateZ(Math.PI / 2);

function caixa(lista: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number, cor: number): void {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  g.deleteAttribute('uv');
  const c = new THREE.Color(cor), n = g.attributes.position.count, cores = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) cores.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  lista.push(g);
}

/** Monta o visual: carroceria numa só malha (cor por vértice) + rodas + barra de luz da viatura. */
function montar(m: ModeloVeiculo, cor: number) {
  const L = m.comprimento, W = m.largura;
  const g: THREE.BufferGeometry[] = [];
  const vidro = 0x1b2630, farol = 0xfff2c0, lanterna = 0xb01818, escuro = 0x222222;
  const rodas: THREE.Object3D[] = [];
  const grupo = new THREE.Group();
  grupo.name = m.id;
  let barra: { r: THREE.Mesh; a: THREE.Mesh } | null = null;
  const corpo = m.tipo === 'viatura' ? 0xf1f1ee : cor;

  if (m.tipo === 'moto') {
    caixa(g, 0.14, 0.28, L * 0.5, 0, 0.62, 0, escuro); // quadro
    caixa(g, 0.26, 0.24, 0.5, 0, 0.92, L * 0.12, cor); // tanque
    caixa(g, 0.24, 0.08, 0.55, 0, 0.86, -L * 0.18, 0x111111); // banco
    caixa(g, 0.2, 0.18, 0.4, 0, 0.7, -L * 0.36, cor); // rabeta
    caixa(g, 0.72, 0.05, 0.06, 0, 1.12, L * 0.3, escuro); // guidão
    caixa(g, 0.07, 0.6, 0.07, 0, 0.78, L * 0.36, 0x888888); // garfo
    caixa(g, 0.18, 0.14, 0.08, 0, 1.0, L * 0.42, farol); // farol
    caixa(g, 0.12, 0.06, 0.05, 0, 0.78, -L * 0.5, lanterna);
    for (const [nome, z] of [['wheel_F', L * 0.37], ['wheel_R', -L * 0.37]] as const) {
      const r = new THREE.Mesh(geoRodaMoto, matRoda);
      r.name = nome;
      r.position.set(0, RAIO_RODA, z);
      grupo.add(r);
      rodas.push(r);
    }
  } else {
    caixa(g, W, 0.5, L, 0, 0.55, 0, corpo); // chassi
    caixa(g, W * 0.9, 0.48, L * 0.5, 0, 1.03, -L * 0.07, vidro); // cabine (vidros)
    caixa(g, W * 0.88, 0.07, L * 0.47, 0, 1.3, -L * 0.07, corpo); // teto
    caixa(g, W, 0.14, 0.12, 0, 0.32, L / 2 + 0.03, escuro); // para-choques
    caixa(g, W, 0.14, 0.12, 0, 0.32, -L / 2 - 0.03, escuro);
    for (const sx of [-1, 1]) {
      caixa(g, 0.32, 0.13, 0.06, sx * W * 0.31, 0.66, L / 2 + 0.01, farol);
      caixa(g, 0.32, 0.13, 0.06, sx * W * 0.31, 0.66, -L / 2 - 0.01, lanterna);
    }
    if (m.tipo === 'viatura') {
      caixa(g, W * 0.9, 0.18, 0.5, 0, 0.7, L * 0.12, 0x1d3a8a); // faixa azul nas portas
    }
    const eixo = m.entreEixos / 2;
    for (const [nome, sx, z] of [['wheel_FL', 1, eixo], ['wheel_FR', -1, eixo], ['wheel_BL', 1, -eixo], ['wheel_BR', -1, -eixo]] as const) {
      const r = new THREE.Mesh(geoRoda, matRoda);
      r.name = nome;
      r.position.set(sx * (W / 2 - 0.05), RAIO_RODA, z);
      grupo.add(r);
      rodas.push(r);
    }
    if (m.tipo === 'viatura') {
      const mr = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.22), new THREE.MeshBasicMaterial({ color: 0x551111 }));
      const ma = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.22), new THREE.MeshBasicMaterial({ color: 0x111155 }));
      mr.position.set(0.28, 1.42, -L * 0.07);
      ma.position.set(-0.28, 1.42, -L * 0.07);
      grupo.add(mr, ma);
      barra = { r: mr, a: ma };
    }
  }
  const merged = mergeGeometries(g, false)!;
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const body = new THREE.Mesh(merged, mat);
  body.name = 'body';
  body.castShadow = false;
  grupo.add(body);
  return { grupo, rodas, body, mat, barra };
}

export interface EntradaVeiculo {
  acel: number; // -1..1 (S negativo = freio/ré)
  dir: number; // -1..1 (positivo = esquerda)
  mao: boolean; // freio de mão
}

export interface Impacto {
  velocidade: number; // m/s contra a parede
  frente: boolean;
}

/**
 * Veículo com física simples: modelo de bicicleta, deslize lateral (`slip`) no freio de mão,
 * colisão por 2 círculos que não trava nem quica (tira só a parte da velocidade que entra na parede).
 */
export class Veiculo {
  readonly grupo: THREE.Group;
  private rodas: THREE.Object3D[];
  private mat: THREE.MeshLambertMaterial;
  private body: THREE.Mesh;
  private barra: { r: THREE.Mesh; a: THREE.Mesh } | null;
  x = 0;
  z = 0;
  h = 0; // direção (0 = +Z)
  v = 0; // velocidade ao longo da direção (m/s)
  slip = 0; // velocidade lateral (m/s)
  esterco = 0; // -1..1 visual
  caido = false; // moto tombada
  luzes = false;
  private giroRoda = 0;
  private inclina = 0;
  private tLuz = 0;

  constructor(readonly modelo: ModeloVeiculo, corIdx: number) {
    const m = montar(modelo, CORES[corIdx % CORES.length].cor);
    this.grupo = m.grupo;
    this.rodas = m.rodas;
    this.mat = m.mat;
    this.body = m.body;
    this.barra = m.barra;
  }

  get ehMoto(): boolean {
    return this.modelo.tipo === 'moto';
  }

  /** Raio dos círculos de colisão. */
  private get raio(): number {
    return this.ehMoto ? 0.5 : this.modelo.largura / 2 + 0.1;
  }

  /** Posição do banco do motorista (esquerda no carro, centro na moto). */
  assento(out: THREE.Vector3): THREE.Vector3 {
    const fx = Math.sin(this.h), fz = Math.cos(this.h), rx = -fz, rz = fx;
    const lado = this.ehMoto ? 0 : -0.38; // esquerda = −direita
    const recuo = this.ehMoto ? -0.15 : -0.05;
    return out.set(this.x + fx * recuo + rx * lado, this.ehMoto ? 0.12 : 0.18, this.z + fz * recuo + rz * lado);
  }

  /** Ponto ao lado da porta: lado -1 = esquerda do veículo, +1 = direita. */
  porta(lado: -1 | 1, afasta = 0.9, out = new THREE.Vector3()): THREE.Vector3 {
    const fx = Math.sin(this.h), fz = Math.cos(this.h), rx = -fz, rz = fx;
    const d = this.modelo.largura / 2 + afasta;
    const s = lado === -1 ? -1 : 1;
    return out.set(this.x + rx * s * d + fx * 0.1, 0, this.z + rz * s * d + fz * 0.1);
  }

  /** Avança a física. Devolve o impacto contra paredes (ou null). */
  atualizar(dt: number, e: EntradaVeiculo, motor: boolean): Impacto | null {
    const m = this.modelo;
    const vmax = m.vmax;
    if (this.caido || !motor) {
      // sem motorista: perde velocidade sozinho
      this.v *= Math.exp(-dt * 1.2);
      e = { acel: 0, dir: 0, mao: false };
    }
    // aceleração cai perto do topo; freio; ré limitada
    if (e.acel > 0) this.v += (this.v < 0 ? 22 : 9 * Math.max(0, 1 - Math.abs(this.v) / vmax) + 1.2) * e.acel * dt;
    else if (e.acel < 0) {
      if (this.v > 0.5) this.v -= 24 * -e.acel * dt;
      else this.v = Math.max(-8, this.v - 6 * -e.acel * dt);
    }
    if (e.acel === 0) this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), 3.2 * dt); // atrito
    this.v = Math.max(-8, Math.min(vmax, this.v));
    if (e.mao) this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), 14 * dt);

    // direção firme em alta: max(0,4, 1 − v/45)
    const maxEster = 0.62 * Math.max(0.4, 1 - Math.abs(this.v) / 45);
    const alvo = e.dir * maxEster;
    this.esterco += (alvo - this.esterco) * Math.min(1, dt * 8);
    const giro = (this.v / m.entreEixos) * Math.tan(this.esterco);
    this.h += giro * dt;
    // freio de mão: a traseira derrapa
    if (e.mao && Math.abs(this.v) > 5) this.slip += -giro * Math.abs(this.v) * 0.35 * dt * 6;
    this.slip *= Math.exp(-dt * (e.mao ? 1.2 : 5));

    const fx = Math.sin(this.h), fz = Math.cos(this.h), rx = -fz, rz = fx;
    let vx = fx * this.v + rx * this.slip, vz = fz * this.v + rz * this.slip;
    this.x += vx * dt;
    this.z += vz * dt;

    // Colisão por 2 círculos (frente e trás): tira só a parte da velocidade que entra na superfície.
    let impacto: Impacto | null = null;
    const meio = m.comprimento / 2 - this.raio - 0.1;
    const tmp = { x: 0, z: 0 };
    for (const [sinal, frente] of [[1, true], [-1, false]] as const) {
      const cx = this.x + fx * meio * sinal, cz = this.z + fz * meio * sinal;
      empurrarCirculo(cx, cz, this.raio, tmp);
      const dx = tmp.x - cx, dz = tmp.z - cz, d = Math.hypot(dx, dz);
      if (d < 1e-6) continue;
      this.x += dx;
      this.z += dz;
      const nx = dx / d, nz = dz / d;
      const vn = vx * nx + vz * nz;
      if (vn < 0) {
        vx -= vn * nx;
        vz -= vn * nz;
        if (!impacto || -vn > impacto.velocidade) impacto = { velocidade: -vn, frente };
      }
    }
    // limites do mapa: não sai da área jogável (fica como parede)
    const lx = LIMITE.halfX - 1.2, lz = LIMITE.halfZ - 1.2;
    if (Math.abs(this.x) > lx || Math.abs(this.z) > lz) {
      if (Math.abs(this.x) > lx) { this.x = Math.sign(this.x) * lx; if (vx * Math.sign(this.x) > 0) { impacto = impacto ?? { velocidade: Math.abs(vx), frente: true }; vx = 0; } }
      if (Math.abs(this.z) > lz) { this.z = Math.sign(this.z) * lz; if (vz * Math.sign(this.z) > 0) { impacto = impacto ?? { velocidade: Math.abs(vz), frente: true }; vz = 0; } }
      this.v = vx * fx + vz * fz;
      this.slip = vx * rx + vz * rz;
    } else if (impacto) {
      this.v = vx * fx + vz * fz;
      this.slip = vx * rx + vz * rz;
    }
    this.visual(dt);
    return impacto;
  }

  private visual(dt: number): void {
    this.grupo.position.set(this.x, 0, this.z);
    this.grupo.rotation.y = this.h;
    this.giroRoda += (this.v / RAIO_RODA) * dt;
    for (const r of this.rodas) {
      r.rotation.x = this.giroRoda;
      if (r.name === 'wheel_FL' || r.name === 'wheel_FR') r.rotation.y = this.esterco;
    }
    // moto: inclina nas curvas; tombada fica deitada
    const alvo = this.caido ? 1.35 : this.ehMoto ? -this.esterco * Math.min(1, Math.abs(this.v) / 14) * 0.9 : 0;
    this.inclina += (alvo - this.inclina) * Math.min(1, dt * 8);
    this.grupo.rotation.z = this.inclina;
    this.grupo.position.y = this.caido ? 0.18 : 0;
    // viatura: luzes piscando (vermelho/azul, ciclo 0,8 s)
    if (this.barra) {
      this.tLuz += dt;
      const f = this.luzes ? Math.floor((this.tLuz % 0.8) / 0.1) % 2 : 0;
      (this.barra.r.material as THREE.MeshBasicMaterial).color.set(this.luzes && f === 0 ? 0xff2020 : 0x551111);
      (this.barra.a.material as THREE.MeshBasicMaterial).color.set(this.luzes && f === 1 ? 0x2a5cff : 0x111155);
    }
  }

  /** Coloca o veículo (garagem). */
  posicionar(x: number, z: number, h: number): void {
    this.x = x; this.z = z; this.h = h; this.v = 0; this.slip = 0; this.caido = false;
    this.visual(0);
  }

  /** Libera geometrias e materiais. */
  dispose(): void {
    this.grupo.removeFromParent();
    this.body.geometry.dispose();
    this.mat.dispose();
    if (this.barra) {
      (this.barra.r.material as THREE.Material).dispose();
      (this.barra.a.material as THREE.Material).dispose();
      this.barra.r.geometry.dispose();
      this.barra.a.geometry.dispose();
    }
  }
}
