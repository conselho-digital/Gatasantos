/** Todo dado vindo da rede passa por aqui (tipos, limites, texto limpo). O canal Realtime é público. */
import type { Clip } from '../game/anim';

export const CLIPES: Clip[] = ['idle', 'walk', 'run', 'crouch_idle', 'crouch_walk', 'jump', 'fall', 'land', 'sit_car', 'ride_bike'];
const LIM = 400; // m: nada passa disso (mapas são menores)

export const num = (v: unknown, min: number, max: number, pad = 0): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : pad;
  return Math.min(max, Math.max(min, n));
};

/** Nome: sem quebras de linha nem caracteres de controle, até 16. */
export function limparNome(v: unknown): string {
  const s = typeof v === 'string' ? [...v].filter((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127).join('') : '';
  return s.trim().slice(0, 16) || 'Jogador';
}

export function limparId(v: unknown): string {
  return typeof v === 'string' && /^[0-9a-f-]{8,40}$/i.test(v) ? v : '';
}

const cor = (v: unknown) => num(v, 0, 0xffffff, 0xffffff) | 0;

export interface PresencaJogador {
  id: string;
  nome: string;
  pers: string;
  eq: { n: string; c1: number; c2: number };
  /** Veículo estacionado (garagem): modelo, cor, posição e direção. */
  veh?: { m: number; c: number; x: number; z: number; h: number };
}

export function limparPresenca(v: unknown): PresencaJogador | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const id = limparId(o.id);
  if (!id) return null;
  const eq = (o.eq ?? {}) as Record<string, unknown>;
  const veh = o.veh && typeof o.veh === 'object' ? (o.veh as Record<string, unknown>) : null;
  return {
    id,
    nome: limparNome(o.nome),
    pers: typeof o.pers === 'string' ? o.pers.slice(0, 24) : 'Astro',
    eq: { n: limparNome(eq.n).slice(0, 20), c1: cor(eq.c1), c2: cor(eq.c2) },
    veh: veh ? { m: num(veh.m, 0, 5) | 0, c: num(veh.c, 0, 4) | 0, x: num(veh.x, -LIM, LIM), z: num(veh.z, -LIM, LIM), h: num(veh.h, -10, 10) } : undefined,
  };
}

export interface Mover {
  i: string;
  x: number; y: number; z: number; // posição (y = altura do pulo)
  r: number; // giro do corpo
  c: Clip;
  hp: number; // 0..100 (%)
  a: number; // código da arma
  p: number; // pitch da mira
  l: boolean; // arma levantada
  rl: boolean; // recarregando
  pr: boolean; // protegido
  ve: number; // veículo que estou dirigindo (0 = nenhum; 1.. = índice do modelo + 1)
  vc: number; // cor do veículo
  vh: number; // direção do veículo
}

export function limparMover(v: unknown): Mover | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const i = limparId(o.i);
  if (!i) return null;
  const c = CLIPES.includes(o.c as Clip) ? (o.c as Clip) : 'idle';
  return {
    i, c,
    x: num(o.x, -LIM, LIM), y: num(o.y, 0, 10), z: num(o.z, -LIM, LIM),
    r: num(o.r, -10, 10), hp: num(o.hp, 0, 100), a: num(o.a, 0, 22) | 0, p: num(o.p, -2, 2),
    l: o.l === true, rl: o.rl === true, pr: o.pr === true,
    ve: num(o.ve, 0, 6) | 0, vc: num(o.vc, 0, 4) | 0, vh: num(o.vh, -10, 10),
  };
}

export interface Tiro {
  i: string;
  o: [number, number, number];
  e: [number, number, number];
  s: boolean; // silenciado
}

const v3 = (v: unknown): [number, number, number] => {
  const a = Array.isArray(v) ? v : [];
  return [num(a[0], -LIM, LIM), num(a[1], -20, 200), num(a[2], -LIM, LIM)];
};

export function limparTiro(v: unknown): Tiro | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const i = limparId(o.i);
  return i ? { i, o: v3(o.o), e: v3(o.e), s: o.s === true } : null;
}

export interface Dano {
  de: string;
  para: string;
  cab: boolean;
  a: number; // código da arma
  o: [number, number, number]; // origem do tiro (cano)
  d: [number, number, number]; // direção unitária
  al: number; // alcance
}

export function limparDano(v: unknown): Dano | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const de = limparId(o.de), para = limparId(o.para);
  if (!de || !para) return null;
  const d = Array.isArray(o.d) ? o.d : [];
  const dx = num(d[0], -1, 1), dy = num(d[1], -1, 1), dz = num(d[2], -1, 1);
  const n = Math.hypot(dx, dy, dz) || 1;
  return { de, para, cab: o.cab === true, a: num(o.a, 0, 22) | 0, o: v3(o.o), d: [dx / n, dy / n, dz / n], al: num(o.al, 0, 400) };
}

export interface Kill {
  de: string;
  para: string;
  a: number;
}

export function limparKill(v: unknown): Kill | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const de = limparId(o.de), para = limparId(o.para);
  return de && para ? { de, para, a: num(o.a, 0, 22) | 0 } : null;
}

export interface Buzina {
  i: string;
  k: number; // 0 carro, 1 moto, 2 sirene ligada, 3 caminhão, 5 batida, 6 sirene desligada
  x: number;
  z: number;
}

export function limparBuzina(v: unknown): Buzina | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const i = limparId(o.i);
  return i ? { i, k: num(o.k, 0, 6) | 0, x: num(o.x, -LIM, LIM), z: num(o.z, -LIM, LIM) } : null;
}
