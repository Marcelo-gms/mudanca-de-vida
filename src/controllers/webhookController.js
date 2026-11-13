const walletService = require('../services/walletService');
const asaasService = require('../services/asaasService');
const { db } = require('../config/database');
const settingsService = require('../services/settingsService');
const env = require('../config/env');

const PAYMENT_PAID_EVENTS = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'];
const TRANSFER_EVENTS = ['TRANSFER_DONE', 'TRANSFER_FAILED', 'TRANSFER_CANCELLED'];

class WebhookController {
  /**
   * Endpoint de Webhook oficial do Asaas
   * POST /api/webhooks/asaas
   *
   * Formato do payload: { id, event: 'PAYMENT_RECEIVED', payment: {...} }
   * ou { id, event: 'TRANSFER_DONE', transfer: {...} }
   *
   * Defesas aplicadas:
   * 1. Token do webhook (header `asaas-access-token`) comparado com a configuração.
   * 2. Reconsulta do status real na API do Asaas antes de creditar/estornar.
   * 3. Crédito apenas de transações DEPOSIT, sempre pelo valor do banco (idempotente).
   * 4. Resposta 200 rápida: a fila de webhooks do Asaas pausa se o endpoint falhar.
   */
  async handleAsaasWebhook(req, res) {
    try {
      const config = settingsService.getAsaasConfig();

      // 1. Validação do token do webhook
      const receivedToken = req.headers['asaas-access-token'] || '';
      if (config.webhookToken) {
        if (receivedToken !== config.webhookToken) {
          console.warn('[Webhook Security] Token do webhook Asaas inválido. Requisição rejeitada.');
          return res.status(401).json({ error: 'Token de autenticação do webhook inválido.' });
        }
      } else if (!config.isMock && env.nodeEnv === 'production') {
        // Produção sem token configurado: não aceita webhook sem autenticação
        console.error('[Webhook Security] asaas_webhook_token não configurado em produção. Webhook rejeitado.');
        return res.status(401).json({ error: 'Webhook sem token configurado no servidor.' });
      }

      const event = String(req.body?.event || '').toUpperCase();
      console.log(`[Webhook Asaas] Evento recebido: ${event}`);

      if (req.body?.payment) {
        return this.handlePaymentEvent(event, req.body.payment, config, res);
      }

      if (req.body?.transfer) {
        return this.handleTransferEvent(event, req.body.transfer, config, res);
      }

      return res.status(200).json({ status: 'IGNORED', message: 'Evento sem payload de payment/transfer.' });
    } catch (err) {
      console.error('[Webhook Error]:', err);
      return res.status(500).json({ error: 'Erro interno ao processar webhook.' });
    }
  }

  /**
   * Eventos de cobrança (depósito Pix)
   */
  async handlePaymentEvent(event, payment, config, res) {
    if (!PAYMENT_PAID_EVENTS.includes(event)) {
      return res.status(200).json({ status: 'IGNORED', message: `Evento '${event}' não requer crédito.` });
    }

    // externalReference = txId interno; payment.id = referência externa salva
    const tx = db.prepare(`
      SELECT * FROM transactions
      WHERE id = ? OR external_reference = ?
    `).get(payment.externalReference || '', payment.id || '');

    if (!tx) {
      console.warn(`[Webhook Warning] Cobrança ${payment.id} não encontrada no banco.`);
      return res.status(200).json({ status: 'IGNORED', message: 'Transação não encontrada.' });
    }

    // Webhooks de cobrança só podem creditar depósitos
    if (tx.type !== 'DEPOSIT') {
      console.log(`[Webhook] Transação ${tx.id} é do tipo ${tx.type}; nenhum crédito aplicado.`);
      return res.status(200).json({ status: 'IGNORED', message: 'Webhook não é de depósito.' });
    }

    if (tx.status === 'COMPLETED') {
      return res.status(200).json({ status: 'ALREADY_PROCESSED' });
    }

    // Defesa em profundidade: reconsulta o status real da cobrança no Asaas
    if (!config.isMock) {
      const paymentId = tx.external_reference || payment.id;
      if (!paymentId) {
        console.warn(`[Webhook Security] Transação ${tx.id} sem referência externa; crédito negado.`);
        return res.status(200).json({ status: 'IGNORED', message: 'Transação sem referência externa para validação.' });
      }
      let remotePayment;
      try {
        remotePayment = await asaasService.getPayment(paymentId);
      } catch (verifyErr) {
        console.error('[Webhook Security] Falha ao verificar cobrança no Asaas:', verifyErr.message);
        // 500 => o Asaas reenvia o webhook depois; não credita sem confirmar
        return res.status(500).json({ error: 'Não foi possível validar a cobrança no gateway. Tente novamente.' });
      }
      if (!asaasService.isPaymentPaid(remotePayment)) {
        console.warn(`[Webhook Security] Status real no Asaas é '${remotePayment?.status}'; crédito negado para ${tx.id}.`);
        return res.status(200).json({ status: 'IGNORED', message: 'Pagamento ainda não confirmado no gateway.' });
      }
    }

    const creditResult = walletService.creditDeposit(tx.id, tx.amount_cents, payment.id || null);

    if (creditResult.alreadyProcessed) {
      console.log(`[Webhook Idempotency] Transação ${tx.id} já havia sido processada anteriormente.`);
      return res.status(200).json({ status: 'ALREADY_PROCESSED' });
    }

    console.log(`[Webhook Success] Depósito Asaas de R$ ${(tx.amount_cents / 100).toFixed(2)} creditado para o usuário ${tx.user_id}`);
    return res.status(200).json({ status: 'SUCCESS' });
  }

  /**
   * Eventos de transferência (conciliação de saques Pix pendentes)
   */
  async handleTransferEvent(event, transfer, config, res) {
    if (!TRANSFER_EVENTS.includes(event)) {
      return res.status(200).json({ status: 'IGNORED', message: `Evento '${event}' não requer conciliação.` });
    }

    const tx = db.prepare(`
      SELECT * FROM transactions
      WHERE external_reference = ? AND type = 'WITHDRAWAL'
    `).get(transfer.id || '');

    if (!tx) {
      console.warn(`[Webhook Warning] Transferência ${transfer.id} não vinculada a nenhum saque.`);
      return res.status(200).json({ status: 'IGNORED', message: 'Saque não encontrado.' });
    }

    if (tx.status !== 'PENDING') {
      return res.status(200).json({ status: 'ALREADY_PROCESSED' });
    }

    // Reconsulta o status real antes de concluir ou estornar
    let remoteStatus = String(transfer.status || '').toUpperCase();
    if (!config.isMock) {
      try {
        const remoteTransfer = await asaasService.getTransfer(transfer.id);
        remoteStatus = String(remoteTransfer?.status || '').toUpperCase();
      } catch (verifyErr) {
        console.error('[Webhook Security] Falha ao verificar transferência no Asaas:', verifyErr.message);
        return res.status(500).json({ error: 'Não foi possível validar a transferência no gateway. Tente novamente.' });
      }
    }

    if (remoteStatus === 'DONE') {
      walletService.finalizeWithdrawal(tx.id, true, transfer.id);
      console.log(`[Webhook Success] Saque ${tx.id} confirmado via TRANSFER_DONE.`);
      return res.status(200).json({ status: 'SUCCESS' });
    }

    if (['FAILED', 'CANCELLED'].includes(remoteStatus)) {
      walletService.finalizeWithdrawal(tx.id, false, transfer.id, `Transferência ${remoteStatus} no Asaas.`);
      console.log(`[Webhook] Saque ${tx.id} estornado (transferência ${remoteStatus}).`);
      return res.status(200).json({ status: 'REFUNDED' });
    }

    return res.status(200).json({ status: 'IGNORED', message: `Status '${remoteStatus}' ainda em processamento.` });
  }

  /**
   * Endpoint para simulação de pagamento em ambiente de testes/desenvolvimento
   * POST /api/webhooks/mock-pay (exige login; bloqueado em produção)
   */
  async handleMockPay(req, res) {
    if (env.nodeEnv === 'production') {
      return res.status(403).json({ error: 'Mock desativado em produção.' });
    }

    const config = settingsService.getAsaasConfig();
    if (!config.isMock) {
      return res.status(403).json({ error: 'Mock desativado: gateway em modo real.' });
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

      // Mock só pode confirmar depósito do próprio usuário logado (ou admin)
      if (req.user && req.user.role !== 'admin' && tx.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Transação não pertence ao usuário autenticado.' });
      }

      const creditResult = walletService.creditDeposit(
        tx.id,
        tx.amount_cents,
        `mock_asaas_${Date.now()}`
      );

      return res.json({
        success: true,
        message: 'Depósito mock Asaas creditado com sucesso!',
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
