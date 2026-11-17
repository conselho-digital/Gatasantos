import * as THREE from 'three';

export interface Cena {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  resize(): void;
}

const NEBLINA_INI = 49;
const NEBLINA_FIM = 161;

/** Cria renderizador, cena, luz e chão (etapa 1). */
export function criarCena(): Cena {
  const grosso = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({
    antialias: !grosso,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, grosso ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdfe8f0);
  scene.fog = new THREE.Fog(0xffffff, NEBLINA_INI, NEBLINA_FIM);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.4, NEBLINA_FIM + 30);
  camera.position.set(4, 3, 6);
  camera.lookAt(0, 0.8, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x778866, 1.1));
  const sol = new THREE.DirectionalLight(0xffffff, 1.6);
  sol.position.set(20, 40, 10);
  sol.castShadow = true;
  sol.shadow.mapSize.set(grosso ? 1024 : 2048, grosso ? 1024 : 2048);
  Object.assign(sol.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
  scene.add(sol);

  const chao = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshLambertMaterial({ color: 0x6f8f5a }),
  );
  chao.rotation.x = -Math.PI / 2;
  chao.receiveShadow = true;
  scene.add(chao);

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);
  return { renderer, scene, camera, resize };
}
