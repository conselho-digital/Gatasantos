import * as THREE from 'three';
import { criarPersonagem, type Personagem } from './character';
import { achar, hex, type Equipe } from './characters';
import { Animador } from './anim';
import { criarAnelEquipe } from './teams';
import { criarModeloArma, type ArmaNaMao } from './gunmodel';
import { ARMAS } from './weapons';
import type { Mover, PresencaJogador } from '../net/clean';
import { raioCilindro, raioEsfera } from './raycast';
import { MODELOS, Veiculo } from './vehicle';

const ATRASO = 100; // ms de buffer de interpolação
const MAX_SNAPS = 24;

interface Snap extends Mover {
  t: number; // hora de chegada (ms)
}

/** Etiqueta com o nome e a faixa de duas cores da equipe (textura de canvas). */
function criarEtiqueta(nome: string, eq: Equipe): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000000a0';
  g.fillRect(0, 8, 256, 40);
  g.font = '700 28px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillStyle = '#fff';
  g.fillText(nome, 128, 38);
  g.fillStyle = hex(eq.c1);
  g.fillRect(0, 48, 128, 8);
  g.fillStyle = hex(eq.c2);
  g.fillRect(128, 48, 128, 8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(1.5, 0.375, 1);
  s.position.y = 2.2;
  s.renderOrder = 10;
  return s;
}

/** Jogador remoto: personagem próprio, animador, nome, anel da equipe e interpolação. */
export class RemotePlayer {
  readonly p: Personagem;
  private anim: Animador;
  private snaps: Snap[] = [];
  private naMao: ArmaNaMao | null = null;
  private armaCod = -1;
  private etiqueta: THREE.Sprite;
  private parado: Veiculo | null = null; // veículo estacionado (presence)
  private guiado: Veiculo | null = null; // veículo que ele dirige agora
  private guiadoKey = '';
  private seat = new THREE.Vector3();
  x = 0;
  y = 0;
  z = 0;
  giro = 0;
  hp = 100;
  ultimoTiro = 0; // para validar cadência (ms)
  credito = 2; // tiros permitidos acumulados (balde de cadência)
  morto = false;

  constructor(private scene: THREE.Scene, readonly info: PresencaJogador) {
    const eq: Equipe = { nome: info.eq.n, c1: info.eq.c1, c2: info.eq.c2 };
    this.p = criarPersonagem(achar(info.pers));
    this.p.raiz.rotation.order = 'YXZ';
    this.p.raiz.add(criarAnelEquipe(eq));
    this.etiqueta = criarEtiqueta(info.nome, eq);
    this.p.raiz.add(this.etiqueta);
    this.anim = new Animador(this.p);
    this.p.raiz.visible = false; // só aparece depois do 1º movimento
    scene.add(this.p.raiz);
    this.setParado(info.veh);
  }

  /** Veículo estacionado que veio pela presence (atualiza ao vivo, sem recriar o jogador). */
  setParado(v: PresencaJogador['veh']): void {
    this.info.veh = v;
    this.parado?.dispose();
    this.parado = null;
    if (!v) return;
    this.parado = new Veiculo(MODELOS[v.m], v.c);
    this.parado.posicionar(v.x, v.z, v.h);
    this.scene.add(this.parado.grupo);
  }

  receber(m: Mover): void {
    this.snaps.push({ ...m, t: performance.now() });
    if (this.snaps.length > MAX_SNAPS) this.snaps.shift();
  }

  /** Interpola ~100 ms atrás para suavizar a rede. */
  atualizar(dt: number): void {
    if (!this.snaps.length) return;
    const alvo = performance.now() - ATRASO;
    let a = this.snaps[0], b = this.snaps[this.snaps.length - 1];
    for (let i = 0; i < this.snaps.length - 1; i++) {
      if (this.snaps[i].t <= alvo && this.snaps[i + 1].t >= alvo) { a = this.snaps[i]; b = this.snaps[i + 1]; break; }
    }
    const k = b.t > a.t ? Math.min(1, Math.max(0, (alvo - a.t) / (b.t - a.t))) : 1;
    this.x = a.x + (b.x - a.x) * k;
    this.y = a.y + (b.y - a.y) * k;
    this.z = a.z + (b.z - a.z) * k;
    const dr = Math.atan2(Math.sin(b.r - a.r), Math.cos(b.r - a.r));
    this.giro = a.r + dr * k;
    const s = alvo >= b.t ? b : a; // estado discreto: o mais recente já alcançado
    this.hp = s.hp;
    this.morto = s.hp <= 0;

    const raiz = this.p.raiz;
    raiz.visible = true;
    // dirigindo: mostra o veículo dele e o corpo sentado; senão o estacionado
    const dirigindo = s.ve > 0 && !!MODELOS[s.ve - 1];
    const chave = `${s.ve}:${s.vc}`;
    if (dirigindo && this.guiadoKey !== chave) {
      this.guiado?.dispose();
      this.guiado = new Veiculo(MODELOS[s.ve - 1], s.vc);
      this.scene.add(this.guiado.grupo);
      this.guiadoKey = chave;
    } else if (!dirigindo && this.guiado) {
      this.guiado.dispose();
      this.guiado = null;
      this.guiadoKey = '';
    }
    if (this.parado) this.parado.grupo.visible = !dirigindo;
    if (dirigindo && this.guiado) {
      const g = this.guiado;
      const antes = g.v;
      const dist = Math.hypot(this.x - g.x, this.z - g.z);
      g.posicionar(this.x, this.z, a.vh + (b.vh - a.vh) * k);
      g.v = dt > 0 ? (dist / dt) * Math.sign(antes || 1) : 0; // só para girar as rodas
      void antes;
      const seat = g.assento(this.seat);
      this.giro = g.h;
      raiz.position.set(seat.x, seat.y, seat.z);
    } else raiz.position.set(this.x, this.y + (this.morto ? 0.12 : 0), this.z);
    raiz.rotation.y = this.giro;
    raiz.rotation.x = this.morto ? -Math.PI / 2 : 0;
    this.etiqueta.visible = !this.morto;

    if (s.a !== this.armaCod) this.trocarArma(s.a);
    this.anim.armado = !!this.naMao && s.l && !this.morto && !dirigindo;
    if (this.naMao) this.naMao.grupo.visible = !dirigindo;
    this.anim.mira = s.p;
    this.anim.tocar(this.morto ? 'idle' : s.c); // o remoto repete o clipe pelo nome
    this.anim.atualizar(dt, 0, (this.y <= 0 || dirigindo) && !this.morto);
  }

  private trocarArma(cod: number): void {
    this.armaCod = cod;
    this.naMao?.grupo.removeFromParent();
    this.naMao = ARMAS[cod] ? criarModeloArma(ARMAS[cod]) : null;
    if (this.naMao) this.p.osso.R_Hand.add(this.naMao.grupo);
  }

  /** Raio × corpo (cilindro) e cabeça (esfera). */
  testarRaio(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number) {
    if (this.morto || !this.p.raiz.visible) return null;
    const th = raioEsfera(ox, oy, oz, dx, dy, dz, this.x, this.y + 1.62, this.z, 0.16, max);
    const tc = raioCilindro(ox, oy, oz, dx, dy, dz, this.x, this.z, 0.32, this.y, this.y + 1.46, max);
    const t = Math.min(th, tc);
    return t === Infinity ? null : { t, cabeca: th <= tc };
  }

  dispose(): void {
    this.parado?.dispose();
    this.guiado?.dispose();
    this.naMao?.grupo.removeFromParent();
    this.scene.remove(this.p.raiz);
    // libera texturas e geometrias do jogador (a sombra é compartilhada)
    const mat = this.etiqueta.material as THREE.SpriteMaterial;
    mat.map?.dispose();
    mat.dispose();
    this.p.malha.geometry.dispose();
    (this.p.malha.material as THREE.Material).dispose();
    this.p.malha.skeleton.dispose();
    this.p.raiz.traverse((o) => {
      if (o instanceof THREE.Mesh && o.name !== 'sombra' && o !== this.p.malha) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}

/** Todos os jogadores remotos aceitos na sessão. */
export class Remotos {
  readonly mapa = new Map<string, RemotePlayer>();
  constructor(private scene: THREE.Scene) {}

  /** Reconcilia com a presença: cria quem chegou e remove quem saiu. */
  sincronizar(lista: PresencaJogador[], aoEntrar: (n: string) => void, aoSair: (n: string) => void): void {
    const ids = new Set(lista.map((p) => p.id));
    for (const p of lista) {
      const atual = this.mapa.get(p.id);
      if (atual && JSON.stringify(atual.info.veh) !== JSON.stringify(p.veh)) atual.setParado(p.veh);
      if (atual && (atual.info.pers !== p.pers || atual.info.eq.c1 !== p.eq.c1 || atual.info.eq.c2 !== p.eq.c2 || atual.info.nome !== p.nome)) {
        atual.dispose(); // personagem/equipe mudou: recria (atualiza ao vivo)
        this.mapa.delete(p.id);
      }
      if (!this.mapa.has(p.id)) {
        this.mapa.set(p.id, new RemotePlayer(this.scene, p));
        if (!atual) aoEntrar(p.nome);
      }
    }
    for (const [id, r] of this.mapa) {
      if (!ids.has(id)) { aoSair(r.info.nome); r.dispose(); this.mapa.delete(id); }
    }
  }

  atualizar(dt: number): void {
    for (const r of this.mapa.values()) r.atualizar(dt);
  }

  limpar(): void {
    for (const r of this.mapa.values()) r.dispose();
    this.mapa.clear();
  }
}
