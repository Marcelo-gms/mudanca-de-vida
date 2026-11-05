/**
 * Sintetizador de efeitos sonoros (Web Audio API), sem arquivos de áudio.
 * Tudo passa por um ganho mestre, então o mudo corta inclusive sons em andamento.
 */
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  ready() {
    return this.enabled && this.init();
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.master) this.master.gain.value = this.enabled ? 1 : 0;
    return this.enabled;
  }

  tone({ type = 'sine', f0, f1 = f0, at = 0, dur = 0.1, vol = 0.2 }) {
    const t = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur);
  }

  noise({ at = 0, dur = 0.03, vol = 0.2, freq = 2500 }) {
    const t = this.ctx.currentTime + at;
    const len = Math.ceil(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    src.buffer = buf;
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
  }

  playClick() {
    if (!this.ready()) return;
    this.tone({ type: 'triangle', f0: 420, f1: 210, dur: 0.05, vol: 0.15 });
  }

  /** Catraca da alavanca + baque no fim do curso. */
  playLever() {
    if (!this.ready()) return;
    for (let i = 0; i < 6; i++) this.noise({ at: i * 0.035, dur: 0.02, vol: 0.25, freq: 1800 + i * 150 });
    this.tone({ type: 'sawtooth', f0: 150, f1: 45, at: 0.22, dur: 0.18, vol: 0.18 });
  }

  playReelStop() {
    if (!this.ready()) return;
    this.tone({ type: 'sine', f0: 170, f1: 55, dur: 0.13, vol: 0.38 });
    this.noise({ dur: 0.03, vol: 0.18, freq: 3200 });
  }

  /** Ronco mecânico contínuo dos rolos girando. Retorna { stop }. */
  startSpinLoop() {
    if (!this.ready()) return { stop() {} };
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 52;
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    amp.gain.value = 0.035;
    lfo.type = 'square';
    lfo.frequency.value = 15;
    depth.gain.value = 0.03;
    lfo.connect(depth).connect(amp.gain);
    osc.connect(filter).connect(amp).connect(this.master);
    osc.start();
    lfo.start();
    let stopped = false;
    return {
      stop() {
        if (stopped) return;
        stopped = true;
        const n = ctx.currentTime;
        depth.disconnect();
        amp.gain.cancelScheduledValues(n);
        amp.gain.setTargetAtTime(0, n, 0.04);
        osc.stop(n + 0.3);
        lfo.stop(n + 0.3);
      }
    };
  }

  /** Sirene ascendente de suspense para o último rolo. Retorna { stop }. */
  playAnticipation(dur = 1.6) {
    if (!this.ready()) return { stop() {} };
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + dur);
    amp.gain.setValueAtTime(0.001, t);
    amp.gain.linearRampToValueAtTime(0.07, t + dur * 0.8);
    osc.connect(amp).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.5);
    let stopped = false;
    return {
      stop() {
        if (stopped) return;
        stopped = true;
        amp.gain.cancelScheduledValues(ctx.currentTime);
        amp.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      }
    };
  }

  /** Tilintar curto de moeda (contagem do prêmio). */
  playCoin() {
    if (!this.ready()) return;
    this.tone({ type: 'triangle', f0: 1900 + Math.random() * 400, f1: 2700, dur: 0.05, vol: 0.06 });
  }

  playWin() {
    if (!this.ready()) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone({ type: 'triangle', f0: f, at: i * 0.08, dur: 0.22, vol: 0.2 });
    });
  }

  playBigWin() {
    if (!this.ready()) return;
    [392, 523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => {
      this.tone({ type: 'sawtooth', f0: f, at: i * 0.1, dur: 0.35, vol: 0.18 });
      this.tone({ type: 'square', f0: f / 2, at: i * 0.1, dur: 0.3, vol: 0.06 });
    });
    this.tone({ type: 'triangle', f0: 1568, at: 0.65, dur: 0.9, vol: 0.15 });
  }
}

window.soundEngine = new SoundEngine();
