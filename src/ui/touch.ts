import { definirJoystick, forcarBotao, injetarGiro, injetarTecla, injetarToque } from '../game/input';

const CSS = `
.gt{position:fixed;inset:0;z-index:3;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;font:700 16px system-ui,sans-serif;color:#fff}
.gt *{touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.gt-cam{position:absolute;inset:0}
.gt-b{position:absolute;border-radius:50%;background:#1b2535b3;border:3px solid #ffffff66;display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.05;padding:4px;box-sizing:border-box}
.gt-b.on{background:#3b82f6cc;border-color:#fff}
.gt-b.vermelho{background:#c62828b3}.gt-b.vermelho.on{background:#ff5252dd}
.gt-b[hidden]{display:none}
.gt-joy{position:absolute;left:max(18px,env(safe-area-inset-left));bottom:max(18px,env(safe-area-inset-bottom));width:150px;height:150px;border-radius:50%;background:#1b253588;border:3px solid #ffffff55}
.gt-joy i{position:absolute;left:50%;top:50%;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;background:#ffffffaa}
.gt-giro{position:fixed;inset:0;z-index:9;background:#0b0f14;display:none;align-items:center;justify-content:center;text-align:center;font:700 26px system-ui;color:#fff;padding:24px}
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
 * tiro e mira em dois botões cada (ligados entre si), pular, agachar, arma, recarregar, porta, garagem,
 * pedais e luzes. Arrastar o resto da tela gira a câmera com a mesma conta do mouse.
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
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, max = r.width / 2 - 8;
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
  const grupos = new Map<string, Set<number>>(); // botões ligados entre si (tiro ×2, mira ×2)

  interface Opcoes {
    rotulo: string;
    x: string; // posição CSS (left ou right)
    y: string; // bottom
    lado?: 'esq' | 'dir';
    tam?: number;
    classe?: string;
    segurar?: (v: boolean) => void; // enquanto apertado
    toque?: () => void; // um aperto
    grupo?: string;
    visivel?: string; // modo em que aparece
  }
  const botao = (o: Opcoes): HTMLElement => {
    const b = document.createElement('div');
    b.className = `gt-b ${o.classe ?? ''}`;
    b.textContent = o.rotulo;
    const t = o.tam ?? 72;
    b.style.width = b.style.height = `${t}px`;
    b.style.fontSize = t >= 90 ? '20px' : '16px';
    b.style[o.lado === 'esq' ? 'left' : 'right'] = `calc(${o.x} + env(safe-area-inset-${o.lado === 'esq' ? 'left' : 'right'}))`;
    b.style.bottom = `calc(${o.y} + env(safe-area-inset-bottom))`;
    b.dataset.modo = o.visivel ?? 'pe';
    const g = o.grupo ? (grupos.get(o.grupo) ?? grupos.set(o.grupo, new Set()).get(o.grupo)!) : null;
    const marca = () => botoes.filter((x) => x.dataset.grupo === o.grupo).forEach((x) => x.classList.toggle('on', !!g && g.size > 0));
    if (o.grupo) b.dataset.grupo = o.grupo;
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      b.setPointerCapture(e.pointerId);
      vibrar();
      if (g) { g.add(e.pointerId); marca(); o.segurar?.(true); }
      else { b.classList.add('on'); o.segurar?.(true); }
      o.toque?.();
    });
    const solta = (e: PointerEvent) => {
      if (g) { g.delete(e.pointerId); marca(); o.segurar?.(g.size > 0); }
      else { b.classList.remove('on'); o.segurar?.(false); }
    };
    b.addEventListener('pointerup', solta);
    b.addEventListener('pointercancel', solta);
    raiz.appendChild(b);
    botoes.push(b);
    return b;
  };

  // Correr: continua correndo 0,5 s depois de soltar
  let tCorrer = 0;
  const correr = (v: boolean) => {
    clearTimeout(tCorrer);
    if (v) injetarTecla('ShiftLeft', true);
    else tCorrer = window.setTimeout(() => injetarTecla('ShiftLeft', false), 500);
  };
  const tecla = (c: string) => (v: boolean) => injetarTecla(c, v);
  const atira = (v: boolean) => forcarBotao(0, v);
  const mira = (v: boolean) => forcarBotao(2, v);

  // A pé (direita): tiro grande, mirar, pular, agachar, arma, recarregar
  botao({ rotulo: 'TIRO', x: '24px', y: '24px', tam: 104, classe: 'vermelho', segurar: atira, grupo: 'tiro' });
  botao({ rotulo: 'TIRO', x: '190px', y: '230px', tam: 76, classe: 'vermelho', segurar: atira, grupo: 'tiro', lado: 'esq' });
  botao({ rotulo: 'MIRAR', x: '24px', y: '140px', tam: 76, segurar: mira, grupo: 'mira' });
  botao({ rotulo: 'MIRAR', x: '190px', y: '150px', tam: 76, segurar: mira, grupo: 'mira', lado: 'esq' });
  botao({ rotulo: 'PULAR', x: '140px', y: '70px', tam: 84, segurar: tecla('Space') });
  botao({ rotulo: 'ABAIXAR', x: '120px', y: '165px', tam: 66, segurar: tecla('KeyC') });
  botao({ rotulo: 'CORRER', x: '190px', y: '24px', tam: 76, lado: 'esq', segurar: correr });
  botao({ rotulo: 'ARMA', x: '24px', y: '236px', tam: 66, toque: () => injetarToque('KeyX') });
  botao({ rotulo: 'RECAR.', x: '24px', y: '312px', tam: 66, toque: () => injetarToque('KeyR') });
  // Veículo
  botao({ rotulo: 'PORTA', x: '110px', y: '260px', tam: 76, classe: 'vermelho', toque: () => injetarToque('KeyF'), visivel: 'porta' });
  botao({ rotulo: 'GARAGEM', x: '24px', y: '388px', tam: 66, toque: () => injetarToque('KeyV'), visivel: 'pe' });
  // Dirigindo: pedais, freio de mão, buzina/luzes, sair
  botao({ rotulo: 'ACEL.', x: '24px', y: '24px', tam: 110, classe: 'vermelho', segurar: tecla('KeyW'), visivel: 'dirigindo' });
  botao({ rotulo: 'FREIO', x: '150px', y: '24px', tam: 84, segurar: tecla('KeyS'), visivel: 'dirigindo' });
  botao({ rotulo: 'MÃO', x: '24px', y: '150px', tam: 72, segurar: tecla('Space'), visivel: 'dirigindo' });
  botao({ rotulo: 'LUZ', x: '110px', y: '150px', tam: 66, toque: () => injetarToque('KeyE'), visivel: 'viatura' });
  botao({ rotulo: 'SAIR', x: '110px', y: '260px', tam: 76, toque: () => injetarToque('KeyF'), visivel: 'dirigindo' });

  const estado = (e: EstadoToque) => {
    dirigindo = e.dirigindo;
    for (const b of botoes) {
      const m = b.dataset.modo;
      b.hidden = !(
        (m === 'pe' && !e.dirigindo) ||
        (m === 'dirigindo' && e.dirigindo) ||
        (m === 'viatura' && e.dirigindo && e.veiculoViatura) ||
        (m === 'porta' && e.pertoVeiculo && !e.dirigindo)
      );
      if (e.corpoACorpo && b.dataset.grupo === 'mira') b.hidden = true;
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
