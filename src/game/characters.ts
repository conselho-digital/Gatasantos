/** Definições dos personagens gerados por código (seção 6.4). */
export type Categoria = 'Famosos' | 'Polícia' | 'Gangue' | 'Meninas';
export type Acessorio = 'bone' | 'quepe' | 'chapeu' | 'bandana' | 'nenhum';

export interface DefPersonagem {
  id: string;
  nome: string;
  categoria: Categoria;
  roupa: number;
  calca: number;
  pele: number;
  cabelo: number;
  cabeloLongo?: boolean;
  acessorio: Acessorio;
  corAcessorio?: number;
}

export const CATEGORIAS: Categoria[] = ['Famosos', 'Polícia', 'Gangue', 'Meninas'];

export const PERSONAGENS: DefPersonagem[] = [
  { id: 'Astro', nome: 'Astro', categoria: 'Famosos', roupa: 0x1d1d22, calca: 0x2a2a30, pele: 0xd9a77f, cabelo: 0x1a1210, acessorio: 'nenhum' },
  { id: 'Craque', nome: 'Craque', categoria: 'Famosos', roupa: 0xf2c200, calca: 0x1b5e20, pele: 0x8d5a3c, cabelo: 0x120c08, acessorio: 'nenhum' },
  { id: 'Chef', nome: 'Chef', categoria: 'Famosos', roupa: 0xf4f4f4, calca: 0x333333, pele: 0xe0b48f, cabelo: 0x4a3322, acessorio: 'chapeu', corAcessorio: 0xffffff },
  { id: 'Oficial', nome: 'Oficial Souza', categoria: 'Polícia', roupa: 0x1f3a6e, calca: 0x14233f, pele: 0xe0b48f, cabelo: 0x2a1d14, acessorio: 'quepe', corAcessorio: 0x14233f },
  { id: 'Sargento', nome: 'Sargento Lima', categoria: 'Polícia', roupa: 0x2e4a2f, calca: 0x1d2e1f, pele: 0x9a6a45, cabelo: 0x120c08, acessorio: 'quepe', corAcessorio: 0x1d2e1f },
  { id: 'Rato', nome: 'Rato', categoria: 'Gangue', roupa: 0x7a1f1f, calca: 0x22252b, pele: 0xc99572, cabelo: 0x222222, acessorio: 'bone', corAcessorio: 0x111111 },
  { id: 'Cobra', nome: 'Cobra', categoria: 'Gangue', roupa: 0x1d5c3a, calca: 0x2b2b2b, pele: 0x7a4d31, cabelo: 0x0e0a08, acessorio: 'bandana', corAcessorio: 0xc62828 },
  { id: 'Bia', nome: 'Bia', categoria: 'Meninas', roupa: 0xe0457b, calca: 0x3a4a7a, pele: 0xe8c3a0, cabelo: 0x2a1a10, cabeloLongo: true, acessorio: 'nenhum' },
  { id: 'Duda', nome: 'Duda', categoria: 'Meninas', roupa: 0x7b3fb5, calca: 0x222831, pele: 0x9a6a45, cabelo: 0x0e0a08, cabeloLongo: true, acessorio: 'nenhum' },
  { id: 'Lia', nome: 'Lia', categoria: 'Meninas', roupa: 0x1fa6a0, calca: 0xeeeeee, pele: 0xf0cfb0, cabelo: 0xb5651d, cabeloLongo: true, acessorio: 'bone', corAcessorio: 0xffffff },
];

export function achar(id: string): DefPersonagem {
  return PERSONAGENS.find((p) => p.id === id) ?? PERSONAGENS[0];
}

/** Duas cores por equipe (anel no chão). A tabela `teams` do Supabase vem depois. */
export interface Equipe {
  nome: string;
  c1: number;
  c2: number;
}
export const EQUIPES: Equipe[] = [
  { nome: 'Verde-amarela', c1: 0x1faa4a, c2: 0xf2c200 },
  { nome: 'Vermelha-branca', c1: 0xd32f2f, c2: 0xffffff },
  { nome: 'Amarela-preta', c1: 0xf2c200, c2: 0x111111 },
  { nome: 'Branca', c1: 0xffffff, c2: 0xcfd8dc },
];

export const MAPAS = [
  { id: 'paulista', nome: 'Mapa 1 — Paulista', pronto: true },
  { id: 'esplanada', nome: 'Mapa 2 — Esplanada', pronto: false },
];

export const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
