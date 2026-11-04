const walletService = require('../services/walletService');
const { db } = require('../config/database');
const env = require('../config/env');

class WebhookController {
  /**
   * Endpoint de Webhook oficial da SuitPay
   * POST /api/webhooks/suitpay
   */
  async handleSuitpayWebhook(req, res) {
    try {
      const payload = req.body;
      console.log('[Webhook Received from SuitPay]:', payload);

      // O identificador da transação é passado como requestNumber ou idTransaction
      const requestNumber = payload.requestNumber || payload.custom_id || payload.id;
      const status = (payload.statusTransaction || payload.status || '').toUpperCase();
      const idTransaction = payload.idTransaction || null;

      if (!requestNumber) {
        return res.status(400).json({ error: 'Identificador requestNumber ausente.' });
      }

      // Procura a transação no banco de dados
      const tx = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(requestNumber);
      if (!tx) {
        console.warn(`[Webhook Warning] Transação ${requestNumber} não encontrada no banco.`);
        return res.status(404).json({ error: 'Transação não encontrada.' });
      }

      // Se o status for de pagamento aprovado ('PAID', 'PAID_OUT', 'COMPLETED')
      if (['PAID', 'PAID_OUT', 'COMPLETED', 'CONFIRMED'].includes(status)) {
        const creditResult = walletService.creditDeposit(
          tx.id,
          tx.amount_cents,
          idTransaction
        );

        if (creditResult.alreadyProcessed) {
          console.log(`[Webhook Idempotency] Transação ${tx.id} já havia sido processada anteriormente.`);
          return res.status(200).json({ status: 'ALREADY_PROCESSED' });
        }

        console.log(`[Webhook Success] Depósito de R$ ${(tx.amount_cents / 100).toFixed(2)} creditado para o usuário ${tx.user_id}`);
        return res.status(200).json({ status: 'SUCCESS' });
      }

      return res.status(200).json({ status: 'IGNORED', message: `Status '${status}' não requer crédito.` });
    } catch (err) {
      console.error('[Webhook Error]:', err);
      return res.status(500).json({ error: 'Erro interno ao processar webhook.' });
    }
  }

  /**
   * Endpoint para simulação de pagamento em ambiente de testes/desenvolvimento
   * POST /api/webhooks/mock-pay
   */
  async handleMockPay(req, res) {
    if (!env.suitpay.enableMock && env.nodeEnv === 'production') {
      return res.status(403).json({ error: 'Mock desativado em produção.' });
    }

    try {
      const { requestNumber } = req.body;
      if (!requestNumber) {
        return res.status(400).json({ error: 'requestNumber obrigatório.' });
      }

      const tx = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(requestNumber);
      if (!tx) {
        return res.status(404).json({ error: 'Transação não encontrada.' });
      }

      const creditResult = walletService.creditDeposit(
        tx.id,
        tx.amount_cents,
        `mock_external_${Date.now()}`
      );

      return res.json({
        success: true,
        message: 'Depósito mock creditado com sucesso!',
        alreadyProcessed: creditResult.alreadyProcessed,
        amountFormatted: (tx.amount_cents / 100).toFixed(2)
      });
    } catch (err) {
      console.error('[Mock Pay Error]:', err);
      return res.status(400).json({ error: err.message });
    }
  }
}

module.exports = new WebhookController();

