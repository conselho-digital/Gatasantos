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

## Rodada: Etapa 4 — Animação
- `anim.ts`: clipes por funções (sem arquivos): `idle, walk, run, crouch_idle, crouch_walk, jump, fall, land`.
  `Animador` com crossfade (0,15 s; 0,08 s no pulo/pouso) e corpo apoiado pelo pé mais baixo.
  Ainda não grava `public/anims/*.json` (os clipes são avaliados em tempo real); clipes de luta/veículo vêm nas etapas 7–8.
- Apoio sem patinar: no apoio o ângulo da coxa muda em linha reta (pé parado no chão); balanço é uma curva suave.
- Velocidades do jogo: andar 2,1, correr 6,2, agachado 1,0 m/s. Pulo: v0 5,5 m/s, gravidade 16 m/s² (~0,95 m).
- Medido pelo pé de apoio (`__game.medirPasso(clip)`, mediana de 2 ciclos; alvo → medido):
  andar 2,1 → 2,10 (quartis 1,93–2,25); correr 6,2 → 6,23; agachado 1,0 → 1,00 (0,97–1,04).
  `TIME_SCALE`: walk 0,974, run 1,176, crouch_walk 0,961 (ao refazer o clipe, medir e recalibrar).
- Controles: Shift corre, C/Ctrl agacha, Espaço pula. `__game.forcarClip(nome)` fixa um clipe no dev.
- Conferido em folha de quadros (8 clipes) por captura lateral.
- Limites: correr tem fase aérea, então os quartis de medida ficam ruidosos (vale a mediana); sem rolar/escalar/cair ainda;
  pulo só no plano (sem subir em caixas).

## Rodada: Etapa 5 — Menu inicial, personagem e equipe (SEM login por enquanto)
- Decisão do dono: **sem Supabase e sem Google por enquanto**. O botão "Entrar no jogo" entra direto; o login
  (Supabase Auth + Google GSI) e a regra "só entra quem fez login" ficam para depois. Não há `@supabase/supabase-js` ainda.
  O único projeto Supabase da conta (`manifestacao`) é do jogo antigo: não reutilizar sem o dono decidir.
- `ui/menu.ts`: fundo liso, foto do rosto, nome (máx. 16, sem caracteres de controle), equipe (a 1ª marcada por padrão),
  mapa (Mapa 2 "em breve"), seleção em carrosséis por categoria (setas no PC, arrasto no celular), fotos sem `loading=lazy`,
  URL `?v=N`. Escolha guardada em `localStorage` (`gata-config`, com try/catch).
- `main.ts` mostra o menu; `game/jogo.ts` (`iniciarJogo`) só monta cena e mapa depois do clique (0 canvas antes de Entrar).
  Mouse preso pedido no clique. `?menu=0` (só dev) pula o menu; `?char=<id>` escolhe o personagem.
- `game/characters.ts`: 10 personagens em 4 categorias (Famosos, Polícia, Gangue, Meninas) + 4 equipes (duas cores) + mapas.
  `character.ts` aceita a definição (cabelo, boné/quepe/chapéu/bandana, olhos). Anel de duas cores sob os pés (`teams.ts`).
- Fotos: `dev/face-shots.html` (câmera 20° de FOV, 1,25 m) gera `public/faces/<id>.webp` (~2 KB cada, 10 arquivos).
- Medido: menu → jogo ok no navegador (nome, equipe e personagem gravados), 0 erros de página.
- Limites: sem login; equipes são locais (tabela `teams` depois); sem rosto de foto real; menu sem teste em celular real.

## Rodada: Etapa 7 (combate solo) + pedestres — etapa 6 (multiplayer) PULADA
- Decisão do dono: **pular a etapa 6** (multiplayer/Supabase Realtime) e **colocar NPCs já**. Combate funciona em modo solo;
  dano pela rede com `plausible` e abates/ranking ficam para quando o multiplayer existir.
- Personagem agora é **1 `SkinnedMesh`** (peças presas a 1 osso, cor por vértice, `MeshBasicMaterial`): 1 chamada por boneco
  (+1 da sombra). `frustumCulled=false` por enquanto (TODO: esfera da pose + 1,2 m).
- `weapons.ts`: Punho, Pistola, Fuzil A/B/C, Fuzil silenciado (dano 20/18/22/16, gap 0,11/0,09/0,12/0,10, pente 30, reserva 120;
  pistola 15, gap 0,4, 12/60). Cabeça × 2. Recarga 1,6 s. Dispersão em disco 0,003 mirando / 0,012 sem mirar. Arma levantada 0,6 s.
- `combat.ts`: hitscan da câmera até o ponto de mira, depois do cano até esse ponto (cobertura bloqueia). Cadência em relógio
  fixo (`cd = gap + cd`, até 3 tiros/quadro). Vida 400, colete 100 (absorve 60%), morrer → renasce em 3,5 s com 60 s de proteção.
  Munição ainda sem limite de 15 min (guardado por conta vem com login). Armas brancas ainda não (só punho).
- `npcs.ts`: 26 pedestres (18 no celular), locais. Andam 2,1 m/s até ponto livre a 8–30 m, esperam 2–7 s; barulho de tiro
  (35 m; 10 m silenciado) faz fugir (6,2 m/s) para fora da linha de visão e esconder agachado 10–18 s; vida 60; morrem
  deitados, ficam 9 s e outro nasce a ≥ 40 m; param além de 75 m e somem além de 110 m. 8 nascem perto (10–45 m).
- `raycast.ts` (caixa/cilindro/esfera), `noise.ts`, `gunmodel.ts`, `ui/hud.ts` (vida, colete, arma/munição, mira, marcador, feed, FPS).
- Controles: clique atira, botão direito mira (FOV × 0,7, sensibilidade × tan), R recarrega, 1–6 / X / roda trocam arma.
- Medido (swiftshader): cena com 26 NPCs = **59 chamadas, 28,9 mil triângulos**. 0 erros de página.
- Cadência (simulação, 10 s): Fuzil A 91 (esperado 90,9), B 112 (111,1), silenciado 101 (100) em 15/20/30/60/144 FPS: ±1 ok.
- Tempo para matar (sem colete; vida 60 / vida 400): Fuzil A 3 tiros 0,22 s / 20 tiros 2,09 s; B 4 / 0,27 s e 23 / 1,98 s;
  C 3 / 0,24 s e 19 / 2,16 s; silenciado 4 / 0,30 s e 25 / 2,40 s; Pistola 4 / 1,2 s e 27 / 10,4 s; Punho 5 / 2 s e 34 / 16,5 s.
  `__game.tabelaTTK(colete)` imprime a tabela completa.
- Testes no navegador (relógio do jogo, `__game.relogio()`; o navegador de teste roda em câmera lenta): tiro mata NPC a 20 m;
  parede entre atirador e NPC bloqueia (vida 60); controle sem parede mata; silenciado a 12 m não assusta, fuzil A assusta e
  o NPC se esconde; recarga automática 0/120 → 30/90 em 1,6 s; morte 3,5 s → renasce com proteção 59 s e dano ignorado;
  NPC morto some após 9 s e nasce a 72 m.
- Limites: pitch inicial 0,28 mira ~5 m à frente no chão (o jogador ajusta com o mouse; avaliar pitch menor);
  sem clipes de luta/queda/reação (NPC cai por rotação simples e foge ao ser atingido); com arma na mão as pernas andam para a
  frente mesmo ao andar de lado; braços da arma por pose fixa (sem IK); sem som (etapa 9); celular sem botões (etapa 13).

## Rodada: Etapa 6 — Multiplayer (Supabase Realtime, SEM login)
- Projeto Supabase novo **`gatasantos`** (ref `micrzdzbhglvskrdboyj`, eu-west-1), vazio: o multiplayer só usa Realtime (sem tabelas).
  `.env.local` (fora do git) e variáveis `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (chave **publishable**, pública) também
  configuradas na Vercel (production/preview/development). `.env.example` documenta. Nunca pôr chave secreta (`service_role`).
- Decisão do dono: **sem login Google**; o menu só pede o **nome** (obrigatório). Sem login não há ranking global, compras
  nem admin (dependem de identidade/RLS): ficam para quando houver login.
- `net/supabase.ts` (cliente), `net/sala.ts` (canal `arena:<mapa>`, `-2`, `-3`… até 12; **máx. 30**, `?max=N` no dev; ouvintes
  de presence ANTES de `subscribe()`; espera a 1ª lista até 2 s; sessão cheia tenta a próxima), `net/clean.ts` (toda mensagem
  passa por `clean*`), `net/plausible.ts`, `game/online.ts`, `game/remote.ts`, placar por Tab.
- Presence: `{id, nome, pers, eq}`; broadcast `move` ~12/s (~4/s parado): posição, giro, clipe (nome), hp %, arma, pitch, levantada,
  recarregando, protegido. Remoto interpola ~100 ms atrás, repete o clipe pelo nome, tem nome em textura de canvas, anel e faixa
  da equipe; `dispose()` libera texturas/geometrias. Eventos: `tiro` (traçador), `dano`, `kill`.
- Dano: o atirador calcula o acerto e manda `dano`; a vítima valida com `plausible` (atirador vivo, a ≤ 8 m de onde diz que
  disparou, raio passa pelo meu corpo com margem 0,5 m, sem parede, alcance + 5 m, cadência × 0,6 por balde de crédito) e
  **recalcula o valor pela arma** (não confia no enviado). Quem morre manda `kill`. Abate só conta se acertei a vítima nos
  últimos 15 s, 1 por vítima a cada 3 s.
- Params: `?room=<nome>` (canal de teste), `?max=2`, `?offline=1`. Dev: `__game.online`, `__game.remotes()`, `__game.mouse(botão,bool)`.
- Testes (2–3 abas, Playwright, relógio do jogo): 2 abas se veem e B acompanha A andando; 3ª aba com `?max=2` cai na **sessão 2**;
  tiro de A em B tira 40 de vida (2 acertos de 20); B morre, `kill` chega, A conta 1 abate, B renasce com 56 s de proteção;
  ao fechar A, B remove o remoto (27 personagens na cena = 26 NPCs + eu, sem vazamento); 0 erros de página.
  Dano forjado recusado: origem longe do atirador, raio que não passa pelo corpo, rajada instantânea (13 de 20 recusadas por cadência).
- Limites: **o canal Realtime é público** e não há login, então dá para forjar mensagens (o jogo é casual; as validações só
  barram o óbvio). Anti-cheat de verdade exige canais privados com RLS em `realtime.messages` e validação no servidor.
  Sem voz (etapa 10), sem veículos remotos (etapa 8), sem sincronizar pedestres (são locais), troca de equipe ao vivo só recria o remoto.
  Nome repetido é permitido. Presença não tem teste de 30 jogadores (só `max=2`).
