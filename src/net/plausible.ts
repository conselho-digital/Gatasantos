import type { RemotePlayer } from '../game/remote';
import { ARMAS } from '../game/weapons';
import { raioCilindro, raioEsfera, raioMundo } from '../game/raycast';
import type { Dano } from './clean';

/**
 * Sem servidor, quem leva o dano decide se ele é plausível (jogo casual, seção 6.7):
 * atirador vivo, perto de onde diz ter disparado, raio passa pelo meu corpo (com margem),
 * sem parede no caminho, dentro do alcance + 5 m e na cadência da arma × 0,6.
 * Devolve o motivo da recusa, ou null se for plausível.
 */
export function plausible(d: Dano, atirador: RemotePlayer | undefined, meu: { x: number; y: number; z: number }, agora: number): string | null {
  const arma = ARMAS[d.a];
  if (!arma) return 'arma';
  if (!atirador) return 'atirador desconhecido';
  if (atirador.morto) return 'atirador morto';
  if (Math.hypot(d.o[0] - atirador.x, d.o[2] - atirador.z) > 8) return 'longe de onde diz estar';
  if (d.al > arma.alcance + 5) return 'alcance';

  // cadência: balde que enche a 1/(gap × 0,6) por segundo (tolera lotes de rede)
  const dt = Math.max(0, agora - atirador.ultimoTiro) / 1000;
  atirador.ultimoTiro = agora;
  atirador.credito = Math.min(4, atirador.credito + dt / (arma.gap * 0.6));
  if (atirador.credito < 1) return 'cadência';
  atirador.credito -= 1;

  // o raio precisa passar pelo meu corpo (margem 0,5 m para atraso de rede)
  const max = arma.alcance + 5;
  const margem = 0.5;
  const tc = raioCilindro(d.o[0], d.o[1], d.o[2], d.d[0], d.d[1], d.d[2], meu.x, meu.z, 0.32 + margem, meu.y - margem, meu.y + 1.46 + margem, max);
  const th = raioEsfera(d.o[0], d.o[1], d.o[2], d.d[0], d.d[1], d.d[2], meu.x, meu.y + 1.62, meu.z, 0.16 + margem, max);
  const t = Math.min(tc, th);
  if (t === Infinity) return 'raio não passa pelo meu corpo';
  if (d.cab && th === Infinity) return 'cabeça sem raio na cabeça';

  // sem parede entre o cano e mim
  const tw = raioMundo(d.o[0], d.o[1], d.o[2], d.d[0], d.d[1], d.d[2], t);
  if (tw < t - 0.3) return 'parede no caminho';
  return null;
}
