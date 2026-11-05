/**
 * Login/cadastro: mini rolos em modo atração e botão de mostrar senha.
 */
(() => {
  const reels = document.querySelectorAll('.mini-reel');

  // Fita vertical com 5 casas (a última repete a primeira para o loop ficar contínuo)
  function paintStrip() {
    if (!reels.length || !window.SymbolRenderer) return;
    const px = Math.round(reels[0].clientWidth * Math.min(window.devicePixelRatio || 1, 2));
    const order = ['TIGRE', 'MOEDA', 'BARRA', 'LARANJA', 'TIGRE'];
    const strip = document.createElement('canvas');
    strip.width = px;
    strip.height = px * order.length;
    const ctx = strip.getContext('2d');
    order.forEach((id, i) => {
      const band = ctx.createLinearGradient(0, i * px, 0, (i + 1) * px);
      band.addColorStop(0, '#f2b93c');
      band.addColorStop(0.5, '#fff6d6');
      band.addColorStop(1, '#f2b93c');
      ctx.fillStyle = band;
      ctx.fillRect(0, i * px, px, px);
      ctx.drawImage(SymbolRenderer.get(id, Math.round(px * 0.86)), px * 0.07, i * px + px * 0.07);
    });
    const url = `url(${strip.toDataURL()})`;
    reels.forEach((r) => { r.style.backgroundImage = url; });
  }

  paintStrip();
  if (document.fonts) {
    document.fonts.load('20px Bungee').then(() => {
      SymbolRenderer.clear();
      paintStrip();
    });
  }

  document.querySelectorAll('[data-toggle-password]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.togglePassword);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Ocultar' : 'Mostrar';
      btn.setAttribute('aria-pressed', String(show));
    });
  });
})();
