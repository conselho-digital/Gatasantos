import * as THREE from 'three';
import type { Arma } from './weapons';

export interface ArmaNaMao {
  grupo: THREE.Group;
  cano: THREE.Object3D; // ponta do cano (origem do 2º raio)
}

const mat = (cor: number) => new THREE.MeshBasicMaterial({ color: cor });

/** Arma simples por código (caixas e cilindros). Frente = +Z do grupo. */
export function criarModeloArma(a: Arma): ArmaNaMao | null {
  if (a.id === 'spray') {
    // lata de spray: cilindro azul com bico, presa na mão (o bico é a "ponta")
    const g = new THREE.Group();
    const lata = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 10), mat(a.cor));
    lata.rotation.x = Math.PI / 2;
    const tampa = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 8), mat(0xdddddd));
    tampa.rotation.x = Math.PI / 2;
    tampa.position.z = 0.1;
    g.add(lata, tampa);
    const bico = new THREE.Object3D();
    bico.position.z = 0.13;
    g.add(bico);
    g.rotation.x = Math.PI / 2;
    return { grupo: g, cano: bico };
  }
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
