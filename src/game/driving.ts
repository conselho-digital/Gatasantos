import * as THREE from 'three';
import { dentroDeCaixa } from './collision';
import { MODELOS, Veiculo, type EntradaVeiculo } from './vehicle';
import type { Pedestres } from './npcs';

/** Estágios de entrar e sair (seção 6.4): aproximar → entrando → dirigindo → saindo. */
export type ModoConducao = 'a_pe' | 'aproximar' | 'entrando' | 'dirigindo' | 'saindo';

export interface Ganchos {
  aviso(msg: string): void;
  /** Dano no piloto (batida de moto) e tombo (jogado para a frente). */
  tombo(dano: number, x: number, z: number): void;
}

export interface EstadoConducao {
  modo: ModoConducao;
  /** Corpo preso ao veículo (entrando, dirigindo, saindo). */
  assentado: boolean;
  corpo: { x: number; y: number; z: number; giro: number };
  /** Andar sozinho até um ponto (aproximar). */
  andarPara: { x: number; z: number } | null;
  clip: 'sit_car' | 'ride_bike' | null;
  kmh: number;
}

const ALCANCE_PORTA = 7; // m para o jogador chamar a porta (o veículo nasce a ~5 m)
const T_ENTRAR = 0.7;
const T_SAIR = 0.5;
const T_LEVANTAR = 0.8; // moto caída: levantar antes de subir
const VEL_MAX_SAIR = 3; // m/s: pare para sair
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** Veículo do jogador (um por vez), garagem e as etapas de entrar/sair. */
export class Conducao {
  veiculo: Veiculo | null = null;
  corIdx = 0; // cor do veículo chamado (rede)
  modo: ModoConducao = 'a_pe';
  private t = 0;
  private de = new THREE.Vector3();
  private para = new THREE.Vector3();
  private portaLado: -1 | 1 = -1;
  readonly estado: EstadoConducao = { modo: 'a_pe', assentado: false, corpo: { x: 0, y: 0, z: 0, giro: 0 }, andarPara: null, clip: null, kmh: 0 };

  constructor(private scene: THREE.Scene, private g: Ganchos, private npcs: Pedestres) {}

  get dirigindo(): boolean {
    return this.modo === 'dirigindo';
  }

  /** Chama o veículo: aparece à frente do jogador em lugar livre (≥ 5,4 m de outros). */
  chamar(modelo: number, cor: number, px: number, pz: number, yaw: number, ocupados: { x: number; z: number }[]): boolean {
    if (this.modo !== 'a_pe') { this.g.aviso('Saia do veículo antes de chamar outro'); return false; }
    this.guardar();
    const v = new Veiculo(MODELOS[modelo], cor);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    for (const d of [5, 6.5, 8, 10, 12, 4]) {
      for (const lado of [0, 3, -3, 6, -6]) {
        const x = px + fx * d - fz * lado, z = pz + fz * d + fx * lado;
        const livre = !dentroDeCaixa(x, z, v.modelo.comprimento / 2) && ocupados.every((o) => Math.hypot(o.x - x, o.z - z) > 5.4);
        if (livre) {
          v.posicionar(x, z, yaw);
          this.scene.add(v.grupo);
          this.veiculo = v;
          return true;
        }
      }
    }
    v.dispose();
    this.g.aviso('Sem lugar livre perto para o veículo');
    return false;
  }

  guardar(): void {
    if (!this.veiculo || this.modo !== 'a_pe') return;
    this.veiculo.dispose();
    this.veiculo = null;
  }

  /** Tecla F: entra se estiver perto, sai se estiver dirigindo parado. */
  alternar(px: number, pz: number): void {
    const v = this.veiculo;
    if (!v) return;
    if (this.modo === 'a_pe') {
      if (Math.hypot(v.x - px, v.z - pz) > ALCANCE_PORTA) { this.g.aviso('Chegue perto do veículo (F)'); return; }
      // porta mais perto
      const e = v.porta(-1, 0.7, _a), d = v.porta(1, 0.7, _b);
      this.portaLado = Math.hypot(e.x - px, e.z - pz) <= Math.hypot(d.x - px, d.z - pz) ? -1 : 1;
      if (v.ehMoto) this.portaLado = -1;
      this.modo = 'aproximar';
      this.t = 0;
    } else if (this.modo === 'dirigindo') {
      if (Math.abs(v.v) > VEL_MAX_SAIR) { this.g.aviso('Pare para sair'); return; }
      this.sairPara(v);
    }
  }

  private sairPara(v: Veiculo): void {
    // tenta a porta esquerda, depois a direita, depois atrás
    const cand: THREE.Vector3[] = [v.porta(-1, 0.9), v.porta(1, 0.9), new THREE.Vector3(v.x - Math.sin(v.h) * (v.modelo.comprimento / 2 + 1), 0, v.z - Math.cos(v.h) * (v.modelo.comprimento / 2 + 1))];
    const livre = cand.find((c) => !dentroDeCaixa(c.x, c.z, 0.5)) ?? cand[0];
    v.assento(this.de);
    this.para.copy(livre);
    this.modo = 'saindo';
    this.t = 0;
  }

  /** Atualiza o veículo e o estado do corpo. `jogador` = posição a pé. */
  atualizar(dt: number, ent: EntradaVeiculo, jogador: { x: number; z: number }): EstadoConducao {
    const v = this.veiculo;
    const e = this.estado;
    e.modo = this.modo;
    e.assentado = false;
    e.andarPara = null;
    e.clip = null;
    e.kmh = v ? Math.abs(v.v) * 3.6 : 0;
    if (!v) return e;
    this.t += dt;

    const impacto = v.atualizar(dt, this.modo === 'dirigindo' ? ent : { acel: 0, dir: 0, mao: false }, this.modo === 'dirigindo');
    e.kmh = Math.abs(v.v) * 3.6;
    const clip = v.ehMoto ? 'ride_bike' : 'sit_car';

    // atropelo (> 4,5 m/s): pedestres no círculo da frente
    if (Math.abs(v.v) > 4.5 && this.modo === 'dirigindo') {
      const fx = Math.sin(v.h) * Math.sign(v.v), fz = Math.cos(v.h) * Math.sign(v.v);
      this.npcs.atropelar(v.x + fx * v.modelo.comprimento * 0.4, v.z + fz * v.modelo.comprimento * 0.4, 1.4, Math.abs(v.v), fx, fz);
    }

    switch (this.modo) {
      case 'a_pe':
        break;
      case 'aproximar': {
        const porta = v.porta(this.portaLado, 0.7, _a);
        e.andarPara = { x: porta.x, z: porta.z };
        if (Math.hypot(porta.x - jogador.x, porta.z - jogador.z) < 0.45 || this.t > 3) {
          this.de.set(porta.x, 0, porta.z);
          this.modo = 'entrando';
          this.t = v.caido ? -T_LEVANTAR : 0; // moto caída: levanta antes de subir
          if (v.caido) { v.caido = false; }
        }
        break;
      }
      case 'entrando': {
        const k = Math.min(1, Math.max(0, this.t / T_ENTRAR));
        v.assento(_b);
        e.assentado = true;
        e.clip = clip;
        const s = k * k * (3 - 2 * k);
        e.corpo = { x: this.de.x + (_b.x - this.de.x) * s, y: _b.y * s, z: this.de.z + (_b.z - this.de.z) * s, giro: v.h };
        if (this.t >= T_ENTRAR) { this.modo = 'dirigindo'; this.t = 0; }
        break;
      }
      case 'dirigindo': {
        v.assento(_b);
        e.assentado = true;
        e.clip = clip;
        e.corpo = { x: _b.x, y: _b.y, z: _b.z, giro: v.h };
        // batida de moto acima de 40 km/h (11 m/s): piloto é jogado e leva dano min(380, (v − 8) × 9)
        if (impacto && v.ehMoto && impacto.velocidade > 11) {
          v.caido = true;
          const dano = Math.min(380, (impacto.velocidade - 8) * 9);
          const fx = Math.sin(v.h) * Math.sign(v.v || 1), fz = Math.cos(v.h) * Math.sign(v.v || 1);
          this.modo = 'a_pe';
          this.g.tombo(dano, v.x + fx * 1.8, v.z + fz * 1.8);
          this.g.aviso('Você caiu da moto!');
        }
        break;
      }
      case 'saindo': {
        const k = Math.min(1, this.t / T_SAIR);
        e.assentado = true;
        e.clip = clip;
        const s = k * k * (3 - 2 * k);
        e.corpo = { x: this.de.x + (this.para.x - this.de.x) * s, y: this.de.y * (1 - s), z: this.de.z + (this.para.z - this.de.z) * s, giro: v.h };
        if (this.t >= T_SAIR) { this.modo = 'a_pe'; e.assentado = false; }
        break;
      }
    }
    e.modo = this.modo;
    return e;
  }

  /** Posição final ao sair (o jogo move o jogador para lá). */
  get saida(): THREE.Vector3 {
    return this.para;
  }

  /** Morreu ou foi expulso: sai do veículo no lugar. */
  forcarSaida(): void {
    if (this.modo === 'a_pe') return;
    const v = this.veiculo;
    if (v) v.porta(-1, 0.9, this.para);
    this.modo = 'a_pe';
  }

  limpar(): void {
    this.guardar();
  }
}
