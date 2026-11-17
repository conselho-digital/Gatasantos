import * as THREE from 'three';
import { criarCena } from './game/scene';

const { renderer, scene, camera } = criarCena();

const cubo = new THREE.Mesh(
  new THREE.BoxGeometry(1.2, 1.2, 1.2),
  new THREE.MeshStandardMaterial({ color: 0xe0457b }),
);
cubo.position.y = 0.8;
cubo.castShadow = true;
scene.add(cubo);

const timer = new THREE.Timer();
renderer.setAnimationLoop((agora: number) => {
  timer.update(agora);
  const dt = Math.min(timer.getDelta(), 0.05);
  cubo.rotation.y += dt;
  cubo.rotation.x += dt * 0.5;
  renderer.render(scene, camera);
});

// Só no modo dev: inspeção.
if (import.meta.env.DEV) {
  (window as unknown as { __game: unknown }).__game = { camera, scene, renderer };
}
