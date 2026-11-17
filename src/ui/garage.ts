import * as THREE from 'three';
import { CORES, MODELOS, Veiculo } from '../game/vehicle';
import { hex } from '../game/characters';

const CSS = `
.gg{position:fixed;inset:0;background:#0b0f14ee;display:flex;z-index:4;color:#eef2f7;font:18px/1.35 system-ui,sans-serif;overflow:auto;
 padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}
.gg-card{margin:auto;width:min(560px,100%);background:#141b26;border:1px solid #2a3547;border-radius:18px;padding:18px;display:flex;flex-direction:column;gap:12px}
.gg h2{margin:0;font-size:26px}
.gg canvas{width:100%;height:auto;aspect-ratio:16/9;border-radius:12px;background:#1b2535}
.gg-linha{display:flex;gap:8px;flex-wrap:wrap}
.gg-b{flex:1 1 30%;min-height:48px;padding:8px;border-radius:12px;border:2px solid #2a3547;background:#0d121a;color:inherit;font:inherit;cursor:pointer}
.gg-b[aria-pressed=true]{border-color:#3b82f6;background:#172338}
.gg-cor{flex:0 0 52px;min-height:52px;border-radius:50%;border:3px solid #2a3547;cursor:pointer}
.gg-cor[aria-pressed=true]{border-color:#fff}
.gg-chamar{min-height:56px;border:0;border-radius:14px;background:#22c55e;color:#04210f;font:700 22px system-ui;cursor:pointer}
.gg-fechar{min-height:48px;border:0;border-radius:12px;background:#334155;color:#fff;font:18px system-ui;cursor:pointer}
`;

export interface EscolhaGaragem {
  modelo: number;
  cor: number;
}

/**
 * Garagem (tecla V): escolhe o modelo e a cor, com pré-visualização do modelo real girando
 * (renderizador próprio, descartado ao fechar). O veículo só aparece no botão Chamar.
 */
export function abrirGaragem(inicial: EscolhaGaragem, aoChamar: (e: EscolhaGaragem) => void, aoFechar: () => void): () => void {
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  const sel = { ...inicial };
  const raiz = document.createElement('div');
  raiz.className = 'gg';
  raiz.innerHTML = `<div class="gg-card"><h2>Garagem</h2><canvas width="640" height="360"></canvas>
    <div class="gg-linha gg-modelos"></div><div class="gg-linha gg-cores"></div>
    <button class="gg-chamar" type="button">Chamar</button><button class="gg-fechar" type="button">Fechar</button></div>`;
  document.body.appendChild(raiz);

  const canvas = raiz.querySelector('canvas')!;
  const rend = new THREE.WebGLRenderer({ canvas, antialias: true });
  rend.setSize(640, 360, false);
  const cena = new THREE.Scene();
  cena.background = new THREE.Color(0x1b2535);
  cena.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
  const sol = new THREE.DirectionalLight(0xffffff, 1.4);
  sol.position.set(4, 6, 3);
  cena.add(sol);
  const cam = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 50);
  let veic: Veiculo | null = null;
  const montar = () => {
    veic?.dispose();
    veic = new Veiculo(MODELOS[sel.modelo], sel.cor);
    cena.add(veic.grupo);
    const d = MODELOS[sel.modelo].comprimento * 1.9 + 2;
    cam.position.set(d * 0.7, d * 0.35, d * 0.7);
    cam.lookAt(0, 0.7, 0);
  };
  montar();

  const linhaM = raiz.querySelector('.gg-modelos')!, linhaC = raiz.querySelector('.gg-cores')!;
  const marcar = () => {
    linhaM.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(i === sel.modelo)));
    linhaC.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(i === sel.cor)));
  };
  MODELOS.forEach((m, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gg-b';
    b.textContent = m.nome;
    b.onclick = () => { sel.modelo = i; sel.cor = m.corInicial; montar(); marcar(); };
    linhaM.appendChild(b);
  });
  CORES.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gg-cor';
    b.style.background = hex(c.cor);
    b.title = c.nome;
    b.setAttribute('aria-label', c.nome);
    b.onclick = () => { sel.cor = i; montar(); marcar(); };
    linhaC.appendChild(b);
  });
  marcar();

  let ativo = true;
  const laco = () => {
    if (!ativo) return;
    if (veic) veic.grupo.rotation.y += 0.012;
    rend.render(cena, cam);
    requestAnimationFrame(laco);
  };
  laco();

  const fechar = () => {
    if (!ativo) return;
    ativo = false;
    veic?.dispose();
    rend.dispose();
    rend.forceContextLoss();
    raiz.remove();
    st.remove();
    removeEventListener('keydown', tecla);
    aoFechar();
  };
  const tecla = (e: KeyboardEvent) => { if (e.code === 'Escape' || e.code === 'KeyV') fechar(); };
  addEventListener('keydown', tecla);
  raiz.querySelector<HTMLButtonElement>('.gg-chamar')!.onclick = () => { aoChamar({ ...sel }); fechar(); };
  raiz.querySelector<HTMLButtonElement>('.gg-fechar')!.onclick = fechar;
  return fechar;
}
