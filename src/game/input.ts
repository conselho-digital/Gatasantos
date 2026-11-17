/** Teclas pressionadas, por código físico (KeyW, ShiftLeft...). */
const teclas = new Set<string>();
addEventListener('keydown', (e) => teclas.add(e.code));
addEventListener('keyup', (e) => teclas.delete(e.code));
addEventListener('blur', () => teclas.clear());

export function tecla(codigo: string): boolean {
  return teclas.has(codigo);
}

/** Eixos de movimento: x = direita(+)/esquerda(-), y = frente(+)/trás(-). */
export function eixoMovimento(): { x: number; y: number } {
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
