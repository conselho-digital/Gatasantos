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
  configuradas na Vercel (production/preview/development). `.env.example` documenta. Nunca pôr chave secreta (a de serviço do Supabase).
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

## Rodada: Mapa 1 = Paulista (GLB do dono)
- Decisão do dono: o mapa do menu "Mapa 1" agora é a **Paulista** (id `paulista`), no lugar da cidade por código. O arquivo é
  do próprio dono (outro jogo dele), então a licença está ok. `public/models/mapa-paulista.glb` (9,1 MB; URL com `?v=1`).
  O mapa simples por código continua só no dev: `?mapa=cidade`.
- O GLB já está em metros e com o mesmo tamanho do jogo (250 x 198 m, altura até 70 m, centrado na origem; chão 244 x 192).
  Usa instanciamento (`EXT_mesh_gpu_instancing`) e quantização, lidos pelo `GLTFLoader` do three r187. 142 materiais, 70 texturas PNG (4,5 MB).
- `game/paulista.ts`: carrega o GLB (tela "Carregando mapa… N%") e **gera colisores da geometria**: triângulos quase verticais
  (|ny| ≤ 0,8) entre 0,9 e 1,9 m viram células de 0,5 m (meio-fio abaixo de 0,9 m não bloqueia), fundidas em retângulos
  (instâncias incluídas). Resultado: 619 colisores. Sombras do mapa desligadas (o sol não segue o jogador ainda).
- `collision.ts` ganhou **grade espacial** (células de 8 m): `registrar`, `perto`, `aoLongoDoRaio` (DDA). `raycast.ts` e `camera.ts`
  usam a grade. `pushOutOfBoxes` agora empurra pela direção do ponto mais próximo (converge em paredes feitas de várias caixas).
- Medido (swiftshader, com 26 NPCs): **135 chamadas, 94,7 mil triângulos** (orçamento do mapa 1: ≤ 370 / ≤ 200 mil). Carrega em < 1 s local.
  Build total 10,0 MB (limite 15 MB; o GLB é 9,3 MB: recomprimir texturas em WebP se faltar espaço).
- Testes: 6 corridas contra paredes: 0 dentro de colisor, 6 pararam antes da parede; raio até a parede a 3 m = 3,0 m;
  câmera ≥ 0,9 m das paredes em 64 posições (único 0,6 m foi num beco de 1,5 m entre jardineira e parede: impossível ter
  0,9 m dos dois lados); multiplayer de 2 abas continua ok no mapa novo; 0 erros de página.
- Limites: colisão só de paredes entre 0,9 e 1,9 m (marquises e passarelas altas não bloqueiam; escadas/rampas não existem);
  terreno plano (sem `terrainHeight`); sem pickups/pedestres posicionados por mapa; o spawn cai na ciclovia da avenida
  (escolher ponto na calçada depois); cartazes e lojas do GLB são texturas fixas (sem o sistema de cartazes pagos).

## Rodada: Tela cheia e paisagem ao entrar
- Pedido do dono: ao clicar em "Entrar no jogo" a tela vai para **tela cheia** e tenta **travar a paisagem** (`entrarEmTelaCheia()` em `ui/menu.ts`,
  chamada dentro do clique para o navegador aceitar). Trava de orientação só existe em celular/tablet (Android/Chrome); iPhone não
  deixa (segue sem). Testado: emulação de celular 844x390 entra com `fullscreenElement = HTML`, 0 erros.

## Rodada: Etapa 8 — Veículos (carros, motos, viatura, garagem)
- `vehicle.ts`: 6 modelos por código (Gol, Buffalo, Opala, Cruiser, Esportiva, Viatura): carroceria numa só malha (cor por vértice) +
  rodas (`wheel_FL/FR/BL/BR`, moto `wheel_F/R`) + barra de luz da viatura. 5 cores iguais (azul escuro, vinho, branco fosco, cinza, amarelo).
  Física: carro 120 km/h (33,3 m/s), moto 130 km/h (36,1); aceleração cai perto do topo; direção `max(0,4, 1 − v/45)`; freio de mão
  freia e faz a traseira derrapar (`slip`); ré até 8 m/s. Colisão por 2 círculos que **não trava nem quica** (tira só a velocidade que entra
  na parede e desliza); fica dentro dos limites do mapa. Moto: inclina nas curvas.
- `driving.ts` (`Conducao`): entrar/sair em etapas `aproximar → entrando → dirigindo → saindo`; o corpo anda até a porta (esquerda ou direita,
  a mais perto), `entrando` leva o corpo da porta ao banco; só sai com ≤ 3 m/s ("Pare para sair"); sai pela porta esquerda, direita ou atrás
  (a primeira livre). Moto caída: levanta (0,8 s) antes de subir. Atropelo acima de 4,5 m/s: dano `20 + v × 5`.
  **Moto acima de 11 m/s (40 km/h) na batida**: piloto é jogado 1,8 m à frente, deitado 1,6 s, dano `min(380, (v − 8) × 9)`; moto fica caída.
- `ui/garage.ts` (tecla V): modelo + cor, pré-visualização do modelo real girando (renderizador próprio descartado ao fechar);
  o veículo só aparece no botão **Chamar**, 5–12 m à frente em lugar livre (≥ 5,4 m de outros). Um por jogador (o anterior some).
  Mouse é preso de novo ao fechar (2 tentativas, lição 22).
- Controles: F entra/sai, W/S acelera/freia/ré, A/D esterça, Espaço freio de mão, E luzes da viatura (vermelho/azul, ciclo 0,8 s).
  Câmera atrás do veículo quando anda (> 0,8 m/s); parado, gira livre. HUD: velocímetro (km/h) e dica "F — entrar".
- Rede: `move` leva `ve` (modelo), `vc` (cor), `vh` (direção); o remoto mostra o veículo dele e o corpo sentado (clipes `sit_car`/`ride_bike`
  repetidos pelo nome). Veículo estacionado vai pela **presence** (`veh {m,c,x,z,h}`, atualiza ao vivo sem recriar o jogador).
- Clipes novos: `sit_car`, `ride_bike`. `dispose()` libera geometria/material de cada veículo.
- Testes (navegador, relógio do jogo): carro entra e dirige; **velocidade máxima 33,3 m/s = 120 km/h**; curva em alta (heading +0,09 rad
  em 0,8 s, direção firme); freio de mão para o carro; para na parede do mapa sem entrar em colisor; moto a 36 m/s bate: cai, vida 400 → 147
  (dano 253); subir na moto caída funciona; carro atropela e mata NPC a 28 m/s; 2 abas: B vê o veículo estacionado de A e depois ele
  guiado, com A sentado; 0 erros de página.
- Limites: **sem som** (motor, buzina, sirene, batida: etapa 9) e sem faíscas; sem animação de abrir/fechar porta nem `door_L/R`;
  veículo estacionado não é obstáculo para pessoas (sem colisão veículo×pessoa nem veículo×veículo); só o dono dirige (sem equipe/passageiro);
  sem empinar a moto (Shift) nem buzina; sem veículos vistos de longe com corte por distância; a saída de A no remoto só foi testada em partes.

## Rodada: Etapa 13 — Celular (prioridade do dono: a maioria dos acessos vem do celular)
- Pedido do dono: preparar o jogo para **mobile**. Controles de toque (`ui/touch.ts`) aparecem quando `pointer: coarse` (ou `?touch=1` no dev);
  entram pelos mesmos caminhos do teclado/mouse (`input.ts`: `injetarTecla`, `injetarToque`, `injetarGiro`, `definirJoystick`, `forcarBotao`),
  então o jogo não tem lógica separada para celular. Arrastar o resto da tela gira a câmera com a mesma conta do mouse (sensibilidade × fov).
- A pé: joystick à esquerda (sempre anda devagar), CORRER (continua 0,5 s depois de soltar), TIRO ×2 e MIRAR ×2 (ligados entre si),
  PULAR, ABAIXAR, ARMA (próxima), RECAR., GARAGEM, PORTA (só perto de veículo). Dirigindo: joystick = volante, ACEL., FREIO, MÃO,
  LUZ (viatura), SAIR. Vibração curta (Android). Vários dedos ao mesmo tempo (andar + atirar).
- HUD no modo toque: vida/colete e arma/munição no canto superior esquerdo, velocímetro no topo, texto ≥ 16–18 px, margens `env(safe-area-inset-*)`.
  Em retrato aparece "Gire o celular para jogar na horizontal". Tela cheia + paisagem já pedidos ao entrar (rodada anterior).
- Testes (emulação 844x390, toque por CDP, relógio do jogo): joystick anda 4,5 m em 2 s (andar 2,1 m/s); arrastar 80 px gira a câmera;
  TIRO 0,6 s = 9 tiros; MIRAR leva o FOV 60 → 42; PULAR sobe 0,81 m; andar e atirar juntos (+13 tiros); PORTA aparece perto do carro,
  entra, vê ACEL./FREIO/MÃO/SAIR, ACEL. leva a 23 m/s em 3 s; 0 erros de página.
- Limites: **não testado em celular de verdade** (só emulação); sem minimapa; ARMA troca para a próxima (sem menu de seleção);
  sem botão de microfone (voz é a etapa 10); sem pausa/engrenagem no celular (etapa 11); botão de pular não escala sozinho obstáculos;
  desempenho real (30+ FPS) precisa ser medido num aparelho.

## Rodada: Skills instaladas + Etapa 9 — Áudio (seguindo `audio-design`)
- **Skills**: o dono perguntou se eu usava as skills — eu **não tinha instalado**. O repositório `conselho-digital/manifestacao` é público: clonado e
  copiado para `.claude/skills/` (router, threejs-*, performance-optimization, camera-systems, input-systems, game-ui-ux, game-feel, audio-design,
  physics-tuning, fps-shooter, Blender…) e `.claude/agents/revisor-bugs-seguranca.md`. Daqui para frente: `router` primeiro, depois só as skills da tarefa
  (aqui: `audio-design`; na revisão final: `performance-optimization`, `fps-shooter`, `game-ui-ux`, `physics-tuning` e o sub agente de segurança).
- `game/audio.ts` (`Som`, `Motor`): tudo sintetizado por WebAudio, sem arquivos. **Barramentos** `sfx`, `veiculos`, `ui`, `voz` → Master com limitador;
  `definirVolume(barramento, slider)` usa o slider **ao quadrado** (mudo em 0), nunca dB direto. Sons repetidos variam tom (±1 semitom) e volume (±2 dB).
  Máx. 10 tiros simultâneos. Volume e lado (pan) pela distância até o ouvinte; alcances (m): tiro 22, silenciado 9, buzina 13, motor 11, sirene 24,
  batida 18, raspão 12, recarga 8, golpe 7 (o círculo do som no chão ainda não foi desenhado).
- Sons: tiro (fuzil grave e longo, pistola seca, silenciado só estalo, fuzil C com eco de 3 repetições; longe perde agudos), recarga em 4 cliques
  (0; 0,42; 0,92; 1,36 s), golpe, pegar item, motor (tom e filtro sobem **contínuos** de 0 a 100% da velocidade, sem marchas; partida sintetizada
  0,2 s depois de fechar a porta; chiado de pneu pelo deslize), buzina (carro 2 notas graves, moto mais aguda, caminhão), sirene "lamento" 600–1400 Hz,
  batida (+ estalo de metal acima de 2,5 m/s) e lata raspando (ruído com trepidação de 38 Hz).
- Controles: **H** buzina (segurar 0,5 s na viatura liga/desliga a sirene; sai sozinha ao sair do veículo). Celular: botão BUZINA ao dirigir.
  Rede: evento `buz` (carro 0, moto 1, sirene ligada 2, caminhão 3, batida 5, sirene desligada 6; 1 a cada 250 ms); tiros de outros jogadores
  tocam no lugar deles; motor de veículo remoto idem. `?mudo=1` desliga o áudio.
- **Medição (skill, passo 8)**: sessão sintética de 40 s (motor 0→90%, 3 rajadas de 10 tiros meus + do outro jogador, buzina, sirene 8 s, batida,
  recarga) renderizada offline e medida com `ffmpeg ebur128`: ganho 1,0 = −14,3 LUFS / pico −0,8 dBFS (alto demais); **ganho 0,62 = −18,5 LUFS,
  LRA 3,6 LU, pico −2,8 dBFS** (alvo mobile −18 ±2, pico ≤ −1). 0,62 virou o padrão do Master.
- **Vazamento**: `__game.som.ativos` (fontes tocando) = 0 depois de tiros e recarga; 3 com motor ligado; 5 com motor + sirene; **volta a 0 ao sair do
  veículo**. 0 erros de página. AudioContext `running` (criado dentro do clique de Entrar).
- Limites: **ninguém ouviu ainda** (só medi e contei): peço ao dono para ouvir em fone e alto-falante do celular e dizer se motor/tiros/sirene
  soam bem; sem música nem ducking (a voz é a etapa 10: o barramento `voz` já existe para ducking); sem menu de volume (etapa 11); passos e
  pneu só chiam ao derrapar; sons de NPC não existem; iOS exige o toque de Entrar para liberar o áudio (já é assim).

## Rodada: Etapa 11 (parcial) — Pausa e configurações (seguindo `game-ui-ux`)
- Skills usadas: `router` → `game-ui-ux` (tela como **pilha**, foco ao abrir, Esc fecha a tela de cima, texto ≥ 18 px, margens `env(safe-area-inset-*)`,
  HUD por eventos, cor nunca é o único sinal). A pausa roda em tempo real e não congela a si mesma.
- `ui/pausa.ts`: abre com **P**, **engrenagem ⚙** (PC e celular) ou **Esc** (perder o mouse preso abre a pausa). Abas: Equipe, Personagem, Armas, Garagem,
  Ranking (placar da sessão), Configurações. Rodapé: Voltar ao jogo e **Voltar ao menu (2 toques)**; créditos.
  Pausar congela **só o jogo local** (NPCs, veículos, tiros); os outros jogadores seguem; a pausa dá **imunidade só no meu jogo**.
- Troca ao vivo: **equipe** (anel novo) e **personagem** (corpo novo: libera geometria/material do antigo) são publicados pela presence e o outro jogador
  atualiza na hora. `ui/selecao.ts`: carrosséis compartilhados entre o menu e a pausa.
- `game/settings.ts`: sensibilidade 0,2x–3x (padrão 0,6x), limite de FPS (livre/30/45/60/90/120), volumes geral/tiros/veículos (slider ao quadrado),
  guardados em `localStorage` (`gata-opcoes`) com try/catch. O limite de FPS só espera o próximo quadro numa grade fixa; o `dt` acumula (nada é descartado).
- Bug achado pelo teste e corrigido: no celular a camada de toque cobria a engrenagem; o HUD agora fica acima (`z-index:4`, `pointer-events:none` exceto o botão).
- Testes (emulação de celular 844x390, 2 abas): toque na engrenagem abre a pausa com foco em "Voltar ao jogo"; relógio do jogo parado durante a pausa
  (8,38 → 8,38); dano na pausa ignorado (vida 400); B vê A trocar para Oficial / Vermelha-branca; configurações salvas; voltar ao jogo retoma; 0 erros.
- **Não feito (precisam de login/identidade, que o dono dispensou):** loja e preços, inventário por conta, admin (gerenciar equipes/preços/outdoor),
  ranking global e compras (`purchases`). O ranking da pausa é só da sessão. Equipes são fixas no código (sem a tabela `teams`).

## Rodada: Revisão do mobile (pedido do dono) — UI responsiva, carros, mira
Problemas relatados no celular: botões em tamanhos ruins e fora da tela, menus que não cabiam, **menu de carros (garagem) sem como fechar**, cabeça do boneco
para fora do carro, mira em "segurar" e câmera com o arrasto vertical ao contrário.
- **Controles de toque responsivos** (`ui/touch.ts`): tamanhos por altura da tela (`--b: clamp(44px,13vh,68px)`, `--B` = 1,55 b, joystick `clamp(104px,36vh,150px)`),
  tudo posicionado em múltiplos de `--b`; antes havia px fixos (o botão GARAGEM ficava a 388 px do chão, fora de telas de 360 px). GARAGEM saiu do HUD
  (fica na pausa). Linha do topo à direita: ARMA, RECAR., PORTA e ⚙. HUD do modo toque também em `clamp()` (`ui/hud.ts`).
- **Menus que cabem em paisagem** (`@media (orientation:landscape) and (max-height:560px)` e `≤380px`): menu inicial em 2 colunas; pausa e garagem com cartão de
  altura máxima `100dvh − 24px`, cabeçalho com **✕ sempre visível**, abas roláveis, painel com rolagem interna e rodapé fixo; garagem em 2 colunas (prévia | opções).
  A garagem só tinha o botão Fechar no fim de um cartão alto: agora tem ✕ no topo (e foco em "Chamar" ao abrir).
- **Teste em 6 tamanhos** (568x320, 667x375, 740x360, 812x375, 844x390, 932x430; toque): todos os controles dentro da tela e **sem sobreposição** nos 3 modos
  (a pé, perto do carro, dirigindo), menor botão 44–48 px; botão Entrar do menu visível sem rolar; pausa e garagem cabem, ✕ e "Voltar ao jogo"/"Chamar" dentro
  da tela, e **fecham por toque no ✕**. Script: ver `ui1.cjs` descrito aqui (cenário reproduzível no CLAUDE.md, não no repositório).
- **Carros**: o topo da cabeça sentado era 1,64 m + banco 0,18 contra teto de 1,3 m. Agora carro de ~1,5 m (chassi 0,15–0,8, colunas finas, teto 1,47 m), **vidros
  translúcidos** em malha própria (+1 chamada por carro) para o motorista aparecer dentro, banco do carro afundado 0,22 m. Medido: **cabeça a 1,40 m, teto a 1,50 m**
  (Gol, Buffalo, Opala e Viatura). Moto: piloto fica em cima (1,81 m), como deve.
- **Mira no celular é alternar**: um toque liga, outro desliga; os 2 botões MIRAR ficam ligados entre si; desliga sozinha ao dirigir ou com arma de mão.
  Testado: toque → FOV 60→42 e continua mirando com o dedo solto; 2º toque → 60; botão da esquerda também alterna e liga os dois.
- **Arrasto vertical invertido (celular e PC)**: arrastar/mover para baixo = olhar para baixo (`pitch + dy`). Testado: arrastar 70 px para baixo pitch 0,28 → 0,52; 100 px para cima → 0,18.
- **CORRER no lado direito** (pedido do dono): ao lado esquerdo do PULAR, na mesma linha do TIRO; o lado esquerdo ficou com joystick, TIRO 2 e MIRAR 2. Teste de 6 tamanhos segue ok (sem sobreposição).
- Limites: testado só em emulação (sem aparelho real); em retrato aparece "Gire o celular"; botões do HUD de toque em < 44 px não existem (mínimo do `clamp`).

## Rodada: Etapa 10 — Voz por proximidade (WebRTC)
- `net/voz.ts` (`Voz`): **aperte para falar** (tecla **T** no PC; botão **MIC** no celular, no topo, segurar). Transmite só enquanto apertado, com **0,25 s de folga**;
  solta ao perder o foco (`blur` e aba escondida). O microfone só é pedido no primeiro aperto (gesto do usuário), **sem ganho automático**
  (o alcance depende do volume real). Ouvir não depende de apertar. Quem não ligou a voz **não abre conexão** (flag `vz` na presence).
- WebRTC direto entre navegadores; sinalização (offer/answer/ice) pelo canal Realtime (evento `rtc`, validado: só mensagens dirigidas a mim, tipos `o/a/c`);
  STUN público do Google, **sem TURN** (algumas redes — dados móveis com NAT simétrico, redes corporativas — não conectam; o jogo avisa só se o microfone for bloqueado).
  Conecta a **3,4 m**, desliga a **4,5 m**, no máx. **8 conversas**; quem tem o id menor oferece (evita duas ofertas ao mesmo tempo).
- `Som.vozRemota(stream)` (`audio.ts`): volume cheio até 0,75 m e cai com a distância; **alcance = 3 m × (0,1 + 0,9 × nível)**, nível = RMS suavizado do áudio recebido
  de −58 dB (0) a −18 dB (1); lado (pan) pela posição; vai pelo barramento `voz`. Elemento de mídia mudo consome o stream (exigência do Chrome).
- HUD: "🎤 T para falar" / "🎤 falando" / "🎤 bloqueado". `?voz=0` desliga. Dev: `__game.voz` (`ativar()`, `apertar(bool)`, `conversas()`).
- Testes (3 abas, microfone falso do Chromium, relógio do jogo): sem ativar a voz nenhuma conversa abre; A e B ativam a 2 m e ficam `connected`; **A fala → B recebe
  nível 0,47–0,79 e alcance 1,6–2,4 m**; A solta → A para de transmitir e o nível em B cai a 0; B a 6 m → conversa fecha dos dois lados; volta a 2 m → reconecta;
  C com voz ligada a 40 m não conecta; 0 erros de página. Teste de MIC no layout de toque: 6 tamanhos sem sobreposição.
- Limites: **círculo da voz no chão não foi desenhado**; sem teste com 8 conversas simultâneas nem em redes móveis reais; sem ducking dos outros sons sob a voz
  (o barramento `voz` já existe); sem opção de volume da voz nas configurações; iPhone antigo pode negar o microfone fora de HTTPS (o site é HTTPS).

## Rodada: Mobile — câmera com o dedo do botão e volante por botões (pedido do dono)
- **Arrastar a câmera segurando um botão**: o dedo que segura CORRER, TIRO, PULAR, ABAIXAR, pedais etc. também gira a câmera ao deslizar (mesma conta do arrasto na tela;
  `semCamera` só nos botões de volante). Testado: dedo 1 no joystick + dedo 2 em CORRER arrastando: yaw 1,57 → 1,40 e o personagem correu (9 m em 1,2 s).
- **Dirigindo no celular: sem joystick.** O joystick some e entram **◀ ▶ grandes** no canto esquerdo (LUZ da viatura acima deles). Direita: ACEL. grande, FREIO, MÃO, BUZINA,
  **EMPINAR (só na moto)** e SAIR/MIC/⚙ no topo. Testado: ACEL. + ▶ → heading 1,57 → 0,19 (vira à direita); ACEL. + ◀ → 0,16 → 0,37 (esquerda); EMPINAR não aparece no carro.
- **Empinar a moto** (`vehicle.ts`, Shift no PC / botão EMPINAR): acima de 3 m/s e com o acelerador, a roda da frente sobe até 0,6 rad (34°) em torno do eixo traseiro
  (parte móvel `pivo` separada do `grupo`); direção fica mais dura (× 0,72) enquanto empina; solta sozinha ao largar o botão ou abaixo de 3 m/s; o piloto empina junto.
  Testado a 27,8 m/s: 0,6 rad segurando, 0 ao soltar.
- Layout: teste dos 6 tamanhos (a pé, perto do carro, dirigindo viatura, dirigindo moto, pausa, garagem): tudo dentro da tela, sem sobreposição, menor botão 44–56 px.

## Rodada: Etapa 12 (parcial) — Itens de vida/colete e pichação
- **Itens** (`pickups.ts`): 30 de **vida (+25% = +100)** e 30 de **colete (+50)**, em posições fixas por mapa (sorteio com semente do nome do mapa), em chão livre e a ≥ 14 m
  uma da outra (medido: mín. 14,2 m, 0 dentro de parede). Pega a 1,3 m **só se ajudar** (vida < 400 / colete < 100); volta após 90 s (estado local). Giram e flutuam;
  **3 chamadas de desenho** (InstancedMesh: caixas de vida, de colete e brilho no chão) — medido 145 com itens × 142 sem. Mensagem "Vida +25%" / "Colete +50" e som de pegar.
  Testes: vida cheia em cima do item não gasta; vida 250 → 350; colete 0 → 50; volta após 90 s (89 s ainda inativo, 91 s ativo); mesmas posições ao recarregar.
- **Lata de spray** (arma 7, tecla 7/ARMA): sem dano e sem munição; tocar em atirar com **parede lisa à frente** (`acharParede`: raios horizontais a 0,5/1,1/1,7/2,3 m até 3 m,
  3 de 4 na mesma distância ±0,3 m, quase de frente, parede reta) estica o braço 1,4 s, chia, solta **névoa na cor da equipe** e cola o **desenho da equipe** na parede
  (faixas nas duas cores + nome; é o desenho de reserva, a imagem do admin precisa de login). Parede baixa gera pintura menor (mín. 0,7 m). Sem parede: "Sem parede lisa à frente".
  **Máx. 40 decalques** (o mais velho some); **não é salvo**. Rede: evento `spray` validado (normal unitária, campos limitados, jogador conhecido, **1 a cada 0,9 s**,
  a ≤ 6 m da parede). Testes: 1 decalque de frente para a parede; o outro jogador vê; sem parede não pinta; 45 pinturas → 40 mantidas; 0 erros.
- **Fora desta rodada** (precisam de login/admin ou de muito trabalho): outdoor com vídeo do YouTube, cartazes pagos, lojas nos prédios (a Paulista já traz lojas e cartazes nas texturas),
  2º mapa (esplanada), relevo e água. Ficam como pendência da etapa 12.
