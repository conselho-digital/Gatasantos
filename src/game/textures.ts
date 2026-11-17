import * as THREE from 'three';

/** Ruído simples e determinístico para texturas de canvas. */
function rng(semente: number) {
  let s = semente >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function textura(c: HTMLCanvasElement, rx = 1, ry = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 4;
  return t;
}

function ruido(g: CanvasRenderingContext2D, w: number, h: number, n: number, forca: number, r: () => number) {
  for (let i = 0; i < n; i++) {
    const v = Math.floor(r() * 255);
    g.fillStyle = `rgba(${v},${v},${v},${forca})`;
    g.fillRect(r() * w, r() * h, 2, 2);
  }
}

/** Grama: 1 repetição = 8 m. */
export function texGrama(): THREE.CanvasTexture {
  const { c, g } = canvas(256, 256);
  const r = rng(11);
  g.fillStyle = '#5f8a4b';
  g.fillRect(0, 0, 256, 256);
  ruido(g, 256, 256, 5000, 0.12, r);
  return textura(c);
}

/** Calçada de pedra: 1 repetição = 4 m (lajes de 1 m). */
export function texCalcada(): THREE.CanvasTexture {
  const { c, g } = canvas(256, 256);
  const r = rng(22);
  g.fillStyle = '#b9b5ab';
  g.fillRect(0, 0, 256, 256);
  ruido(g, 256, 256, 3000, 0.1, r);
  g.strokeStyle = '#8f8b82';
  g.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
  }
  return textura(c);
}

/** Asfalto com faixas. Eixo U ao longo da rua; 1 repetição = 12 m de comprimento. */
export function texAsfalto(faixas: number, larguraM: number): THREE.CanvasTexture {
  const w = 512, h = 512;
  const { c, g } = canvas(w, h);
  const r = rng(33);
  g.fillStyle = '#3a3c40';
  g.fillRect(0, 0, w, h);
  ruido(g, w, h, 9000, 0.1, r);
  const faixaPx = h / faixas;
  g.fillStyle = '#e8e8e8';
  for (let i = 1; i < faixas; i++) {
    const y = i * faixaPx;
    if (i === faixas / 2) {
      g.fillStyle = '#e8c93a';
      g.fillRect(0, y - 4, w, 3);
      g.fillRect(0, y + 1, w, 3);
      g.fillStyle = '#e8e8e8';
    } else {
      for (let x = 0; x < w; x += 128) g.fillRect(x + 16, y - 2, 64, 4);
    }
  }
  const t = textura(c);
  t.userData.larguraM = larguraM;
  return t;
}

export type TipoFachada = 'creme' | 'ocre' | 'vidro' | 'concreto';
const PALETA: Record<TipoFachada, { parede: string; laje: string; janela: string; reflexo: string }> = {
  creme: { parede: '#e6dcc0', laje: '#cfc3a1', janela: '#3b5266', reflexo: '#8fb0c8' },
  ocre: { parede: '#c99a4b', laje: '#a97f35', janela: '#33424d', reflexo: '#7d97a8' },
  vidro: { parede: '#5f87a3', laje: '#9fb3c0', janela: '#274456', reflexo: '#9fd0e8' },
  concreto: { parede: '#8d9094', laje: '#6d7074', janela: '#2f3b45', reflexo: '#6f8799' },
};

/**
 * Fachada em metros: a textura cobre 12 m de largura x 3 m de altura
 * (uma fileira), com laje de 0,2 m no pé, pilares e 4 janelas.
 */
export function texFachada(tipo: TipoFachada): THREE.CanvasTexture {
  const PX = 64; // pixels por metro
  const { c, g } = canvas(12 * PX, 3 * PX);
  const p = PALETA[tipo];
  g.fillStyle = p.parede;
  g.fillRect(0, 0, c.width, c.height);
  // laje no pé de cada fileira (0,2 m)
  g.fillStyle = p.laje;
  g.fillRect(0, c.height - 0.2 * PX, c.width, 0.2 * PX);
  for (let i = 0; i < 4; i++) {
    const x0 = i * 3 * PX;
    // pilar de 0,3 m na borda esquerda de cada módulo de 3 m
    g.fillStyle = p.laje;
    g.fillRect(x0, 0, 0.3 * PX, c.height);
    // janela 2 m x 1,5 m
    const jx = x0 + 0.5 * PX, jy = 0.6 * PX, jw = 2.2 * PX, jh = 1.6 * PX;
    g.fillStyle = p.janela;
    g.fillRect(jx, jy, jw, jh);
    const grad = g.createLinearGradient(jx, jy, jx + jw, jy + jh);
    grad.addColorStop(0, p.reflexo + 'cc');
    grad.addColorStop(0.45, p.reflexo + '22');
    grad.addColorStop(1, '#00000000');
    g.fillStyle = grad;
    g.fillRect(jx, jy, jw, jh);
    g.fillStyle = p.laje;
    g.fillRect(jx - 4, jy + jh, jw + 8, 6); // peitoril
    g.fillRect(jx + jw / 2 - 2, jy, 4, jh); // montante
  }
  return textura(c);
}

export function texTelhado(): THREE.CanvasTexture {
  const { c, g } = canvas(128, 128);
  const r = rng(44);
  g.fillStyle = '#6b6e72';
  g.fillRect(0, 0, 128, 128);
  ruido(g, 128, 128, 1500, 0.15, r);
  return textura(c);
}
