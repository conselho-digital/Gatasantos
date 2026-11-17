import { EQUIPES, hex, PERSONAGENS, achar } from '../game/characters';
import { ARMAS, type ArmaId } from '../game/weapons';
import { LIMITES_FPS, type Config } from '../game/settings';
import type { Placar } from '../game/online';
import { abrirSelecaoPersonagem, rosto } from './selecao';

const CSS = `
.gp{position:fixed;inset:0;z-index:6;background:#0b0f14ee;color:#eef2f7;font:18px/1.35 system-ui,sans-serif;display:flex;overflow:auto;
 padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}
.gp-card{margin:auto;width:min(620px,100%);max-height:calc(100dvh - 24px);background:#141b26;border:1px solid #2a3547;border-radius:18px;padding:14px;display:flex;flex-direction:column;gap:10px;box-sizing:border-box}
.gp-topo{display:flex;align-items:center;justify-content:space-between;gap:8px}
.gp-x{width:48px;height:48px;border:0;border-radius:50%;background:#334155;color:#fff;font-size:22px;cursor:pointer;flex:0 0 auto}
.gp-abas{flex-wrap:nowrap!important;overflow-x:auto;scrollbar-width:none}.gp-abas::-webkit-scrollbar{display:none}
.gp-aba{flex:0 0 auto!important;white-space:nowrap}
.gp-painel{flex:1 1 auto;overflow-y:auto;min-height:0}
@media (orientation:landscape) and (max-height:560px){.gp{font-size:16px}.gp-card{padding:8px 12px;gap:6px}.gp h2{font-size:20px}.gp-aba,.gp-b{min-height:42px;padding:4px 10px}.gp-voltar,.gp-sair{min-height:44px;font-size:17px}.gp-aviso{display:none}.gp input[type=range]{height:26px}}
.gp h2{margin:0;font-size:24px}
.gp-abas{display:flex;gap:6px;flex-wrap:wrap}
.gp-aba{flex:1 1 auto;min-height:48px;padding:6px 12px;border-radius:12px;border:2px solid #2a3547;background:#0d121a;color:inherit;font:inherit;cursor:pointer}
.gp-aba[aria-selected=true]{border-color:#3b82f6;background:#172338}
.gp-painel{display:flex;flex-direction:column;gap:10px;min-height:140px}
.gp-linha{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.gp-b{flex:1 1 40%;min-height:48px;padding:8px 12px;border-radius:12px;border:2px solid #2a3547;background:#0d121a;color:inherit;font:inherit;cursor:pointer;display:flex;align-items:center;gap:8px;justify-content:center}
.gp-b[aria-pressed=true]{border-color:#3b82f6;background:#172338}
.gp-cores{display:inline-flex;width:34px;height:18px;border-radius:9px;overflow:hidden;border:1px solid #fff4}.gp-cores i{flex:1}
.gp label{display:flex;flex-direction:column;gap:4px;width:100%}
.gp input[type=range]{width:100%;height:32px}
.gp table{width:100%;border-collapse:collapse}.gp td,.gp th{padding:6px 8px;text-align:left}.gp .eu{color:#ffd400}
.gp-rodape{display:flex;gap:8px;flex-wrap:wrap}
.gp-voltar{flex:1 1 40%;min-height:52px;border:0;border-radius:12px;background:#22c55e;color:#04210f;font:700 20px system-ui,sans-serif;cursor:pointer}
.gp-sair{flex:1 1 40%;min-height:52px;border:0;border-radius:12px;background:#7f1d1d;color:#fff;font:700 18px system-ui,sans-serif;cursor:pointer}
.gp-aviso{font-size:18px;opacity:.75}
.gp img.foto{width:96px;height:96px;border-radius:50%;object-fit:cover;border:3px solid #3b82f6}
`;

export interface ContextoPausa {
  equipeAtual: number;
  aoEquipe(i: number): void;
  personagemAtual: string;
  aoPersonagem(id: string): void;
  armaAtual: ArmaId;
  aoArma(id: ArmaId): void;
  aoGaragem(): void;
  placar(): Placar[];
  config: Config; // mutável: o jogo lê em tempo real
  aoConfig(): void;
  aoVoltarAoMenu(): void;
  aoFechar(): void;
}

const ABAS = ['Equipe', 'Personagem', 'Armas', 'Garagem', 'Ranking', 'Configurações'] as const;

/**
 * Pausa (P / engrenagem / Esc): pilha de telas, uma aba por vez, foco ao abrir e Esc fecha a tela de cima.
 * Pausar congela só o jogo local; esta tela roda em tempo real. Rodapé com créditos.
 */
export function abrirPausa(c: ContextoPausa): () => void {
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  const raiz = document.createElement('div');
  raiz.className = 'gp';
  raiz.setAttribute('role', 'dialog');
  raiz.setAttribute('aria-modal', 'true');
  raiz.innerHTML = '<div class="gp-card"><div class="gp-topo"><h2>Pausado</h2><button class="gp-x" type="button" aria-label="Fechar a pausa">✕</button></div><div class="gp-abas" role="tablist"></div><div class="gp-painel"></div><div class="gp-rodape"></div><div class="gp-aviso">Gata Santos — mapa da Paulista do acervo do dono.</div></div>';
  document.body.appendChild(raiz);
  raiz.querySelector<HTMLButtonElement>('.gp-x')!.onclick = () => fechar();
  const abasEl = raiz.querySelector<HTMLElement>('.gp-abas')!, painel = raiz.querySelector<HTMLElement>('.gp-painel')!, rodape = raiz.querySelector<HTMLElement>('.gp-rodape')!;
  let aba: (typeof ABAS)[number] = 'Equipe';
  let fechada = false;

  const fechar = () => {
    if (fechada) return;
    fechada = true;
    removeEventListener('keydown', tecla, true);
    raiz.remove();
    st.remove();
    c.aoFechar();
  };
  // Esc fecha a tela de cima (primeiro a seleção de personagem, se aberta); P também retoma
  const tecla = (e: KeyboardEvent) => {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      const sel = document.querySelector('.gs');
      if (sel) sel.remove();
      else fechar();
      e.preventDefault();
      e.stopPropagation();
    }
  };
  addEventListener('keydown', tecla, true);

  const botao = (txt: string, ativo: boolean, fn: () => void, extra?: HTMLElement) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gp-b';
    if (extra) b.appendChild(extra);
    b.appendChild(document.createTextNode(txt));
    b.setAttribute('aria-pressed', String(ativo));
    b.onclick = fn;
    return b;
  };
  const slider = (rotulo: string, min: number, max: number, passo: number, valor: number, fmt: (v: number) => string, fn: (v: number) => void) => {
    const l = document.createElement('label');
    const t = document.createElement('span');
    const i = document.createElement('input');
    i.type = 'range';
    i.min = String(min); i.max = String(max); i.step = String(passo); i.value = String(valor);
    const mostra = () => { t.textContent = `${rotulo}: ${fmt(Number(i.value))}`; };
    mostra();
    i.oninput = () => { mostra(); fn(Number(i.value)); c.aoConfig(); };
    l.append(t, i);
    return l;
  };

  const desenhar = () => {
    abasEl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.textContent === aba)));
    painel.replaceChildren();
    if (aba === 'Equipe') {
      const lin = document.createElement('div');
      lin.className = 'gp-linha';
      EQUIPES.forEach((e, i) => {
        const cores = document.createElement('span');
        cores.className = 'gp-cores';
        cores.innerHTML = `<i style="background:${hex(e.c1)}"></i><i style="background:${hex(e.c2)}"></i>`;
        lin.appendChild(botao(e.nome, i === c.equipeAtual, () => { c.equipeAtual = i; c.aoEquipe(i); desenhar(); }, cores));
      });
      painel.appendChild(lin);
    } else if (aba === 'Personagem') {
      const img = document.createElement('img');
      img.className = 'foto';
      img.alt = '';
      img.src = rosto(c.personagemAtual);
      const d = achar(c.personagemAtual);
      const b = botao(`Trocar (${d.nome})`, false, () => abrirSelecaoPersonagem(raiz, c.personagemAtual, (id) => { c.personagemAtual = id; c.aoPersonagem(id); desenhar(); }), img);
      painel.appendChild(b);
      b.focus();
      void PERSONAGENS;
    } else if (aba === 'Armas') {
      const lin = document.createElement('div');
      lin.className = 'gp-linha';
      for (const a of ARMAS) lin.appendChild(botao(a.nome, a.id === c.armaAtual, () => { c.armaAtual = a.id; c.aoArma(a.id); desenhar(); }));
      painel.appendChild(lin);
    } else if (aba === 'Garagem') {
      const p = document.createElement('div');
      p.textContent = 'Escolha o modelo e a cor e chame o seu veículo.';
      painel.append(p, botao('Abrir garagem', false, () => c.aoGaragem()));
    } else if (aba === 'Ranking') {
      const tab = document.createElement('table');
      tab.innerHTML = '<tr><th>Jogador</th><th>Abates</th><th>Mortes</th></tr>';
      for (const l of c.placar()) {
        const tr = tab.insertRow();
        if (l.eu) tr.className = 'eu';
        for (const v of [l.nome, String(l.abates), String(l.mortes)]) tr.insertCell().textContent = v;
      }
      const nota = document.createElement('div');
      nota.className = 'gp-aviso';
      nota.textContent = 'Placar desta sessão. O ranking global precisa de login (ainda não existe).';
      painel.append(tab, nota);
    } else {
      const cfg = c.config;
      painel.append(
        slider('Sensibilidade da câmera', 0.2, 3, 0.05, cfg.sens, (v) => `${v.toFixed(2)}x`, (v) => { cfg.sens = v; }),
        slider('Volume geral', 0, 1, 0.05, cfg.volMaster, (v) => `${Math.round(v * 100)}%`, (v) => { cfg.volMaster = v; }),
        slider('Volume dos tiros', 0, 1, 0.05, cfg.volSfx, (v) => `${Math.round(v * 100)}%`, (v) => { cfg.volSfx = v; }),
        slider('Volume dos veículos', 0, 1, 0.05, cfg.volVeiculos, (v) => `${Math.round(v * 100)}%`, (v) => { cfg.volVeiculos = v; }),
      );
      const lf = document.createElement('div');
      lf.className = 'gp-linha';
      for (const f of LIMITES_FPS) lf.appendChild(botao(f ? `${f} FPS` : 'FPS livre', cfg.fps === f, () => { cfg.fps = f; c.aoConfig(); desenhar(); }));
      const t = document.createElement('div');
      t.textContent = 'Limite de FPS (economiza bateria):';
      painel.append(t, lf);
    }
  };

  for (const a of ABAS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gp-aba';
    b.setAttribute('role', 'tab');
    b.textContent = a;
    b.onclick = () => { aba = a; desenhar(); };
    abasEl.appendChild(b);
  }
  // Rodapé: voltar ao jogo e voltar ao menu (2 toques para confirmar)
  const voltar = document.createElement('button');
  voltar.type = 'button';
  voltar.className = 'gp-voltar';
  voltar.textContent = 'Voltar ao jogo';
  voltar.onclick = fechar;
  const sair = document.createElement('button');
  sair.type = 'button';
  sair.className = 'gp-sair';
  sair.textContent = 'Voltar ao menu';
  let armado = 0;
  sair.onclick = () => {
    if (armado) { c.aoVoltarAoMenu(); return; }
    sair.textContent = 'Toque de novo para sair';
    armado = window.setTimeout(() => { armado = 0; sair.textContent = 'Voltar ao menu'; }, 3000);
  };
  rodape.append(voltar, sair);
  desenhar();
  voltar.focus(); // foco ao abrir
  return fechar;
}
