/**
 * Áudio sintetizado por código (WebAudio), sem arquivos. Segue a skill `audio-design`:
 * barramentos (SFX, Veículos, UI, Voz) → Master com limitador; sliders 0..1 viram ganho ao QUADRADO
 * (mudo em 0); sons repetidos variam tom e volume; nenhum oscilador fica sem parada.
 */
export type TipoTiro = 'fuzil' | 'fuzilC' | 'pistola' | 'silenciado';
export type TipoBuzina = 'carro' | 'moto' | 'caminhao';
export type Barramento = 'sfx' | 'veiculos' | 'ui' | 'voz';

/** Alcance (m) em que cada som some. Perto do círculo desenhado no chão. */
export const ALCANCE = { tiro: 22, silenciado: 9, buzina: 13, motor: 11, sirene: 24, batida: 18, raspao: 12, recarga: 8, golpe: 7 } as const;

const MAX_TIROS_SIMULTANEOS = 10;

/** Ganho com o panorâmico preso (lado do som pela posição). */
interface Saida extends GainNode {
  pan: StereoPannerNode;
}

export interface ParVoz {
  readonly nivel: number;
  readonly alcance: number;
  atualizar(x: number, z: number, dt: number): void;
  parar(): void;
}

export interface Controle {
  parar(): void;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const dbParaGanho = (db: number) => Math.pow(10, db / 20);

export class Som {
  readonly master: GainNode;
  private limitador: DynamicsCompressorNode;
  readonly barras: Record<Barramento, GainNode>;
  private ruido: AudioBuffer;
  private ouvX = 0;
  private ouvZ = 0;
  private ouvYaw = 0;
  private tirosAtivos = 0;
  /** Fontes (osciladores/ruído) ainda tocando: tem que voltar a 0 ao guardar veículos (teste de vazamento). */
  ativos = 0;
  /** Ganho master alvo (calibrado por medição de loudness). */
  private nivel = 0.62; // medido: −18,5 LUFS, pico −2,8 dBFS (alvo mobile −18 ±2)

  constructor(readonly ctx: BaseAudioContext = new AudioContext()) {
    this.master = ctx.createGain();
    this.master.gain.value = this.nivel;
    // Limitador de segurança no Master (pico ≤ −1 dBFS); não é o mixer
    this.limitador = ctx.createDynamicsCompressor();
    this.limitador.threshold.value = -3;
    this.limitador.knee.value = 0;
    this.limitador.ratio.value = 20;
    this.limitador.attack.value = 0.002;
    this.limitador.release.value = 0.1;
    this.master.connect(this.limitador).connect(ctx.destination);
    const bus = (g: number) => {
      const n = ctx.createGain();
      n.gain.value = g;
      n.connect(this.master);
      return n;
    };
    this.barras = { sfx: bus(1), veiculos: bus(1), ui: bus(1), voz: bus(1) };
    // 1 s de ruído branco compartilhado
    this.ruido = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.ruido.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  /** Slider 0..1 → ganho ao quadrado; 0 = mudo (nunca dB direto do slider). */
  definirVolume(b: Barramento | 'master', slider: number): void {
    const s = Math.min(1, Math.max(0, slider));
    const alvo = s <= 0 ? 0 : s * s;
    const g = b === 'master' ? this.master.gain : this.barras[b].gain;
    g.setTargetAtTime(b === 'master' ? alvo * this.nivel : alvo, this.ctx.currentTime, 0.02);
  }

  /** Ganho de calibração do Master (resultado da medição de loudness). */
  calibrar(ganho: number): void {
    this.nivel = ganho;
    this.master.gain.value = ganho;
  }

  retomar(): Promise<void> {
    return this.ctx instanceof AudioContext ? this.ctx.resume() : Promise.resolve();
  }

  ouvinte(x: number, z: number, yaw: number): void {
    this.ouvX = x;
    this.ouvZ = z;
    this.ouvYaw = yaw;
  }

  /** Volume e lado pela distância até o ouvinte. */
  private espacial(x: number, z: number, alcance: number): { g: number; pan: number; d: number } {
    const dx = x - this.ouvX, dz = z - this.ouvZ, d = Math.hypot(dx, dz);
    const g = d >= alcance ? 0 : Math.pow(1 - d / alcance, 2);
    // direita do ouvinte = (−cos yaw, sin yaw)
    const dir = d > 0.5 ? (dx * -Math.cos(this.ouvYaw) + dz * Math.sin(this.ouvYaw)) / d : 0;
    return { g, pan: Math.max(-1, Math.min(1, dir)), d };
  }

  /** Cadeia padrão de uma fonte: ganho → pan → barramento. */
  private saida(bus: Barramento, g: number, pan: number): Saida {
    const ganho = this.ctx.createGain() as Saida;
    ganho.gain.value = g;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    ganho.pan = p;
    ganho.connect(p).connect(this.barras[bus]);
    return ganho;
  }

  private osc(tipo: OscillatorType, f: number, dest: AudioNode, t0: number, t1: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = tipo;
    o.frequency.value = f;
    o.connect(dest);
    this.ativos++;
    o.onended = () => { this.ativos--; o.disconnect(); };
    o.start(t0);
    o.stop(t1);
    return o;
  }

  private ruidoFonte(dest: AudioNode, t0: number, t1: number, loop = false): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.ruido;
    s.loop = loop;
    s.loopStart = 0;
    s.connect(dest);
    this.ativos++;
    s.onended = () => { this.ativos--; s.disconnect(); };
    s.start(t0, Math.random() * 0.5);
    s.stop(t1);
    return s;
  }

  // ---------------------------------------------------------------- tiros

  /** Fuzil grave e longo, pistola seca, silenciado só estalo; longe perde agudos; fuzil C com eco de 3 repetições. */
  tiro(tipo: TipoTiro, x: number, z: number): void {
    const alc = tipo === 'silenciado' ? ALCANCE.silenciado : ALCANCE.tiro;
    const e = this.espacial(x, z, alc);
    if (e.g <= 0.001 || this.tirosAtivos >= MAX_TIROS_SIMULTANEOS) return;
    this.tirosAtivos++;
    const t = this.ctx.currentTime;
    // variação por disparo: tom ±1 semitom e volume ±2 dB (acaba com o "metralhadora de cópias")
    const tom = Math.pow(2, rnd(-1, 1) / 12), vol = dbParaGanho(rnd(-2, 2));
    const longe = this.ctx.createBiquadFilter(); // longe perde agudos
    longe.type = 'lowpass';
    longe.frequency.value = 500 + 15000 * Math.pow(1 - Math.min(1, e.d / alc), 1.5);
    const saida = this.saida('sfx', 0.55 * e.g * vol, e.pan);
    longe.connect(saida);
    let dur = 0.25;
    if (tipo === 'silenciado') {
      dur = 0.06;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3500;
      hp.connect(longe);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      g.connect(hp);
      this.ruidoFonte(g, t, t + dur);
    } else {
      const grave = tipo === 'fuzilC';
      dur = tipo === 'pistola' ? 0.12 : grave ? 0.45 : 0.28;
      // estalo (ruído filtrado)
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = (tipo === 'pistola' ? 2600 : grave ? 900 : 1700) * tom;
      bp.Q.value = 0.7;
      const gr = this.ctx.createGain();
      gr.gain.setValueAtTime(1, t);
      gr.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.8);
      bp.connect(gr).connect(longe);
      this.ruidoFonte(bp, t, t + dur);
      // corpo grave (seno que cai)
      const ob = this.ctx.createGain();
      ob.gain.setValueAtTime(tipo === 'pistola' ? 0.4 : 0.9, t);
      ob.gain.exponentialRampToValueAtTime(0.001, t + dur);
      ob.connect(longe);
      const o = this.osc('sine', (grave ? 90 : 130) * tom, ob, t, t + dur);
      o.frequency.exponentialRampToValueAtTime(grave ? 38 : 55, t + dur * 0.9);
      // eco de 3 repetições no fuzil lento
      if (grave) {
        for (let i = 1; i <= 3; i++) {
          const ge = this.ctx.createGain();
          ge.gain.setValueAtTime(0.35 / i, t + i * 0.13);
          ge.gain.exponentialRampToValueAtTime(0.001, t + i * 0.13 + 0.25);
          const lp = this.ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 700 / i;
          ge.connect(lp).connect(longe);
          this.ruidoFonte(ge, t + i * 0.13, t + i * 0.13 + 0.3);
          dur = Math.max(dur, i * 0.13 + 0.3);
        }
      }
    }
    setTimeout(() => { this.tirosAtivos--; }, dur * 1000 + 50);
  }

  /** Recarga: 4 cliques espaçados (0; 0,42; 0,92; 1,36 s). */
  recarga(x: number, z: number): void {
    const e = this.espacial(x, z, ALCANCE.recarga);
    if (e.g <= 0.001) return;
    const t = this.ctx.currentTime;
    for (const dt of [0, 0.42, 0.92, 1.36]) {
      const s = this.saida('sfx', 0.35 * e.g, e.pan);
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = rnd(1800, 2600);
      hp.Q.value = 3;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(1, t + dt);
      g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.05);
      hp.connect(g).connect(s);
      this.ruidoFonte(hp, t + dt, t + dt + 0.06);
    }
  }

  /** Soco/golpe: baque curto. */
  golpe(x: number, z: number): void {
    const e = this.espacial(x, z, ALCANCE.golpe);
    if (e.g <= 0.001) return;
    const t = this.ctx.currentTime;
    const s = this.saida('sfx', 0.6 * e.g * dbParaGanho(rnd(-2, 2)), e.pan);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    g.connect(s);
    const o = this.osc('sine', rnd(110, 150), g, t, t + 0.14);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
  }

  /** Spray: chiado de ruído agudo por ~1,2 s. */
  spray(x: number, z: number): void {
    const e = this.espacial(x, z, ALCANCE.golpe);
    if (e.g <= 0.001) return;
    const t = this.ctx.currentTime;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.05);
    g.gain.setValueAtTime(0.4, t + 1.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.25);
    hp.connect(g).connect(this.saida('sfx', 0.6 * e.g, e.pan));
    this.ruidoFonte(hp, t, t + 1.3);
  }

  /** Pegar item (vida/colete): dois tons subindo. */
  pegar(): void {
    const t = this.ctx.currentTime;
    const s = this.saida('ui', 0.3, 0);
    for (const [i, f] of [660, 880].entries()) {
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.09);
      g.gain.exponentialRampToValueAtTime(1, t + i * 0.09 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.18);
      g.connect(s);
      this.osc('triangle', f, g, t + i * 0.09, t + i * 0.09 + 0.2);
    }
  }

  // ------------------------------------------------------------- veículos

  /** Batida: estalo de metal + baque; > 2,5 m/s de frente soma um estalo. */
  batida(v: number, x: number, z: number): void {
    const e = this.espacial(x, z, ALCANCE.batida);
    if (e.g <= 0.001) return;
    const t = this.ctx.currentTime;
    const forca = Math.min(1, v / 14);
    const s = this.saida('veiculos', 0.7 * e.g * (0.3 + 0.7 * forca), e.pan);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    g.connect(s);
    const o = this.osc('sine', 85, g, t, t + 0.35);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.3);
    if (v > 2.5) {
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2200;
      bp.Q.value = 1.2;
      const gm = this.ctx.createGain();
      gm.gain.setValueAtTime(0.8, t);
      gm.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      bp.connect(gm).connect(s);
      this.ruidoFonte(bp, t, t + 0.25);
    }
  }

  /** Lata raspando na parede: ruído com trepidação de 38 Hz; fica ligado enquanto raspa. */
  raspao(): Controle & { atualizar(x: number, z: number, forca: number): void } {
    const t = this.ctx.currentTime;
    const tremolo = this.ctx.createGain();
    tremolo.gain.value = 0.5;
    const lfo = this.ctx.createGain();
    lfo.gain.value = 0.5;
    const saida = this.saida('veiculos', 0, 0);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1300;
    bp.Q.value = 1.5;
    bp.connect(tremolo).connect(saida);
    const o = this.osc('square', 38, lfo, t, t + 3600);
    lfo.connect(tremolo.gain);
    const r = this.ruidoFonte(bp, t, t + 3600, true);
    let vivo = true;
    return {
      atualizar: (px, pz, forca) => {
        const e = this.espacial(px, pz, ALCANCE.raspao);
        saida.gain.setTargetAtTime(vivo ? 0.5 * e.g * Math.min(1, forca) : 0, this.ctx.currentTime, 0.03);
        saida.pan.pan.setTargetAtTime(e.pan, this.ctx.currentTime, 0.03);
      },
      parar: () => {
        vivo = false;
        saida.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
        const fim = this.ctx.currentTime + 0.1;
        o.stop(fim);
        r.stop(fim);
      },
    };
  }

  /** Buzina: carro 2 notas graves, moto mais aguda, caminhão de bombeiros (viatura com sirene). Fica enquanto segurar. */
  buzina(tipo: TipoBuzina, x: number, z: number): Controle & { posicao(x: number, z: number): void } {
    const notas = tipo === 'carro' ? [247, 311] : tipo === 'moto' ? [466, 587] : [110, 139];
    const t = this.ctx.currentTime;
    const saida = this.saida('veiculos', 0, 0);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    lp.connect(saida);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    g.connect(lp);
    const oscs = notas.map((f) => this.osc('sawtooth', f, g, t, t + 3600));
    const atualiza = (px: number, pz: number) => {
      const e = this.espacial(px, pz, ALCANCE.buzina);
      saida.gain.setTargetAtTime(0.6 * e.g, this.ctx.currentTime, 0.02);
      saida.pan.pan.setTargetAtTime(e.pan, this.ctx.currentTime, 0.02);
    };
    atualiza(x, z);
    return {
      posicao: atualiza,
      parar: () => {
        const fim = this.ctx.currentTime + 0.08;
        g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.02);
        oscs.forEach((o) => o.stop(fim));
      },
    };
  }

  /** Sirene "lamento": 600–1400 Hz subindo e descendo. */
  sirene(x: number, z: number): Controle & { posicao(x: number, z: number): void } {
    const t = this.ctx.currentTime;
    const saida = this.saida('veiculos', 0, 0);
    const g = this.ctx.createGain();
    g.gain.value = 0.35;
    g.connect(saida);
    const o = this.osc('triangle', 1000, g, t, t + 3600);
    const lfo = this.ctx.createOscillator();
    const prof = this.ctx.createGain();
    prof.gain.value = 400; // 600..1400 Hz
    lfo.frequency.value = 0.45;
    lfo.connect(prof).connect(o.frequency);
    this.ativos++;
    lfo.onended = () => { this.ativos--; lfo.disconnect(); };
    lfo.start(t);
    lfo.stop(t + 3600);
    const atualiza = (px: number, pz: number) => {
      const e = this.espacial(px, pz, ALCANCE.sirene);
      saida.gain.setTargetAtTime(0.6 * e.g, this.ctx.currentTime, 0.05);
      saida.pan.pan.setTargetAtTime(e.pan, this.ctx.currentTime, 0.05);
    };
    atualiza(x, z);
    return {
      posicao: atualiza,
      parar: () => {
        const fim = this.ctx.currentTime + 0.1;
        saida.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
        o.stop(fim);
        lfo.stop(fim);
      },
    };
  }

  /**
   * Motor: osciladores + ruído; tom e filtro sobem contínuos de 0 a 100% da velocidade (sem marchas);
   * soltar o acelerador volta ao motor parado. `crank` = partida sintetizada.
   */
  motor(tipo: 'carro' | 'moto'): Motor {
    return new Motor(this, tipo);
  }

  // usado pela classe Motor
  /**
   * Voz de outro jogador (stream WebRTC): volume cheio até 0,75 m e cai com a distância; o **alcance depende do volume da voz**
   * (`3 m × (0,1 + 0,9 × nível)`, nível = RMS suavizado de −58 dB (0) a −18 dB (1)). Lado pela posição.
   */
  vozRemota(stream: MediaStream): ParVoz {
    const ctx = this.ctx;
    // Chrome só entrega o áudio de um stream remoto ao WebAudio se um elemento de mídia (mudo) o consumir
    const el = new Audio();
    el.srcObject = stream;
    el.muted = true;
    void el.play().catch(() => undefined);
    const fonte = (ctx as AudioContext).createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    const ganho = ctx.createGain();
    ganho.gain.value = 0;
    const pan = ctx.createStereoPanner();
    fonte.connect(an);
    fonte.connect(ganho).connect(pan).connect(this.barras.voz);
    const buf = new Float32Array(an.fftSize);
    let nivel = 0;
    return {
      get nivel() { return nivel; },
      get alcance() { return 3 * (0.1 + 0.9 * nivel); },
      atualizar: (x, z, dt) => {
        an.getFloatTimeDomainData(buf);
        let s = 0;
        for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        const db = 20 * Math.log10(Math.sqrt(s / buf.length) + 1e-9);
        const alvo = Math.min(1, Math.max(0, (db + 58) / 40));
        nivel += (alvo - nivel) * Math.min(1, dt * (alvo > nivel ? 14 : 3)); // sobe rápido, desce devagar
        const R = 3 * (0.1 + 0.9 * nivel);
        const dx = x - this.ouvX, dz = z - this.ouvZ, d = Math.hypot(dx, dz);
        const g = d <= 0.75 ? 1 : d >= R || R <= 0.75 ? (d <= R ? 1 : 0) : Math.pow((R - d) / (R - 0.75), 1.5);
        ganho.gain.setTargetAtTime(g, ctx.currentTime, 0.05);
        const lado = d > 0.3 ? (dx * -Math.cos(this.ouvYaw) + dz * Math.sin(this.ouvYaw)) / d : 0;
        pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, lado)), ctx.currentTime, 0.05);
      },
      parar: () => {
        ganho.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
        try { fonte.disconnect(); ganho.disconnect(); pan.disconnect(); an.disconnect(); } catch { /* já solto */ }
        el.srcObject = null;
      },
    };
  }

  /** Só para a classe Motor. */
  _interno() {
    return { ctx: this.ctx, saida: this.saida.bind(this), osc: this.osc.bind(this), ruidoFonte: this.ruidoFonte.bind(this), espacial: this.espacial.bind(this) };
  }
}

/** Som de motor de um veículo (do jogador ou remoto). */
export class Motor implements Controle {
  private o1: OscillatorNode;
  private o2: OscillatorNode;
  private filtro: BiquadFilterNode;
  private ganho: GainNode;
  private saida: Saida;
  private pneu: GainNode;
  private pneuSaida: Saida;
  private rodando = true;
  private base: number;
  private ruidos: AudioBufferSourceNode[] = [];

  constructor(private som: Som, private tipo: 'carro' | 'moto') {
    const i = som._interno();
    const t = i.ctx.currentTime;
    this.base = tipo === 'moto' ? 62 : 38;
    this.saida = i.saida('veiculos', 0, 0);
    this.ganho = i.ctx.createGain();
    this.ganho.gain.value = 0.0001;
    this.filtro = i.ctx.createBiquadFilter();
    this.filtro.type = 'lowpass';
    this.filtro.frequency.value = 400;
    this.filtro.connect(this.ganho).connect(this.saida);
    this.o1 = i.osc('sawtooth', this.base, this.filtro, t, t + 7200);
    this.o2 = i.osc('square', this.base / 2, this.filtro, t, t + 7200);
    // chiado de pneu: ruído filtrado, ganho pelo ângulo entre trajetória e direção
    this.pneuSaida = i.saida('veiculos', 0, 0);
    this.pneu = i.ctx.createGain();
    this.pneu.gain.value = 0;
    const bp = i.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 2;
    bp.connect(this.pneu).connect(this.pneuSaida);
    this.ruidos.push(i.ruidoFonte(bp, t, t + 7200, true));
  }

  /** Partida: pulsos graves de ~0,45 s, depois o ralenti entra. */
  crank(): void {
    const i = this.som._interno();
    const t = i.ctx.currentTime;
    const g = i.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (let k = 0; k < 6; k++) {
      g.gain.setValueAtTime(0.6, t + k * 0.075);
      g.gain.exponentialRampToValueAtTime(0.05, t + k * 0.075 + 0.06);
    }
    g.connect(this.saida);
    i.osc('sawtooth', this.tipo === 'moto' ? 70 : 48, g, t, t + 0.5);
  }

  /** `vel` 0..1 (da velocidade máxima), `acel` 0..1 (acelerador), `derrapa` 0..1 (chiado). */
  atualizar(x: number, z: number, vel: number, acel: number, derrapa: number): void {
    if (!this.rodando) return;
    const i = this.som._interno();
    const t = i.ctx.currentTime;
    const v = Math.min(1, Math.max(0, vel));
    const f = this.base * (1 + (this.tipo === 'moto' ? 4.4 : 3.6) * v) * (1 + 0.12 * acel);
    this.o1.frequency.setTargetAtTime(f, t, 0.05);
    this.o2.frequency.setTargetAtTime(f / 2, t, 0.05);
    this.filtro.frequency.setTargetAtTime(380 + 2200 * v + 700 * acel, t, 0.05);
    const e = i.espacial(x, z, ALCANCE.motor);
    this.saida.gain.setTargetAtTime(0.5 * e.g, t, 0.03);
    this.saida.pan.pan.setTargetAtTime(e.pan, t, 0.03);
    this.pneuSaida.pan.pan.setTargetAtTime(e.pan, t, 0.03);
    this.ganho.gain.setTargetAtTime(0.22 + 0.2 * acel + 0.1 * v, t, 0.05);
    this.pneuSaida.gain.setTargetAtTime(0.5 * e.g, t, 0.03);
    this.pneu.gain.setTargetAtTime(Math.min(1, derrapa) * 0.7, t, 0.04);
  }

  /** Para tudo (guardar veículo, sair do jogo): nada fica tocando. */
  parar(): void {
    if (!this.rodando) return;
    this.rodando = false;
    const i = this.som._interno();
    const t = i.ctx.currentTime;
    this.ganho.gain.setTargetAtTime(0.0001, t, 0.03);
    this.pneu.gain.setTargetAtTime(0, t, 0.03);
    const fim = t + 0.15;
    this.o1.stop(fim);
    this.o2.stop(fim);
    this.ruidos.forEach((r) => r.stop(fim));
  }
}
