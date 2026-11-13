const { v4: uuidv4 } = require('uuid');
const walletService = require('../services/walletService');
const asaasService = require('../services/asaasService');
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
        JSON.stringify({ requestedAt: new Date().toISOString(), gateway: 'Asaas' })
      );

      // Dados completos do usuário (inclui asaas_customer_id para reuso de cliente)
      const fullUser = db.prepare(`
        SELECT id, name, document, email, asaas_customer_id FROM users WHERE id = ?
      `).get(req.user.id);

      // Solicita Cobrança Pix no Asaas
      let gatewayResponse;
      try {
        gatewayResponse = await asaasService.requestPixCashIn({
          user: fullUser,
          amountCents: parsedAmount,
          txId
        });
      } catch (gatewayErr) {
        // Não deixa transação PENDING órfã quando a gateway falha
        db.prepare(`
          UPDATE transactions
          SET status = 'FAILED', metadata = json_set(COALESCE(metadata, '{}'), '$.error', ?), updated_at = datetime('now')
          WHERE id = ?
        `).run(String(gatewayErr.message || 'Falha na gateway'), txId);
        throw gatewayErr;
      }

      // Salva referência externa do ID da cobrança no Asaas
      if (gatewayResponse?.id) {
        db.prepare(`
          UPDATE transactions
          SET external_reference = ?
          WHERE id = ?
        `).run(gatewayResponse.id, txId);
      }

      return res.json({
        success: true,
        transactionId: txId,
        externalId: gatewayResponse.id,
        amountFormatted: (parsedAmount / 100).toFixed(2),
        paymentCode: gatewayResponse.qr_code,
        paymentCodeBase64: gatewayResponse.qr_code_base64
      });
    } catch (err) {
      console.error('[Deposit Error]:', err);
      return res.status(400).json({ error: err.message || 'Falha ao gerar Pix para depósito via Asaas.' });
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

      // 1. Validações e bloqueio atômico com travas de CPF e Rollover (SecOps 4.1, 4.2 e 4.3)
      reservation = walletService.reserveWithdrawal(
        req.user.id,
        parsedAmount,
        pixKey,
        pixType
      );

      // 2. Dispara transferência Pix de Saque no Asaas
      const payoutResult = await asaasService.requestPixCashOut({
        amountCents: parsedAmount,
        pixKey: reservation.pixKey,
        receiverDocument: reservation.user.document.replace(/\D/g, '')
      });

      // 3. Concilia conforme o status real da transferência no Asaas
      const transferStatus = String(payoutResult?.status || '').toUpperCase();

      if (['FAILED', 'CANCELLED'].includes(transferStatus)) {
        walletService.finalizeWithdrawal(reservation.transactionId, false, payoutResult?.id || null, `Transferência ${transferStatus} no Asaas.`);
        return res.status(400).json({ success: false, error: 'A transferência Pix foi recusada pelo gateway. O valor foi estornado ao seu saldo.' });
      }

      if (transferStatus === 'DONE') {
        walletService.finalizeWithdrawal(reservation.transactionId, true, payoutResult?.id || null);
      } else {
        // PENDING / BANK_PROCESSING: guarda a referência e aguarda o webhook TRANSFER_DONE
        walletService.attachWithdrawalReference(reservation.transactionId, payoutResult?.id || null);
      }

      const updatedWallet = walletService.getUserWallet(req.user.id);

      return res.json({
        success: true,
        message: transferStatus === 'DONE'
          ? 'Saque processado com sucesso!'
          : 'Saque solicitado! A transferência Pix está em processamento.',
        transactionId: reservation.transactionId,
        newBalanceFormatted: updatedWallet.balanceFormatted
      });
    } catch (err) {
      console.error('[Withdraw Error]:', err.message);

      if (reservation?.transactionId) {
        if (err.ambiguous) {
          // Timeout/5xx: o Pix PODE ter sido enviado pela gateway.
          // Estornar aqui permitiria saque duplicado; mantém PENDING para revisão manual.
          walletService.flagWithdrawalForReview(reservation.transactionId, err.message);
          return res.status(202).json({
            success: false,
            pendingReview: true,
            error: 'Seu saque está em processamento. Se o valor não chegar em alguns minutos, contate o suporte.'
          });
        }
        // Recusa explícita da gateway (4xx): estorno atômico seguro
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
        SELECT id, type, amount_cents, status, created_at, external_reference
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
