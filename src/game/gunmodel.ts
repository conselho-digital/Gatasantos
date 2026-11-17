import * as THREE from 'three';
import type { Arma } from './weapons';

export interface ArmaNaMao {
  grupo: THREE.Group;
  cano: THREE.Object3D; // ponta do cano (origem do 2º raio)
}

const mat = (cor: number) => new THREE.MeshBasicMaterial({ color: cor });

/** Arma simples por código (caixas e cilindros). Frente = +Z do grupo. */
export function criarModeloArma(a: Arma): ArmaNaMao | null {
  if (a.corpoACorpo) return null;
  const g = new THREE.Group();
  g.name = `arma-${a.id}`;
  const L = a.comprimento;
  const corpo = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.075, L * 0.72), mat(a.cor));
  corpo.position.z = L * 0.3 - 0.06;
  const cano = new THREE.Mesh(new THREE.CylinderGeometry(a.silenciada ? 0.022 : 0.012, a.silenciada ? 0.022 : 0.012, L * 0.5, 8), mat(0x111111));
  cano.rotation.x = Math.PI / 2;
  cano.position.set(0, 0.015, L * 0.7 - 0.06);
  const cabo = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.11, 0.05), mat(0x222222));
  cabo.position.set(0, -0.08, 0);
  g.add(corpo, cano, cabo);
  if (a.automatica) {
    const pente = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 0.05), mat(0x15171a));
    pente.position.set(0, -0.09, L * 0.35 - 0.06);
    g.add(pente);
  }
  const ponta = new THREE.Object3D();
  ponta.position.set(0, 0.015, L * 0.95 - 0.06);
  g.add(ponta);
  g.rotation.x = Math.PI / 2; // +Z da arma aponta para a frente da mão (eixo −Y do osso)
  return { grupo: g, cano: ponta };
}
