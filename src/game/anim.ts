import * as THREE from 'three';
import type { Personagem } from './character';

/** Clipes gerados por funções (sem arquivos de terceiros). */
export type Clip =
  | 'idle' | 'walk' | 'run'
  | 'crouch_idle' | 'crouch_walk'
  | 'jump' | 'fall' | 'land'
  | 'sit_car' | 'ride_bike';

/** Velocidades do jogo (m/s): andar 2,1, correr 6,2, agachado 1. */
export const VEL_JOGO: Partial<Record<Clip, number>> = { walk: 2.1, run: 6.2, crouch_walk: 1.0 };

/** Ciclos por segundo na escala 1 (um ciclo = 2 passos). */
const CICLO: Partial<Record<Clip, number>> = { walk: 1.2, run: 1.6, crouch_walk: 0.9 };

/**
 * Escala de tempo por clipe: velocidade do clipe × escala = velocidade do jogo.
 * Calibrada medindo o pé de apoio (`medirPasso`, seção "Etapa 4" do CLAUDE.md).
 */
export const TIME_SCALE: Partial<Record<Clip, number>> = { walk: 0.974, run: 1.176, crouch_walk: 0.961 };

const OSSOS = [
  'Pelvis', 'Spine', 'Neck', 'Head',
  'L_UpperArm', 'L_ForeArm', 'R_UpperArm', 'R_ForeArm',
  'L_Thigh', 'L_Calf', 'R_Thigh', 'R_Calf', 'L_Foot', 'R_Foot',
] as const;
type Osso = (typeof OSSOS)[number];
const IDX: Record<string, number> = Object.fromEntries(OSSOS.map((o, i) => [o, i]));
const N = OSSOS.length * 3;

/** Pose = rotação (x,y,z) em radianos por osso. x>0 numa coxa leva a perna para trás. */
type Pose = Float32Array;

function def(p: Pose, o: Osso, x: number, y = 0, z = 0) {
  const i = IDX[o] * 3;
  p[i] = x; p[i + 1] = y; p[i + 2] = z;
}

const TAU = Math.PI * 2;

/**
 * Ciclo de locomoção. Apoio: o ângulo da coxa muda em linha reta (o pé fica
 * parado no chão, sem patinar); balanço: curva suave de volta.
 * `d` = fração do ciclo em apoio, `s` = amplitude da coxa, `k` = dobra do joelho.
 */
function ciclo(p: Pose, fase: number, s: number, k: number, a: number, cotovelo: number, inclina: number, d: number, base = 0, baseJoelho = 0) {
  for (const [lado, off] of [['L', 0], ['R', 0.5]] as const) {
    const u = (fase + off) % 1;
    let ang: number, dobra: number;
    if (u < d) {
      ang = s - (2 * s * u) / d; // apoio: de +s (à frente) a −s (atrás)
      dobra = 0.06 + 0.25 * Math.sin((Math.PI * u) / d) ** 2 * (k > 1 ? 1 : 0.3); // amortece o apoio
    } else {
      const v = (u - d) / (1 - d);
      ang = -s + 2 * s * (0.5 - 0.5 * Math.cos(Math.PI * v));
      dobra = 0.06 + k * Math.sin(Math.PI * v) ** 1.1; // joelho dobra no balanço
    }
    def(p, `${lado}_Thigh` as Osso, -(base + ang));
    def(p, `${lado}_Calf` as Osso, baseJoelho + dobra);
    def(p, `${lado}_Foot` as Osso, 0.1);
    const sen = Math.sin((fase + off) * TAU);
    def(p, `${lado}_UpperArm` as Osso, a * sen, 0, lado === 'L' ? 0.08 : -0.08);
    def(p, `${lado}_ForeArm` as Osso, -(cotovelo + 0.15 * Math.max(0, sen)));
  }
  const f = fase * TAU;
  def(p, 'Spine', inclina, Math.sin(f) * 0.08);
  def(p, 'Pelvis', 0, -Math.sin(f) * 0.06);
  def(p, 'Head', -inclina * 0.7);
}

function posar(clip: Clip, fase: number, t: number, p: Pose): void {
  p.fill(0);
  switch (clip) {
    case 'idle': {
      const r = Math.sin(t * 1.8);
      def(p, 'Spine', 0.02 + 0.015 * r);
      def(p, 'Head', -0.02 - 0.01 * r);
      def(p, 'L_UpperArm', 0.02, 0, 0.1); def(p, 'R_UpperArm', 0.02, 0, -0.1);
      def(p, 'L_ForeArm', -0.12); def(p, 'R_ForeArm', -0.12);
      def(p, 'L_Calf', 0.04); def(p, 'R_Calf', 0.04);
      break;
    }
    case 'walk': ciclo(p, fase, 0.62, 1.0, 0.5, 0.2, 0.03, 0.6); break;
    case 'run': ciclo(p, fase, 0.95, 1.9, 0.95, 1.3, 0.2, 0.35); break;
    case 'crouch_idle': {
      const r = Math.sin(t * 1.8);
      def(p, 'L_Thigh', -1.0); def(p, 'R_Thigh', -1.0);
      def(p, 'L_Calf', 1.9); def(p, 'R_Calf', 1.9);
      def(p, 'Spine', 0.4 + 0.015 * r); def(p, 'Head', -0.3);
      def(p, 'L_UpperArm', -0.5, 0, 0.1); def(p, 'R_UpperArm', -0.5, 0, -0.1);
      def(p, 'L_ForeArm', -0.7); def(p, 'R_ForeArm', -0.7);
      break;
    }
    case 'crouch_walk': {
      ciclo(p, fase, 0.55, 0.6, 0.3, 0.7, 0.4, 0.6, 1.0, 1.4);
      break;
    }
    case 'jump': {
      def(p, 'L_Thigh', -0.7); def(p, 'R_Thigh', -0.3);
      def(p, 'L_Calf', 1.0); def(p, 'R_Calf', 0.7);
      def(p, 'Spine', 0.05); def(p, 'Head', -0.1);
      def(p, 'L_UpperArm', -2.3, 0, 0.3); def(p, 'R_UpperArm', -2.3, 0, -0.3);
      def(p, 'L_ForeArm', -0.3); def(p, 'R_ForeArm', -0.3);
      break;
    }
    case 'fall': {
      const b = Math.sin(t * 9) * 0.05;
      def(p, 'L_Thigh', -0.25); def(p, 'R_Thigh', 0.15);
      def(p, 'L_Calf', 0.5); def(p, 'R_Calf', 0.25);
      def(p, 'Spine', 0.1);
      def(p, 'L_UpperArm', -1.5 + b, 0, 0.7); def(p, 'R_UpperArm', -1.5 - b, 0, -0.7);
      def(p, 'L_ForeArm', -0.4); def(p, 'R_ForeArm', -0.4);
      break;
    }
    case 'sit_car': {
      // sentado no carro: coxas para a frente, mãos no volante
      def(p, 'L_Thigh', -1.4); def(p, 'R_Thigh', -1.4);
      def(p, 'L_Calf', 1.45); def(p, 'R_Calf', 1.45);
      def(p, 'Spine', -0.05); def(p, 'Head', 0.05);
      def(p, 'L_UpperArm', -0.95, 0, 0.18); def(p, 'R_UpperArm', -0.95, 0, -0.18);
      def(p, 'L_ForeArm', -0.55); def(p, 'R_ForeArm', -0.55);
      break;
    }
    case 'ride_bike': {
      // na moto: inclinado para o guidão
      def(p, 'L_Thigh', -1.1, 0, 0.18); def(p, 'R_Thigh', -1.1, 0, -0.18);
      def(p, 'L_Calf', 1.25); def(p, 'R_Calf', 1.25);
      def(p, 'Spine', 0.35); def(p, 'Head', -0.3);
      def(p, 'L_UpperArm', -1.15, 0, 0.3); def(p, 'R_UpperArm', -1.15, 0, -0.3);
      def(p, 'L_ForeArm', -0.35); def(p, 'R_ForeArm', -0.35);
      break;
    }
    case 'land': {
      def(p, 'L_Thigh', -0.8); def(p, 'R_Thigh', -0.8);
      def(p, 'L_Calf', 1.5); def(p, 'R_Calf', 1.5);
      def(p, 'Spine', 0.35); def(p, 'Head', -0.2);
      def(p, 'L_UpperArm', -0.6, 0, 0.2); def(p, 'R_UpperArm', -0.6, 0, -0.2);
      break;
    }
  }
}

const LOCOMOCAO = new Set<Clip>(['walk', 'run', 'crouch_walk']);
const PELVIS_BASE = 0.95;
const SOLA = 0.06; // do osso do pé até a sola

/** Animador de um personagem: crossfade entre clipes e pé sempre no chão. */
export class Animador {
  clip: Clip = 'idle';
  private fase = 0;
  private tClip = 0;
  private fade = 1;
  private fadeDur = 0.15;
  private atual: Pose = new Float32Array(N);
  private anterior: Pose = new Float32Array(N);
  private aplicada: Pose = new Float32Array(N);
  private ossos: THREE.Object3D[];
  private v = new THREE.Vector3();
  /** Braços com arma de duas mãos (0..1, suavizado) e inclinação da mira (rad, + = olhando para baixo). */
  armado = false;
  mira = 0;
  private armaW = 0;
  private socoT = 0;
  private sprayT = 0;

  constructor(private p: Personagem) {
    this.ossos = OSSOS.map((n) => p.osso[n]);
    this.atualizar(0, 0);
  }

  /** Troca de clipe com crossfade. `instante` pula a mistura (testes). */
  tocar(clip: Clip, instante = false): void {
    if (clip === this.clip) return;
    const continua = LOCOMOCAO.has(clip) && LOCOMOCAO.has(this.clip);
    this.anterior.set(this.aplicada);
    this.clip = clip;
    this.tClip = 0;
    this.fade = instante ? 1 : 0;
    this.fadeDur = clip === 'jump' || clip === 'land' ? 0.08 : 0.15;
    if (!continua && LOCOMOCAO.has(clip)) this.fase = 0;
  }

  /** Estica o braço com a lata de spray por `seg` segundos. */
  pulverizar(seg = 1.4): void {
    this.sprayT = seg;
  }

  /** Dispara o golpe de braço (soco) de ~0,3 s. */
  soco(): void {
    this.socoT = 0.3;
  }

  /** Avança `dt` segundos. `noChao` = encostar o pé mais baixo no chão. */
  atualizar(dt: number, _vel: number, noChao = true): void {
    void _vel;
    this.tClip += dt;
    const esc = TIME_SCALE[this.clip] ?? 1;
    const ciclo = CICLO[this.clip];
    if (ciclo) this.fase = (this.fase + dt * ciclo * esc) % 1;
    posar(this.clip, this.fase, this.tClip, this.atual);

    this.fade = Math.min(1, this.fade + dt / this.fadeDur);
    const w = this.fade * this.fade * (3 - 2 * this.fade);
    for (let i = 0; i < N; i++) this.aplicada[i] = this.anterior[i] * (1 - w) + this.atual[i] * w;
    this.sobrepor(dt);
    for (let b = 0; b < this.ossos.length; b++) {
      this.ossos[b].rotation.set(this.aplicada[b * 3], this.aplicada[b * 3 + 1], this.aplicada[b * 3 + 2]);
    }
    const pelvis = this.p.osso.Pelvis;
    pelvis.position.y = PELVIS_BASE;
    if (noChao) {
      // Apoia pelo pé mais baixo: o corpo desce quando os joelhos dobram.
      this.p.raiz.updateMatrixWorld(true);
      const m = Math.min(this.pe('L_Foot'), this.pe('R_Foot'));
      pelvis.position.y = PELVIS_BASE - m;
    }
  }

  /** Sobrepõe braços/tronco: arma de duas mãos e soco (por cima do clipe de pernas). */
  private sobrepor(dt: number): void {
    const A = this.aplicada;
    const set = (o: Osso, x: number, y: number, z: number, w: number) => {
      const i = IDX[o] * 3;
      A[i] += (x - A[i]) * w; A[i + 1] += (y - A[i + 1]) * w; A[i + 2] += (z - A[i + 2]) * w;
    };
    this.armaW += ((this.armado ? 1 : 0) - this.armaW) * Math.min(1, dt * 12);
    if (this.armaW > 0.001) {
      const w = this.armaW, p = this.mira;
      set('R_UpperArm', -1.45 + p, 0.1, -0.12, w);
      set('R_ForeArm', -0.3, 0, 0, w);
      set('L_UpperArm', -1.3 + p, -0.55, 0.25, w);
      set('L_ForeArm', -0.5, 0, 0, w);
      set('Spine', 0.05, A[IDX.Spine * 3 + 1] * 0.3, 0, w);
    }
    if (this.sprayT > 0) {
      this.sprayT = Math.max(0, this.sprayT - dt);
      const k = Math.min(1, this.sprayT * 6, (1.4 - this.sprayT) * 6 + 0.2);
      set('R_UpperArm', -1.45 + this.mira * 0.5, 0, -0.1, k);
      set('R_ForeArm', -0.15, 0, 0, k);
    }
    if (this.socoT > 0) {
      this.socoT = Math.max(0, this.socoT - dt);
      const k = Math.sin(Math.PI * (1 - this.socoT / 0.3)); // sobe e volta
      set('R_UpperArm', -1.55, 0, -0.1, k);
      set('R_ForeArm', -0.1, 0, 0, k);
      set('Spine', 0.1, -0.5, 0, k);
    }
  }

  /** Altura da sola relativa à raiz do personagem. */
  pe(nome: string): number {
    return this.p.raiz.worldToLocal(this.p.osso[nome].getWorldPosition(this.v)).y - SOLA;
  }
  /** Posição Z do pé relativa à raiz. */
  peZ(nome: string): number {
    return this.p.raiz.worldToLocal(this.p.osso[nome].getWorldPosition(this.v)).z;
  }
}

/**
 * Mede a velocidade do pé de apoio (m/s) durante 2 ciclos do clipe:
 * é o quanto o corpo anda para o pé não patinar. Devolve média, mín e máx.
 */
export function medirPasso(p: Personagem, clip: Clip) {
  const a = new Animador(p);
  a.tocar(clip, true);
  a.atualizar(0, 0);
  const dt = 1 / 240;
  const ciclos = 2;
  const passos = Math.round(ciclos / ((CICLO[clip] ?? 1) * (TIME_SCALE[clip] ?? 1)) / dt);
  const vel: number[] = [];
  const ant: Record<string, number> = { L_Foot: a.peZ('L_Foot'), R_Foot: a.peZ('R_Foot') };
  for (let i = 0; i < passos; i++) {
    a.atualizar(dt, 0);
    const baixo = a.pe('L_Foot') < a.pe('R_Foot') ? 'L_Foot' : 'R_Foot'; // pé de apoio = o mais baixo
    for (const f of ['L_Foot', 'R_Foot']) {
      const z = a.peZ(f);
      if (f === baixo) vel.push(-(z - ant[f]) / dt); // o pé de apoio anda para trás
      ant[f] = z;
    }
  }
  vel.sort((x, y) => x - y);
  const q = (f: number) => vel[Math.floor(f * (vel.length - 1))];
  return { media: q(0.5), min: q(0.25), max: q(0.75), amostras: vel.length }; // mediana e quartis
}
