import { definirJoystick, forcarBotao, injetarGiro, injetarTecla, injetarToque } from '../game/input';

/**
 * Tamanhos por altura da tela (celular em paisagem tem ~320–430 px de altura): `--b` botão normal,
 * `--B` botão grande, `--J` joystick. Tudo posicionado em múltiplos de `--b`, então cabe em qualquer aparelho.
 */
const CSS = `
.gt{position:fixed;inset:0;z-index:3;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;font:700 clamp(11px,3.2vh,15px) system-ui,sans-serif;color:#fff;
 --b:clamp(44px,13vh,68px);--B:calc(var(--b)*1.55);--J:clamp(104px,36vh,150px);--g:calc(var(--b)*.16);
 --ml:max(10px,env(safe-area-inset-left));--mr:max(10px,env(safe-area-inset-right));--mb:max(10px,env(safe-area-inset-bottom));--mt:max(8px,env(safe-area-inset-top))}
.gt *{touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.gt-cam{position:absolute;inset:0}
.gt-b{position:absolute;border-radius:50%;background:#1b2535b3;border:2px solid #ffffff66;display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.05;padding:2px;box-sizing:border-box}
.gt-b.on{background:#3b82f6cc;border-color:#fff}
.gt-b.vermelho{background:#c62828b3}.gt-b.vermelho.on{background:#ff5252dd}
.gt-b[hidden]{display:none}
.gt-joy{position:absolute;left:var(--ml);bottom:var(--mb);width:var(--J);height:var(--J);border-radius:50%;background:#1b253588;border:2px solid #ffffff55}
.gt-joy i{position:absolute;left:50%;top:50%;width:42%;height:42%;margin:-21% 0 0 -21%;border-radius:50%;background:#ffffffaa}
.gt-giro{position:fixed;inset:0;z-index:9;background:#0b0f14;display:none;align-items:center;justify-content:center;text-align:center;font:700 24px system-ui;color:#fff;padding:24px}
@media (orientation:portrait){.gt-giro{display:flex}}
`;

export interface EstadoToque {
  dirigindo: boolean;
  pertoVeiculo: boolean; // dá para entrar (F)
  veiculoViatura: boolean;
  corpoACorpo: boolean; // arma de mão: esconde mira
}

export interface ControlesToque {
  estado(e: EstadoToque): void;
  dispose(): void;
}

const vibrar = () => { try { navigator.vibrate?.(12); } catch { /* sem vibração */ } };

/**
 * Controles de toque (seção 6.6): joystick (sempre anda devagar), Correr (continua 0,5 s depois de soltar),
 * TIRO ×2 (segurar), MIRAR ×2 (**alternar**: um toque liga, outro desliga; os dois botões ficam ligados entre si),
 * pular, agachar, arma, recarregar, porta, pedais e luzes. Arrastar o resto da tela gira a câmera.
 */
export function criarControlesToque(): ControlesToque {
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  const raiz = document.createElement('div');
  raiz.className = 'gt';
  document.body.appendChild(raiz);
  const aviso = document.createElement('div');
  aviso.className = 'gt-giro';
  aviso.textContent = 'Gire o celular para jogar na horizontal';
  document.body.appendChild(aviso);

  // --- Arrastar a tela: câmera
  const cam = document.createElement('div');
  cam.className = 'gt-cam';
  raiz.appendChild(cam);
  const dedos = new Map<number, { x: number; y: number }>();
  cam.addEventListener('pointerdown', (e) => {
    cam.setPointerCapture(e.pointerId);
    dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  cam.addEventListener('pointermove', (e) => {
    const d = dedos.get(e.pointerId);
    if (!d) return;
    injetarGiro((e.clientX - d.x) * 1.4, (e.clientY - d.y) * 1.4);
    d.x = e.clientX;
    d.y = e.clientY;
  });
  const soltaCam = (e: PointerEvent) => dedos.delete(e.pointerId);
  cam.addEventListener('pointerup', soltaCam);
  cam.addEventListener('pointercancel', soltaCam);

  // --- Joystick (esquerda): direção; no veículo vira o volante
  const joy = document.createElement('div');
  joy.className = 'gt-joy';
  const knob = document.createElement('i');
  joy.appendChild(knob);
  raiz.appendChild(joy);
  let joyId = -1;
  let dirigindo = false;
  const mexerJoy = (e: PointerEvent) => {
    const r = joy.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, max = r.width / 2 - 6;
    let x = e.clientX - cx, y = e.clientY - cy;
    const d = Math.hypot(x, y);
    if (d > max) { x = (x / d) * max; y = (y / d) * max; }
    knob.style.transform = `translate(${x}px,${y}px)`;
    const nx = x / max, ny = -y / max;
    const zona = Math.hypot(nx, ny) < 0.2; // zona morta
    if (dirigindo) {
      definirJoystick(0, 0);
      injetarTecla('KeyA', !zona && nx < -0.3);
      injetarTecla('KeyD', !zona && nx > 0.3);
    } else definirJoystick(zona ? 0 : nx, zona ? 0 : ny);
  };
  const soltaJoy = () => {
    joyId = -1;
    knob.style.transform = '';
    definirJoystick(0, 0);
    injetarTecla('KeyA', false);
    injetarTecla('KeyD', false);
  };
  joy.addEventListener('pointerdown', (e) => { joyId = e.pointerId; joy.setPointerCapture(e.pointerId); mexerJoy(e); });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) mexerJoy(e); });
  joy.addEventListener('pointerup', soltaJoy);
  joy.addEventListener('pointercancel', soltaJoy);

  // --- Botões
  const botoes: HTMLElement[] = [];
  const grupos = new Map<string, Set<number>>(); // botões ligados entre si (tiro ×2)
  const marcaGrupo = (grupo: string, ligado: boolean) => botoes.filter((x) => x.dataset.grupo === grupo).forEach((x) => x.classList.toggle('on', ligado));

  interface Opcoes {
    rotulo: string;
    /** posições CSS (calc com --b/--B/--J/--g): `r`/`l` distância da lateral; `b`/`t` distância de baixo/topo */
    r?: string;
    l?: string;
    b?: string;
    t?: string;
    tam?: string; // calc/var
    classe?: string;
    segurar?: (v: boolean) => void; // enquanto apertado
    toque?: () => void; // um aperto
    grupo?: string; // ligados entre si (segurar)
    alternar?: (ligado: boolean) => void; // um toque liga, outro desliga (mira)
    visivel?: string; // modo em que aparece
  }
  const botao = (o: Opcoes): HTMLElement => {
    const b = document.createElement('div');
    b.className = `gt-b ${o.classe ?? ''}`;
    b.textContent = o.rotulo;
    const t = o.tam ?? 'var(--b)';
    b.style.width = b.style.height = t;
    if (o.r) b.style.right = `calc(var(--mr) + ${o.r})`;
    if (o.l) b.style.left = `calc(var(--ml) + ${o.l})`;
    if (o.b) b.style.bottom = `calc(var(--mb) + ${o.b})`;
    if (o.t) b.style.top = `calc(var(--mt) + ${o.t})`;
    b.dataset.modo = o.visivel ?? 'pe';
    if (o.grupo) b.dataset.grupo = o.grupo;
    const g = o.grupo ? (grupos.get(o.grupo) ?? grupos.set(o.grupo, new Set()).get(o.grupo)!) : null;
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      b.setPointerCapture(e.pointerId);
      vibrar();
      if (o.alternar) {
        const ligado = !alternados.get(o.grupo ?? o.rotulo);
        alternados.set(o.grupo ?? o.rotulo, ligado);
        marcaGrupo(o.grupo ?? o.rotulo, ligado);
        o.alternar(ligado);
        return;
      }
      if (g) { g.add(e.pointerId); marcaGrupo(o.grupo!, true); o.segurar?.(true); }
      else { b.classList.add('on'); o.segurar?.(true); }
      o.toque?.();
    });
    const solta = (e: PointerEvent) => {
      if (o.alternar) return; // alternar: soltar não faz nada
      if (g) { g.delete(e.pointerId); marcaGrupo(o.grupo!, g.size > 0); o.segurar?.(g.size > 0); }
      else { b.classList.remove('on'); o.segurar?.(false); }
    };
    b.addEventListener('pointerup', solta);
    b.addEventListener('pointercancel', solta);
    if (o.alternar) b.dataset.grupo = o.grupo ?? o.rotulo;
    raiz.appendChild(b);
    botoes.push(b);
    return b;
  };
  const alternados = new Map<string, boolean>();

  // Correr: continua correndo 0,5 s depois de soltar
  let tCorrer = 0;
  const correr = (v: boolean) => {
    clearTimeout(tCorrer);
    if (v) injetarTecla('ShiftLeft', true);
    else tCorrer = window.setTimeout(() => injetarTecla('ShiftLeft', false), 500);
  };
  const tecla = (c: string) => (v: boolean) => injetarTecla(c, v);
  const atira = (v: boolean) => forcarBotao(0, v);
  const mira = (ligado: boolean) => forcarBotao(2, ligado);

  const g = 'var(--g)', b = 'var(--b)', B = 'var(--B)', J = 'var(--J)';
  // A pé — direita: TIRO grande no canto; MIRAR em cima; PULAR à esquerda; ABAIXAR acima do PULAR
  botao({ rotulo: 'TIRO', r: '0px', b: '0px', tam: B, classe: 'vermelho', segurar: atira, grupo: 'tiro' });
  botao({ rotulo: 'MIRAR', r: `calc((${B} - ${b}) / 2)`, b: `calc(${B} + ${g})`, alternar: mira, grupo: 'mira' });
  botao({ rotulo: 'PULAR', r: `calc(${B} + ${g})`, b: '0px', tam: `calc(${b} * 1.15)`, segurar: tecla('Space') });
  botao({ rotulo: 'ABAIXAR', r: `calc(${B} + ${g})`, b: `calc(${b} * 1.15 + ${g})`, segurar: tecla('KeyC') });
  // A pé — esquerda (ao lado do joystick): CORRER, TIRO 2, MIRAR 2
  botao({ rotulo: 'CORRER', l: `calc(${J} + ${g})`, b: '0px', segurar: correr });
  botao({ rotulo: 'TIRO', l: `calc(${J} + ${g})`, b: `calc(${b} + ${g})`, classe: 'vermelho', segurar: atira, grupo: 'tiro' });
  botao({ rotulo: 'MIRAR', l: `calc(${J} + ${g})`, b: `calc(2 * (${b} + ${g}))`, alternar: mira, grupo: 'mira' });
  // Topo à direita (a engrenagem do HUD fica no canto): ARMA, RECAR., PORTA (perto de veículo)
  botao({ rotulo: 'ARMA', r: `calc(${b} + ${g})`, t: '0px', tam: b, toque: () => injetarToque('KeyX') });
  botao({ rotulo: 'RECAR.', r: `calc(2 * (${b} + ${g}))`, t: '0px', tam: b, toque: () => injetarToque('KeyR') });
  botao({ rotulo: 'PORTA', r: `calc(3 * (${b} + ${g}))`, t: '0px', tam: b, classe: 'vermelho', toque: () => injetarToque('KeyF'), visivel: 'porta' });
  // Dirigindo: pedais à direita, volante (joystick) à esquerda, buzina/luz/sair
  botao({ rotulo: 'ACEL.', r: '0px', b: '0px', tam: B, classe: 'vermelho', segurar: tecla('KeyW'), visivel: 'dirigindo' });
  botao({ rotulo: 'FREIO', r: `calc(${B} + ${g})`, b: '0px', tam: `calc(${b} * 1.15)`, segurar: tecla('KeyS'), visivel: 'dirigindo' });
  botao({ rotulo: 'MÃO', r: `calc(${B} + ${g})`, b: `calc(${b} * 1.15 + ${g})`, segurar: tecla('Space'), visivel: 'dirigindo' });
  botao({ rotulo: 'BUZINA', r: `calc((${B} - ${b}) / 2)`, b: `calc(${B} + ${g})`, segurar: tecla('KeyH'), visivel: 'dirigindo' });
  botao({ rotulo: 'LUZ', l: `calc(${J} + ${g})`, b: '0px', toque: () => injetarToque('KeyE'), visivel: 'viatura' });
  botao({ rotulo: 'SAIR', r: `calc(${b} + ${g})`, t: '0px', tam: b, classe: 'vermelho', toque: () => injetarToque('KeyF'), visivel: 'dirigindo' });

  const estado = (e: EstadoToque) => {
    dirigindo = e.dirigindo;
    // mira alternada não fica ligada ao dirigir nem com arma de mão
    if ((e.dirigindo || e.corpoACorpo) && alternados.get('mira')) {
      alternados.set('mira', false);
      marcaGrupo('mira', false);
      mira(false);
    }
    for (const x of botoes) {
      const m = x.dataset.modo;
      x.hidden = !(
        (m === 'pe' && !e.dirigindo) ||
        (m === 'dirigindo' && e.dirigindo) ||
        (m === 'viatura' && e.dirigindo && e.veiculoViatura) ||
        (m === 'porta' && e.pertoVeiculo && !e.dirigindo)
      );
      if (e.corpoACorpo && x.dataset.grupo === 'mira') x.hidden = true;
    }
  };
  estado({ dirigindo: false, pertoVeiculo: false, veiculoViatura: false, corpoACorpo: false });

  return {
    estado,
    dispose() {
      raiz.remove();
      aviso.remove();
      st.remove();
    },
  };
}
