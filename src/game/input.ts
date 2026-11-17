/** Teclas pressionadas, por código físico (KeyW, ShiftLeft...). */
const teclas = new Set<string>();
addEventListener('keydown', (e) => teclas.add(e.code));
addEventListener('keyup', (e) => teclas.delete(e.code));
addEventListener('blur', () => teclas.clear());

export function tecla(codigo: string): boolean {
  return teclas.has(codigo);
}

/** Joystick virtual (celular): x/y em -1..1. */
let joyX = 0;
let joyY = 0;

/** Eixos de movimento: x = direita(+)/esquerda(-), y = frente(+)/trás(-). */
export function eixoMovimento(): { x: number; y: number } {
  if (joyX || joyY) return { x: joyX, y: joyY };
  const x = (tecla('KeyD') ? 1 : 0) - (tecla('KeyA') ? 1 : 0);
  const y = (tecla('KeyW') ? 1 : 0) - (tecla('KeyS') ? 1 : 0);
  return { x, y };
}

// Mouse preso: deltas acumulados até serem consumidos.
let dx = 0;
let dy = 0;
let preso = false;

export function iniciarMouse(alvo: HTMLElement): void {
  alvo.addEventListener('click', () => {
    if (!document.pointerLockElement) alvo.requestPointerLock?.();
  });
  document.addEventListener('pointerlockchange', () => {
    preso = document.pointerLockElement === alvo;
  });
  addEventListener('mousemove', (e) => {
    if (!preso) return;
    dx += e.movementX;
    dy += e.movementY;
  });
}

/** Devolve e zera o giro do mouse (pixels). Mouse delta não leva `dt`. */
export function consumirMouse(): { dx: number; dy: number } {
  const r = { dx, dy };
  dx = 0;
  dy = 0;
  return r;
}

// Botões do mouse (só contam com o mouse preso), roda e teclas de um toque.
const botoes = new Set<number>();
let roda = 0;
const toques = new Set<string>();

addEventListener('mousedown', (e) => { if (preso) botoes.add(e.button); });
addEventListener('mouseup', (e) => botoes.delete(e.button));
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => { if (preso) roda += Math.sign(e.deltaY); }, { passive: true });
addEventListener('keydown', (e) => { if (!e.repeat) toques.add(e.code); });
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) botoes.clear(); });

/** 0 = esquerdo (atirar), 2 = direito (mirar). */
export function botaoMouse(b: 0 | 2): boolean {
  return botoes.has(b);
}

/** Passos de roda desde a última chamada (+1 = próxima arma). */
export function consumirRoda(): number {
  const r = roda;
  roda = 0;
  return r;
}

/** Verdadeiro uma vez por aperto da tecla. */
export function apertou(codigo: string): boolean {
  return toques.delete(codigo);
}

/** Descarta os apertos acumulados (para o 1º quadro). */
export function limparToques(): void {
  toques.clear();
}

/** Só para testes no dev: simula botão do mouse sem mouse preso. */
export function forcarBotao(b: number, valor: boolean): void {
  if (valor) botoes.add(b);
  else botoes.delete(b);
}

// ---- Entrada virtual (celular): os botões de toque entram pelos mesmos caminhos do teclado e do mouse ----

export function definirJoystick(x: number, y: number): void {
  joyX = x;
  joyY = y;
}

/** Tecla virtual segurada (Shift, C, Espaço, W/S/A/D nos pedais). */
export function injetarTecla(codigo: string, valor: boolean): void {
  if (valor) teclas.add(codigo);
  else teclas.delete(codigo);
}

/** Aperto de uma tecla (vale uma vez): F, V, R, X, E. */
export function injetarToque(codigo: string): void {
  toques.add(codigo);
}

/** Giro da câmera por arrasto (mesma conta do mouse: pixels). */
export function injetarGiro(ddx: number, ddy: number): void {
  dx += ddx;
  dy += ddy;
}
