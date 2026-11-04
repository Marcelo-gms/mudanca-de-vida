document.addEventListener('DOMContentLoaded', () => {
  // Inicialização do Canvas do Jogo
  const slotCanvas = new SlotCanvas('slotCanvas');

  // Elementos da Interface
  const balanceDisplay = document.getElementById('balanceDisplay');
  const spinBtn = document.getElementById('spinBtn');
  const currentBetDisplay = document.getElementById('currentBetDisplay');
  const betMinusBtn = document.getElementById('betMinusBtn');
  const betPlusBtn = document.getElementById('betPlusBtn');
  const presetBtns = document.querySelectorAll('.preset-btn');
  const turboToggleBtn = document.getElementById('turboToggleBtn');
  const toggleAudioBtn = document.getElementById('toggleAudioBtn');
  const lastWinDisplay = document.getElementById('lastWinDisplay');
  const winBanner = document.getElementById('winBanner');
  const winText = document.getElementById('winText');
  const winAmount = document.getElementById('winAmount');
  const tigerBonusAlert = document.getElementById('tigerBonusAlert');

  // Modais
  const openDepositBtn = document.getElementById('openDepositBtn');
  const depositModal = document.getElementById('depositModal');
  const openWithdrawBtn = document.getElementById('openWithdrawBtn');
  const withdrawModal = document.getElementById('withdrawModal');
  const openHistoryBtn = document.getElementById('openHistoryBtn');
  const historyModal = document.getElementById('historyModal');
  const modalCloseBtns = document.querySelectorAll('.modal-close');

  // Estado Local
  let currentBetCents = 100; // R$ 1,00
  const betLevels = [50, 100, 200, 500, 1000, 2000, 5000];
  let isSpinning = false;
  let isTurbo = false;
  let depositPollingInterval = null;
  let currentPendingDepositId = null;

  // Atualiza exibição da aposta
  function updateBetDisplay() {
    currentBetDisplay.textContent = `R$ ${(currentBetCents / 100).toFixed(2)}`;
    presetBtns.forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.bet, 10) === currentBetCents);
    });
  }

  // Seletor de Apostas
  betMinusBtn.addEventListener('click', () => {
    if (isSpinning) return;
    if (window.soundEngine) window.soundEngine.playClick();
    const idx = betLevels.indexOf(currentBetCents);
    if (idx > 0) {
      currentBetCents = betLevels[idx - 1];
      updateBetDisplay();
    }
  });

  betPlusBtn.addEventListener('click', () => {
    if (isSpinning) return;
    if (window.soundEngine) window.soundEngine.playClick();
    const idx = betLevels.indexOf(currentBetCents);
    if (idx < betLevels.length - 1) {
      currentBetCents = betLevels[idx + 1];
      updateBetDisplay();
    }
  });

  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (isSpinning) return;
      if (window.soundEngine) window.soundEngine.playClick();
      currentBetCents = parseInt(btn.dataset.bet, 10);
      updateBetDisplay();
    });
  });

  // Toggle Turbo
  turboToggleBtn.addEventListener('click', () => {
    isTurbo = !isTurbo;
    turboToggleBtn.classList.toggle('active', isTurbo);
    slotCanvas.setTurbo(isTurbo);
    if (window.soundEngine) window.soundEngine.playClick();
  });

  // Toggle Áudio
  toggleAudioBtn.addEventListener('click', () => {
    if (window.soundEngine) {
      const enabled = window.soundEngine.toggle();
      toggleAudioBtn.textContent = enabled ? '🔊' : '🔇';
    }
  });

  // Giro dos Rolos
  spinBtn.addEventListener('click', async () => {
    if (isSpinning) return;
    isSpinning = true;
    spinBtn.disabled = true;

    // Oculta alertas de vitória anteriores
    winBanner.classList.remove('show');
    tigerBonusAlert.style.display = 'none';

    // Inicia animação visual dos rolos imediatamente
    slotCanvas.startSpin();
    if (window.soundEngine) window.soundEngine.playSpinTick();

    try {
      const response = await fetch('/api/game/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          betCents: currentBetCents,
          clientSeed: 'client_' + Date.now()
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erro ao girar.');
      }

      // Para os rolos com os símbolos retornados pelo CSPRNG do servidor
      slotCanvas.stopSpin(data.spin.matrix, data.spin.hits, () => {
        // Atualiza saldo na tela
        balanceDisplay.textContent = `R$ ${data.newBalanceFormatted}`;

        // Trata premiação
        if (data.spin.isWin) {
          const winFormatted = `R$ ${(data.spin.payoutCents / 100).toFixed(2)}`;
          lastWinDisplay.textContent = winFormatted;
          winAmount.textContent = winFormatted;

          if (data.spin.multiplier >= 20) {
            winText.textContent = 'MEGA VITÓRIA!';
            if (window.soundEngine) window.soundEngine.playBigWin();
          } else if (data.spin.multiplier >= 5) {
            winText.textContent = 'GRANDE VITÓRIA!';
            if (window.soundEngine) window.soundEngine.playBigWin();
          } else {
            winText.textContent = 'VOCÊ GANHOU!';
            if (window.soundEngine) window.soundEngine.playWin();
          }

          winBanner.classList.add('show');
          setTimeout(() => winBanner.classList.remove('show'), 3500);
        }

        // Feature do Tigre da Sorte
        if (data.spin.fortuneTigerBonus) {
          tigerBonusAlert.style.display = 'block';
          if (window.soundEngine) window.soundEngine.playBigWin();
          setTimeout(() => { tigerBonusAlert.style.display = 'none'; }, 4000);
        }

        isSpinning = false;
        spinBtn.disabled = false;
      });

    } catch (err) {
      alert(err.message || 'Falha ao processar o giro.');
      slotCanvas.isSpinning = false;
      isSpinning = false;
      spinBtn.disabled = false;
    }
  });

  // Controle de Modais
  function openModal(modal) {
    modal.classList.add('active');
    if (window.soundEngine) window.soundEngine.playClick();
  }

  function closeModal(modal) {
    modal.classList.remove('active');
    if (depositPollingInterval) {
      clearInterval(depositPollingInterval);
      depositPollingInterval = null;
    }
  }

  modalCloseBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.close;
      closeModal(document.getElementById(targetId));
    });
  });

  // Modal Depósito
  openDepositBtn.addEventListener('click', () => {
    document.getElementById('depositFormStep').style.display = 'block';
    document.getElementById('pixResultStep').style.display = 'none';
    openModal(depositModal);
  });

  // Presets de depósito
  const depPresetBtns = document.querySelectorAll('.dep-preset-btn');
  const customDepositInput = document.getElementById('customDepositInput');
  depPresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      depPresetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      customDepositInput.value = btn.dataset.amount;
    });
  });

  // Geração de Pix para Depósito (SuitPay)
  const generatePixBtn = document.getElementById('generatePixBtn');
  generatePixBtn.addEventListener('click', async () => {
    const amountVal = parseFloat(customDepositInput.value);
    if (isNaN(amountVal) || amountVal < 5) {
      alert('O valor mínimo para depósito é de R$ 5,00');
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

      document.getElementById('pixQrCodeImg').src = data.paymentCodeBase64;
      document.getElementById('pixCodeInput').value = data.paymentCode;

      document.getElementById('depositFormStep').style.display = 'none';
      document.getElementById('pixResultStep').style.display = 'block';

      // Inicia polling para atualizar o saldo assim que o Pix for aprovado
      startDepositPolling(data.transactionId);

    } catch (err) {
      alert(err.message);
    } finally {
      generatePixBtn.disabled = false;
      generatePixBtn.textContent = 'GERAR PIX COPIA E COLA';
    }
  });

  // Copiar código Pix
  const copyPixBtn = document.getElementById('copyPixBtn');
  copyPixBtn.addEventListener('click', () => {
    const input = document.getElementById('pixCodeInput');
    input.select();
    navigator.clipboard.writeText(input.value);
    copyPixBtn.textContent = 'COPIADO COM SUCESSO! ✅';
    setTimeout(() => { copyPixBtn.textContent = 'COPIAR CHAVE PIX'; }, 2000);
  });

  // Simular Pagamento Instantâneo (Dev Mode)
  const simularPagamentoBtn = document.getElementById('simularPagamentoBtn');
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
          alert(`✅ Pagamento Pix de R$ ${data.amountFormatted} confirmado com sucesso!`);
          await refreshWallet();
          closeModal(depositModal);
        }
      } catch (err) {
        alert('Falha ao simular: ' + err.message);
      } finally {
        simularPagamentoBtn.disabled = false;
        simularPagamentoBtn.textContent = 'Simular Pagamento Instantâneo (Dev)';
      }
    });
  }

  // Polling de detecção do pagamento Pix
  function startDepositPolling(txId) {
    if (depositPollingInterval) clearInterval(depositPollingInterval);

    depositPollingInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/wallet/transactions');
        const data = await res.json();
        if (data.success && data.transactions) {
          const match = data.transactions.find(t => t.id === txId && t.status === 'COMPLETED');
          if (match) {
            clearInterval(depositPollingInterval);
            await refreshWallet();
            alert(`🎉 Pix confirmado! Seu depósito de R$ ${match.amountFormatted} já está disponível.`);
            closeModal(depositModal);
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 2500);
  }

  // Modal Saque
  openWithdrawBtn.addEventListener('click', async () => {
    await refreshWallet();
    document.getElementById('withdrawErrorMsg').style.display = 'none';
    openModal(withdrawModal);
  });

  const confirmWithdrawBtn = document.getElementById('confirmWithdrawBtn');
  confirmWithdrawBtn.addEventListener('click', async () => {
    const amountVal = parseFloat(document.getElementById('withdrawAmountInput').value);
    const pixKey = document.getElementById('withdrawPixKey').value;
    const errorBox = document.getElementById('withdrawErrorMsg');

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
        body: JSON.stringify({
          amountCents: Math.round(amountVal * 100),
          pixKey,
          pixType: 'CPF'
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao solicitar saque.');
      }

      alert('🎉 Saque realizado com sucesso! O valor foi enviado via Pix.');
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

  // Atualiza informações da Carteira
  async function refreshWallet() {
    try {
      const res = await fetch('/api/wallet/me');
      const data = await res.json();
      if (data.success && data.wallet) {
        balanceDisplay.textContent = `R$ ${data.wallet.balanceFormatted}`;
        const availSpan = document.getElementById('withdrawAvailBalance');
        if (availSpan) availSpan.textContent = data.wallet.balanceFormatted;

        // Atualiza Rollover
        const rolloverText = document.getElementById('rolloverStatusText');
        const rolloverFill = document.getElementById('rolloverProgressFill');
        const rolloverHint = document.getElementById('rolloverHint');
        const withdrawBtn = document.getElementById('confirmWithdrawBtn');

        if (rolloverText) rolloverText.textContent = `${data.wallet.rollover.progressPercent}%`;
        if (rolloverFill) rolloverFill.style.width = `${data.wallet.rollover.progressPercent}%`;

        if (rolloverHint) {
          if (data.wallet.rollover.isMet) {
            rolloverHint.innerHTML = '✅ Rollover cumprido! Saque 100% liberado.';
            if (withdrawBtn) withdrawBtn.disabled = false;
          } else {
            const remFormatted = (data.wallet.rollover.remainingCents / 100).toFixed(2);
            rolloverHint.innerHTML = `⚠️ Faltam apostar R$ ${remFormatted} para liberar o saque.`;
            if (withdrawBtn) withdrawBtn.disabled = true;
          }
        }
      }
    } catch (err) {
      console.error('Error refreshing wallet:', err);
    }
  }

  // Modal Histórico & Provably Fair
  openHistoryBtn.addEventListener('click', async () => {
    openModal(historyModal);
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Carregando...</td></tr>';

    try {
      const res = await fetch('/api/game/history');
      const data = await res.json();

      if (data.success && data.history.length > 0) {
        tbody.innerHTML = data.history.map(row => `
          <tr>
            <td>${new Date(row.created_at).toLocaleTimeString('pt-BR')}</td>
            <td>R$ ${row.betFormatted}</td>
            <td style="color:${row.payout_cents > 0 ? '#10b981' : '#fff'}; font-weight:bold;">
              R$ ${row.payoutFormatted}
            </td>
            <td>${row.multiplier > 0 ? row.multiplier + 'x' : '-'}</td>
            <td><code title="${row.server_seed_hash}" style="font-size:10px;">${row.server_seed_hash.substring(0, 16)}...</code></td>
          </tr>
        `).join('');
      } else {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum giro realizado ainda.</td></tr>';
      }
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#ef4444;">Erro ao carregar histórico.</td></tr>';
    }
  });
});

