import * as THREE from 'three';
import { criarCena } from './game/scene';
import { criarCidade, LIMITE } from './game/city';
import { COLLIDERS, empurrarCirculo } from './game/collision';
import { eixoMovimento, tecla } from './game/input';

const params = new URLSearchParams(location.search);
const { renderer, scene, camera } = criarCena();

// Mapa 1 (etapa 2)
const cidade = criarCidade();
scene.add(cidade.grupo);

// Jogador provisório (a etapa 3 troca pelo personagem low-poly)
const jogador = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.35, 1.1, 4, 8),
  new THREE.MeshLambertMaterial({ color: 0xe0457b }),
);
jogador.castShadow = true;
scene.add(jogador);
const RAIO = 0.4;
const pos = { x: 0, z: 0 };
let yaw = 0;
const [px, pz] = (params.get('pos') ?? '0,0').split(',').map(Number);
pos.x = px || 0;
pos.z = pz || 0;
empurrarCirculo(pos.x, pos.z, RAIO, pos);

const camFixa = params.get('cam')?.split(',').map(Number);
const timer = new THREE.Timer();
const tmp = { x: 0, z: 0 };

function atualizar(dt: number) {
  const { x, y } = eixoMovimento();
  const vel = tecla('ShiftLeft') ? 6.2 : 2.1; // andar devagar por padrão
  if (tecla('ArrowLeft')) yaw += dt * 1.8;
  if (tecla('ArrowRight')) yaw -= dt * 1.8;
  if (x || y) {
    const n = Math.hypot(x, y);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const rx = -fz, rz = fx;
    const nx = pos.x + ((fx * y + rx * -x) / n) * vel * dt;
    const nz = pos.z + ((fz * y + rz * -x) / n) * vel * dt;
    empurrarCirculo(nx, nz, RAIO, tmp);
    pos.x = Math.max(-LIMITE.halfX + RAIO, Math.min(LIMITE.halfX - RAIO, tmp.x));
    pos.z = Math.max(-LIMITE.halfZ + RAIO, Math.min(LIMITE.halfZ - RAIO, tmp.z));
  }
  jogador.position.set(pos.x, 0.9, pos.z);
  jogador.rotation.y = yaw;
  if (camFixa && camFixa.length >= 6) {
    camera.position.set(camFixa[0], camFixa[1], camFixa[2]);
    camera.lookAt(camFixa[3], camFixa[4], camFixa[5]);
  } else {
    camera.position.set(pos.x - Math.sin(yaw) * 5, 3, pos.z - Math.cos(yaw) * 5);
    camera.lookAt(pos.x, 1.4, pos.z);
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
    player: () => ({ ...pos, yaw }),
    teleport: (x: number, z: number) => { pos.x = x; pos.z = z; },
    setYaw: (a: number) => { yaw = a; },
    colliders: COLLIDERS,
    validate: cidade.validate,
  };
}
