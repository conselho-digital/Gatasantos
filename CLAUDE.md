# Gata Santos — guia para o Claude

Especificação completa: `docs/ESPECIFICACAO.md` (leia inteira antes de cada etapa).

## Regras de trabalho (seção 2 e 0)
- TypeScript estrito; código e comentários em português; respostas curtas ao dono.
- Dependências permitidas: `three`, `@supabase/supabase-js`; dev: vite, typescript, eslint
  (+ `typescript-eslint`, `@eslint/js`, `globals` só para o lint de TS). Outras: perguntar.
- Uma etapa por vez. Fim de etapa: `npm run check` + teste no navegador + seção "Rodada" aqui + commit.
- Tudo gerado por código; nada de assets de terceiros. Itens pagos: perguntar antes.
- Sem segredos no código. Só a chave anon do Supabase vai no front.
- Dev: `?dev=1`, `window.__game` só em `import.meta.env.DEV`.

## Arquitetura (seção 3 e 10, resumo)
Vite + TS + Three.js r187; Vercel estático; Supabase (Auth Google, Realtime, Postgres RLS).
Sem servidor autoritativo: dano calculado no cliente, validado com `plausible`.
Lições-chave: presence antes de `subscribe()`; `warmUp` com e sem neblina; sRGB em canvas;
mapas não lidos em tempo de importação; todo oscilador precisa de parada; `?v=N` em assets trocados.

## Rodada: Etapa 1 — Esqueleto
- Vite + TS + three 0.187, cena (hemisfério + sol com sombra, neblina 49–161 m), chão, cubo girando.
- `THREE.Timer`, `dt` ≤ 50 ms, pixel ratio ≤ 2 (≤ 1,5 em toque), sem antialias em toque.
- `npm run check` verde: lint, typecheck, build, tamanho (0,5 MB), segredos, audit.
- Medido (swiftshader): 3 chamadas, 26 triângulos, 0 erros de página.
- Limites: `vercel.json` usa domínio provisório `gatasantos.com.br`; deploy na Vercel ainda não feito.
- Skills (`.claude/skills`) ainda não instaladas: origem é um repositório fora do escopo.
