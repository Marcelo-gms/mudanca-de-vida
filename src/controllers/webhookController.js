const walletService = require('../services/walletService');
const { db } = require('../config/database');
const settingsService = require('../services/settingsService');
const env = require('../config/env');

class WebhookController {
  /**
   * Endpoint de Webhook oficial da PushinPay
   * POST /api/webhooks/pushinpay (ou /api/webhooks/suitpay para compatibilidade)
   */
  async handlePushinpayWebhook(req, res) {
    try {
      const payload = req.body;
      console.log('[Webhook Received from PushinPay]:', payload);

      // O identificador da transação é passado no campo 'id' da PushinPay
      const externalId = payload.id || payload.transaction_id || payload.requestNumber;
      const status = (payload.status || payload.statusTransaction || '').toLowerCase();
      const endToEndId = payload.end_to_end_id || null;

      if (!externalId) {
        return res.status(400).json({ error: 'Identificador id ausente no payload.' });
      }

      // Procura a transação no banco de dados por external_reference ou pelo ID interno
      const tx = db.prepare(`
        SELECT * FROM transactions
        WHERE external_reference = ? OR id = ?
      `).get(externalId, externalId);

      if (!tx) {
        console.warn(`[Webhook Warning] Transação ${externalId} não encontrada no banco.`);
        return res.status(404).json({ error: 'Transação não encontrada.' });
      }

      // Se o status for de pagamento aprovado ('paid' no PushinPay)
      if (['paid', 'completed', 'confirmed'].includes(status)) {
        const creditResult = walletService.creditDeposit(
          tx.id,
          tx.amount_cents,
          endToEndId || externalId
        );

        if (creditResult.alreadyProcessed) {
          console.log(`[Webhook Idempotency] Transação ${tx.id} já havia sido processada anteriormente.`);
          return res.status(200).json({ status: 'ALREADY_PROCESSED' });
        }

        console.log(`[Webhook Success] Depósito PushinPay de R$ ${(tx.amount_cents / 100).toFixed(2)} creditado para o usuário ${tx.user_id}`);
        return res.status(200).json({ status: 'SUCCESS' });
      }

      return res.status(200).json({ status: 'IGNORED', message: `Status '${status}' não requer crédito.` });
    } catch (err) {
      console.error('[Webhook Error]:', err);
      return res.status(500).json({ error: 'Erro interno ao processar webhook.' });
    }
  }

  // Compatibilidade com método antigo
  async handleSuitpayWebhook(req, res) {
    return this.handlePushinpayWebhook(req, res);
  }

  /**
   * Endpoint para simulação de pagamento em ambiente de testes/desenvolvimento
   * POST /api/webhooks/mock-pay
   */
  async handleMockPay(req, res) {
    const config = settingsService.getPushinpayConfig();
    if (!config.isMock && env.nodeEnv === 'production') {
      return res.status(403).json({ error: 'Mock desativado em produção.' });
    }

    try {
      const { requestNumber, id } = req.body;
      const txIdOrRef = requestNumber || id;

      if (!txIdOrRef) {
        return res.status(400).json({ error: 'Identificador da transação obrigatório.' });
      }

      const tx = db.prepare(`
        SELECT * FROM transactions
        WHERE id = ? OR external_reference = ?
      `).get(txIdOrRef, txIdOrRef);

      if (!tx) {
        return res.status(404).json({ error: 'Transação não encontrada.' });
      }

      const creditResult = walletService.creditDeposit(
        tx.id,
        tx.amount_cents,
        `mock_pushin_${Date.now()}`
      );

      return res.json({
        success: true,
        message: 'Depósito mock PushinPay creditado com sucesso!',
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
