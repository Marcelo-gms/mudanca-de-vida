/**
 * Arte vetorial dos símbolos (estilo fita de rolo física: traço escuro, volume dourado).
 * Cada símbolo é desenhado uma vez por tamanho e guardado em cache (versão nítida e com motion blur).
 */
const OUTLINE = '#3b1406';

const SymbolRenderer = {
  cache: new Map(),

  clear() {
    this.cache.clear();
  },

  /** Retorna um canvas quadrado de `px` pixels com o símbolo pronto para drawImage. */
  get(id, px, blur = false) {
    const key = `${id}|${px}|${blur ? 1 : 0}`;
    let out = this.cache.get(key);
    if (out) return out;

    out = document.createElement('canvas');
    out.width = out.height = px;
    const ctx = out.getContext('2d');

    if (blur) {
      // Motion blur vertical: cópias translúcidas deslocadas
      const sharp = this.get(id, px);
      ctx.globalAlpha = 0.22;
      for (let k = -4; k <= 4; k++) ctx.drawImage(sharp, 0, k * px * 0.045);
    } else {
      const tmp = document.createElement('canvas');
      tmp.width = tmp.height = px;
      this.paint(tmp.getContext('2d'), id, px);
      ctx.shadowColor = 'rgba(60, 20, 0, 0.45)';
      ctx.shadowBlur = px * 0.05;
      ctx.shadowOffsetY = px * 0.03;
      ctx.drawImage(tmp, 0, 0);
    }

    this.cache.set(key, out);
    return out;
  },

  /** Desenha o símbolo num <canvas> qualquer (usado na tabela de pagamentos). */
  drawTo(canvas, id) {
    const px = Math.round(canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2)) || 48;
    canvas.width = canvas.height = px;
    canvas.getContext('2d').drawImage(this.get(id, px), 0, 0);
  },

  paint(ctx, id, s) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = s * 0.028;
    switch (id) {
      case 'TIGRE': return this.tiger(ctx, s);
      case 'MOEDA': return this.coins(ctx, s);
      case 'BARRA': return this.goldBars(ctx, s);
      default: return this.orange(ctx, s);
    }
  },

  // ---------- primitivas ----------
  ellipse(ctx, x, y, rx, ry, fill, stroke = true, rot = 0) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) ctx.stroke();
  },

  poly(ctx, pts, fill) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  },

  sparkle(ctx, x, y, r) {
    ctx.save();
    ctx.fillStyle = '#fffbe6';
    ctx.shadowColor = '#fff3b0';
    ctx.shadowBlur = r;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const d = i % 2 ? r * 0.28 : r;
      ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    ctx.fill();
    ctx.restore();
  },

  gold(ctx, x0, y0, x1, y1) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, '#fff4b0');
    g.addColorStop(0.45, '#f6c442');
    g.addColorStop(1, '#a8640a');
    return g;
  },

  // ---------- símbolos ----------
  tiger(ctx, s) {
    const c = s / 2;

    // Medalhão dourado com fundo vermelho
    const ring = ctx.createRadialGradient(c, c * 0.8, s * 0.05, c, c, s * 0.46);
    ring.addColorStop(0, '#fff3b0');
    ring.addColorStop(0.55, '#f2b632');
    ring.addColorStop(1, '#a8650a');
    this.ellipse(ctx, c, c, s * 0.44, s * 0.44, ring);
    const red = ctx.createRadialGradient(c, c * 0.85, s * 0.04, c, c, s * 0.37);
    red.addColorStop(0, '#f0503c');
    red.addColorStop(1, '#8f1010');
    this.ellipse(ctx, c, c, s * 0.365, s * 0.365, red);

    const fur = ctx.createRadialGradient(c, c - s * 0.04, s * 0.03, c, c, s * 0.27);
    fur.addColorStop(0, '#ffc766');
    fur.addColorStop(0.6, '#f08a1c');
    fur.addColorStop(1, '#b8520a');

    // Orelhas
    for (const dx of [-1, 1]) {
      this.ellipse(ctx, c + dx * s * 0.2, c - s * 0.17, s * 0.085, s * 0.085, fur);
      this.ellipse(ctx, c + dx * s * 0.2, c - s * 0.165, s * 0.042, s * 0.042, '#f7a7b4', false);
    }

    // Cabeça
    this.ellipse(ctx, c, c + s * 0.03, s * 0.255, s * 0.225, fur);

    // Focinho branco
    this.ellipse(ctx, c - s * 0.068, c + s * 0.115, s * 0.088, s * 0.064, '#fff8ec', false);
    this.ellipse(ctx, c + s * 0.068, c + s * 0.115, s * 0.088, s * 0.064, '#fff8ec', false);
    this.ellipse(ctx, c, c + s * 0.175, s * 0.07, s * 0.045, '#fff8ec', false);

    // Listras
    ctx.save();
    ctx.strokeStyle = '#2a1204';
    ctx.lineWidth = s * 0.022;
    const stripe = (x0, y0, x1, y1) => {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    };
    stripe(c, c - s * 0.18, c, c - s * 0.1);
    stripe(c - s * 0.055, c - s * 0.17, c - s * 0.035, c - s * 0.11);
    stripe(c + s * 0.055, c - s * 0.17, c + s * 0.035, c - s * 0.11);
    for (const dx of [-1, 1]) {
      stripe(c + dx * s * 0.245, c - s * 0.01, c + dx * s * 0.165, c + s * 0.015);
      stripe(c + dx * s * 0.24, c + s * 0.06, c + dx * s * 0.17, c + s * 0.065);
      stripe(c + dx * s * 0.205, c - s * 0.09, c + dx * s * 0.15, c - s * 0.06);
    }
    ctx.restore();

    // Olhos
    for (const dx of [-1, 1]) {
      const ex = c + dx * s * 0.095;
      const ey = c - s * 0.02;
      this.ellipse(ctx, ex, ey, s * 0.056, s * 0.04, '#d9f27a', true, dx * -0.25);
      this.ellipse(ctx, ex, ey, s * 0.015, s * 0.033, '#111', false);
      this.ellipse(ctx, ex - s * 0.012, ey - s * 0.012, s * 0.008, s * 0.008, '#fff', false);
    }

    // Nariz e boca
    ctx.beginPath();
    ctx.moveTo(c - s * 0.04, c + s * 0.06);
    ctx.quadraticCurveTo(c, c + s * 0.05, c + s * 0.04, c + s * 0.06);
    ctx.lineTo(c, c + s * 0.11);
    ctx.closePath();
    ctx.fillStyle = '#e0567a';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(c, c + s * 0.11);
    ctx.lineTo(c, c + s * 0.14);
    ctx.moveTo(c - s * 0.05, c + s * 0.15);
    ctx.quadraticCurveTo(c - s * 0.02, c + s * 0.16, c, c + s * 0.14);
    ctx.quadraticCurveTo(c + s * 0.02, c + s * 0.16, c + s * 0.05, c + s * 0.15);
    ctx.lineWidth = s * 0.016;
    ctx.stroke();
    ctx.lineWidth = s * 0.028;

    // Faixa WILD
    const bx = c - s * 0.3;
    const by = s * 0.735;
    const bw = s * 0.6;
    const bh = s * 0.17;
    this.poly(ctx, [[bx - s * 0.06, by + s * 0.03], [bx + s * 0.04, by + s * 0.03], [bx + s * 0.04, by + bh + s * 0.03], [bx - s * 0.06, by + bh + s * 0.03], [bx - s * 0.02, by + bh / 2 + s * 0.03]], '#8f1010');
    this.poly(ctx, [[bx + bw + s * 0.06, by + s * 0.03], [bx + bw - s * 0.04, by + s * 0.03], [bx + bw - s * 0.04, by + bh + s * 0.03], [bx + bw + s * 0.06, by + bh + s * 0.03], [bx + bw + s * 0.02, by + bh / 2 + s * 0.03]], '#8f1010');
    const band = ctx.createLinearGradient(0, by, 0, by + bh);
    band.addColorStop(0, '#ff4a3a');
    band.addColorStop(1, '#a3130f');
    this.poly(ctx, [[bx, by], [bx + bw, by], [bx + bw, by + bh], [bx, by + bh]], band);
    ctx.font = `${Math.round(s * 0.13)}px Bungee, Impact, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = s * 0.03;
    ctx.strokeText('WILD', c, by + bh / 2 + s * 0.008);
    ctx.fillStyle = this.gold(ctx, 0, by, 0, by + bh);
    ctx.fillText('WILD', c, by + bh / 2 + s * 0.008);
  },

  coins(ctx, s) {
    const c = s / 2;
    const coin = (x, y, r) => {
      this.ellipse(ctx, x, y, r, r, this.gold(ctx, x - r, y - r, x + r, y + r));
      ctx.save();
      ctx.strokeStyle = '#a86b0b';
      ctx.lineWidth = r * 0.08;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.76, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      // Furo quadrado (moeda chinesa) e marcas
      const h = r * 0.2;
      this.poly(ctx, [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]], '#5a1d06');
      ctx.fillStyle = '#a86b0b';
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        ctx.fillRect(x + dx * r * 0.47 - r * 0.07, y + dy * r * 0.47 - r * 0.07, r * 0.14, r * 0.14);
      }
      // Brilho
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = r * 0.09;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.88, Math.PI * 1.1, Math.PI * 1.45);
      ctx.stroke();
      ctx.restore();
    };
    coin(c - s * 0.16, c - s * 0.1, s * 0.2);
    coin(c + s * 0.17, c - s * 0.11, s * 0.19);
    coin(c, c + s * 0.1, s * 0.27);
    this.sparkle(ctx, c + s * 0.31, c - s * 0.3, s * 0.08);
    this.sparkle(ctx, c - s * 0.3, c + s * 0.2, s * 0.05);
  },

  goldBars(ctx, s) {
    const c = s / 2;
    const ingot = (x, y, w, h) => {
      const d = h * 0.5;
      const front = ctx.createLinearGradient(0, y - h, 0, y);
      front.addColorStop(0, '#ffe27a');
      front.addColorStop(0.5, '#d99c1e');
      front.addColorStop(1, '#8f5506');
      this.poly(ctx, [[x, y], [x + w, y], [x + w * 0.9, y - h], [x + w * 0.1, y - h]], front);
      const top = ctx.createLinearGradient(0, y - h - d, 0, y - h);
      top.addColorStop(0, '#fff8d2');
      top.addColorStop(1, '#f2c445');
      this.poly(ctx, [[x + w * 0.1, y - h], [x + w * 0.9, y - h], [x + w * 0.8, y - h - d], [x + w * 0.2, y - h - d]], top);
      // Selo gravado
      ctx.save();
      ctx.strokeStyle = 'rgba(110, 60, 4, 0.7)';
      ctx.lineWidth = s * 0.012;
      ctx.strokeRect(x + w * 0.3, y - h * 0.72, w * 0.4, h * 0.42);
      ctx.restore();
    };
    const w = s * 0.37;
    const h = s * 0.16;
    const base = s * 0.8;
    ingot(c - w - s * 0.01, base, w, h);
    ingot(c + s * 0.01, base, w, h);
    ingot(c - w / 2, base - h - h * 0.3, w, h);
    this.sparkle(ctx, c + s * 0.25, s * 0.3, s * 0.08);
    this.sparkle(ctx, c - s * 0.33, s * 0.5, s * 0.05);
  },

  orange(ctx, s) {
    const c = s / 2;
    const r = s * 0.31;
    const cy = c + s * 0.06;

    const body = ctx.createRadialGradient(c - r * 0.35, cy - r * 0.4, r * 0.05, c, cy, r);
    body.addColorStop(0, '#ffd99e');
    body.addColorStop(0.45, '#ff9a1f');
    body.addColorStop(0.85, '#e2630a');
    body.addColorStop(1, '#b4470a');
    this.ellipse(ctx, c, cy, r, r * 0.95, body);

    // Textura de casca
    ctx.fillStyle = 'rgba(160, 60, 0, 0.25)';
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4;
      const d = r * (0.35 + ((i * 37) % 10) / 18);
      ctx.beginPath();
      ctx.arc(c + Math.cos(a) * d, cy + Math.sin(a) * d * 0.95, s * 0.008, 0, Math.PI * 2);
      ctx.fill();
    }
    this.ellipse(ctx, c - r * 0.38, cy - r * 0.45, r * 0.24, r * 0.13, 'rgba(255, 255, 255, 0.6)', false, -0.6);

    // Cabinho e folha
    ctx.beginPath();
    ctx.moveTo(c, cy - r * 0.9);
    ctx.quadraticCurveTo(c + s * 0.01, cy - r * 1.1, c + s * 0.03, cy - r * 1.2);
    ctx.lineWidth = s * 0.03;
    ctx.strokeStyle = '#5b3a12';
    ctx.stroke();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = s * 0.028;

    const lx = c + s * 0.03;
    const ly = cy - r * 1.15;
    const leaf = ctx.createLinearGradient(lx, ly, lx + s * 0.24, ly - s * 0.1);
    leaf.addColorStop(0, '#7be04f');
    leaf.addColorStop(1, '#2f8a1f');
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.quadraticCurveTo(lx + s * 0.08, ly - s * 0.16, lx + s * 0.26, ly - s * 0.1);
    ctx.quadraticCurveTo(lx + s * 0.14, ly + s * 0.04, lx, ly);
    ctx.fillStyle = leaf;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(lx + s * 0.02, ly - s * 0.01);
    ctx.quadraticCurveTo(lx + s * 0.12, ly - s * 0.07, lx + s * 0.22, ly - s * 0.09);
    ctx.lineWidth = s * 0.012;
    ctx.strokeStyle = 'rgba(20, 70, 10, 0.8)';
    ctx.stroke();
  }
};

window.SymbolRenderer = SymbolRenderer;
