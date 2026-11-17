/** Todo dado vindo da rede passa por aqui (tipos, limites, texto limpo). O canal Realtime é público. */
import type { Clip } from '../game/anim';

export const CLIPES: Clip[] = ['idle', 'walk', 'run', 'crouch_idle', 'crouch_walk', 'jump', 'fall', 'land'];
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
}

export function limparPresenca(v: unknown): PresencaJogador | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const id = limparId(o.id);
  if (!id) return null;
  const eq = (o.eq ?? {}) as Record<string, unknown>;
  return {
    id,
    nome: limparNome(o.nome),
    pers: typeof o.pers === 'string' ? o.pers.slice(0, 24) : 'Astro',
    eq: { n: limparNome(eq.n).slice(0, 20), c1: cor(eq.c1), c2: cor(eq.c2) },
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
