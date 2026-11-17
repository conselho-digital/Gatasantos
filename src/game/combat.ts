import * as THREE from 'three';
import { ARMAS, armaPorId, DISPERSAO_MIRANDO, DISPERSAO_SEM_MIRAR, GOLPE_ATRASO, LEVANTADA, RAIO_RUIDO, RAIO_RUIDO_SILENCIADO, RECARGA, type Arma, type ArmaId } from './weapons';
import { emitirRuido } from './noise';
import { raioMundo } from './raycast';

/** Dados do tiro entregues ao alvo (a rede usa para a vítima validar). */
export interface ContextoTiro {
  ox: number; oy: number; oz: number; // cano
  dx: number; dy: number; dz: number; // direção unitária
  alcance: number;
  arma: Arma;
  px: number; pz: number; // posição do atirador
}

export interface Alvo {
  t: number;
  cabeca: boolean;
  /** Aplica o dano. Devolve true se o alvo morreu (a rede não sabe: a vítima decide). */
  aplicar(dano: number, ctx: ContextoTiro): boolean;
}

/** Tudo que pode ser acertado: pedestres e jogadores remotos. */
export interface Alvos {
  testarRaio(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): Alvo | null;
  maisPerto(x: number, z: number, raio: number): { aplicar(dano: number, ctx: ContextoTiro): boolean } | null;
}

export const VIDA_MAX = 400;
export const COLETE_MAX = 100;
const RENASCER_EM = 3.5; // s
const PROTECAO = 60; // s depois de renascer
const MAX_TIROS_POR_QUADRO = 3;

export interface Entrada {
  segurar: boolean; // botão de atirar apertado
  clique: boolean; // acabou de apertar
  mirando: boolean;
  recarregar: boolean;
  trocarPara: ArmaId | null;
  roda: number;
  camera: THREE.PerspectiveCamera;
  muzzle: THREE.Vector3 | null; // cano da arma (null = sem arma na mão)
  px: number;
  pz: number;
  yaw: number; // para onde o corpo olha (soco)
}

export interface Ganchos {
  tracer(de: THREE.Vector3, ate: THREE.Vector3): void;
  aviso(msg: string): void;
  marcador(cabeca: boolean, morreu: boolean): void;
  soco(): void;
  renascer(): void;
  recarga?(): void;
  /** Lata de spray: tenta pintar a parede à frente. */
  spray?(): void;
}

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Vector3();
const _p = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();

/** Combate local: armas, cadência em relógio fixo, vida/colete, morrer e renascer. */
export class Combate {
  vida = VIDA_MAX;
  colete = 0;
  arma: Arma = armaPorId('fuzilA');
  municao = new Map<ArmaId, { pente: number; reserva: number }>();
  cd = 0;
  recarga = 0;
  levantada = 0; // s com a arma levantada depois de atirar
  morto = 0;
  protecao = 0;
  abates = 0;
  mortes = 0;
  tiros = 0;
  private golpe = 0;
  private golpeYaw = 0;
  private golpeX = 0;
  private golpeZ = 0;

  constructor(private alvos: Alvos, private g: Ganchos) {
    for (const a of ARMAS) this.municao.set(a.id, { pente: a.pente, reserva: a.reserva });
  }

  get balas() {
    return this.municao.get(this.arma.id)!;
  }

  get recarregando(): boolean {
    return this.recarga > 0;
  }

  /** Dano em mim: colete absorve 60% enquanto durar. Respeita a proteção. */
  /** Pausa: imunidade só no meu jogo. */
  imune = false;

  danoEmMim(valor: number): boolean {
    if (this.imune || this.morto > 0 || this.protecao > 0) return false;
    const abs = Math.min(this.colete, valor * 0.6);
    this.colete -= abs;
    this.vida -= valor - abs;
    if (this.vida <= 0) {
      this.vida = 0;
      this.morto = RENASCER_EM;
      this.mortes++;
      this.recarga = 0;
      this.g.aviso('Você morreu');
      return true;
    }
    return false;
  }

  /** Vida +`n` (máx. 400). Devolve false se já está cheia (o item não é gasto). */
  curar(n: number): boolean {
    if (this.vida >= VIDA_MAX || this.morto > 0) return false;
    this.vida = Math.min(VIDA_MAX, this.vida + n);
    return true;
  }

  /** Colete +`n` (máx. 100). Devolve false se já está cheio. */
  darColete(n: number): boolean {
    if (this.colete >= COLETE_MAX || this.morto > 0) return false;
    this.colete = Math.min(COLETE_MAX, this.colete + n);
    return true;
  }

  trocar(id: ArmaId): void {
    if (id === this.arma.id) return;
    this.arma = armaPorId(id);
    this.recarga = 0;
    this.cd = 0.2; // tempo de sacar
  }

  private proxima(passo: number): void {
    const i = ARMAS.findIndex((a) => a.id === this.arma.id);
    this.trocar(ARMAS[(i + passo + ARMAS.length) % ARMAS.length].id);
  }

  private iniciarRecarga(): void {
    const b = this.balas;
    if (this.recarga > 0 || this.arma.corpoACorpo || b.pente >= this.arma.pente) return;
    if (b.reserva <= 0) { this.g.aviso('Sem munição'); return; }
    this.recarga = RECARGA;
    this.g.recarga?.();
  }

  atualizar(dt: number, e: Entrada): void {
    this.protecao = Math.max(0, this.protecao - dt);
    this.levantada = Math.max(0, this.levantada - dt);

    if (this.morto > 0) {
      this.morto -= dt;
      if (this.morto <= 0) {
        this.vida = VIDA_MAX;
        this.colete = 0;
        this.protecao = PROTECAO;
        this.g.renascer();
        this.g.aviso('Renasceu — protegido por 60 s');
      }
      return;
    }

    if (e.trocarPara) this.trocar(e.trocarPara);
    if (e.roda) this.proxima(e.roda);

    // Recarga
    if (this.recarga > 0) {
      this.recarga -= dt;
      if (this.recarga <= 0) {
        const b = this.balas, falta = this.arma.pente - b.pente, n = Math.min(falta, b.reserva);
        b.pente += n;
        b.reserva -= n;
      }
    }
    if (e.recarregar) this.iniciarRecarga();

    // Golpe pendente (corpo a corpo: o dano só vale ~0,3 s depois do clique)
    if (this.golpe > 0) {
      this.golpe -= dt;
      if (this.golpe <= 0) this.acertarGolpe();
    }

    // Cadência em relógio fixo: a sobra do quadro entra no próximo intervalo.
    this.cd -= dt;
    const quer = this.arma.automatica ? e.segurar : e.clique;
    if (!quer) {
      if (this.cd < 0) this.cd = 0; // parado: não acumula crédito
      return;
    }
    if (this.recarga > 0) return;
    let n = 0;
    while (this.cd <= 1e-12 && n < MAX_TIROS_POR_QUADRO) {
      if (this.arma.id === 'spray') {
        this.g.spray?.();
        this.cd += this.arma.gap;
        break;
      }
      if (this.arma.corpoACorpo) {
        this.golpe = GOLPE_ATRASO;
        this.golpeYaw = e.yaw;
        this.golpeX = e.px;
        this.golpeZ = e.pz;
        this.g.soco();
        this.cd += this.arma.gap;
        break;
      }
      if (this.balas.pente <= 0) { this.iniciarRecarga(); break; }
      this.atirar(e);
      this.cd += this.arma.gap;
      n++;
      if (!this.arma.automatica) break;
    }
    if (this.cd < 0) this.cd = 0;
  }

  private acertarGolpe(): void {
    // pedestre à frente (cone), dentro do alcance do punho
    const alvo = this.alvos.maisPerto(this.golpeX + Math.sin(this.golpeYaw) * 0.8, this.golpeZ + Math.cos(this.golpeYaw) * 0.8, this.arma.alcance - 0.6);
    if (!alvo) return;
    const ctx: ContextoTiro = { ox: this.golpeX, oy: 1.2, oz: this.golpeZ, dx: Math.sin(this.golpeYaw), dy: 0, dz: Math.cos(this.golpeYaw), alcance: this.arma.alcance, arma: this.arma, px: this.golpeX, pz: this.golpeZ };
    const morreu = alvo.aplicar(this.arma.dano, ctx);
    if (morreu) this.abates++;
    this.g.marcador(false, morreu);
  }

  /** Hitscan: da câmera até o ponto de mira; depois do cano até esse ponto. */
  private atirar(e: Entrada): void {
    const a = this.arma;
    this.balas.pente--;
    this.tiros++;
    this.levantada = LEVANTADA;

    // direção da câmera com dispersão em disco
    e.camera.getWorldDirection(_d);
    _o.copy(e.camera.position);
    const disp = e.mirando ? DISPERSAO_MIRANDO : DISPERSAO_SEM_MIRAR;
    _r.crossVectors(_d, _u.set(0, 1, 0)).normalize();
    _u.crossVectors(_r, _d).normalize();
    const ang = Math.random() * Math.PI * 2, raio = Math.sqrt(Math.random()) * disp;
    _d.addScaledVector(_r, Math.cos(ang) * raio).addScaledVector(_u, Math.sin(ang) * raio).normalize();

    // 1) raio da câmera: onde a mira cai
    let t = a.alcance;
    const tp = this.alvos.testarRaio(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, a.alcance);
    const tw = raioMundo(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, a.alcance);
    if (tw < t) t = tw;
    if (tp && tp.t < t) t = tp.t;
    _p.copy(_o).addScaledVector(_d, t); // ponto de mira

    // 2) raio do cano até o ponto de mira (cobertura na frente da arma bloqueia)
    _m.copy(e.muzzle ?? _o);
    _d.subVectors(_p, _m);
    const dist = _d.length();
    if (dist < 1e-4) { emitirRuido(e.px, e.pz, a.silenciada ? RAIO_RUIDO_SILENCIADO : RAIO_RUIDO); return; }
    _d.divideScalar(dist);
    const alcance2 = Math.min(a.alcance, dist + 0.5);
    const tw2 = raioMundo(_m.x, _m.y, _m.z, _d.x, _d.y, _d.z, alcance2);
    const tp2 = this.alvos.testarRaio(_m.x, _m.y, _m.z, _d.x, _d.y, _d.z, alcance2);
    let fim = Math.min(alcance2, tw2);
    if (tp2 && tp2.t <= fim) {
      fim = tp2.t;
      const dano = a.dano * (tp2.cabeca ? a.cabeca : 1);
      const ctx: ContextoTiro = { ox: _m.x, oy: _m.y, oz: _m.z, dx: _d.x, dy: _d.y, dz: _d.z, alcance: alcance2, arma: a, px: e.px, pz: e.pz };
      const morreu = tp2.aplicar(dano, ctx);
      if (morreu) this.abates++;
      this.g.marcador(tp2.cabeca, morreu);
    }
    _p.copy(_m).addScaledVector(_d, Math.min(fim, alcance2));
    this.g.tracer(_m, _p);
    emitirRuido(e.px, e.pz, a.silenciada ? RAIO_RUIDO_SILENCIADO : RAIO_RUIDO);
  }
}
