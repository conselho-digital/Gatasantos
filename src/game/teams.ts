import * as THREE from 'three';
import type { Equipe } from './characters';

/** Anel de duas cores sob os pés (metade de cada cor). */
export function criarAnelEquipe(e: Equipe): THREE.Group {
  const g = new THREE.Group();
  g.name = 'anel-equipe';
  for (const [i, cor] of [e.c1, e.c2].entries()) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.62, 24, 1, i * Math.PI, Math.PI),
      new THREE.MeshBasicMaterial({ color: cor, side: THREE.DoubleSide, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.045;
    m.renderOrder = 6;
    g.add(m);
  }
  return g;
}
