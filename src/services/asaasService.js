const axios = require('axios');
const { db } = require('../config/database');
const settingsService = require('./settingsService');
const mockAsaasService = require('./mockAsaasService');

/**
 * Cliente do gateway Asaas (API v3).
 *
 * Convenções importantes:
 * - O banco do projeto trabalha em CENTAVOS (inteiro); o Asaas trabalha em
 *   REAIS (decimal). Toda conversão acontece exclusivamente neste arquivo.
 * - Autenticação: header `access_token`.
 * - Erros ambíguos (timeout, queda de rede, 5xx) são marcados com
 *   `err.ambiguous = true` para o chamador NÃO estornar automaticamente.
 */

const PAID_PAYMENT_STATUSES = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];

function centsToReais(amountCents) {
  return Number((amountCents / 100).toFixed(2));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function buildError(error, fallbackMsg) {
  const apiErrors = error.response?.data?.errors;
  const msg = (Array.isArray(apiErrors) && apiErrors[0]?.description)
    || error.response?.data?.message
    || error.message
    || fallbackMsg;
  const err = new Error(msg);
  const status = error.response?.status;
  err.ambiguous = !error.response || error.code === 'ECONNABORTED' || status >= 500;
  return err;
}

class AsaasService {
  getConfig() {
    return settingsService.getAsaasConfig();
  }

  isMock(config = this.getConfig()) {
    return config.isMock || !config.apiKey;
  }

  getHeaders(config) {
    return {
      'access_token': config.apiKey,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'tigrinho2-backend'
    };
  }

  /**
   * Garante que o usuário possui um customer no Asaas e retorna o id.
   * O id é persistido em users.asaas_customer_id para reuso.
   */
  async ensureCustomer(user, config = this.getConfig()) {
    if (user.asaas_customer_id) {
      return user.asaas_customer_id;
    }

    try {
      const response = await axios.post(`${config.urlBase}/customers`, {
        name: user.name,
        cpfCnpj: (user.document || '').replace(/\D/g, ''),
        externalReference: user.id,
        notificationDisabled: true
      }, { headers: this.getHeaders(config), timeout: 12000 });

      const customerId = response.data?.id;
      if (!customerId) {
        throw new Error('Asaas não retornou o id do cliente.');
      }

      db.prepare('UPDATE users SET asaas_customer_id = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(customerId, user.id);

      return customerId;
    } catch (error) {
      if (error.response || error.request) {
        console.error('[Asaas Error - customers]:', error.response?.data || error.message);
        throw buildError(error, 'Falha ao registrar cliente no Asaas.');
      }
      throw error;
    }
  }

  /**
   * Cash-in: cria cobrança Pix e retorna QR Code + copia-e-cola.
   * Fluxo: POST /payments (billingType PIX) → GET /payments/{id}/pixQrCode
   */
  async requestPixCashIn({ user, amountCents, txId }) {
    const config = this.getConfig();

    if (this.isMock(config)) {
      return mockAsaasService.requestPixCashIn({ amountCents, txId });
    }

    const customerId = await this.ensureCustomer(user, config);

    let payment;
    try {
      const response = await axios.post(`${config.urlBase}/payments`, {
        customer: customerId,
        billingType: 'PIX',
        value: centsToReais(amountCents),
        dueDate: todayISO(),
        description: 'Depósito Tigrinho da Sorte',
        externalReference: txId
      }, { headers: this.getHeaders(config), timeout: 12000 });
      payment = response.data;
    } catch (error) {
      console.error('[Asaas Error - payments]:', error.response?.data || error.message);
      throw buildError(error, 'Falha ao criar cobrança Pix no Asaas.');
    }

    try {
      const qrResponse = await axios.get(`${config.urlBase}/payments/${payment.id}/pixQrCode`, {
        headers: this.getHeaders(config),
        timeout: 12000
      });
      const qr = qrResponse.data;

      let qrCodeBase64 = qr.encodedImage || '';
      if (qrCodeBase64 && !qrCodeBase64.startsWith('data:')) {
        qrCodeBase64 = `data:image/png;base64,${qrCodeBase64}`;
      }

      return {
        id: payment.id,
        status: payment.status,
        qr_code: qr.payload,
        qr_code_base64: qrCodeBase64,
        expirationDate: qr.expirationDate || null
      };
    } catch (error) {
      console.error('[Asaas Error - pixQrCode]:', error.response?.data || error.message);
      throw buildError(error, 'Cobrança criada, mas falhou ao gerar o QR Code Pix.');
    }
  }

  /**
   * Cash-out: transferência Pix para a chave CPF do titular.
   * Endpoint: POST /transfers (operationType PIX)
   */
  async requestPixCashOut({ amountCents, pixKey, receiverDocument }) {
    const config = this.getConfig();
    const cleanKey = (pixKey || '').replace(/\D/g, '');

    if (this.isMock(config)) {
      return mockAsaasService.requestPixCashOut({ amountCents, pixKey: cleanKey });
    }

    try {
      const response = await axios.post(`${config.urlBase}/transfers`, {
        value: centsToReais(amountCents),
        operationType: 'PIX',
        pixAddressKey: cleanKey,
        pixAddressKeyType: 'CPF',
        description: 'Saque Tigrinho da Sorte'
      }, { headers: this.getHeaders(config), timeout: 15000 });

      return response.data;
    } catch (error) {
      console.error('[Asaas Error - transfers]:', error.response?.data || error.message);
      throw buildError(error, 'Falha ao processar saque Pix no Asaas.');
    }
  }

  /**
   * Consulta uma cobrança para validar webhooks antes de creditar.
   * Endpoint: GET /payments/{id}
   */
  async getPayment(paymentId) {
    const config = this.getConfig();

    if (this.isMock(config)) {
      return mockAsaasService.getPayment(paymentId);
    }

    const response = await axios.get(`${config.urlBase}/payments/${encodeURIComponent(paymentId)}`, {
      headers: this.getHeaders(config),
      timeout: 10000
    });
    return response.data;
  }

  /**
   * Consulta uma transferência (saque) para conciliação de webhooks.
   * Endpoint: GET /transfers/{id}
   */
  async getTransfer(transferId) {
    const config = this.getConfig();

    if (this.isMock(config)) {
      return mockAsaasService.getTransfer(transferId);
    }

    const response = await axios.get(`${config.urlBase}/transfers/${encodeURIComponent(transferId)}`, {
      headers: this.getHeaders(config),
      timeout: 10000
    });
    return response.data;
  }

  isPaymentPaid(payment) {
    return PAID_PAYMENT_STATUSES.includes(String(payment?.status || '').toUpperCase());
  }

  /**
   * Health check de conectividade/credencial (consulta leve, sem efeito colateral).
   */
  async testConnection() {
    const config = this.getConfig();

    if (this.isMock(config)) {
      return {
        success: true,
        mode: 'MOCK',
        message: 'Modo Mock ativo. Respostas simuladas localmente com sucesso.'
      };
    }

    try {
      const response = await axios.get(`${config.urlBase}/customers?limit=1`, {
        headers: this.getHeaders(config),
        timeout: 8000
      });

      return {
        success: true,
        mode: `REAL (${config.urlBase.includes('sandbox') ? 'Sandbox' : 'Produção'})`,
        message: 'Conexão e autenticação estabelecidas com sucesso no Asaas!',
        data: { totalCustomers: response.data?.totalCount ?? 0 }
      };
    } catch (error) {
      return {
        success: false,
        mode: 'REAL',
        statusCode: error.response?.status,
        message: error.response?.data?.errors?.[0]?.description || error.message || 'Falha de autenticação com o Asaas.'
      };
    }
  }
}

module.exports = new AsaasService();
