/**
 * Renderizador de Símbolos Vetoriais em HTML5 Canvas para o Tigrinho
 */
const SymbolRenderer = {
  drawSymbol(ctx, symbolId, x, y, size, isHighlighted = false) {
    ctx.save();
    ctx.translate(x, y);

    const half = size / 2;

    // Fundo do Símbolo
    ctx.fillStyle = isHighlighted ? 'rgba(251, 191, 36, 0.25)' : 'rgba(25, 5, 5, 0.6)';
    ctx.strokeStyle = isHighlighted ? '#fbbf24' : 'rgba(245, 158, 11, 0.3)';
    ctx.lineWidth = isHighlighted ? 3 : 1;

    // Retângulo arredondado
    this.roundRect(ctx, 4, 4, size - 8, size - 8, 10);
    ctx.fill();
    ctx.stroke();

    if (isHighlighted) {
      // Glow effect
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 12;
    }

    switch (symbolId) {
      case 'TIGRE':
        this.drawTiger(ctx, half, half, size * 0.4);
        break;
      case 'MOEDA':
        this.drawCoinPot(ctx, half, half, size * 0.38);
        break;
      case 'BARRA':
        this.drawGoldBar(ctx, half, half, size * 0.38);
        break;
      case 'LARANJA':
      default:
        this.drawOrange(ctx, half, half, size * 0.38);
        break;
    }

    ctx.restore();
  },

  drawTiger(ctx, cx, cy, r) {
    // Cabeça do Tigre Dourado (Wild)
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
    grad.addColorStop(0, '#fef08a');
    grad.addColorStop(0.6, '#f59e0b');
    grad.addColorStop(1, '#b45309');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Orelhas
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(cx - r * 0.75, cy - r * 0.75, r * 0.35, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.75, cy - r * 0.75, r * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // Listras do Tigre
    ctx.fillStyle = '#450a0a';
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - r * 0.8);
    ctx.lineTo(cx + 4, cy - r * 0.8);
    ctx.lineTo(cx, cy - r * 0.4);
    ctx.fill();

    // Olhos
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, cy - r * 0.1, r * 0.18, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.35, cy - r * 0.1, r * 0.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(cx - r * 0.32, cy - r * 0.1, r * 0.09, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.32, cy - r * 0.1, r * 0.09, 0, Math.PI * 2);
    ctx.fill();

    // Focinho
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.35, r * 0.45, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Nariz Vermelho
    ctx.fillStyle = '#e11d48';
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy + r * 0.18);
    ctx.lineTo(cx + 5, cy + r * 0.18);
    ctx.lineTo(cx, cy + r * 0.32);
    ctx.fill();

    // Badge WILD
    ctx.fillStyle = '#dc2626';
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, cx - 22, cy + r * 0.7, 44, 14, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 9px Montserrat, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('WILD 50x', cx, cy + r * 0.7 + 7);
  },

  drawCoinPot(ctx, cx, cy, r) {
    // Pote de Moedas / Ouro Chinês
    const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
    grad.addColorStop(0, '#f59e0b');
    grad.addColorStop(0.5, '#fde68a');
    grad.addColorStop(1, '#d97706');

    // Lingote Sycee
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, r * 0.9, r * 0.45, 0, 0, Math.PI);
    ctx.fill();

    // Topo do Sycee
    ctx.beginPath();
    ctx.arc(cx, cy - 2, r * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Detalhe de Moeda
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.arc(cx, cy - 2, r * 0.18, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 9px Montserrat, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('10x', cx, cy + r * 0.85);
  },

  drawGoldBar(ctx, cx, cy, r) {
    // Barra de Ouro / Envelope Vermelho
    const w = r * 1.5;
    const h = r * 0.9;
    const x = cx - w / 2;
    const y = cy - h / 2;

    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, '#fef08a');
    grad.addColorStop(0.5, '#eab308');
    grad.addColorStop(1, '#854d0e');

    ctx.fillStyle = grad;
    this.roundRect(ctx, x, y, w, h, 6);
    ctx.fill();

    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#713f12';
    ctx.font = 'bold 10px Montserrat, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BAR 5x', cx, cy);
  },

  drawOrange(ctx, cx, cy, r) {
    // Laranja da Sorte
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r * 0.85);
    grad.addColorStop(0, '#fed7aa');
    grad.addColorStop(0.5, '#fb923c');
    grad.addColorStop(1, '#ea580c');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy + 2, r * 0.75, 0, Math.PI * 2);
    ctx.fill();

    // Folha verde da laranja
    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    ctx.ellipse(cx + 6, cy - r * 0.65, 8, 4, Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();

    // Caule
    ctx.fillStyle = '#78350f';
    ctx.fillRect(cx - 1, cy - r * 0.75, 3, 6);

    // Label
    ctx.fillStyle = '#fdba74';
    ctx.font = 'bold 9px Montserrat, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('2x', cx, cy + r * 0.85);
  },

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
};

window.SymbolRenderer = SymbolRenderer;

