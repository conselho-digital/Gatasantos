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
