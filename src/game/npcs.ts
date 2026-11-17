import * as THREE from 'three';
import { criarPersonagem, type Personagem } from './character';
import { PERSONAGENS, type DefPersonagem } from './characters';
import { Animador, VEL_JOGO } from './anim';
import { LIMITE } from './city';
import { dentroDeCaixa, empurrarCirculo, pontoLivre } from './collision';
import { raioCilindro, raioEsfera, raioMundo } from './raycast';

/** Pedestres locais (seção 6.9): cada jogador vê os seus, nada vai pela rede. */
type Estado = 'andar' | 'esperar' | 'fugir' | 'esconder' | 'morto';

const VIDA = 60;
const RAIO_CORPO = 0.32;
const PARAR_ALEM = 75; // m: congela
const SUMIR_ALEM = 110; // m: some
const TEMPO_NO_CHAO = 9; // s
const RAIO_SOLO = 0.4;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Civis leves: sorteia cores de roupa e pele (sem polícia nem famosos). */
function defCivil(r: () => number): DefPersonagem {
  const roupas = [0x3b82f6, 0xef4444, 0x22c55e, 0xf59e0b, 0x8b5cf6, 0x14b8a6, 0xe5e7eb, 0x6b7280, 0xec4899];
  const calcas = [0x1f2937, 0x374151, 0x1e3a8a, 0x4b5563, 0x78350f];
  const peles = [0xf0cfb0, 0xe0b48f, 0xc99572, 0x9a6a45, 0x7a4d31, 0x5a3820];
  const cabelos = [0x0e0a08, 0x2a1a10, 0x4a3322, 0xb5651d, 0x888888];
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const base = PERSONAGENS[0];
  return {
    ...base, id: 'civil', nome: 'Civil', categoria: 'Famosos',
    roupa: pick(roupas), calca: pick(calcas), pele: pick(peles), cabelo: pick(cabelos),
    cabeloLongo: r() < 0.3, acessorio: r() < 0.2 ? 'bone' : 'nenhum', corAcessorio: pick(roupas),
  };
}

class Pedestre {
  p: Personagem;
  anim: Animador;
  x = 0;
  z = 0;
  giro = 0;
  vida = VIDA;
  estado: Estado = 'esperar';
  t = 0; // tempo no estado
  duracao = 0;
  alvoX = 0;
  alvoZ = 0;
  queda = 0; // 0..1 deitado
  parado = 0; // tempo sem avançar (preso)

  constructor(def: DefPersonagem) {
    this.p = criarPersonagem(def);
    this.p.raiz.rotation.order = 'YXZ'; // gira em Y e depois inclina (queda)
    this.anim = new Animador(this.p);
  }

  vivo(): boolean {
    return this.estado !== 'morto';
  }
}

export class Pedestres {
  readonly lista: Pedestre[] = [];
  private jogador = { x: 0, z: 0 };
  private rnd = rng(7);

  constructor(scene: THREE.Scene, quantidade: number, jogadorX: number, jogadorZ: number) {
    this.jogador = { x: jogadorX, z: jogadorZ };
    const r = rng(99);
    for (let i = 0; i < quantidade; i++) {
      const n = new Pedestre(defCivil(r));
      // 8 nascem perto de quem entrou (10–45 m); o resto espalhado pelo mapa
      const perto = i < 8;
      this.reposicionar(n, perto ? 10 : 0, perto ? 45 : 0);
      this.lista.push(n);
      scene.add(n.p.raiz);
    }
  }

  private reposicionar(n: Pedestre, dMin: number, dMax: number): void {
    for (let i = 0; i < 60; i++) {
      let ponto: { x: number; z: number } | null;
      if (dMax > 0) {
        const a = this.rnd() * Math.PI * 2, d = dMin + this.rnd() * (dMax - dMin);
        const x = this.jogador.x + Math.cos(a) * d, z = this.jogador.z + Math.sin(a) * d;
        ponto = this.valido(x, z) ? { x, z } : null;
      } else {
        ponto = pontoLivre(-LIMITE.halfX + 2, LIMITE.halfX - 2, -LIMITE.halfZ + 2, LIMITE.halfZ - 2, RAIO_SOLO + 0.2, this.rnd);
        if (ponto && Math.hypot(ponto.x - this.jogador.x, ponto.z - this.jogador.z) < dMin) ponto = null;
      }
      if (ponto) {
        n.x = ponto.x;
        n.z = ponto.z;
        break;
      }
    }
    n.vida = VIDA;
    n.estado = 'esperar';
    n.t = 0;
    n.duracao = 0.5 + this.rnd() * 3;
    n.queda = 0;
    n.giro = this.rnd() * Math.PI * 2;
    n.p.raiz.visible = true;
  }

  private valido(x: number, z: number): boolean {
    return Math.abs(x) < LIMITE.halfX - 2 && Math.abs(z) < LIMITE.halfZ - 2 && !dentroDeCaixa(x, z, RAIO_SOLO + 0.2);
  }

  /** Novo destino: ponto livre a 8–30 m, em linha reta. */
  private novoAlvo(n: Pedestre): void {
    for (let i = 0; i < 20; i++) {
      const a = this.rnd() * Math.PI * 2, d = 8 + this.rnd() * 22;
      const x = n.x + Math.cos(a) * d, z = n.z + Math.sin(a) * d;
      if (!this.valido(x, z)) continue;
      const dx = Math.cos(a), dz = Math.sin(a);
      if (raioMundo(n.x, 1, n.z, dx, 0, dz, d) !== Infinity) continue; // caminho livre
      n.alvoX = x;
      n.alvoZ = z;
      n.estado = 'andar';
      n.t = 0;
      n.parado = 0;
      return;
    }
    n.estado = 'esperar';
    n.t = 0;
    n.duracao = 2 + this.rnd() * 5;
  }

  /** Barulho: quem está dentro do raio se assusta e foge para fora da linha de visão. */
  assustar(x: number, z: number, raio: number): void {
    for (const n of this.lista) {
      if (!n.vivo() || Math.hypot(n.x - x, n.z - z) > raio) continue;
      this.fugir(n, x, z);
    }
  }

  private fugir(n: Pedestre, fx: number, fz: number): void {
    const longe = Math.atan2(n.x - fx, n.z - fz); // direção oposta à fonte
    let melhor: { x: number; z: number; d: number } | null = null;
    let escondido = false;
    for (let i = 0; i < 16; i++) {
      const a = longe + (this.rnd() - 0.5) * Math.PI, d = 6 + this.rnd() * 19;
      const x = n.x + Math.sin(a) * d, z = n.z + Math.cos(a) * d;
      if (!this.valido(x, z)) continue;
      // escondido = parede entre a fonte do barulho e o ponto
      const ex = x - fx, ez = z - fz, dist = Math.hypot(ex, ez);
      const oculto = raioMundo(fx, 1.5, fz, ex / dist, 0, ez / dist, dist) !== Infinity;
      const dn = Math.hypot(x - n.x, z - n.z);
      if (oculto && (!escondido || dn < melhor!.d)) { melhor = { x, z, d: dn }; escondido = true; }
      else if (!escondido && (!melhor || dn > melhor.d)) melhor = { x, z, d: dn };
    }
    n.estado = 'fugir';
    n.t = 0;
    n.parado = 0;
    n.alvoX = melhor?.x ?? n.x + Math.sin(longe) * 15;
    n.alvoZ = melhor?.z ?? n.z + Math.cos(longe) * 15;
  }

  /** Dano em um pedestre. Devolve true se morreu. */
  dano(n: Pedestre, valor: number, origemX: number, origemZ: number): boolean {
    if (!n.vivo()) return false;
    n.vida -= valor;
    if (n.vida <= 0) {
      n.estado = 'morto';
      n.t = 0;
      n.queda = 0;
      n.giro = Math.atan2(origemX - n.x, origemZ - n.z) + Math.PI; // cai de costas para o tiro
      return true;
    }
    // reação: é empurrado para longe do golpe e foge
    const a = Math.atan2(n.x - origemX, n.z - origemZ);
    const nx = n.x + Math.sin(a) * 0.4, nz = n.z + Math.cos(a) * 0.4;
    if (this.valido(nx, nz)) { n.x = nx; n.z = nz; }
    this.fugir(n, origemX, origemZ);
    return false;
  }

  /** Primeiro pedestre vivo atingido pelo raio. */
  testarRaio(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number) {
    let melhor: { t: number; n: Pedestre; cabeca: boolean } | null = null;
    for (const n of this.lista) {
      if (!n.vivo() || !n.p.raiz.visible) continue;
      if (Math.hypot(n.x - ox, n.z - oz) > max + 2) continue;
      const th = raioEsfera(ox, oy, oz, dx, dy, dz, n.x, 1.62, n.z, 0.16, max);
      const tc = raioCilindro(ox, oy, oz, dx, dy, dz, n.x, n.z, RAIO_CORPO, 0, 1.46, max);
      const t = Math.min(th, tc);
      if (t !== Infinity && (!melhor || t < melhor.t)) melhor = { t, n, cabeca: th <= tc };
    }
    return melhor;
  }

  /** Pedestre vivo mais perto de (x,z) dentro de `raio` (soco). */
  maisPerto(x: number, z: number, raio: number): Pedestre | null {
    let m: Pedestre | null = null, md = raio;
    for (const n of this.lista) {
      if (!n.vivo()) continue;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < md) { md = d; m = n; }
    }
    return m;
  }

  atualizar(dt: number, jx: number, jz: number): void {
    this.jogador.x = jx;
    this.jogador.z = jz;
    const tmp = { x: 0, z: 0 };
    for (const n of this.lista) {
      const d = Math.hypot(n.x - jx, n.z - jz);
      n.p.raiz.visible = d <= SUMIR_ALEM;
      if (d > PARAR_ALEM && n.vivo()) continue; // longe: congelado
      n.t += dt;

      let vel = 0;
      switch (n.estado) {
        case 'esperar':
          if (n.t >= n.duracao) this.novoAlvo(n);
          break;
        case 'andar':
        case 'fugir': {
          const correndo = n.estado === 'fugir';
          vel = correndo ? VEL_JOGO.run! : VEL_JOGO.walk!;
          const dx = n.alvoX - n.x, dz = n.alvoZ - n.z, dist = Math.hypot(dx, dz);
          if (dist < 0.5) {
            if (correndo) { n.estado = 'esconder'; n.duracao = 10 + this.rnd() * 8; }
            else { n.estado = 'esperar'; n.duracao = 2 + this.rnd() * 5; }
            n.t = 0;
            vel = 0;
            break;
          }
          const passo = Math.min(vel * dt, dist);
          const ax = n.x, az = n.z;
          empurrarCirculo(n.x + (dx / dist) * passo, n.z + (dz / dist) * passo, RAIO_SOLO, tmp);
          n.x = tmp.x;
          n.z = tmp.z;
          n.giro = Math.atan2(dx, dz);
          if (Math.hypot(n.x - ax, n.z - az) < passo * 0.3) {
            n.parado += dt; // preso numa parede
            if (n.parado > 0.6) { n.estado = n.estado === 'fugir' ? 'esconder' : 'esperar'; n.t = 0; n.duracao = n.estado === 'esconder' ? 10 + this.rnd() * 8 : 2 + this.rnd() * 5; }
          } else n.parado = 0;
          break;
        }
        case 'esconder':
          if (n.t >= n.duracao) { n.estado = 'esperar'; n.t = 0; n.duracao = 1 + this.rnd() * 3; }
          break;
        case 'morto':
          n.queda = Math.min(1, n.queda + dt / 0.4);
          if (n.t >= TEMPO_NO_CHAO) {
            this.reposicionar(n, 40, 90); // outro nasce a ≥ 40 m
            if (!n.p.raiz.visible) n.p.raiz.visible = true;
          }
          break;
      }

      // Animação
      if (n.estado === 'morto') {
        n.p.raiz.rotation.x = -n.queda * (Math.PI / 2);
        n.p.raiz.position.set(n.x, n.queda * 0.12, n.z);
        n.p.raiz.rotation.y = n.giro;
        n.anim.tocar('idle');
        n.anim.atualizar(dt, 0, false);
        continue;
      }
      n.p.raiz.rotation.x = 0;
      n.p.raiz.position.set(n.x, 0, n.z);
      n.p.raiz.rotation.y = n.giro;
      n.anim.tocar(n.estado === 'fugir' ? 'run' : n.estado === 'andar' ? 'walk' : n.estado === 'esconder' ? 'crouch_idle' : 'idle');
      n.anim.atualizar(dt, vel);
    }
  }

  /** Resumo para inspeção no dev. */
  resumo() {
    return this.lista.map((n) => ({ x: +n.x.toFixed(1), z: +n.z.toFixed(1), estado: n.estado, vida: n.vida, visivel: n.p.raiz.visible }));
  }
}
