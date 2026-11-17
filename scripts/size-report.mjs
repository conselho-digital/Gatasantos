// Lista os maiores arquivos de dist/ e falha se o total passar de 15 MB.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LIMITE = 15 * 1024 * 1024;
const todos = [];
const andar = (dir) => {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    const s = statSync(p);
    if (s.isDirectory()) andar(p);
    else todos.push({ p, tam: s.size });
  }
};
andar('dist');
const total = todos.reduce((a, f) => a + f.tam, 0);
todos.sort((a, b) => b.tam - a.tam).slice(0, 10)
  .forEach((f) => console.log(`${(f.tam / 1024).toFixed(1).padStart(9)} KB  ${f.p}`));
console.log(`Total: ${(total / 1048576).toFixed(2)} MB (limite 15 MB)`);
if (total > LIMITE) {
  console.error('Build passou do limite!');
  process.exit(1);
}
