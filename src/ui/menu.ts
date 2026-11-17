import { CATEGORIAS, EQUIPES, hex, MAPAS, PERSONAGENS, achar } from '../game/characters';
import type { ConfigJogo } from '../game/jogo';

const CHAVE = 'gata-config';
const VERSAO_FOTOS = 1; // sobe quando as fotos de rosto mudarem (?v=N fura o cache)

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

const rosto = (id: string) => `/faces/${id}.webp?v=${VERSAO_FOTOS}`;

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
.gm-aviso{font-size:18px;opacity:.7;text-align:center}
.gm-sel{position:fixed;inset:0;background:#0b0f14f2;overflow:auto;padding:max(16px,env(safe-area-inset-top)) 16px 24px;z-index:2}
.gm-sel h2{margin:12px 0 6px;font-size:22px}
.gm-car{display:flex;align-items:center;gap:6px}
.gm-trilho{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:8px 2px;flex:1;scrollbar-width:none}
.gm-trilho::-webkit-scrollbar{display:none}
.gm-item{flex:0 0 112px;scroll-snap-align:start;text-align:center;background:#141b26;border:3px solid transparent;border-radius:14px;padding:8px;cursor:pointer;color:inherit;font:inherit}
.gm-item[aria-pressed=true]{border-color:#3b82f6}
.gm-item img{width:96px;height:96px;border-radius:50%;object-fit:cover;background:#222;display:block;margin:0 auto 6px}
.gm-seta{width:44px;height:64px;border:0;border-radius:10px;background:#1d2736;color:#fff;font-size:24px;cursor:pointer}
@media (pointer:coarse){.gm-seta{display:none}}
.gm-fechar{position:sticky;top:0;float:right;min-height:48px;padding:8px 18px;border:0;border-radius:12px;background:#3b82f6;color:#fff;font:700 18px system-ui;cursor:pointer}
`;

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
      <img class="gm-foto" alt="Personagem escolhido" />
      <div class="gm-pers"></div>
      <div><label for="gm-nome">Seu nome</label>
        <input id="gm-nome" type="text" maxlength="16" autocomplete="off" placeholder="Jogador" /></div>
      <div><label>Equipe</label><div class="gm-linha gm-equipes"></div></div>
      <div><label>Mapa</label><div class="gm-linha gm-mapas"></div></div>
      <button class="gm-entrar" type="button">Entrar no jogo</button>
      <div class="gm-aviso">Login com Google chega numa próxima etapa.</div>
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

  // Seleção de personagem: carrosséis por categoria (setas no PC, arrasto no celular)
  foto.onclick = () => {
    const tela = document.createElement('div');
    tela.className = 'gm-sel';
    tela.innerHTML = `<button class="gm-fechar" type="button">Fechar</button><h1>Escolha o personagem</h1>`;
    for (const cat of CATEGORIAS) {
      const h = document.createElement('h2');
      h.textContent = cat;
      const car = document.createElement('div');
      car.className = 'gm-car';
      const trilho = document.createElement('div');
      trilho.className = 'gm-trilho';
      for (const d of PERSONAGENS.filter((p) => p.categoria === cat)) {
        const it = document.createElement('button');
        it.type = 'button';
        it.className = 'gm-item';
        it.setAttribute('aria-pressed', String(d.id === salvo.personagem));
        it.innerHTML = `<img src="${rosto(d.id)}" alt="" />${d.nome}`; // sem loading=lazy
        it.onclick = () => {
          salvo.personagem = d.id;
          mostrarPersonagem();
          tela.remove();
        };
        trilho.appendChild(it);
      }
      const seta = (txt: string, dir: number) => {
        const s = document.createElement('button');
        s.type = 'button';
        s.className = 'gm-seta';
        s.textContent = txt;
        s.setAttribute('aria-label', dir < 0 ? 'Anterior' : 'Próximo');
        s.onclick = () => trilho.scrollBy({ left: dir * 240, behavior: 'smooth' });
        return s;
      };
      car.append(seta('‹', -1), trilho, seta('›', 1));
      tela.append(h, car);
    }
    tela.querySelector<HTMLButtonElement>('.gm-fechar')!.onclick = () => tela.remove();
    raiz.appendChild(tela);
  };

  return new Promise((resolve) => {
    q<HTMLButtonElement>('.gm-entrar').onclick = () => {
      const nome = [...campoNome.value].filter((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127).join('').trim().slice(0, 16) || 'Jogador';
      salvo.nome = nome;
      gravar(salvo);
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
