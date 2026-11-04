/**
 * Controlador de Animação e Física dos Rolos em HTML5 Canvas
 */
class SlotCanvas {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.width = this.canvas.width;
    this.height = this.canvas.height;

    this.cols = 3;
    this.rows = 3;
    this.cellW = this.width / this.cols;
    this.cellH = this.height / this.rows;

    // Matriz visual atual
    this.currentMatrix = [
      ['LARANJA', 'MOEDA', 'LARANJA'],
      ['TIGRE', 'TIGRE', 'TIGRE'],
      ['BARRA', 'LARANJA', 'BARRA']
    ];

    // Estados dos 3 rolos
    this.reels = [
      { offset: 0, speed: 0, spinning: false, targetSymbols: ['LARANJA', 'TIGRE', 'BARRA'] },
      { offset: 0, speed: 0, spinning: false, targetSymbols: ['MOEDA', 'TIGRE', 'LARANJA'] },
      { offset: 0, speed: 0, spinning: false, targetSymbols: ['LARANJA', 'TIGRE', 'BARRA'] }
    ];

    this.allSymbolsPool = ['TIGRE', 'MOEDA', 'BARRA', 'LARANJA'];
    this.winningHits = [];
    this.particles = [];
    this.isSpinning = false;
    this.isTurbo = false;

    // Inicia loop de renderização a 60 FPS
    this.render = this.render.bind(this);
    requestAnimationFrame(this.render);
  }

  setTurbo(turbo) {
    this.isTurbo = turbo;
  }

  startSpin() {
    this.isSpinning = true;
    this.winningHits = [];
    this.particles = [];

    const baseSpeed = this.isTurbo ? 35 : 22;

    this.reels.forEach((reel, i) => {
      reel.spinning = true;
      reel.speed = baseSpeed + i * 2;
      reel.offset = 0;
    });
  }

  stopSpin(matrixResult, hitsResult, onComplete) {
    // Define os símbolos de parada para cada rolo (colunas da matriz)
    for (let c = 0; c < 3; c++) {
      this.reels[c].targetSymbols = [
        matrixResult[0][c].id,
        matrixResult[1][c].id,
        matrixResult[2][c].id
      ];
    }

    const stopDelay = this.isTurbo ? 100 : 250;

    // Parada sequencial: Rolo 1 -> Rolo 2 -> Rolo 3
    this.reels.forEach((reel, i) => {
      setTimeout(() => {
        reel.spinning = false;
        if (window.soundEngine) window.soundEngine.playReelStop();

        if (i === 2) {
          // Último rolo parou
          this.isSpinning = false;
          this.currentMatrix = [
            [this.reels[0].targetSymbols[0], this.reels[1].targetSymbols[0], this.reels[2].targetSymbols[0]],
            [this.reels[0].targetSymbols[1], this.reels[1].targetSymbols[1], this.reels[2].targetSymbols[1]],
            [this.reels[0].targetSymbols[2], this.reels[1].targetSymbols[2], this.reels[2].targetSymbols[2]]
          ];
          this.winningHits = hitsResult || [];

          if (this.winningHits.length > 0) {
            this.spawnWinParticles();
          }

          if (onComplete) onComplete();
        }
      }, (i + 1) * stopDelay);
    });
  }

  spawnWinParticles() {
    for (let i = 0; i < 40; i++) {
      this.particles.push({
        x: this.width / 2,
        y: this.height / 2,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12 - 3,
        size: Math.random() * 6 + 3,
        color: ['#fbbf24', '#f59e0b', '#ef4444', '#10b981'][Math.floor(Math.random() * 4)],
        life: 1.0,
        decay: Math.random() * 0.03 + 0.015
      });
    }
  }

  render() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Fundo dos rolos
    this.ctx.fillStyle = '#140303';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Divisórias dos 3 rolos
    this.ctx.strokeStyle = 'rgba(245, 158, 11, 0.2)';
    this.ctx.lineWidth = 2;
    for (let c = 1; c < this.cols; c++) {
      this.ctx.beginPath();
      this.ctx.moveTo(c * this.cellW, 0);
      this.ctx.lineTo(c * this.cellW, this.height);
      this.ctx.stroke();
    }

    // Desenha cada rolo
    for (let c = 0; c < this.cols; c++) {
      const reel = this.reels[c];
      const x = c * this.cellW;

      if (reel.spinning) {
        reel.offset = (reel.offset + reel.speed) % this.cellH;

        // Desenha símbolos contínuos em movimento
        for (let r = -1; r <= this.rows; r++) {
          const y = r * this.cellH + reel.offset;
          const fakeSymbol = this.allSymbolsPool[(Math.floor((Date.now() / 40) + r + c * 3)) % this.allSymbolsPool.length];
          SymbolRenderer.drawSymbol(this.ctx, fakeSymbol, x + 2, y + 2, this.cellW - 4, false);
        }
      } else {
        // Rolo parado: desenha os símbolos finais
        for (let r = 0; r < this.rows; r++) {
          const y = r * this.cellH;
          const symbolId = this.currentMatrix[r][c];

          // Verifica se a célula faz parte de alguma linha vencedora
          const isHit = this.winningHits.some(h =>
            h.coords && h.coords.some(([hr, hc]) => hr === r && hc === c)
          );

          SymbolRenderer.drawSymbol(this.ctx, symbolId, x + 2, y + 2, this.cellW - 4, isHit);
        }
      }
    }

    // Desenha linhas de pagamento premiadas conectando as células
    if (!this.isSpinning && this.winningHits.length > 0) {
      this.drawWinningPaylines();
    }

    // Atualiza e desenha partículas de celebração
    this.renderParticles();

    requestAnimationFrame(this.render);
  }

  drawWinningPaylines() {
    this.ctx.save();
    this.ctx.lineWidth = 4;
    this.ctx.strokeStyle = '#fbbf24';
    this.ctx.shadowColor = '#f59e0b';
    this.ctx.shadowBlur = 15;

    for (const hit of this.winningHits) {
      if (!hit.coords || hit.coords.length < 3) continue;

      this.ctx.beginPath();
      hit.coords.forEach(([r, c], idx) => {
        const cx = c * this.cellW + this.cellW / 2;
        const cy = r * this.cellH + this.cellH / 2;
        if (idx === 0) {
          this.ctx.moveTo(cx, cy);
        } else {
          this.ctx.lineTo(cx, cy);
        }
      });
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  renderParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2; // gravidade
      p.life -= p.decay;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.globalAlpha = p.life;
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }
  }
}

window.SlotCanvas = SlotCanvas;

