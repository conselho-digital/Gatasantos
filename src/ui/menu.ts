import { EQUIPES, hex, MAPAS, PERSONAGENS, achar } from '../game/characters';
import type { ConfigJogo } from '../game/jogo';
import { abrirSelecaoPersonagem, rosto } from './selecao';

const CHAVE = 'gata-config';

interface Salvo {
  nome: string;
  personagem: string;
  equipe: number;
  mapa: string;
}

function ler(): Salvo {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE) ?? '{}') as Partial<Salvo>;
    return {
      nome: String(s.nome ?? '').slice(0, 16),
      personagem: achar(String(s.personagem ?? '')).id,
      equipe: Math.min(Math.max(Number(s.equipe ?? 0) | 0, 0), EQUIPES.length - 1),
      mapa: MAPAS.some((m) => m.id === s.mapa && m.pronto) ? String(s.mapa) : MAPAS[0].id,
    };
  } catch {
    return { nome: '', personagem: PERSONAGENS[0].id, equipe: 0, mapa: MAPAS[0].id };
  }
}

function gravar(s: Salvo): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(s));
  } catch {
    /* sem armazenamento: segue sem lembrar */
  }
}


const CSS = `
.gm{position:fixed;inset:0;display:flex;overflow:auto;
 background:radial-gradient(ellipse at 50% 0%,#26334a 0%,#0b0f14 70%);color:#eef2f7;font:18px/1.35 system-ui,sans-serif;
 padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}
.gm *{box-sizing:border-box}
.gm-card{margin:auto;width:min(440px,100%);background:#141b26;border:1px solid #2a3547;border-radius:18px;padding:20px;display:flex;flex-direction:column;gap:14px}
.gm h1{margin:0;font-size:28px;text-align:center;letter-spacing:.5px}
.gm-foto{width:140px;height:140px;border-radius:50%;object-fit:cover;border:4px solid #3b82f6;align-self:center;cursor:pointer;background:#222}
.gm-pers{text-align:center;opacity:.8;margin-top:-6px}
.gm input[type=text]{font:inherit;padding:12px;border-radius:10px;border:1px solid #2a3547;background:#0d121a;color:inherit;width:100%}
.gm label{font-size:18px;opacity:.85}
.gm-linha{display:flex;gap:8px;flex-wrap:wrap}
.gm-chip{flex:1 1 45%;min-height:48px;padding:10px;border-radius:12px;border:2px solid #2a3547;background:#0d121a;color:inherit;font:inherit;cursor:pointer;display:flex;align-items:center;gap:8px;justify-content:center}
.gm-chip[aria-pressed=true]{border-color:#3b82f6;background:#172338}
.gm-chip:disabled{opacity:.4;cursor:not-allowed}
.gm-cores{display:inline-flex;width:34px;height:18px;border-radius:9px;overflow:hidden;border:1px solid #fff4}
.gm-cores i{flex:1}
.gm-entrar{min-height:56px;border:0;border-radius:14px;background:#22c55e;color:#04210f;font:700 22px system-ui;cursor:pointer}
.gm-entrar:active{transform:scale(.98)}
.gm-aviso{font-size:16px;opacity:.7;text-align:center}
.gm-cols{display:flex;flex-direction:column;gap:14px}.gm-col{display:flex;flex-direction:column;gap:12px;min-width:0}
.gm{height:100dvh}
@media (orientation:landscape) and (max-height:560px){
 .gm{font-size:16px}.gm-card{width:min(900px,100%);padding:10px 16px;gap:6px}.gm h1{font-size:22px}
 .gm-cols{flex-direction:row;gap:18px}.gm-col{flex:1;gap:8px}
 .gm-foto{width:78px;height:78px}.gm-pers{margin-top:-2px}
 .gm label{font-size:15px}.gm input[type=text]{padding:8px}
 .gm-chip{min-height:42px;padding:4px 8px;font-size:15px}.gm-entrar{min-height:46px;font-size:19px}.gm-aviso{font-size:13px}
}
@media (orientation:landscape) and (max-height:380px){
 .gm-aviso{display:none}.gm-foto{width:54px;height:54px;border-width:3px}.gm-pers{font-size:14px}.gm label{font-size:14px}
 .gm-chip{min-height:38px;font-size:14px;white-space:nowrap;overflow:hidden}.gm-entrar{min-height:42px;font-size:18px}.gm h1{font-size:18px}
 .gm-card{padding:6px 12px;gap:4px}.gm-cols{gap:12px}.gm-col{gap:5px}.gm input[type=text]{padding:6px}
}
`;

/**
 * Tela cheia e paisagem travada ao entrar (precisa rodar dentro do clique, lição 21).
 * A trava de orientação só funciona em celular/tablet e depois de entrar em tela cheia.
 */
export function entrarEmTelaCheia(): void {
  try {
    const el = document.documentElement;
    if (document.fullscreenElement || !el.requestFullscreen) return;
    void el.requestFullscreen({ navigationUI: 'hide' })
      .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
      .catch(() => undefined); // navegador não deixou (ex.: iPhone): segue sem
  } catch {
    /* sem tela cheia: segue */
  }
}

/** Menu inicial: fundo liso, foto do rosto, nome, equipe e mapa. Devolve a escolha ao clicar em Entrar. */
export function mostrarMenu(): Promise<ConfigJogo> {
  const estilo = document.createElement('style');
  estilo.textContent = CSS;
  document.head.appendChild(estilo);
  const salvo = ler();

  const raiz = document.createElement('div');
  raiz.className = 'gm';
  raiz.innerHTML = `
    <div class="gm-card">
      <h1>Gata Santos</h1>
      <div class="gm-cols">
        <div class="gm-col">
          <img class="gm-foto" alt="Personagem escolhido" />
          <div class="gm-pers"></div>
          <div><label for="gm-nome">Seu nome</label>
            <input id="gm-nome" type="text" maxlength="16" autocomplete="off" placeholder="Jogador" /></div>
        </div>
        <div class="gm-col">
          <div><label>Equipe</label><div class="gm-linha gm-equipes"></div></div>
          <div><label>Mapa</label><div class="gm-linha gm-mapas"></div></div>
          <button class="gm-entrar" type="button">Entrar no jogo</button>
          <div class="gm-aviso">Sem login: só o seu nome. Quem estiver no mapa vê você.</div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(raiz);

  const q = <T extends HTMLElement>(s: string) => raiz.querySelector<T>(s)!;
  const foto = q<HTMLImageElement>('.gm-foto');
  const nomePers = q('.gm-pers');
  const campoNome = q<HTMLInputElement>('#gm-nome');
  campoNome.value = salvo.nome;

  const mostrarPersonagem = () => {
    const d = achar(salvo.personagem);
    foto.src = rosto(d.id);
    nomePers.textContent = `${d.nome} · ${d.categoria}`;
  };
  mostrarPersonagem();

  // Equipes
  const linhaEq = q('.gm-equipes');
  EQUIPES.forEach((e, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gm-chip';
    b.innerHTML = `<span class="gm-cores"><i style="background:${hex(e.c1)}"></i><i style="background:${hex(e.c2)}"></i></span>${e.nome}`;
    b.onclick = () => {
      salvo.equipe = i;
      linhaEq.querySelectorAll('button').forEach((x, j) => x.setAttribute('aria-pressed', String(j === i)));
    };
    b.setAttribute('aria-pressed', String(i === salvo.equipe)); // equipe padrão sempre marcada
    linhaEq.appendChild(b);
  });

  // Mapas
  const linhaMapa = q('.gm-mapas');
  MAPAS.forEach((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gm-chip';
    b.textContent = m.pronto ? m.nome : `${m.nome} (em breve)`;
    b.disabled = !m.pronto;
    b.setAttribute('aria-pressed', String(m.id === salvo.mapa));
    b.onclick = () => {
      salvo.mapa = m.id;
      linhaMapa.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    };
    linhaMapa.appendChild(b);
  });

  // Seleção de personagem (carrosséis por categoria; compartilhada com a pausa)
  foto.onclick = () => abrirSelecaoPersonagem(raiz, salvo.personagem, (id) => { salvo.personagem = id; mostrarPersonagem(); });

  return new Promise((resolve) => {
    q<HTMLButtonElement>('.gm-entrar').onclick = () => {
      const bruto = [...campoNome.value].filter((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127).join('').trim().slice(0, 16);
      if (!bruto) { campoNome.focus(); campoNome.style.borderColor = '#ef4444'; campoNome.placeholder = 'Digite seu nome'; return; }
      const nome = bruto;
      salvo.nome = nome;
      gravar(salvo);
      entrarEmTelaCheia();
      raiz.remove();
      estilo.remove();
      // Chamado dentro do clique: permite tela cheia e mouse preso (lição 21).
      resolve({
        nome,
        personagem: salvo.personagem,
        equipe: EQUIPES[salvo.equipe],
        mapa: salvo.mapa,
        travarMouse: !matchMedia('(pointer: coarse)').matches,
      });
    };
  });
}
