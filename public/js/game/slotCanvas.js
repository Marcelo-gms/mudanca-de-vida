/**
 * Rolos físicos em HTML5 Canvas.
 * - Cada rolo é uma fita cíclica projetada num tambor (cilindro), como numa máquina real.
 * - Arranque com recuo, frenagem desacelerada com quique e parada sequencial.
 * - Suspense no 3º rolo quando os dois primeiros podem formar prêmio alto.
 * O resultado SEMPRE vem do servidor (CSPRNG); o Math.random aqui é só cosmético.
 */
const STRIP_LENGTH = 24;
const STRIP_POOL = ['LARANJA', 'LARANJA', 'LARANJA', 'BARRA', 'BARRA', 'MOEDA', 'TIGRE'];
const VIEW = 1.5; // meia janela visível, em símbolos
const DRUM_ANGLE = 0.9; // ângulo do tambor na borda da janela (rad)
const BOUNCE = 0.14; // quanto o rolo passa do ponto antes de assentar (em símbolos)

const mod = (n, m) => ((n % m) + m) % m;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

class SlotCanvas {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.R = VIEW / DRUM_ANGLE;
    this.turbo = false;
    this.spinning = false;
    this.reels = [0, 1, 2].map(() => ({
      strip: Array.from({ length: STRIP_LENGTH }, () => pick(STRIP_POOL)),
      pos: 0,
      speed: 0,
      state: 'idle',
      t: 0
    }));
    this.win = null;
    this.sparks = [];
    this.flash = 0;
    this.teaseReel = -1;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  setTurbo(turbo) {
    this.turbo = turbo;
  }

  // ---------- geometria ----------
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || 340;
    const h = this.canvas.clientHeight || 250;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = w;
    this.H = h;
    this.dpr = dpr;
    this.unit = h / (2 * this.R * Math.sin(DRUM_ANGLE));
    this.gap = w * 0.025;
    this.reelW = (w - this.gap * 4) / 3;
    this.symSize = Math.min(this.unit, this.reelW) * 0.86;
    this.symPx = Math.round(this.symSize * dpr);

    // Sombreamento cilíndrico (topo/base escuros, faixa de brilho no meio)
    const v = this.ctx.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, 'rgba(25, 6, 0, 0.78)');
    v.addColorStop(0.2, 'rgba(25, 6, 0, 0.18)');
    v.addColorStop(0.42, 'rgba(255, 255, 255, 0.10)');
    v.addColorStop(0.58, 'rgba(255, 255, 255, 0.10)');
    v.addColorStop(0.8, 'rgba(25, 6, 0, 0.18)');
    v.addColorStop(1, 'rgba(25, 6, 0, 0.78)');
    this.shadeV = v;
    this.shadeH = [0, 1, 2].map((c) => {
      const x = this.reelX(c);
      const g = this.ctx.createLinearGradient(x, 0, x + this.reelW, 0);
      g.addColorStop(0, 'rgba(40, 10, 0, 0.35)');
      g.addColorStop(0.18, 'rgba(40, 10, 0, 0)');
      g.addColorStop(0.82, 'rgba(40, 10, 0, 0)');
      g.addColorStop(1, 'rgba(40, 10, 0, 0.35)');
      return g;
    });
  }

  reelX(c) {
    return this.gap + c * (this.reelW + this.gap);
  }

  /** Posição vertical (px) de um ponto da fita a `s` símbolos do centro da janela. */
  proj(s) {
    return this.H / 2 + this.R * Math.sin(s / this.R) * this.unit;
  }

  // ---------- controle do giro ----------
  startSpin() {
    this.win = null;
    this.sparks.length = 0;
    this.teaseReel = -1;
    this.spinning = true;
    this.spinStart = performance.now();
    const vmax = this.turbo ? 28 : 17;
    const stagger = this.turbo ? 0.03 : 0.07;
    this.reels.forEach((r, c) => {
      Object.assign(r, { state: 'windup', t: -c * stagger, p0: r.pos, speed: 0, vmax: vmax + c });
    });
    if (window.soundEngine) this.loop = window.soundEngine.startSpinLoop();
  }

  stopSpin(matrix, hits, onComplete) {
    const targets = [0, 1, 2].map((c) => [matrix[0][c].id, matrix[1][c].id, matrix[2][c].id]);

    // Suspense: os dois primeiros da linha central podem fechar prêmio acima da laranja
    const natives = [matrix[1][0].id, matrix[1][1].id].filter((id) => id !== 'TIGRE');
    this.tease = natives.every((id) => id === natives[0]) && natives[0] !== 'LARANJA';

    this.hits = hits || [];
    this.onComplete = onComplete;

    const minSpin = this.turbo ? 350 : 1000;
    const gap = this.turbo ? 140 : 380;
    const wait = Math.max(0, minSpin - (performance.now() - this.spinStart));
    targets.forEach((t, c) => {
      let delay = wait + c * gap;
      if (c === 2 && this.tease) delay += this.turbo ? 700 : 1500;
      setTimeout(() => this.beginStop(c, t), delay);
    });
  }

  /** Para os rolos onde estiverem (erro de rede/servidor), sem prêmio. */
  abortSpin(onComplete) {
    this.hits = [];
    this.tease = false;
    this.onComplete = onComplete;
    this.reels.forEach((r, c) => {
      if (r.state !== 'idle') setTimeout(() => this.beginStop(c, null), c * 120);
    });
    if (this.reels.every((r) => r.state === 'idle')) this.finish();
  }

  beginStop(c, targetSymbols) {
    const r = this.reels[c];
    const v = Math.max(r.speed, 14);
    const want = (v * (this.turbo ? 0.28 : 0.45)) / 3;
    const target = Math.floor(r.pos - Math.max(3, want));
    // Grava o resultado na fita, fora da área visível, para ele "chegar" rolando
    if (targetSymbols) targetSymbols.forEach((id, row) => { r.strip[mod(target + row, STRIP_LENGTH)] = id; });
    const dist = r.pos - (target - BOUNCE);
    Object.assign(r, { state: 'stopping', t: 0, p0: r.pos, target, dist, dur: (3 * dist) / v });
  }

  onClunk(c) {
    if (window.soundEngine) window.soundEngine.playReelStop();
    if (c === 1 && this.tease) {
      this.teaseReel = 2;
      this.reels[2].vmax *= 1.25;
      if (window.soundEngine) this.teaseSound = window.soundEngine.playAnticipation(this.turbo ? 0.9 : 1.8);
    }
    if (c === 2) {
      this.teaseReel = -1;
      if (this.teaseSound) this.teaseSound.stop();
      if (this.loop) this.loop.stop();
    }
  }

  finish() {
    this.spinning = false;
    if (this.loop) this.loop.stop();
    if (this.hits.length) {
      const cells = new Set();
      this.hits.forEach((h) => (h.coords || []).forEach(([row, col]) => cells.add(row * 3 + col)));
      this.win = { hits: this.hits, cells, t0: performance.now() / 1000 };
      this.flash = 0.5;
      cells.forEach((k) => this.burst(Math.floor(k / 3), k % 3, 14));
    }
    const cb = this.onComplete;
    this.onComplete = null;
    if (cb) cb();
  }

  // ---------- loop ----------
  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.reels.forEach((r, c) => this.update(r, c, dt));
    this.draw(now / 1000, dt);
    requestAnimationFrame((t) => this.frame(t));
  }

  update(r, c, dt) {
    if (r.state === 'idle') return;
    r.t += dt;

    if (r.state === 'windup') {
      // Recuo curto antes de disparar, como a alavanca puxando o tambor
      const k = Math.max(0, Math.min(1, r.t / 0.14));
      r.pos = r.p0 + 0.22 * Math.sin((k * Math.PI) / 2);
      if (k >= 1) Object.assign(r, { state: 'spin', t: 0, speed: 0 });
    } else if (r.state === 'spin') {
      r.speed = Math.min(r.vmax, r.speed + r.vmax * dt * 5);
      r.pos -= r.speed * dt;
    } else if (r.state === 'stopping') {
      const k = Math.min(1, r.t / r.dur);
      r.pos = r.p0 - r.dist * (1 - Math.pow(1 - k, 3));
      r.speed = ((3 * r.dist) / r.dur) * Math.pow(1 - k, 2);
      if (k >= 1) {
        Object.assign(r, { state: 'bounce', t: 0, speed: 0 });
        this.onClunk(c);
      }
    } else if (r.state === 'bounce') {
      const k = Math.min(1, r.t / 0.2);
      r.pos = r.target - BOUNCE * Math.pow(1 - k, 2);
      if (k >= 1) {
        Object.assign(r, { state: 'idle', pos: mod(r.target, STRIP_LENGTH) });
        if (this.reels.every((x) => x.state === 'idle')) this.finish();
      }
    }
  }

  draw(time, dt) {
    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#140404';
    ctx.fillRect(0, 0, W, H);

    for (let c = 0; c < 3; c++) this.drawReel(c, time);
    if (this.teaseReel >= 0) this.drawTease(time);
    if (this.win) this.drawWin(time, dt);
    this.drawSparks(dt);

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 240, 200, ${this.flash})`;
      ctx.fillRect(0, 0, W, H);
      this.flash = Math.max(0, this.flash - dt * 2.5);
    }
  }

  drawReel(c, time) {
    const { ctx, H } = this;
    const r = this.reels[c];
    const x = this.reelX(c);
    const w = this.reelW;
    const size = this.symSize;
    const blur = r.speed > 9;
    const base = Math.floor(r.pos);
    const showWin = this.win && r.state === 'idle';

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, 0, w, H);
    ctx.clip();
    ctx.fillStyle = '#f7f0dc';
    ctx.fillRect(x, 0, w, H);

    for (let i = base - 1; i <= base + 4; i++) {
      const sTop = i - r.pos - VIEW;
      if (sTop > VIEW || sTop + 1 < -VIEW) continue;
      const y0 = this.proj(sTop);
      const y1 = this.proj(sTop + 1);
      const h = (y1 - y0) * (size / this.unit);
      const cy = (y0 + y1) / 2;
      const row = i - base;
      const hit = showWin && this.win.cells.has(row * 3 + c);
      const scale = hit ? 1 + 0.07 * Math.sin((time - this.win.t0) * 9) : 1;
      const img = SymbolRenderer.get(r.strip[mod(i, STRIP_LENGTH)], this.symPx, blur);
      ctx.drawImage(img, x + (w - size * scale) / 2, cy - (h * scale) / 2, size * scale, h * scale);
      if (showWin && !hit && row >= 0 && row < 3) {
        ctx.fillStyle = 'rgba(30, 8, 0, 0.45)';
        ctx.fillRect(x, y0, w, y1 - y0);
      }
    }

    ctx.fillStyle = this.shadeV;
    ctx.fillRect(x, 0, w, H);
    ctx.fillStyle = this.shadeH[c];
    ctx.fillRect(x, 0, w, H);
    ctx.restore();
  }

  drawTease(time) {
    const { ctx } = this;
    const x = this.reelX(this.teaseReel);
    ctx.save();
    ctx.strokeStyle = '#ffd34d';
    ctx.shadowColor = '#ff8a00';
    ctx.shadowBlur = 24;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 18);
    ctx.strokeRect(x + 2, 2, this.reelW - 4, this.H - 4);
    ctx.restore();
  }

  drawWin(time, dt) {
    const { ctx } = this;
    const t = time - this.win.t0;
    ctx.save();
    for (const hit of this.win.hits) {
      if (!hit.coords) continue;

      // Moldura dourada pulsante em cada célula premiada
      ctx.strokeStyle = '#ffd34d';
      ctx.shadowColor = '#ff9d00';
      ctx.shadowBlur = 16;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.65 + 0.35 * Math.sin(t * 9);
      for (const [row, col] of hit.coords) {
        const y0 = this.proj(row - 1.5);
        const y1 = this.proj(row - 0.5);
        ctx.beginPath();
        ctx.roundRect(this.reelX(col) + 3, y0 + 3, this.reelW - 6, y1 - y0 - 6, 10);
        ctx.stroke();
      }

      // Linha premiada tracejada correndo
      ctx.globalAlpha = 1;
      ctx.beginPath();
      hit.coords.forEach(([row, col], k) => {
        const px = this.reelX(col) + this.reelW / 2;
        const py = this.proj(row - 1);
        if (k) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
      ctx.lineWidth = 6;
      ctx.setLineDash([18, 10]);
      ctx.lineDashOffset = -t * 70;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 2;
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#fffbe6';
      ctx.stroke();
    }
    ctx.restore();

    // Brilhos contínuos nos primeiros segundos
    if (t < 2.5 && Math.random() < dt * 30) {
      const cells = [...this.win.cells];
      const k = pick(cells);
      this.burst(Math.floor(k / 3), k % 3, 1);
    }
  }

  burst(row, col, n) {
    const cx = this.reelX(col) + this.reelW / 2;
    const cy = this.proj(row - 1);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 40 + Math.random() * 160;
      this.sparks.push({
        x: cx + (Math.random() - 0.5) * this.reelW * 0.6,
        y: cy + (Math.random() - 0.5) * this.unit * 0.6,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 60,
        size: 3 + Math.random() * 5,
        life: 1,
        decay: 0.8 + Math.random() * 0.9
      });
    }
  }

  drawSparks(dt) {
    const { ctx } = this;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 220 * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.life > 0.5 ? '#fffbe6' : '#ffc533';
      ctx.translate(p.x, p.y);
      ctx.rotate(p.life * 4);
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        const d = k % 2 ? p.size * 0.3 : p.size;
        ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
      }
      ctx.fill();
      ctx.restore();
    }
  }
}

/**
 * Chuva / chafariz de moedas em tela cheia. Só roda enquanto houver moedas.
 */
class CoinRain {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.coins = [];
    this.running = false;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(window.innerWidth * dpr);
    this.canvas.height = Math.round(window.innerHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Moedas jorrando de (x, y) para cima, como saindo da bandeja. */
  fountain(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.coins.push({
        x, y,
        vx: (Math.random() - 0.5) * 420,
        vy: -(520 + Math.random() * 620),
        g: 1400,
        r: 6 + Math.random() * 6,
        spin: Math.random() * 6,
        spinV: 6 + Math.random() * 12,
        delay: (i / n) * 1.2
      });
    }
    this.start();
  }

  /** Moedas caindo do topo da tela. */
  rain(n) {
    for (let i = 0; i < n; i++) {
      this.coins.push({
        x: Math.random() * window.innerWidth,
        y: -30,
        vx: (Math.random() - 0.5) * 60,
        vy: 120 + Math.random() * 220,
        g: 320,
        r: 7 + Math.random() * 6,
        spin: Math.random() * 6,
        spinV: 4 + Math.random() * 8,
        delay: Math.random() * 2.2
      });
    }
    this.start();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const { ctx } = this;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (c.delay > 0) {
        c.delay -= dt;
        continue;
      }
      c.vy += c.g * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.spin += c.spinV * dt;
      if (c.y > window.innerHeight + 40) {
        this.coins.splice(i, 1);
        continue;
      }
      const sx = Math.max(0.12, Math.abs(Math.cos(c.spin)));
      ctx.fillStyle = '#a8690b';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.r * sx, c.r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = sx > 0.5 ? '#ffd24a' : '#e7a91f';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.r * sx * 0.78, c.r * 0.78, 0, 0, Math.PI * 2);
      ctx.fill();
      if (sx > 0.45) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.beginPath();
        ctx.ellipse(c.x - c.r * sx * 0.3, c.y - c.r * 0.35, c.r * sx * 0.18, c.r * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (this.coins.length) {
      requestAnimationFrame((t) => this.loop(t));
    } else {
      this.running = false;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }
}

window.SlotCanvas = SlotCanvas;
window.CoinRain = CoinRain;
