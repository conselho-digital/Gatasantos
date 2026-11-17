import * as THREE from 'three';
import { aoLongoDoRaio, type Caixa } from './collision';
import { raioCaixa } from './raycast';

/** Pichação (seção 6.16): a lata de spray pinta o desenho da equipe em parede lisa. Não é salva; máx. 40 decalques. */
const MAX_DECALQUES = 40;
const ALTURAS = [0.5, 1.1, 1.7, 2.3]; // raios horizontais em várias alturas
const ALCANCE = 3;
const TEMPO_NEVOA = 1.4; // s

export interface Parede {
  x: number;
  y: number;
  z: number;
  nx: number; // normal da parede (aponta para o jogador)
  nz: number;
  largura: number;
}

/** Procura parede lisa e quase vertical à frente: precisa ser reta em ~2 m e alta o bastante. */
export function acharParede(x: number, z: number, yaw: number): Parede | null {
  const dx = Math.sin(yaw), dz = Math.cos(yaw);
  const acertos: { t: number; caixa: Caixa }[] = [];
  for (const h of ALTURAS) {
    let t = Infinity;
    let cx: Caixa | null = null;
    aoLongoDoRaio(x, z, dx, dz, ALCANCE, (b) => {
      const tt = raioCaixa(x, h, z, dx, 0, dz, b, ALCANCE);
      if (tt < t) { t = tt; cx = b; }
    });
    if (cx && t !== Infinity) acertos.push({ t, caixa: cx });
  }
  if (acertos.length < 3) return null;
  const t0 = acertos.map((a) => a.t).sort((a, b) => a - b)[Math.floor(acertos.length / 2)];
  const retos = acertos.filter((a) => Math.abs(a.t - t0) < 0.3); // mesma distância = parede reta
  if (retos.length < 3) return null;
  const b = retos[0].caixa;
  const hx = x + dx * t0, hz = z + dz * t0;
  // normal = face mais perto do ponto de impacto
  const faces: [number, number, number][] = [
    [Math.abs(hx - b.minX), -1, 0], [Math.abs(hx - b.maxX), 1, 0], [Math.abs(hz - b.minZ), 0, -1], [Math.abs(hz - b.maxZ), 0, 1],
  ];
  faces.sort((p, q) => p[0] - q[0]);
  const [, nx, nz] = faces[0];
  if (-(dx * nx + dz * nz) < 0.5) return null; // de raspão: não pinta
  const alt = b.h ?? 3;
  // parede baixa (mureta, jardineira): pintura menor, no mínimo 0,7 m
  const largura = Math.min(2, Math.max(0.7, alt * 0.55));
  const y = Math.min(1.5, Math.max(largura / 2 + 0.1, alt - largura / 2 - 0.1));
  return { x: hx, y, z: hz, nx, nz, largura };
}

const cacheTex = new Map<string, THREE.CanvasTexture>();

/** Desenho de reserva do grafite: faixas nas duas cores da equipe + o nome (a imagem do admin vem com o login). */
function texturaGrafite(c1: number, c2: number, nome: string): THREE.CanvasTexture {
  const chave = `${c1}-${c2}-${nome}`;
  let t = cacheTex.get(chave);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 220;
  const g = c.getContext('2d')!;
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  g.clearRect(0, 0, 320, 220);
  g.save();
  g.beginPath();
  g.roundRect(8, 8, 304, 204, 26);
  g.clip();
  for (let i = -6; i < 12; i++) {
    g.fillStyle = hex(i % 2 === 0 ? c1 : c2);
    g.beginPath();
    g.moveTo(i * 40, 0); g.lineTo(i * 40 + 40, 0); g.lineTo(i * 40 - 80, 220); g.lineTo(i * 40 - 120, 220);
    g.fill();
  }
  g.restore();
  g.lineWidth = 8;
  g.strokeStyle = '#111';
  g.beginPath();
  g.roundRect(8, 8, 304, 204, 26);
  g.stroke();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let tam = 46;
  g.font = `900 ${tam}px system-ui, sans-serif`;
  while (g.measureText(nome.slice(0, 14)).width > 270 && tam > 18) { tam -= 2; g.font = `900 ${tam}px system-ui, sans-serif`; } // o nome tem que caber
  g.lineWidth = 10;
  g.strokeStyle = '#000';
  g.strokeText(nome.slice(0, 14), 160, 112);
  g.fillStyle = '#fff';
  g.fillText(nome.slice(0, 14), 160, 112);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cacheTex.set(chave, t);
  return t;
}

/** Decalques na parede (máx. 40, os mais velhos somem) e a névoa de tinta. */
export class Grafite {
  private decalques: THREE.Mesh[] = [];
  private geo = new THREE.PlaneGeometry(1, 220 / 320);
  private mats = new Map<string, THREE.MeshBasicMaterial>();
  private nevoa: THREE.Points;
  private nevoaT = 0;
  private ini = new THREE.Vector3();
  private fim = new THREE.Vector3();
  private sementes: number[] = [];

  constructor(private scene: THREE.Scene) {
    const n = 36;
    const pos = new Float32Array(n * 3);
    this.nevoa = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)), new THREE.PointsMaterial({ size: 0.12, transparent: true, opacity: 0.8, depthWrite: false, color: 0xffffff }));
    this.nevoa.visible = false;
    this.nevoa.frustumCulled = false;
    scene.add(this.nevoa);
    for (let i = 0; i < n * 3; i++) this.sementes.push(Math.random() - 0.5);
  }

  get quantos(): number {
    return this.decalques.length;
  }

  /** Pinta o desenho da equipe na parede. */
  pintar(p: Parede, c1: number, c2: number, nome: string, origem?: THREE.Vector3): void {
    const chave = `${c1}-${c2}-${nome}`;
    let mat = this.mats.get(chave);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ map: texturaGrafite(c1, c2, nome), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      this.mats.set(chave, mat);
    }
    const m = new THREE.Mesh(this.geo, mat);
    m.scale.set(p.largura, p.largura, 1);
    m.position.set(p.x + p.nx * 0.03, p.y, p.z + p.nz * 0.03);
    m.lookAt(p.x + p.nx, p.y, p.z + p.nz); // o +Z do plano aponta para fora da parede
    m.renderOrder = 3;
    this.scene.add(m);
    this.decalques.push(m);
    while (this.decalques.length > MAX_DECALQUES) this.scene.remove(this.decalques.shift()!);
    // névoa na cor da equipe por 1,4 s, da mão até a parede
    (this.nevoa.material as THREE.PointsMaterial).color.setHex(c1);
    this.ini.copy(origem ?? new THREE.Vector3(p.x + p.nx * 0.8, p.y, p.z + p.nz * 0.8));
    this.fim.set(p.x + p.nx * 0.05, p.y, p.z + p.nz * 0.05);
    this.nevoaT = TEMPO_NEVOA;
    this.nevoa.visible = true;
  }

  atualizar(dt: number): void {
    if (this.nevoaT <= 0) return;
    this.nevoaT = Math.max(0, this.nevoaT - dt);
    const pos = this.nevoa.geometry.attributes.position as THREE.BufferAttribute;
    const k = 1 - this.nevoaT / TEMPO_NEVOA;
    for (let i = 0; i < pos.count; i++) {
      const f = Math.min(1, k * 3 + i / pos.count * 0.2);
      pos.setXYZ(i,
        this.ini.x + (this.fim.x - this.ini.x) * f + this.sementes[i * 3] * 0.5 * f,
        this.ini.y + (this.fim.y - this.ini.y) * f + this.sementes[i * 3 + 1] * 0.5 * f,
        this.ini.z + (this.fim.z - this.ini.z) * f + this.sementes[i * 3 + 2] * 0.5 * f);
    }
    pos.needsUpdate = true;
    (this.nevoa.material as THREE.PointsMaterial).opacity = 0.8 * (this.nevoaT / TEMPO_NEVOA);
    if (this.nevoaT <= 0) this.nevoa.visible = false;
  }
}
