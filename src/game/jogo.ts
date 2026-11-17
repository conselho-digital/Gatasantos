import * as THREE from 'three';
import { criarCena } from './scene';
import { criarCidade, LIMITE } from './city';
import { criarPaulista } from './paulista';
import { COLLIDERS, empurrarCirculo, pontoLivre } from './collision';
import { apertou, botaoMouse, forcarBotao, consumirMouse, consumirRoda, eixoMovimento, iniciarMouse, limparToques, tecla } from './input';
import { criarPersonagem } from './character';
import { achar, type Equipe } from './characters';
import { criarAnelEquipe } from './teams';
import { Animador, medirPasso, TIME_SCALE, VEL_JOGO, type Clip } from './anim';
import { atualizarCamera, distanciaMinimaDeCaixas, novoEstadoCamera, posicaoDesejada } from './camera';
import { Combate, COLETE_MAX, VIDA_MAX, type Alvo, type Alvos } from './combat';
import { Online } from './online';
import { limparNome } from '../net/clean';
import { criarModeloArma, type ArmaNaMao } from './gunmodel';
import { Pedestres } from './npcs';
import { ouvirRuido } from './noise';
import { ARMAS, armaPorId, simularCadencia, tabelaTempoParaMatar, type ArmaId } from './weapons';
import { Hud } from '../ui/hud';
import { raioMundo } from './raycast';

/** Escolhas feitas no menu inicial. */
export interface ConfigJogo {
  nome: string;
  personagem: string;
  equipe: Equipe;
  mapa: string;
  /** Pede o mouse preso (só vale dentro do clique do botão Entrar). */
  travarMouse: boolean;
}

const FOV = 60;
const FOV_MIRANDO = FOV * 0.7;
const SENS = 0.6; // padrão 0,6x
const RAD_POR_PX = 0.004;
const RAIO = 0.4;
const GRAVIDADE = 16;
const PULO = 5.5;
const TECLAS_ARMA: Record<string, ArmaId> = { Digit1: 'punho', Digit2: 'pistola', Digit3: 'fuzilA', Digit4: 'fuzilB', Digit5: 'fuzilC', Digit6: 'fuzilS' };

/** Monta o mapa e inicia o laço. Só roda depois do "Entrar" (nada é montado antes). */
export async function iniciarJogo(cfg: ConfigJogo, params: URLSearchParams): Promise<void> {
  const { renderer, scene, camera } = criarCena();
  camera.fov = FOV;
  iniciarMouse(renderer.domElement);
  if (cfg.travarMouse) renderer.domElement.requestPointerLock?.();

  // Mapa: Paulista (GLB do dono) por padrão; `?mapa=cidade` usa o mapa simples por código (dev).
  const aviso = document.createElement('div');
  aviso.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#0b0f14;color:#fff;font:22px system-ui;z-index:5';
  aviso.textContent = 'Carregando mapa…';
  document.body.appendChild(aviso);
  const cidade = params.get('mapa') === 'cidade' || cfg.mapa === 'cidade'
    ? criarCidade()
    : await criarPaulista((p) => { aviso.textContent = `Carregando mapa… ${Math.round(p * 100)}%`; });
  aviso.remove();
  scene.add(cidade.grupo);

  const boneco = criarPersonagem(achar(cfg.personagem));
  boneco.raiz.rotation.order = 'YXZ';
  boneco.raiz.add(criarAnelEquipe(cfg.equipe));
  scene.add(boneco.raiz);
  const anim = new Animador(boneco);

  let altura = 0;
  let vy = 0;
  let clipForcado: Clip | null = null;
  let pouso = 0; // tempo restante do clipe 'land'

  const pos = { x: 0, z: 0 };
  let giro = 0; // direção do corpo
  const cam = novoEstadoCamera();
  const [px, pz] = params.get('pos') ? params.get('pos')!.split(',').map(Number) : [cidade.spawn.x, cidade.spawn.z];
  pos.x = px || 0;
  pos.z = pz || 0;
  empurrarCirculo(pos.x, pos.z, RAIO, pos);
  const spawn = { x: pos.x, z: pos.z };

  // Pedestres: 26 no PC, 18 no celular (locais, nada vai pela rede)
  const grosso = matchMedia('(pointer: coarse)').matches;
  const npcs = new Pedestres(scene, grosso ? 18 : 26, pos.x, pos.z);
  ouvirRuido((x, z, raio) => npcs.assustar(x, z, raio));

  // HUD
  const hud = new Hud();
  hud.feed(`Bem-vindo, ${cfg.nome}!`);

  // Tiros: traçadores curtos
  const tracers: { linha: THREE.Line; t: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const linha = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 }));
    linha.visible = false;
    linha.frustumCulled = false;
    scene.add(linha);
    tracers.push({ linha, t: 0 });
  }
  let proxTracer = 0;

  const desenharTracer = (de: THREE.Vector3, ate: THREE.Vector3) => {
    const t = tracers[proxTracer++ % tracers.length];
    const p = t.linha.geometry.attributes.position as THREE.BufferAttribute;
    p.setXYZ(0, de.x, de.y, de.z);
    p.setXYZ(1, ate.x, ate.y, ate.z);
    p.needsUpdate = true;
    t.linha.visible = true;
    t.t = 0.06;
  };

  // Rede: sessão no Supabase Realtime (sem login; só o nome)
  const maxSessao = Number(params.get('max')) || undefined;
  const online = new Online(
    scene,
    { id: crypto.randomUUID(), nome: limparNome(cfg.nome), pers: cfg.personagem, eq: { n: cfg.equipe.nome, c1: cfg.equipe.c1, c2: cfg.equipe.c2 } },
    {
      feed: (m) => hud.feed(m),
      tracer: desenharTracer,
      receberDano: (v) => combate.danoEmMim(v),
      meuEstado: () => ({ x: pos.x, y: altura, z: pos.z }),
    },
  );

  // Tudo que pode ser acertado: pedestres + jogadores remotos (o mais perto vence)
  const remotosAlvo = online.alvosRemotos();
  const alvos: Alvos = {
    testarRaio(ox, oy, oz, dx, dy, dz, max): Alvo | null {
      const a = npcs.testarRaio(ox, oy, oz, dx, dy, dz, max), b = remotosAlvo.testarRaio(ox, oy, oz, dx, dy, dz, max);
      return a && (!b || a.t <= b.t) ? a : b;
    },
    maisPerto: (x, z, raio) => remotosAlvo.maisPerto(x, z, raio) ?? npcs.maisPerto(x, z, raio),
  };

  const combate = new Combate(alvos, {
    tracer(de, ate) {
      desenharTracer(de, ate);
      online.enviarTiro(de, ate, combate.arma.silenciada);
    },
    aviso: (m) => hud.feed(m),
    marcador: (cab, morreu) => hud.marcador(cab, morreu),
    soco: () => anim.soco(),
    renascer() {
      const p = pontoLivre(spawn.x - 8, spawn.x + 8, spawn.z - 8, spawn.z + 8, RAIO + 0.3);
      if (p) { pos.x = p.x; pos.z = p.z; }
      altura = 0; vy = 0;
    },
  });

  // Arma na mão (modelo por código preso à mão direita)
  let naMao: ArmaNaMao | null = null;
  let armaMostrada: ArmaId | null = null;
  const trocarModelo = () => {
    if (armaMostrada === combate.arma.id) return;
    if (naMao) naMao.grupo.removeFromParent();
    naMao = criarModeloArma(combate.arma);
    if (naMao) boneco.osso.R_Hand.add(naMao.grupo);
    armaMostrada = combate.arma.id;
  };

  const camFixa = params.get('cam')?.split(',').map(Number);
  const timer = new THREE.Timer();
  const tmp = { x: 0, z: 0 };
  let primeira = true;
  let gAntes = false;
  let mirandoSuave = 0;
  let fpsAcum = 0, fpsN = 0, fpsT = 0;
  const muzzle = new THREE.Vector3();

  let relogio = 0; // tempo de jogo (s), só para testes

  function atualizar(dt: number) {
    relogio += dt;
    const morto = combate.morto > 0;
    const m = consumirMouse();
    const mirando = botaoMouse(2) && !combate.arma.corpoACorpo && !morto;
    // sensibilidade ao mirar: × tan(fov atual/2) / tan(fov normal/2)
    const fator = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    cam.yaw -= m.dx * RAD_POR_PX * SENS * fator;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch - m.dy * RAD_POR_PX * SENS * fator, -0.5934, 1.2043);
    const g = tecla('KeyG');
    if (g && !gAntes) cam.perto = !cam.perto;
    gAntes = g;

    // Armas por tecla
    let trocarPara: ArmaId | null = null;
    for (const [codigo, id] of Object.entries(TECLAS_ARMA)) if (apertou(codigo)) trocarPara = id;
    if (apertou('KeyX')) trocarPara = ARMAS[(ARMAS.findIndex((a) => a.id === combate.arma.id) + 1) % ARMAS.length].id;
    const recarregar = apertou('KeyR');

    const { x, y } = morto ? { x: 0, y: 0 } : eixoMovimento();
    const agachado = tecla('KeyC') || tecla('ControlLeft');
    const correndo = tecla('ShiftLeft') && !agachado && !mirando;
    const vel = agachado ? VEL_JOGO.crouch_walk! : correndo ? VEL_JOGO.run! : VEL_JOGO.walk!;
    const noChao = altura <= 0 && vy <= 0;
    if (noChao && tecla('Space') && !agachado && !morto) vy = PULO;
    if (vy > 0 || altura > 0) {
      vy -= GRAVIDADE * dt;
      altura += vy * dt;
      if (altura <= 0) { if (vy < -3) pouso = 0.18; altura = 0; vy = 0; }
    }
    pouso = Math.max(0, pouso - dt);

    let dirx = 0, dirz = 0;
    if (x || y) {
      const n = Math.hypot(x, y);
      const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
      dirx = (fx * y - fz * x) / n;
      dirz = (fz * y + fx * x) / n;
      empurrarCirculo(pos.x + dirx * vel * dt, pos.z + dirz * vel * dt, RAIO, tmp);
      pos.x = Math.max(-LIMITE.halfX + RAIO, Math.min(LIMITE.halfX - RAIO, tmp.x));
      pos.z = Math.max(-LIMITE.halfZ + RAIO, Math.min(LIMITE.halfZ - RAIO, tmp.z));
    }

    // Câmera (FOV × 0,7 ao mirar, com transição suave)
    mirandoSuave += ((mirando ? 1 : 0) - mirandoSuave) * Math.min(1, dt * 12);
    camera.fov = FOV + (FOV_MIRANDO - FOV) * mirandoSuave;
    if (camFixa && camFixa.length >= 6) {
      camera.position.set(camFixa[0], camFixa[1], camFixa[2]);
      camera.lookAt(camFixa[3], camFixa[4], camFixa[5]);
    } else {
      atualizarCamera(camera, pos.x, altura, pos.z, cam, dt, mirando, primeira);
    }
    primeira = false;

    // Corpo: com a arma levantada ou mirando olha para onde a câmera olha
    const armado = !combate.arma.corpoACorpo;
    const olhando = armado && (mirando || combate.levantada > 0) && !morto;
    const alvoGiro = olhando ? cam.yaw : x || y ? Math.atan2(dirx, dirz) : giro;
    let d = alvoGiro - giro;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    if (olhando || x || y) giro += d * (1 - Math.exp(-dt * (olhando ? 22 : 14)));

    boneco.raiz.position.set(pos.x, altura, pos.z);
    boneco.raiz.rotation.y = giro;
    boneco.raiz.rotation.x = morto ? -Math.PI / 2 : 0;
    if (morto) boneco.raiz.position.y += 0.12;

    const mexe = !!(x || y);
    let clip: Clip;
    if (morto) clip = 'idle';
    else if (altura > 0) clip = vy > 0 ? 'jump' : 'fall';
    else if (pouso > 0) clip = 'land';
    else if (mexe) clip = agachado ? 'crouch_walk' : correndo ? 'run' : 'walk';
    else clip = agachado ? 'crouch_idle' : 'idle';
    if (clipForcado) clip = clipForcado; // só dev: inspeção
    trocarModelo();
    anim.armado = armado && olhando;
    anim.mira = cam.pitch;
    anim.tocar(clip);
    anim.atualizar(dt, vel, altura <= 0 && !morto);

    // Combate (usa a câmera e o cano já atualizados)
    boneco.raiz.updateMatrixWorld(true);
    if (naMao) naMao.cano.getWorldPosition(muzzle);
    combate.atualizar(dt, {
      segurar: botaoMouse(0),
      clique: botaoMouse(0) && !cliqueAntes,
      mirando,
      recarregar,
      trocarPara,
      roda: consumirRoda(),
      camera,
      muzzle: naMao ? muzzle : null,
      px: pos.x,
      pz: pos.z,
      yaw: giro,
    });
    cliqueAntes = botaoMouse(0);

    // Rede: jogadores remotos (interpolados) e o meu estado
    online.remotos.atualizar(dt);
    if (online.ativo) {
      online.enviarMove(dt, {
        x: pos.x, y: altura, z: pos.z, r: giro, c: clip,
        hp: Math.round((combate.vida / VIDA_MAX) * 100),
        a: ARMAS.findIndex((a) => a.id === combate.arma.id), p: cam.pitch,
        l: olhando, rl: combate.recarregando, pr: combate.protecao > 0,
      }, !mexe && altura <= 0);
    }
    if (tecla('Tab')) hud.placar(online.placar({ nome: cfg.nome, mortes: combate.mortes, abates: combate.abates + online.abates })); else hud.placar(null);

    // Pedestres, traçadores, HUD
    npcs.atualizar(dt, pos.x, pos.z);
    for (const t of tracers) {
      if (!t.linha.visible) continue;
      t.t -= dt;
      if (t.t <= 0) t.linha.visible = false;
    }
    hud.barras(combate.vida, combate.colete);
    hud.armaMunicao(combate.arma.nome, combate.balas.pente, combate.balas.reserva, combate.recarregando, combate.arma.corpoACorpo);
    hud.mirando(mirando);
    hud.texto(morto ? `Você morreu — renasce em ${combate.morto.toFixed(1)} s` : combate.protecao > 0 ? '' : '');
    fpsAcum += dt; fpsN++; fpsT += dt;
    if (fpsT >= 0.5) { hud.contadorFps(fpsN / fpsAcum); fpsAcum = 0; fpsN = 0; fpsT = 0; }
  }
  let cliqueAntes = false;
  limparToques();
  addEventListener('keydown', (e) => { if (e.code === 'Tab') e.preventDefault(); });

  // Entra na sessão online (assíncrono: o jogo já roda sozinho enquanto conecta)
  if (params.get('offline') !== '1') void online.conectar(params.get('room') ?? cfg.mapa, maxSessao);

  renderer.setAnimationLoop((agora: number) => {
    timer.update(agora);
    atualizar(Math.min(timer.getDelta(), 0.05));
    renderer.render(scene, camera);
  });

  // Só no modo dev: inspeção.
  if (import.meta.env.DEV) {
    (window as unknown as { __game: unknown }).__game = {
      camera, scene, renderer,
      ready: () => true,
      relogio: () => relogio,
      player: () => ({ ...pos, giro, altura }),
      teleport: (x: number, z: number) => { pos.x = x; pos.z = z; },
      setYaw: (a: number) => { cam.yaw = a; },
      look: cam,
      colliders: COLLIDERS,
      raioMundo,
      validate: cidade.validate,
      combat: () => combate,
      npcs: () => npcs.resumo(),
      npcsObj: npcs,
      mouse: forcarBotao,
      remotes: () => [...online.remotos.mapa.values()].map((r) => ({ id: r.info.id, nome: r.info.nome, x: +r.x.toFixed(2), z: +r.z.toFixed(2), hp: r.hp, visivel: r.p.raiz.visible })),
      online,
      eu: online.eu,
      pickups: () => [],
      tabelaTTK: (colete = 0) => tabelaTempoParaMatar([60, VIDA_MAX], colete),
      cadencia: (id: ArmaId, fps: number, s = 10) => ({ tiros: simularCadencia(armaPorId(id).gap, fps, s), esperado: s / armaPorId(id).gap }),
      coleteMax: COLETE_MAX,
      /** Mede a distância câmera–caixa em 16 giros x 4 inclinações (64 posições). */
      camTeste: (x: number, z: number) => {
        pos.x = x; pos.z = z;
        let min = Infinity;
        const p = new THREE.Vector3();
        for (let i = 0; i < 16; i++) {
          for (const pitch of [-0.5, 0.0, 0.28, 1.1]) {
            cam.yaw = (i / 16) * Math.PI * 2;
            cam.pitch = pitch;
            atualizarCamera(camera, x, 0, z, cam, 0.016, false, true);
            p.copy(camera.position);
            min = Math.min(min, distanciaMinimaDeCaixas(p));
          }
        }
        return min;
      },
      posDesejada: posicaoDesejada,
      anim,
      forcarClip: (c: Clip | null) => { clipForcado = c; },
      timeScale: TIME_SCALE,
      medirPasso: (c: Clip) => medirPasso(criarPersonagem(), c),
    };
  }
}
