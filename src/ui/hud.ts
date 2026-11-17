import { COLETE_MAX, VIDA_MAX } from '../game/combat';

const CSS = `
.gh{position:fixed;inset:0;pointer-events:none;font:18px/1.3 system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px #000;
 padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left))}
.gh-mira{position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;opacity:.9}
.gh-mira::before,.gh-mira::after{content:"";position:absolute;background:#fff;box-shadow:0 0 2px #000}
.gh-mira::before{left:10px;top:0;width:2px;height:22px}.gh-mira::after{top:10px;left:0;height:2px;width:22px}
.gh-mira.aim{transform:scale(.6)}
.gh-mx{position:absolute;left:50%;top:50%;width:30px;height:30px;margin:-15px 0 0 -15px;opacity:0;transition:opacity .25s;
 border:3px solid #fff;transform:rotate(45deg);border-radius:4px}
.gh-mx.on{opacity:1;transition:none}.gh-mx.cab{border-color:#ffd400}.gh-mx.mat{border-color:#ff3b30}
.gh-bar{position:absolute;left:max(12px,env(safe-area-inset-left));bottom:max(14px,env(safe-area-inset-bottom));width:min(260px,40vw)}
.gh-barra{height:14px;border-radius:7px;background:#0008;margin-top:6px;overflow:hidden;border:1px solid #fff5}
.gh-barra i{display:block;height:100%}
.gh-v i{background:#e53935}.gh-c i{background:#3b82f6}
.gh-arma{position:absolute;right:max(12px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));text-align:right;font-size:22px}
.gh-arma small{display:block;font-size:18px;opacity:.85}
.gh-feed{position:absolute;left:max(12px,env(safe-area-inset-left));top:max(12px,env(safe-area-inset-top));max-width:60vw}
.gh-feed div{background:#0007;border-radius:8px;padding:4px 10px;margin-bottom:4px;animation:ghf 6s forwards}
@keyframes ghf{0%,85%{opacity:1}100%{opacity:0}}
.gh-aviso{position:absolute;left:0;right:0;top:20%;text-align:center;font:700 30px system-ui}
.gh-placar{position:absolute;left:50%;top:14%;transform:translateX(-50%);min-width:min(420px,90vw);background:#000c;border-radius:12px;padding:10px 16px}
.gh-placar table{width:100%;border-collapse:collapse}.gh-placar td,.gh-placar th{padding:4px 8px;text-align:left}.gh-placar .eu{color:#ffd400}
.gh-vel{position:absolute;left:50%;bottom:max(14px,env(safe-area-inset-bottom));transform:translateX(-50%);font:700 34px system-ui}
.gh-dica{position:absolute;left:50%;bottom:22%;transform:translateX(-50%);background:#000a;border-radius:10px;padding:6px 14px}
.gh.toque .gh-bar{bottom:auto;top:64px;width:min(190px,28vw)}
.gh.toque .gh-arma{right:auto;bottom:auto;left:max(12px,env(safe-area-inset-left));top:96px;text-align:left;font-size:20px}
.gh.toque .gh-feed{top:max(12px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);max-width:50vw;font-size:16px}
.gh.toque .gh-vel{bottom:auto;top:16px;font-size:28px}
.gh.toque .gh-dica{display:none}
.gh-fps{position:absolute;right:max(12px,env(safe-area-inset-right));top:max(12px,env(safe-area-inset-top));font-size:18px;opacity:.8}
`;

/** HUD por eventos: vida, colete, arma e munição, mira, marcador de acerto, avisos. */
export class Hud {
  private raiz = document.createElement('div');
  private vida: HTMLElement;
  private colete: HTMLElement;
  private arma: HTMLElement;
  private feedEl: HTMLElement;
  private aviso: HTMLElement;
  private mira: HTMLElement;
  private mx: HTMLElement;
  private fps: HTMLElement;
  private tMx = 0;
  private placarEl: HTMLElement;
  private vel: HTMLElement;
  private dicaEl: HTMLElement;

  constructor(toque = false) {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    this.raiz.className = toque ? 'gh toque' : 'gh';
    this.raiz.innerHTML = `
      <div class="gh-mira"></div><div class="gh-mx"></div>
      <div class="gh-feed"></div>
      <div class="gh-aviso"></div>
      <div class="gh-fps"></div><div class="gh-placar" hidden></div><div class="gh-vel" hidden></div><div class="gh-dica" hidden></div>
      <div class="gh-bar"><div class="gh-nv"></div>
        <div class="gh-barra gh-v"><i></i></div><div class="gh-barra gh-c"><i></i></div></div>
      <div class="gh-arma"></div>`;
    document.body.appendChild(this.raiz);
    const q = (s: string) => this.raiz.querySelector<HTMLElement>(s)!;
    this.vida = q('.gh-v i');
    this.colete = q('.gh-c i');
    this.arma = q('.gh-arma');
    this.feedEl = q('.gh-feed');
    this.aviso = q('.gh-aviso');
    this.mira = q('.gh-mira');
    this.mx = q('.gh-mx');
    this.fps = q('.gh-fps');
    this.placarEl = q('.gh-placar');
    this.vel = q('.gh-vel');
    this.dicaEl = q('.gh-dica');
  }

  barras(vida: number, colete: number): void {
    this.vida.style.width = `${Math.max(0, (vida / VIDA_MAX) * 100)}%`;
    this.colete.style.width = `${Math.max(0, (colete / COLETE_MAX) * 100)}%`;
  }

  armaMunicao(nome: string, pente: number, reserva: number, recarregando: boolean, corpo: boolean): void {
    this.arma.innerHTML = corpo ? nome : `${nome}<small>${recarregando ? 'Recarregando…' : `${pente} / ${reserva}`}</small>`;
  }

  mirando(sim: boolean): void {
    this.mira.classList.toggle('aim', sim);
  }

  feed(msg: string): void {
    const d = document.createElement('div');
    d.textContent = msg;
    this.feedEl.appendChild(d);
    setTimeout(() => d.remove(), 6000);
    while (this.feedEl.children.length > 5) this.feedEl.firstChild?.remove();
  }

  marcador(cabeca: boolean, morreu: boolean): void {
    this.mx.className = `gh-mx on${morreu ? ' mat' : cabeca ? ' cab' : ''}`;
    clearTimeout(this.tMx);
    this.tMx = window.setTimeout(() => this.mx.classList.remove('on'), 120);
  }

  texto(t: string): void {
    this.aviso.textContent = t;
  }

  /** Placar (Tab). `null` esconde. Nomes entram como texto (nunca HTML). */
  placar(linhas: { nome: string; abates: number; mortes: number; eu: boolean }[] | null): void {
    if (!linhas) { this.placarEl.hidden = true; return; }
    const tab = document.createElement('table');
    tab.innerHTML = '<tr><th>Jogador</th><th>Abates</th><th>Mortes</th></tr>';
    for (const l of linhas) {
      const tr = tab.insertRow();
      if (l.eu) tr.className = 'eu';
      for (const v of [l.nome, String(l.abates), String(l.mortes)]) tr.insertCell().textContent = v;
    }
    this.placarEl.replaceChildren(tab);
    this.placarEl.hidden = false;
  }

  /** Velocímetro em km/h (null esconde). */
  veiculo(kmh: number | null): void {
    this.vel.hidden = kmh === null;
    if (kmh !== null) this.vel.textContent = `${Math.round(kmh)} km/h`;
  }

  dica(t: string): void {
    this.dicaEl.hidden = !t;
    if (this.dicaEl.textContent !== t) this.dicaEl.textContent = t;
  }

  contadorFps(fps: number): void {
    this.fps.textContent = `${Math.round(fps)} FPS`;
  }
}
