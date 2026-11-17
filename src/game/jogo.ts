import * as THREE from 'three';
import { criarCena } from './scene';
import { criarCidade, LIMITE } from './city';
import { COLLIDERS, empurrarCirculo } from './collision';
import { consumirMouse, eixoMovimento, iniciarMouse, tecla } from './input';
import { criarPersonagem } from './character';
import { achar, type Equipe } from './characters';
import { criarAnelEquipe } from './teams';
import { Animador, medirPasso, TIME_SCALE, VEL_JOGO, type Clip } from './anim';
import { atualizarCamera, distanciaMinimaDeCaixas, novoEstadoCamera, posicaoDesejada } from './camera';

/** Escolhas feitas no menu inicial. */
export interface ConfigJogo {
  nome: string;
  personagem: string;
  equipe: Equipe;
  mapa: string;
  /** Pede o mouse preso (só vale dentro do clique do botão Entrar). */
  travarMouse: boolean;
}

/** Monta o mapa e inicia o laço. Só roda depois do "Entrar" (nada é montado antes). */
export function iniciarJogo(cfg: ConfigJogo, params: URLSearchParams): void {
  const { renderer, scene, camera } = criarCena();
  iniciarMouse(renderer.domElement);
  if (cfg.travarMouse) renderer.domElement.requestPointerLock?.();

  const cidade = criarCidade();
  scene.add(cidade.grupo);

  const boneco = criarPersonagem(achar(cfg.personagem));
  boneco.raiz.add(criarAnelEquipe(cfg.equipe));
  scene.add(boneco.raiz);
  const anim = new Animador(boneco);

  const GRAVIDADE = 16;
  const PULO = 5.5;
  let altura = 0;
  let vy = 0;
  let clipForcado: Clip | null = null;
  let pouso = 0; // tempo restante do clipe 'land'

  const RAIO = 0.4;
  const SENS = 0.6; // padrão 0,6x
  const RAD_POR_PX = 0.004;
  const pos = { x: 0, z: 0 };
  let giro = 0; // direção do corpo
  const cam = novoEstadoCamera();
  const [px, pz] = (params.get('pos') ?? '0,0').split(',').map(Number);
  pos.x = px || 0;
  pos.z = pz || 0;
  empurrarCirculo(pos.x, pos.z, RAIO, pos);

  const camFixa = params.get('cam')?.split(',').map(Number);
  const timer = new THREE.Timer();
  const tmp = { x: 0, z: 0 };
  let primeira = true;
  let gAntes = false;

  function atualizar(dt: number) {
    const m = consumirMouse();
    cam.yaw -= m.dx * RAD_POR_PX * SENS;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch - m.dy * RAD_POR_PX * SENS, -0.5934, 1.2043);
    const g = tecla('KeyG');
    if (g && !gAntes) cam.perto = !cam.perto;
    gAntes = g;

    const { x, y } = eixoMovimento();
    const agachado = tecla('KeyC') || tecla('ControlLeft');
    const correndo = tecla('ShiftLeft') && !agachado;
    const vel = agachado ? VEL_JOGO.crouch_walk! : correndo ? VEL_JOGO.run! : VEL_JOGO.walk!; // andar devagar por padrão
    const noChao = altura <= 0 && vy <= 0;
    if (noChao && tecla('Space') && !agachado) { vy = PULO; }
    if (vy > 0 || altura > 0) {
      vy -= GRAVIDADE * dt;
      altura += vy * dt;
      if (altura <= 0) { if (vy < -3) pouso = 0.18; altura = 0; vy = 0; }
    }
    pouso = Math.max(0, pouso - dt);
    if (x || y) {
      const n = Math.hypot(x, y);
      const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
      const dirx = (fx * y - fz * x) / n, dirz = (fz * y + fx * x) / n;
      empurrarCirculo(pos.x + dirx * vel * dt, pos.z + dirz * vel * dt, RAIO, tmp);
      pos.x = Math.max(-LIMITE.halfX + RAIO, Math.min(LIMITE.halfX - RAIO, tmp.x));
      pos.z = Math.max(-LIMITE.halfZ + RAIO, Math.min(LIMITE.halfZ - RAIO, tmp.z));
      // gira o corpo suavemente para a direção do movimento
      const alvo = Math.atan2(dirx, dirz);
      let d = alvo - giro;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      giro += d * (1 - Math.exp(-dt * 14));
    }
    boneco.raiz.position.set(pos.x, altura, pos.z);
    boneco.raiz.rotation.y = giro;
    const mexe = !!(x || y);
    let clip: Clip;
    if (altura > 0) clip = vy > 0 ? 'jump' : 'fall';
    else if (pouso > 0) clip = 'land';
    else if (mexe) clip = agachado ? 'crouch_walk' : correndo ? 'run' : 'walk';
    else clip = agachado ? 'crouch_idle' : 'idle';
    if (clipForcado) clip = clipForcado; // só dev: inspeção
    anim.tocar(clip);
    anim.atualizar(dt, vel, altura <= 0);

    if (camFixa && camFixa.length >= 6) {
      camera.position.set(camFixa[0], camFixa[1], camFixa[2]);
      camera.lookAt(camFixa[3], camFixa[4], camFixa[5]);
    } else {
      atualizarCamera(camera, pos.x, 0, pos.z, cam, dt, false, primeira);
      primeira = false;
    }
  }

  renderer.setAnimationLoop((agora: number) => {
    timer.update(agora);
    atualizar(Math.min(timer.getDelta(), 0.05));
    renderer.render(scene, camera);
  });

  // Só no modo dev: inspeção.
  if (import.meta.env.DEV) {
    (window as unknown as { __game: unknown }).__game = {
      camera, scene, renderer,
      player: () => ({ ...pos, giro }),
      teleport: (x: number, z: number) => { pos.x = x; pos.z = z; },
      setYaw: (a: number) => { cam.yaw = a; },
      look: cam,
      colliders: COLLIDERS,
      validate: cidade.validate,
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
