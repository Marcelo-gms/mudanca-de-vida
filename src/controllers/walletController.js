const { v4: uuidv4 } = require('uuid');
const walletService = require('../services/walletService');
const suitpayService = require('../services/suitpayService');
const { db } = require('../config/database');

class WalletController {
  getWalletInfo(req, res) {
    try {
      const wallet = walletService.getUserWallet(req.user.id);
      return res.json({ success: true, wallet });
    } catch (err) {
      console.error('[Wallet Info Error]:', err);
      return res.status(500).json({ error: err.message || 'Erro ao consultar carteira.' });
    }
  }

  async deposit(req, res) {
    try {
      const { amountCents } = req.body;
      const parsedAmount = parseInt(amountCents, 10);

      if (isNaN(parsedAmount) || parsedAmount < 500) { // Mínimo R$ 5,00
        return res.status(400).json({ error: 'O valor mínimo para depósito é de R$ 5,00.' });
      }

      if (parsedAmount > 1000000) { // Máximo R$ 10.000,00
        return res.status(400).json({ error: 'O valor máximo para depósito é de R$ 10.000,00.' });
      }

      const txId = uuidv4();

      // Registra transação pendente no banco antes de solicitar o QR code
      db.prepare(`
        INSERT INTO transactions (id, user_id, type, amount_cents, status, metadata)
        VALUES (?, ?, 'DEPOSIT', ?, 'PENDING', ?)
      `).run(
        txId,
        req.user.id,
        parsedAmount,
        JSON.stringify({ requestedAt: new Date().toISOString() })
      );

      // Solicita QR Code na SuitPay
      const suitpayResponse = await suitpayService.requestPixQrCode({
        requestNumber: txId,
        amountCents: parsedAmount,
        user: req.user
      });

      // Salva referência externa da SuitPay
      if (suitpayResponse?.idTransaction) {
        db.prepare(`
          UPDATE transactions
          SET external_reference = ?
          WHERE id = ?
        `).run(suitpayResponse.idTransaction, txId);
      }

      return res.json({
        success: true,
        transactionId: txId,
        amountFormatted: (parsedAmount / 100).toFixed(2),
        paymentCode: suitpayResponse.paymentCode,
        paymentCodeBase64: suitpayResponse.paymentCodeBase64
      });
    } catch (err) {
      console.error('[Deposit Error]:', err);
      return res.status(400).json({ error: err.message || 'Falha ao gerar Pix para depósito.' });
    }
  }

  async withdraw(req, res) {
    let reservation = null;
    try {
      const { amountCents, pixKey, pixType } = req.body;
      const parsedAmount = parseInt(amountCents, 10);

      if (isNaN(parsedAmount) || parsedAmount < 1000) { // Mínimo R$ 10,00
        return res.status(400).json({ error: 'O valor mínimo para saque é de R$ 10,00.' });
      }

      // 1. Validações e bloqueio atômico com travas de CPF e Rollover
      reservation = walletService.reserveWithdrawal(
        req.user.id,
        parsedAmount,
        pixKey,
        pixType
      );

      // 2. Dispara pagamento na SuitPay
      const payoutResult = await suitpayService.requestPixPayment({
        key: reservation.pixKey,
        typeKey: reservation.pixType,
        amountCents: parsedAmount
      });

      // 3. Finaliza com sucesso
      walletService.finalizeWithdrawal(
        reservation.transactionId,
        true,
        payoutResult.idTransaction || null
      );

      const updatedWallet = walletService.getUserWallet(req.user.id);

      return res.json({
        success: true,
        message: 'Saque processado com sucesso!',
        transactionId: reservation.transactionId,
        newBalanceFormatted: updatedWallet.balanceFormatted
      });
    } catch (err) {
      console.error('[Withdraw Error]:', err.message);

      // Se a reserva chegou a ser feita e falhou no envio externo, efetua o estorno
      if (reservation?.transactionId) {
        walletService.finalizeWithdrawal(reservation.transactionId, false, null, err.message);
      }

      return res.status(400).json({
        success: false,
        error: err.message || 'Erro ao processar saque.'
      });
    }
  }

  getTransactions(req, res) {
    try {
      const txs = db.prepare(`
        SELECT id, type, amount_cents, status, created_at
        FROM transactions
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 25
      `).all(req.user.id);

      const formatted = txs.map(t => ({
        ...t,
        amountFormatted: (t.amount_cents / 100).toFixed(2)
      }));

      return res.json({ success: true, transactions: formatted });
    } catch (err) {
      console.error('[Transactions Error]:', err);
      return res.status(500).json({ error: 'Erro ao carregar transações.' });
    }
  }
}

module.exports = new WalletController();

