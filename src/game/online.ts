import * as THREE from 'three';
import { Remotos } from './remote';
import { Sala, MAX_SESSAO } from '../net/sala';
import { temSupabase } from '../net/supabase';
import { limparDano, limparKill, limparMover, limparTiro, type Mover, type PresencaJogador } from '../net/clean';
import { plausible } from '../net/plausible';
import { ARMAS } from './weapons';
import type { Alvo, Alvos, ContextoTiro } from './combat';

export interface Placar {
  nome: string;
  abates: number;
  mortes: number;
  eu: boolean;
}

interface Ganchos {
  feed(msg: string): void;
  tracer(de: THREE.Vector3, ate: THREE.Vector3): void;
  /** Dano que chegou e passou na validação. Devolve true se isso me matou. */
  receberDano(valor: number): boolean;
  meuEstado(): { x: number; y: number; z: number };
}

/** Liga o jogo ao Supabase Realtime: presença, movimento, tiros, danos e abates. */
export class Online {
  readonly remotos: Remotos;
  sala: Sala | null = null;
  readonly kd = new Map<string, { k: number; m: number }>(); // placar por id
  abates = 0;
  private acertos = new Map<string, number>(); // id → hora (ms) do meu último acerto
  private ultimoAbate = new Map<string, number>(); // id → hora do último abate contado
  private tMove = 0;
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();

  constructor(scene: THREE.Scene, readonly eu: PresencaJogador, private g: Ganchos) {
    this.remotos = new Remotos(scene);
  }

  get ativo(): boolean {
    return !!this.sala;
  }

  /** Entra numa sessão (`?room=` troca o nome do canal, `?max=` baixa o limite). */
  async conectar(sala: string, max = MAX_SESSAO): Promise<boolean> {
    if (!temSupabase()) { this.g.feed('Sem Supabase configurado: jogando sozinho'); return false; }
    try {
      this.sala = await Sala.entrar(sala, this.eu, max, {
        presencaMudou: (lista) => this.remotos.sincronizar(lista, (n) => this.g.feed(`${n} entrou`), (n) => this.g.feed(`${n} saiu`)),
        evento: (nome, p) => this.receber(nome, p),
      });
    } catch {
      this.sala = null;
    }
    if (!this.sala) { this.g.feed('Não consegui conectar: jogando sozinho'); return false; }
    this.g.feed(`Sessão ${this.sala.sessao} — ${this.remotos.mapa.size + 1} jogador(es)`);
    return true;
  }

  private receber(nome: string, payload: unknown): void {
    if (nome === 'move') {
      const m = limparMover(payload);
      if (m && m.i !== this.eu.id) this.remotos.mapa.get(m.i)?.receber(m);
    } else if (nome === 'tiro') {
      const t = limparTiro(payload);
      if (t && t.i !== this.eu.id) this.g.tracer(this.a.set(...t.o), this.b.set(...t.e));
    } else if (nome === 'dano') {
      const d = limparDano(payload);
      if (!d || d.para !== this.eu.id) return;
      const motivo = plausible(d, this.remotos.mapa.get(d.de), this.g.meuEstado(), performance.now());
      if (motivo) { if (import.meta.env.DEV) console.warn('[dano recusado]', motivo); return; }
      const arma = ARMAS[d.a];
      const valor = arma.dano * (d.cab ? arma.cabeca : 1); // recalcula: não confia no valor enviado
      if (this.g.receberDano(valor)) {
        this.sala?.enviar('kill', { de: d.de, para: this.eu.id, a: d.a });
        this.contar(d.de, d.para);
        const quem = this.remotos.mapa.get(d.de)?.info.nome ?? 'alguém';
        this.g.feed(`${quem} derrubou você`);
      }
    } else if (nome === 'kill') {
      const k = limparKill(payload);
      if (!k) return;
      if (k.para !== this.eu.id) this.contar(k.de, k.para);
      const quem = (id: string) => (id === this.eu.id ? 'Você' : this.remotos.mapa.get(id)?.info.nome ?? 'alguém');
      this.g.feed(`${quem(k.de)} derrubou ${quem(k.para)}`);
      if (k.de === this.eu.id) this.contarMeuAbate(k.para);
    }
  }

  private contar(de: string, para: string): void {
    const a = this.kd.get(de) ?? { k: 0, m: 0 }, p = this.kd.get(para) ?? { k: 0, m: 0 };
    a.k++;
    p.m++;
    this.kd.set(de, a);
    this.kd.set(para, p);
  }

  /** Abate só vale se eu acertei a vítima nos últimos 15 s, 1 por vítima a cada 3 s. */
  private contarMeuAbate(vitima: string): void {
    const agora = performance.now();
    if (agora - (this.acertos.get(vitima) ?? -1e9) > 15000) return;
    if (agora - (this.ultimoAbate.get(vitima) ?? -1e9) < 3000) return;
    this.ultimoAbate.set(vitima, agora);
    this.abates++;
  }

  /** Posição, clipe e estado: ~12/s andando, ~4/s parado. */
  enviarMove(dt: number, m: Omit<Mover, 'i'>, parado: boolean): void {
    if (!this.sala) return;
    this.tMove += dt;
    if (this.tMove < (parado ? 0.25 : 1 / 12)) return;
    this.tMove = 0;
    this.sala.enviar('move', { i: this.eu.id, ...m });
  }

  enviarTiro(o: THREE.Vector3, e: THREE.Vector3, silenciado: boolean): void {
    this.sala?.enviar('tiro', { i: this.eu.id, o: [o.x, o.y, o.z], e: [e.x, e.y, e.z], s: silenciado });
  }

  /** Alvos remotos para o hitscan: o atirador calcula o acerto e manda; a vítima valida. */
  alvosRemotos(): Alvos {
    return {
      testarRaio: (ox, oy, oz, dx, dy, dz, max): Alvo | null => {
        let melhor: { t: number; cabeca: boolean; id: string } | null = null;
        for (const [id, r] of this.remotos.mapa) {
          const h = r.testarRaio(ox, oy, oz, dx, dy, dz, max);
          if (h && (!melhor || h.t < melhor.t)) melhor = { ...h, id };
        }
        if (!melhor) return null;
        const id = melhor.id;
        return { t: melhor.t, cabeca: melhor.cabeca, aplicar: (_d, c) => this.enviarDano(id, melhor!.cabeca, c) };
      },
      maisPerto: (x, z, raio) => {
        for (const [id, r] of this.remotos.mapa) {
          if (!r.morto && Math.hypot(r.x - x, r.z - z) < raio) return { aplicar: (_d: number, c: ContextoTiro) => this.enviarDano(id, false, c) };
        }
        return null;
      },
    };
  }

  private enviarDano(para: string, cab: boolean, c: ContextoTiro): boolean {
    this.acertos.set(para, performance.now());
    const cod = ARMAS.findIndex((a) => a.id === c.arma.id);
    this.sala?.enviar('dano', { de: this.eu.id, para, cab, a: cod, o: [c.ox, c.oy, c.oz], d: [c.dx, c.dy, c.dz], al: c.alcance });
    return false; // quem morre decide e avisa com 'kill'
  }

  placar(meu: { nome: string; mortes: number; abates: number }): Placar[] {
    const lista: Placar[] = [{ nome: meu.nome, abates: meu.abates, mortes: meu.mortes, eu: true }];
    for (const [id, r] of this.remotos.mapa) {
      const kd = this.kd.get(id);
      lista.push({ nome: r.info.nome, abates: kd?.k ?? 0, mortes: kd?.m ?? 0, eu: false });
    }
    return lista.sort((x, y) => y.abates - x.abates);
  }

  async sair(): Promise<void> {
    this.remotos.limpar();
    await this.sala?.sair();
    this.sala = null;
  }
}
