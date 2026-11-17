/** Configurações do jogador (seção 6.17), guardadas no navegador. Padrões: sensibilidade 0,6x, FPS livre. */
export interface Config {
  sens: number; // 0,2x – 3x
  fps: number; // 0 = sem limite; 30/45/60/90/120
  volMaster: number; // sliders 0..1 (viram ganho ao quadrado)
  volSfx: number;
  volVeiculos: number;
}

export const PADRAO: Config = { sens: 0.6, fps: 0, volMaster: 1, volSfx: 1, volVeiculos: 1 };
export const LIMITES_FPS = [0, 30, 45, 60, 90, 120];
const CHAVE = 'gata-opcoes';

const num = (v: unknown, min: number, max: number, pad: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : pad);

export function lerConfig(): Config {
  try {
    const o = JSON.parse(localStorage.getItem(CHAVE) ?? '{}') as Partial<Config>;
    return {
      sens: num(o.sens, 0.2, 3, PADRAO.sens),
      fps: LIMITES_FPS.includes(o.fps as number) ? (o.fps as number) : PADRAO.fps,
      volMaster: num(o.volMaster, 0, 1, 1),
      volSfx: num(o.volSfx, 0, 1, 1),
      volVeiculos: num(o.volVeiculos, 0, 1, 1),
    };
  } catch {
    return { ...PADRAO };
  }
}

export function gravarConfig(c: Config): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(c));
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
}
