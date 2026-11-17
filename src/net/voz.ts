import type { Som, ParVoz } from '../game/audio';

/** Conecta a 3,4 m, desliga a 4,5 m, no máx. 8 conversas ao mesmo tempo. */
export const CONECTA = 3.4;
export const DESCONECTA = 4.5;
export const MAX_CONVERSAS = 8;
const FOLGA = 0.25; // s depois de soltar o botão ainda transmite
const STUN = [{ urls: 'stun:stun.l.google.com:19302' }]; // sem TURN: algumas redes não conectam

export interface MensagemRtc {
  i: string; // quem enviou
  p: string; // para quem
  t: 'o' | 'a' | 'c'; // offer / answer / candidate
  d: unknown;
}

export interface PontoVoz {
  id: string;
  x: number;
  z: number;
  vz: boolean;
}

export interface AdaptadorVoz {
  meuId: string;
  enviar(m: MensagemRtc): void;
  /** Jogadores remotos conhecidos (posição já interpolada). */
  vizinhos(): PontoVoz[];
  /** Publica "voz ligada" para os outros (presence). */
  publicar(ligado: boolean): void;
}

interface Par {
  id: string;
  pc: RTCPeerConnection;
  voz: ParVoz | null;
  filaIce: RTCIceCandidateInit[];
  remotoPronto: boolean;
}

/**
 * Voz por proximidade (seção 6.11): **aperte para falar** (botão do microfone ou T), WebRTC direto entre
 * navegadores com sinalização pelo canal Realtime (`rtc`). Quem não ligou a voz não abre conexão.
 * Ouvir não depende de apertar. Sem chat de texto.
 */
export class Voz {
  private pares = new Map<string, Par>();
  private mic: MediaStream | null = null;
  private faixa: MediaStreamTrack | null = null;
  private tFim = 0; // fim da folga de 0,25 s
  private apertado = false;
  private tVarre = 0;
  ligada = false;
  estado: 'desligada' | 'pedindo' | 'negada' | 'pronta' = 'desligada';
  falando = false;

  constructor(private som: Som, private net: AdaptadorVoz) {
    // soltar ao perder o foco (aba escondida, troca de app)
    addEventListener('blur', () => this.apertar(false));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.apertar(false); });
  }

  /** Pede o microfone (precisa de um gesto do usuário: toque no botão ou T). */
  async ativar(): Promise<boolean> {
    if (this.mic) return true;
    if (this.estado === 'pedindo') return false;
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') { this.estado = 'negada'; return false; }
    this.estado = 'pedindo';
    try {
      // sem ganho automático: o alcance da voz depende do volume real
      this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false }, video: false });
      this.faixa = this.mic.getAudioTracks()[0];
      this.faixa.enabled = false; // só transmite enquanto apertado
      this.ligada = true;
      this.estado = 'pronta';
      this.net.publicar(true);
      return true;
    } catch {
      this.estado = 'negada';
      return false;
    }
  }

  /** Botão do microfone / tecla T: transmite só enquanto apertado (+ 0,25 s de folga). */
  apertar(sim: boolean): void {
    this.apertado = sim;
    if (sim) {
      this.tFim = Infinity;
      if (this.faixa) this.faixa.enabled = true;
    } else {
      this.tFim = performance.now() + FOLGA * 1000;
    }
  }

  /** Recebe sinalização (offer/answer/ice) dirigida a mim. */
  async receber(m: MensagemRtc): Promise<void> {
    if (m.p !== this.net.meuId || !this.ligada) return; // quem não ligou a voz não abre conexão
    let par = this.pares.get(m.i);
    try {
      if (m.t === 'o') {
        if (par || this.pares.size >= MAX_CONVERSAS) return;
        par = this.criar(m.i);
        await par.pc.setRemoteDescription(m.d as RTCSessionDescriptionInit);
        par.remotoPronto = true;
        await this.drenarIce(par);
        const resp = await par.pc.createAnswer();
        await par.pc.setLocalDescription(resp);
        this.net.enviar({ i: this.net.meuId, p: m.i, t: 'a', d: par.pc.localDescription });
      } else if (m.t === 'a' && par) {
        await par.pc.setRemoteDescription(m.d as RTCSessionDescriptionInit);
        par.remotoPronto = true;
        await this.drenarIce(par);
      } else if (m.t === 'c' && par) {
        if (par.remotoPronto) await par.pc.addIceCandidate(m.d as RTCIceCandidateInit);
        else par.filaIce.push(m.d as RTCIceCandidateInit);
      }
    } catch {
      if (par) this.fechar(m.i); // sinalização inválida: descarta
    }
  }

  private async drenarIce(par: Par): Promise<void> {
    for (const c of par.filaIce.splice(0)) await par.pc.addIceCandidate(c).catch(() => undefined);
  }

  private criar(id: string): Par {
    const pc = new RTCPeerConnection({ iceServers: STUN });
    const par: Par = { id, pc, voz: null, filaIce: [], remotoPronto: false };
    if (this.faixa && this.mic) pc.addTrack(this.faixa, this.mic);
    pc.onicecandidate = (e) => { if (e.candidate) this.net.enviar({ i: this.net.meuId, p: id, t: 'c', d: e.candidate.toJSON() }); };
    pc.ontrack = (e) => { par.voz?.parar(); par.voz = this.som.vozRemota(e.streams[0] ?? new MediaStream([e.track])); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.fechar(id); };
    this.pares.set(id, par);
    return par;
  }

  private async oferecer(id: string): Promise<void> {
    const par = this.criar(id);
    try {
      const o = await par.pc.createOffer({ offerToReceiveAudio: true });
      await par.pc.setLocalDescription(o);
      this.net.enviar({ i: this.net.meuId, p: id, t: 'o', d: par.pc.localDescription });
    } catch {
      this.fechar(id);
    }
  }

  private fechar(id: string): void {
    const par = this.pares.get(id);
    if (!par) return;
    this.pares.delete(id);
    par.voz?.parar();
    par.pc.onicecandidate = par.pc.ontrack = par.pc.onconnectionstatechange = null;
    par.pc.close();
  }

  /** Todo quadro: folga do botão, conexões por proximidade e volume pela distância. */
  atualizar(dt: number, meuX: number, meuZ: number): void {
    // transmissão: botão apertado ou dentro da folga de 0,25 s
    const transmitir = this.ligada && (this.apertado || performance.now() < this.tFim);
    if (this.faixa) this.faixa.enabled = transmitir;
    this.falando = transmitir;

    // proximidade (4x por segundo)
    this.tVarre -= dt;
    const viz = new Map(this.net.vizinhos().map((v) => [v.id, v]));
    if (this.tVarre <= 0) {
      this.tVarre = 0.25;
      for (const [id, par] of this.pares) {
        const v = viz.get(id);
        if (!v || !v.vz || !this.ligada || Math.hypot(v.x - meuX, v.z - meuZ) > DESCONECTA) this.fechar(id);
        else void par;
      }
      if (this.ligada) {
        for (const v of viz.values()) {
          if (!v.vz || this.pares.has(v.id) || this.pares.size >= MAX_CONVERSAS) continue;
          // quem tem o id menor oferece (evita duas ofertas ao mesmo tempo)
          if (Math.hypot(v.x - meuX, v.z - meuZ) <= CONECTA && this.net.meuId < v.id) void this.oferecer(v.id);
        }
      }
    }
    for (const [id, par] of this.pares) {
      const v = viz.get(id);
      if (v && par.voz) par.voz.atualizar(v.x, v.z, dt);
    }
  }

  /** Conversas abertas (para o teste). */
  conversas(): { id: string; estado: string; nivel: number; alcance: number }[] {
    return [...this.pares.values()].map((p) => ({ id: p.id, estado: p.pc.connectionState, nivel: +(p.voz?.nivel ?? 0).toFixed(2), alcance: +(p.voz?.alcance ?? 0).toFixed(2) }));
  }

  /** Para tudo: conexões, microfone e sons (sair do jogo). */
  dispose(): void {
    for (const id of [...this.pares.keys()]) this.fechar(id);
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
    this.faixa = null;
    this.ligada = false;
    this.net.publicar(false);
  }
}
