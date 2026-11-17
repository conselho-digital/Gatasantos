import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { limparPresenca, type PresencaJogador } from './clean';

/** Máximo de jogadores por sessão (checado ao entrar). `?max=2` baixa o limite no dev. */
export const MAX_SESSAO = 30;
const MAX_SESSOES = 12;

export interface OuvintesSala {
  presencaMudou(lista: PresencaJogador[]): void;
  evento(nome: string, payload: unknown): void;
}

export const EVENTOS = ['move', 'tiro', 'dano', 'kill', 'rtc'] as const;

/**
 * Sala = um canal Realtime `arena:<mapa>` (`-2`, `-3`... quando enche).
 * Presence guarda quem está; broadcast leva movimento, tiros e danos. Sem servidor próprio.
 */
export class Sala {
  private constructor(
    private ch: RealtimeChannel,
    readonly nome: string,
    readonly sessao: number,
    readonly eu: PresencaJogador,
  ) {}

  /** Entra na primeira sessão com vaga. Devolve null se o Supabase falhar. */
  static async entrar(mapa: string, eu: PresencaJogador, max: number, ouv: OuvintesSala): Promise<Sala | null> {
    const cli = supabase();
    for (let n = 1; n <= MAX_SESSOES; n++) {
      const nome = n === 1 ? `arena:${mapa}` : `arena:${mapa}-${n}`;
      const ch = cli.channel(nome, { config: { presence: { key: eu.id }, broadcast: { self: false, ack: false } } });
      let aceito = false;
      let primeiraLista: (() => void) | null = null;
      const lista = (): PresencaJogador[] => {
        const r: PresencaJogador[] = [];
        for (const metas of Object.values(ch.presenceState())) {
          for (const m of metas as unknown[]) {
            const p = limparPresenca(m);
            if (p && p.id !== eu.id) r.push(p);
          }
        }
        return r;
      };
      // Ouvintes ANTES de subscribe(): depois o Supabase recusa ("cannot add presence callbacks").
      ch.on('presence', { event: 'sync' }, () => {
        primeiraLista?.();
        if (aceito) ouv.presencaMudou(lista());
      });
      for (const ev of EVENTOS) ch.on('broadcast', { event: ev }, (m) => { if (aceito) ouv.evento(ev, m.payload); });

      const ok = await new Promise<boolean>((res) => {
        const t = setTimeout(() => res(false), 8000);
        ch.subscribe((s) => {
          if (s === 'SUBSCRIBED') { clearTimeout(t); res(true); }
          else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') { clearTimeout(t); res(false); }
        });
      });
      if (!ok) { await cli.removeChannel(ch); return null; }

      await ch.track(eu);
      // espera a 1ª lista de presença (até 2 s) para contar quem já está
      await new Promise<void>((res) => { primeiraLista = res; setTimeout(res, 2000); });
      const total = lista().length + 1;
      if (total > max) { await cli.removeChannel(ch); continue; } // cheia: tenta a próxima
      aceito = true;
      ouv.presencaMudou(lista());
      return new Sala(ch, nome, n, eu);
    }
    return null;
  }

  enviar(evento: (typeof EVENTOS)[number], payload: unknown): void {
    void this.ch.send({ type: 'broadcast', event: evento, payload });
  }

  /** Atualiza o que os outros veem de mim (equipe/personagem) ao vivo. */
  async atualizarEu(p: PresencaJogador): Promise<void> {
    await this.ch.track(p);
  }

  async sair(): Promise<void> {
    await supabase().removeChannel(this.ch);
  }
}
