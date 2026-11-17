# Gata Santos — guia para o Claude

Especificação completa: `docs/ESPECIFICACAO.md` (leia inteira antes de cada etapa).

## Regras de trabalho (seção 2 e 0)
- **Git: sempre `git push origin main` direto. Nunca criar outras branches nem PRs** (ordem do dono).
- **Sem domínio real por enquanto** (o dono compra depois); o site usa o endereço `.vercel.app`.
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
- Deploy na Vercel funcionando (`gatasantos.vercel.app`). Sem domínio real ainda; redirecionamento www removido do `vercel.json`.
- Skills (`.claude/skills`) ainda não instaladas: origem é um repositório fora do escopo.

## Rodada: Etapa 2 — Mapa 1 simples
- `city.ts`: avenida (z −12..12, 4 faixas), rua perimetral 12 m, calçada de pedra, muro preto 4 m, 6 prédios.
  Limite jogável 244 x 192 m (`LIMITE`). `validate()` roda só no dev e avisa prédio em rua ou sobreposto (0 avisos).
- Prédios: geometria fundida por tipo de fachada (UV em metros; fachada 12 x 3 m com laje de 0,2 m, pilares, janelas).
- `textures.ts` (canvas sRGB), `collision.ts` (`COLLIDERS`, `empurrarCirculo`), `input.ts` (WASD, Shift corre, setas giram).
- Jogador provisório (cápsula) até a etapa 3. `?pos=x,z`, `?cam=x,y,z,ax,ay,az`; `__game` no dev.
- Medido (swiftshader): 20–22 chamadas, 300–460 triângulos, 0 erros de página.
- Teste: correr 9 s contra prédio parou em z = −36,6 (face −37 − raio 0,4); contra o muro parou em x = 121,6;
  diagonal desliza pela parede; 0 amostras dentro de colisor.
- Limites: sem avenida com ruas transversais, parque nem calçadas detalhadas (etapa 12); câmera ainda atravessa prédio (etapa 3).

## Rodada: Etapa 3 — Personagem + câmera
- `character.ts`: boneco low-poly por código (~700 tri, `MeshBasicMaterial` sem luz, sombra por círculo).
  Ossos nomeados (`Pelvis, Spine, Neck, Head, L/R_UpperArm/ForeArm/Hand/Thigh/Calf/Foot`) prontos para a etapa 4.
- `camera.ts`: orbital 3ª pessoa, 2,7 m atrás e 0,7 m à direita, pitch −34°..+69° (inicial 0,28), tecla G = perto,
  plano próximo 0,4 m, recuo mínimo 0,3 m. Recua pelo raio até a 1ª caixa engordada (0,9 m) e usa
  `pushOutOfBoxes` duas vezes (no ponto desejado e depois do suavizado). `Caixa` ganhou altura `h` opcional.
- Mouse preso ao clicar; giro = px × 0,004 × sensibilidade 0,6 (sem `dt`). WASD relativo à câmera; Shift corre.
- Medido: distância mínima câmera–caixa em 64 posições (16 giros × 4 inclinações): 0,900 m
  (colado na parede, a 1 m, canto de prédio e canto do muro) — aceite ≥ 0,9 ok. Via `__game.camTeste(x,z)`.
- Render: 32 chamadas, 1330 triângulos; 0 erros de página.
- Limites: sem mira/FOV, sem câmera de veículo; boneco ainda sem animação (etapa 4); cabelo/rosto simples.
