/**
 * Utilidades do painel admin: toasts, trilho dos sliders, símbolos do jogo e modais.
 */
(() => {
  const stack = document.createElement('div');
  stack.className = 'toast-stack';
  stack.setAttribute('role', 'status');
  stack.setAttribute('aria-live', 'polite');
  document.body.append(stack);

  window.adminToast = (message, type = 'info') => {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    stack.append(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3600);
  };

  // Recarrega depois do toast aparecer
  window.reloadSoon = () => setTimeout(() => location.reload(), 900);

  // Sliders com a parte preenchida em dourado
  document.querySelectorAll('.admin-slider').forEach((s) => {
    const paint = () => s.style.setProperty('--fill', `${((s.value - s.min) / (s.max - s.min)) * 100}%`);
    paint();
    s.addEventListener('input', paint);
  });

  // Símbolos do jogo desenhados com a mesma arte dos rolos
  const syms = document.querySelectorAll('canvas[data-sym]');
  if (syms.length && window.SymbolRenderer) {
    const draw = () => syms.forEach((c) => SymbolRenderer.drawTo(c, c.dataset.sym));
    draw();
    if (document.fonts) {
      document.fonts.load('20px Bungee').then(() => {
        SymbolRenderer.clear();
        draw();
      });
    }
  }

  // Modais: Esc e clique fora fecham
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.active').forEach((m) => m.classList.remove('active'));
  });
  document.querySelectorAll('.modal-overlay').forEach((o) => {
    o.addEventListener('click', (e) => { if (e.target === o) o.classList.remove('active'); });
  });
})();
