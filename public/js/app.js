document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);
  const sfx = window.soundEngine;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const slotCanvas = new SlotCanvas('slotCanvas');
  const coinRain = new CoinRain('fxCanvas');

  // Elementos da interface
  const machine = $('machine');
  const balanceDisplay = $('balanceDisplay');
  const spinBtn = $('spinBtn');
  const lever = $('lever');
  const currentBetDisplay = $('currentBetDisplay');
  const presetBtns = document.querySelectorAll('.preset-btn');
  const turboToggleBtn = $('turboToggleBtn');
  const toggleAudioBtn = $('toggleAudioBtn');
  const lastWinDisplay = $('lastWinDisplay');
  const winBanner = $('winBanner');
  const winText = $('winText');
  const winAmount = $('winAmount');
  const tigerBonusAlert = $('tigerBonusAlert');
  const bigWin = $('bigWin');
  const srStatus = $('srStatus');

  const depositModal = $('depositModal');
  const withdrawModal = $('withdrawModal');
  const historyModal = $('historyModal');

  // Estado local
  let balanceCents = parseInt(document.body.dataset.balance, 10) || 0;
  let currentBetCents = 100;
  const betLevels = [50, 100, 200, 500, 1000, 2000, 5000];
  let isSpinning = false;
  let isTurbo = false;
  let depositPollingInterval = null;
  let currentPendingDepositId = null;
  let presentationTimer = null;
  const rolls = new Set();

  const brl = (cents) => 'R$ ' + (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function setBalance(cents) {
    balanceDisplay.textContent = brl(cents);
  }

  // Contador rolante (estilo display de máquina). Retorna uma função que pula para o fim.
  function roll(els, from, to, ms, tick = false) {
    const start = performance.now();
    let raf = 0;
    let lastTick = 0;
    const paint = (v) => els.forEach((el) => { el.textContent = brl(v); });
    const finish = () => {
      cancelAnimationFrame(raf);
      paint(to);
      rolls.delete(finish);
    };
    const step = (now) => {
      const k = Math.min(1, (now - start) / ms);
      paint(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 2))));
      if (tick && now - lastTick > 70) {
        sfx.playCoin();
        lastTick = now;
      }
      if (k < 1) raf = requestAnimationFrame(step);
      else finish();
    };
    rolls.add(finish);
    raf = requestAnimationFrame(step);
    return finish;
  }

  function toast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    $('toastStack').append(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3600);
  }

  // Encerra qualquer celebração em andamento (girar de novo pula a animação, como numa máquina real)
  function endPresentation() {
    rolls.forEach((finish) => finish());
    clearTimeout(presentationTimer);
    winBanner.classList.remove('show');
    tigerBonusAlert.classList.remove('show');
    bigWin.classList.remove('show', 'mega');
    bigWin.setAttribute('aria-hidden', 'true');
    machine.classList.remove('is-win', 'is-bigwin');
  }

  function pullLever() {
    lever.classList.remove('pull');
    void lever.offsetWidth; // reinicia a animação
    lever.classList.add('pull');
  }

  function coinsFromTray(n) {
    if (reduceMotion) return;
    const r = $('coinTray').getBoundingClientRect();
    coinRain.fountain(r.left + r.width / 2, r.top + r.height / 2, n);
  }

  // ---------- Aposta ----------
  function updateBetDisplay() {
    currentBetDisplay.textContent = brl(currentBetCents);
    presetBtns.forEach((btn) => {
      btn.classList.toggle('active', parseInt(btn.dataset.bet, 10) === currentBetCents);
    });
  }

  function stepBet(dir) {
    if (isSpinning) return;
    const idx = betLevels.indexOf(currentBetCents) + dir;
    if (idx < 0 || idx >= betLevels.length) return;
    sfx.playClick();
    currentBetCents = betLevels[idx];
    updateBetDisplay();
  }

  $('betMinusBtn').addEventListener('click', () => stepBet(-1));
  $('betPlusBtn').addEventListener('click', () => stepBet(1));
  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (isSpinning) return;
      sfx.playClick();
      currentBetCents = parseInt(btn.dataset.bet, 10);
      updateBetDisplay();
    });
  });

  turboToggleBtn.addEventListener('click', () => {
    isTurbo = !isTurbo;
    turboToggleBtn.classList.toggle('active', isTurbo);
    turboToggleBtn.setAttribute('aria-pressed', String(isTurbo));
    slotCanvas.setTurbo(isTurbo);
    sfx.playClick();
  });

  toggleAudioBtn.addEventListener('click', () => {
    const enabled = sfx.toggle();
    toggleAudioBtn.classList.toggle('muted', !enabled);
    toggleAudioBtn.setAttribute('aria-pressed', String(enabled));
  });

  // ---------- Giro ----------
  async function spin() {
    if (isSpinning) return;
    isSpinning = true;
    spinBtn.disabled = true;
    endPresentation();

    const balanceBefore = balanceCents;
    pullLever();
    sfx.playLever();
    machine.classList.add('is-spinning');
    lastWinDisplay.textContent = brl(0);
    setBalance(Math.max(0, balanceBefore - currentBetCents)); // crédito sai na hora, como na máquina
    slotCanvas.startSpin();

    try {
      const response = await fetch('/api/game/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ betCents: currentBetCents, clientSeed: 'client_' + Date.now() })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Erro ao girar.');

      slotCanvas.stopSpin(data.spin.matrix, data.spin.hits, () => {
        machine.classList.remove('is-spinning');
        balanceCents = data.newBalanceCents;
        presentResult(data.spin);
        isSpinning = false;
        spinBtn.disabled = false;
      });
    } catch (err) {
      slotCanvas.abortSpin(() => {
        machine.classList.remove('is-spinning');
        isSpinning = false;
        spinBtn.disabled = false;
      });
      setBalance(balanceBefore);
      toast(err.message || 'Falha ao processar o giro.', 'error');
      refreshWallet();
    }
  }

  function presentResult(result) {
    if (!result.isWin) {
      setBalance(balanceCents);
      srStatus.textContent = 'Sem prêmio nesta rodada.';
      return;
    }

    const payout = result.payoutCents;
    const tier = result.multiplier >= 20 ? 'mega' : result.multiplier >= 5 ? 'big' : 'small';
    const ms = { small: 900, big: 2600, mega: 4200 }[tier];
    srStatus.textContent = `Você ganhou ${brl(payout)}!`;
    machine.classList.add('is-win');

    if (tier === 'small') {
      winText.textContent = 'Você ganhou!';
      winBanner.classList.add('show');
      roll([lastWinDisplay, winAmount], 0, payout, ms, true);
      sfx.playWin();
      coinsFromTray(16);
    } else {
      $('bigWinTitle').textContent = tier === 'mega' ? 'Mega vitória!' : 'Grande vitória!';
      bigWin.classList.add('show');
      bigWin.classList.toggle('mega', tier === 'mega');
      bigWin.setAttribute('aria-hidden', 'false');
      if (!reduceMotion) machine.classList.add('is-bigwin');
      roll([lastWinDisplay, $('bigWinAmount')], 0, payout, ms, true);
      sfx.playBigWin();
      coinsFromTray(tier === 'mega' ? 45 : 25);
      if (tier === 'mega' && !reduceMotion) coinRain.rain(30);
    }

    if (result.fortuneTigerBonus) {
      tigerBonusAlert.classList.add('show');
      if (tier === 'small') sfx.playBigWin();
    }

    // Crédito sobe depois que o prêmio termina de contar
    const cancelCredit = () => {
      clearTimeout(creditTimer);
      rolls.delete(cancelCredit);
      setBalance(balanceCents);
    };
    const creditTimer = setTimeout(() => {
      rolls.delete(cancelCredit);
      roll([balanceDisplay], balanceCents - payout, balanceCents, 600);
    }, ms);
    rolls.add(cancelCredit);
    presentationTimer = setTimeout(endPresentation, ms + 2200);
  }

  spinBtn.addEventListener('click', spin);
  lever.addEventListener('click', spin);
  bigWin.addEventListener('click', endPresentation);

  // ---------- Modais ----------
  function openModal(modal) {
    modal.classList.add('active');
    sfx.playClick();
  }

  function closeModal(modal) {
    modal.classList.remove('active');
    if (depositPollingInterval) {
      clearInterval(depositPollingInterval);
      depositPollingInterval = null;
    }
  }

  document.querySelectorAll('.modal-close').forEach((btn) => {
    btn.addEventListener('click', () => closeModal($(btn.dataset.close)));
  });
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(overlay); });
  });

  // Teclado: Espaço gira, Esc fecha
  document.addEventListener('keydown', (e) => {
    const openModalEl = document.querySelector('.modal-overlay.active');
    if (e.key === 'Escape') {
      if (openModalEl) closeModal(openModalEl);
      else endPresentation();
      return;
    }
    if (e.code !== 'Space' || openModalEl || e.repeat) return;
    if (e.target.closest('button, input, textarea, select, a')) return;
    e.preventDefault();
    spin();
  });

  // ---------- Depósito ----------
  $('openDepositBtn').addEventListener('click', () => {
    $('depositFormStep').style.display = 'block';
    $('pixResultStep').style.display = 'none';
    openModal(depositModal);
  });

  const depPresetBtns = document.querySelectorAll('.dep-preset-btn');
  const customDepositInput = $('customDepositInput');
  depPresetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      depPresetBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      customDepositInput.value = btn.dataset.amount;
    });
  });

  const generatePixBtn = $('generatePixBtn');
  generatePixBtn.addEventListener('click', async () => {
    const amountVal = parseFloat(customDepositInput.value);
    if (isNaN(amountVal) || amountVal < 5) {
      toast('O valor mínimo para depósito é de R$ 5,00', 'error');
      return;
    }

    generatePixBtn.disabled = true;
    generatePixBtn.textContent = 'GERANDO PIX...';

    try {
      const res = await fetch('/api/wallet/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents: Math.round(amountVal * 100) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar Pix');

      currentPendingDepositId = data.transactionId;
      $('pixQrCodeImg').src = data.paymentCodeBase64;
      $('pixCodeInput').value = data.paymentCode;
      $('depositFormStep').style.display = 'none';
      $('pixResultStep').style.display = 'block';
      startDepositPolling(data.transactionId);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      generatePixBtn.disabled = false;
      generatePixBtn.textContent = 'GERAR PIX COPIA E COLA';
    }
  });

  const copyPixBtn = $('copyPixBtn');
  copyPixBtn.addEventListener('click', () => {
    const input = $('pixCodeInput');
    input.select();
    navigator.clipboard.writeText(input.value);
    copyPixBtn.textContent = 'COPIADO COM SUCESSO! ✅';
    setTimeout(() => { copyPixBtn.textContent = 'COPIAR CHAVE PIX'; }, 2000);
  });

  const simularPagamentoBtn = $('simularPagamentoBtn');
  if (simularPagamentoBtn) {
    simularPagamentoBtn.addEventListener('click', async () => {
      if (!currentPendingDepositId) return;
      simularPagamentoBtn.disabled = true;
      simularPagamentoBtn.textContent = 'Confirmando pagamento...';

      try {
        const res = await fetch('/api/webhooks/mock-pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestNumber: currentPendingDepositId })
        });
        const data = await res.json();
        if (data.success) {
          toast(`Pagamento Pix de R$ ${data.amountFormatted} confirmado!`, 'success');
          await refreshWallet();
          closeModal(depositModal);
          coinsFromTray(20);
        }
      } catch (err) {
        toast('Falha ao simular: ' + err.message, 'error');
      } finally {
        simularPagamentoBtn.disabled = false;
        simularPagamentoBtn.textContent = 'Simular Pagamento Instantâneo (Dev)';
      }
    });
  }

  function startDepositPolling(txId) {
    if (depositPollingInterval) clearInterval(depositPollingInterval);

    depositPollingInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/wallet/transactions');
        const data = await res.json();
        if (data.success && data.transactions) {
          const match = data.transactions.find((t) => t.id === txId && t.status === 'COMPLETED');
          if (match) {
            clearInterval(depositPollingInterval);
            await refreshWallet();
            toast(`Pix confirmado! R$ ${match.amountFormatted} já disponível.`, 'success');
            closeModal(depositModal);
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 2500);
  }

  // ---------- Saque ----------
  $('openWithdrawBtn').addEventListener('click', async () => {
    await refreshWallet();
    $('withdrawErrorMsg').style.display = 'none';
    openModal(withdrawModal);
  });

  const confirmWithdrawBtn = $('confirmWithdrawBtn');
  confirmWithdrawBtn.addEventListener('click', async () => {
    const amountVal = parseFloat($('withdrawAmountInput').value);
    const pixKey = $('withdrawPixKey').value;
    const errorBox = $('withdrawErrorMsg');

    if (isNaN(amountVal) || amountVal < 10) {
      errorBox.textContent = 'O valor mínimo para saque é de R$ 10,00';
      errorBox.style.display = 'block';
      return;
    }

    confirmWithdrawBtn.disabled = true;
    confirmWithdrawBtn.textContent = 'PROCESSANDO SAQUE...';
    errorBox.style.display = 'none';

    try {
      const res = await fetch('/api/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents: Math.round(amountVal * 100), pixKey, pixType: 'CPF' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Erro ao solicitar saque.');

      toast('Saque realizado! O valor foi enviado via Pix.', 'success');
      await refreshWallet();
      closeModal(withdrawModal);
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.style.display = 'block';
    } finally {
      confirmWithdrawBtn.disabled = false;
      confirmWithdrawBtn.textContent = 'SOLICITAR SAQUE';
    }
  });

  // ---------- Carteira ----------
  async function refreshWallet() {
    try {
      const res = await fetch('/api/wallet/me');
      const data = await res.json();
      if (!data.success || !data.wallet) return;

      const { wallet } = data;
      balanceCents = wallet.balanceCents;
      if (!isSpinning) setBalance(balanceCents);
      $('withdrawAvailBalance').textContent = wallet.balanceFormatted;

      $('rolloverStatusText').textContent = `${wallet.rollover.progressPercent}%`;
      $('rolloverProgressFill').style.width = `${wallet.rollover.progressPercent}%`;
      if (wallet.rollover.isMet) {
        $('rolloverHint').textContent = '✅ Rollover cumprido! Saque 100% liberado.';
        confirmWithdrawBtn.disabled = false;
      } else {
        const rem = (wallet.rollover.remainingCents / 100).toFixed(2);
        $('rolloverHint').textContent = `⚠️ Faltam apostar R$ ${rem} para liberar o saque.`;
        confirmWithdrawBtn.disabled = true;
      }
    } catch (err) {
      console.error('Error refreshing wallet:', err);
    }
  }

  // ---------- Histórico & Provably Fair ----------
  $('openHistoryBtn').addEventListener('click', async () => {
    openModal(historyModal);
    const tbody = $('historyTableBody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Carregando...</td></tr>';

    try {
      const res = await fetch('/api/game/history');
      const data = await res.json();

      if (data.success && data.history.length > 0) {
        tbody.innerHTML = data.history.map((row) => `
          <tr>
            <td>${new Date(row.created_at).toLocaleTimeString('pt-BR')}</td>
            <td>${brl(row.bet_cents)}</td>
            <td class="${row.payout_cents > 0 ? 'td-win' : ''}">${brl(row.payout_cents)}</td>
            <td>${row.multiplier > 0 ? row.multiplier + 'x' : '-'}</td>
            <td><code title="${row.server_seed_hash}">${row.server_seed_hash.substring(0, 16)}...</code></td>
          </tr>
        `).join('');
      } else {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum giro realizado ainda.</td></tr>';
      }
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="5" class="td-error">Erro ao carregar histórico.</td></tr>';
    }
  });

  // ---------- Inicialização ----------
  setBalance(balanceCents);
  updateBetDisplay();
  const drawPaytable = () => {
    document.querySelectorAll('canvas[data-sym]').forEach((cv) => SymbolRenderer.drawTo(cv, cv.dataset.sym));
  };
  drawPaytable();
  let paytableTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(paytableTimer);
    paytableTimer = setTimeout(drawPaytable, 150);
  });
  // A faixa WILD usa a fonte Bungee: redesenha quando ela terminar de carregar
  if (document.fonts) {
    document.fonts.load('20px Bungee').then(() => {
      SymbolRenderer.clear();
      drawPaytable();
    });
  }
});
