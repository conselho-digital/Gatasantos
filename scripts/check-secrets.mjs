// Varre arquivos rastreados atrás de chaves secretas comuns.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const padroes = [
  /service_role/i,
  /sk_live_[0-9a-zA-Z]+/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
  /ghp_[0-9a-zA-Z]{36}/,
  /APP_USR-[0-9a-f-]{20,}/,
];
const arquivos = execSync('git ls-files -co --exclude-standard', { encoding: 'utf8' })
  .split('\n').filter((f) => f && !/\.(png|webp|jpg|glb|mp3|lock)$/.test(f) && !f.includes('package-lock') && f !== 'scripts/check-secrets.mjs');
let achou = false;
for (const f of arquivos) {
  let txt;
  try { txt = readFileSync(f, 'utf8'); } catch { continue; }
  for (const re of padroes) {
    if (re.test(txt)) { console.error(`Possível segredo em ${f}: ${re}`); achou = true; }
  }
}
if (achou) process.exit(1);
console.log(`Segredos: nada achado (${arquivos.length} arquivos).`);
