/** Tabela de armas (seção 6.7). Dano no corpo; cabeça × `cabeca`. */
export type ArmaId = 'punho' | 'pistola' | 'fuzilA' | 'fuzilB' | 'fuzilC' | 'fuzilS';

export interface Arma {
  id: ArmaId;
  nome: string;
  dano: number;
  cabeca: number;
  gap: number; // s entre tiros
  pente: number;
  reserva: number;
  alcance: number; // m
  automatica: boolean;
  silenciada: boolean;
  corpoACorpo: boolean;
  duasMaos: boolean;
  cor: number;
  comprimento: number;
}

export const RECARGA = 1.6; // s
export const DISPERSAO_MIRANDO = 0.003;
export const DISPERSAO_SEM_MIRAR = 0.012;
export const LEVANTADA = 0.6; // s com a arma levantada depois de atirar
export const GOLPE_ATRASO = 0.3; // s até o soco acertar

export const ARMAS: Arma[] = [
  { id: 'punho', nome: 'Punho', dano: 12, cabeca: 1, gap: 0.5, pente: 0, reserva: 0, alcance: 1.8, automatica: false, silenciada: true, corpoACorpo: true, duasMaos: false, cor: 0, comprimento: 0 },
  { id: 'pistola', nome: 'Pistola', dano: 15, cabeca: 2, gap: 0.4, pente: 12, reserva: 60, alcance: 70, automatica: false, silenciada: false, corpoACorpo: false, duasMaos: true, cor: 0x2b2b2b, comprimento: 0.22 },
  { id: 'fuzilA', nome: 'Fuzil A', dano: 20, cabeca: 2, gap: 0.11, pente: 30, reserva: 120, alcance: 140, automatica: true, silenciada: false, corpoACorpo: false, duasMaos: true, cor: 0x3a3f33, comprimento: 0.6 },
  { id: 'fuzilB', nome: 'Fuzil B', dano: 18, cabeca: 2, gap: 0.09, pente: 30, reserva: 120, alcance: 140, automatica: true, silenciada: false, corpoACorpo: false, duasMaos: true, cor: 0x4a3b2a, comprimento: 0.58 },
  { id: 'fuzilC', nome: 'Fuzil C', dano: 22, cabeca: 2, gap: 0.12, pente: 30, reserva: 120, alcance: 150, automatica: true, silenciada: false, corpoACorpo: false, duasMaos: true, cor: 0x2f3a4a, comprimento: 0.64 },
  { id: 'fuzilS', nome: 'Fuzil silenciado', dano: 16, cabeca: 2, gap: 0.10, pente: 30, reserva: 120, alcance: 120, automatica: true, silenciada: true, corpoACorpo: false, duasMaos: true, cor: 0x1c1c1c, comprimento: 0.72 },
];

export const armaPorId = (id: ArmaId): Arma => ARMAS.find((a) => a.id === id)!;

/** Raios de barulho (m): tiro 35 m, silenciado 10 m (seção 6.9). */
export const RAIO_RUIDO = 35;
export const RAIO_RUIDO_SILENCIADO = 10;

/**
 * Tabela de tempo para matar: tiros no corpo e segundos (do 1º ao último tiro)
 * por arma e por vida do alvo. `colete` absorve 60% do dano até acabar.
 */
export function tabelaTempoParaMatar(vidas = [60, 400], colete = 0) {
  const linhas: { arma: string; vida: number; colete: number; tiros: number; segundos: number }[] = [];
  for (const a of ARMAS.filter((x) => !x.corpoACorpo || x.id === 'punho')) {
    for (const vida of vidas) {
      let v = vida, c = colete, tiros = 0;
      while (v > 0 && tiros < 1000) {
        const abs = Math.min(c, a.dano * 0.6);
        c -= abs;
        v -= a.dano - abs;
        tiros++;
      }
      linhas.push({ arma: a.nome, vida, colete, tiros, segundos: +((tiros - 1) * a.gap).toFixed(2) });
    }
  }
  return linhas;
}

/**
 * Simula a cadência em relógio fixo (`cd = gap + cd`): quadros a `fps`, botão
 * apertado por `segundos`. Devolve o número de tiros (esperado: segundos/gap ± 1).
 */
export function simularCadencia(gap: number, fps: number, segundos: number): number {
  const dt = 1 / fps;
  let cd = 0, tiros = 0;
  for (let t = 0; t < segundos - 1e-9; t += dt) {
    cd -= dt;
    let n = 0;
    while (cd <= 1e-12 && n < 3) {
      tiros++;
      cd += gap;
      n++;
    }
    if (cd < 0) cd = 0; // limite de 3 tiros por quadro
  }
  return tiros;
}
