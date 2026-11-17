import { CATEGORIAS, PERSONAGENS } from '../game/characters';

const VERSAO_FOTOS = 1; // sobe quando as fotos de rosto mudarem (?v=N fura o cache)
export const rosto = (id: string) => `/faces/${id}.webp?v=${VERSAO_FOTOS}`;

const CSS = `
.gs{position:fixed;inset:0;background:#0b0f14f5;overflow:auto;z-index:8;color:#eef2f7;font:18px/1.35 system-ui,sans-serif;
 padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) 24px max(16px,env(safe-area-inset-left))}
.gs h1{margin:12px 0;font-size:26px}.gs h2{margin:12px 0 6px;font-size:22px}
.gs-car{display:flex;align-items:center;gap:6px}
.gs-trilho{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:8px 2px;flex:1;scrollbar-width:none}
.gs-trilho::-webkit-scrollbar{display:none}
.gs-item{flex:0 0 112px;scroll-snap-align:start;text-align:center;background:#141b26;border:3px solid transparent;border-radius:14px;padding:8px;cursor:pointer;color:inherit;font:inherit}
.gs-item[aria-pressed=true]{border-color:#3b82f6}
.gs-item img{width:96px;height:96px;border-radius:50%;object-fit:cover;background:#222;display:block;margin:0 auto 6px}
.gs-seta{width:44px;height:64px;border:0;border-radius:10px;background:#1d2736;color:#fff;font-size:24px;cursor:pointer}
@media (pointer:coarse){.gs-seta{display:none}}
.gs-fechar{position:sticky;top:0;float:right;min-height:48px;padding:8px 18px;border:0;border-radius:12px;background:#3b82f6;color:#fff;font:700 18px system-ui,sans-serif;cursor:pointer}
`;

/**
 * Seleção de personagem: carrosséis por categoria (setas no PC, arrasto no celular), fotos sem `loading=lazy`.
 * Usada no menu inicial e na pausa. Foca o personagem atual ao abrir.
 */
export function abrirSelecaoPersonagem(pai: HTMLElement, atual: string, aoEscolher: (id: string) => void): HTMLElement {
  if (!document.getElementById('gs-css')) {
    const st = document.createElement('style');
    st.id = 'gs-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const tela = document.createElement('div');
  tela.className = 'gs';
  tela.innerHTML = '<button class="gs-fechar" type="button">Fechar</button><h1>Escolha o personagem</h1>';
  let foco: HTMLElement | null = null;
  for (const cat of CATEGORIAS) {
    const h = document.createElement('h2');
    h.textContent = cat;
    const car = document.createElement('div');
    car.className = 'gs-car';
    const trilho = document.createElement('div');
    trilho.className = 'gs-trilho';
    for (const d of PERSONAGENS.filter((p) => p.categoria === cat)) {
      const it = document.createElement('button');
      it.type = 'button';
      it.className = 'gs-item';
      it.setAttribute('aria-pressed', String(d.id === atual));
      const img = document.createElement('img');
      img.src = rosto(d.id);
      img.alt = '';
      it.append(img, document.createTextNode(d.nome));
      it.onclick = () => { aoEscolher(d.id); tela.remove(); };
      if (d.id === atual) foco = it;
      trilho.appendChild(it);
    }
    const seta = (txt: string, dir: number) => {
      const s = document.createElement('button');
      s.type = 'button';
      s.className = 'gs-seta';
      s.textContent = txt;
      s.setAttribute('aria-label', dir < 0 ? 'Anterior' : 'Próximo');
      s.onclick = () => trilho.scrollBy({ left: dir * 240, behavior: 'smooth' });
      return s;
    };
    car.append(seta('‹', -1), trilho, seta('›', 1));
    tela.append(h, car);
  }
  tela.querySelector<HTMLButtonElement>('.gs-fechar')!.onclick = () => tela.remove();
  pai.appendChild(tela);
  (foco ?? tela.querySelector<HTMLElement>('.gs-item'))?.focus(); // foco ao abrir
  return tela;
}
