/** Barulhos do mundo (tiros, batidas): pedestres e outros sistemas escutam aqui. */
type Ouvinte = (x: number, z: number, raio: number) => void;
const ouvintes: Ouvinte[] = [];

export function ouvirRuido(f: Ouvinte): void {
  ouvintes.push(f);
}

export function emitirRuido(x: number, z: number, raio: number): void {
  for (const f of ouvintes) f(x, z, raio);
}
