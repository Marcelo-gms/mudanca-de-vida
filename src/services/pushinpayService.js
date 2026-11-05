const axios = require('axios');
const settingsService = require('./settingsService');
const mockPushinpayService = require('./mockPushinpayService');

class PushinpayService {
  getConfig() {
    return settingsService.getPushinpayConfig();
  }

  getHeaders(config) {
    return {
      'Authorization': `Bearer ${config.token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
  }

  /**
   * Pay-in (Cash-in): Gera cobrança Pix via PushinPay
   * Endpoint: POST /api/pix/cashIn
   * @param {Object} params
   * @param {number} params.amountCents - Valor em centavos (inteiro)
   * @param {string} [params.webhookUrl] - URL opcional de retorno do webhook
   */
  async requestPixCashIn({ amountCents, webhookUrl }) {
    const config = this.getConfig();

    if (config.isMock || !config.token) {
      return mockPushinpayService.requestPixCashIn({ amountCents, webhookUrl: webhookUrl || config.publicWebhookUrl });
    }

    const payload = {
      value: parseInt(amountCents, 10)
    };

    const finalWebhookUrl = webhookUrl || config.publicWebhookUrl;
    if (finalWebhookUrl) {
      payload.webhook_url = finalWebhookUrl;
    }

    try {
      const response = await axios.post(`${config.urlBase}/pix/cashIn`, payload, {
        headers: this.getHeaders(config),
        timeout: 12000
      });

      const data = response.data;

      // Normaliza o Base64 do QR Code garantindo prefixo data:image para tags <img>
      let qrCodeBase64 = data.qr_code_base64 || '';
      if (qrCodeBase64 && !qrCodeBase64.startsWith('data:')) {
        qrCodeBase64 = `data:image/png;base64,${qrCodeBase64}`;
      }

      return {
        id: data.id,
        qr_code: data.qr_code,
        qr_code_base64: qrCodeBase64,
        status: data.status,
        value: data.value
      };
    } catch (error) {
      console.error('[PushinPay Error - pix/cashIn]:', error.response?.data || error.message);
      const msg = error.response?.data?.message || error.response?.data?.error || error.message || 'Falha na comunicação com gateway PushinPay.';
      throw new Error(msg);
    }
  }

  /**
   * Pay-out (Cash-out): Dispara transferência Pix de Saque via PushinPay
   * Endpoint: POST /api/pix/cashOut
   * @param {Object} params
   * @param {number} params.amountCents - Valor em centavos
   * @param {string} params.pixKey - Chave Pix (CPF)
   * @param {string} [params.receiverDocument] - CPF do titular
   * @param {string} [params.webhookUrl] - URL de retorno
   */
  async requestPixCashOut({ amountCents, pixKey, receiverDocument, webhookUrl }) {
    const config = this.getConfig();
    const cleanKey = (pixKey || '').replace(/\D/g, '');
    const cleanDoc = (receiverDocument || cleanKey).replace(/\D/g, '');

    if (config.isMock || !config.token) {
      return mockPushinpayService.requestPixCashOut({
        amountCents,
        pixKey: cleanKey,
        receiverDocument: cleanDoc,
        webhookUrl: webhookUrl || config.publicWebhookUrl
      });
    }

    const payload = {
      value: parseInt(amountCents, 10),
      pix_key: cleanKey,
      pix_key_type: 'national_registration',
      receiver_national_registration: cleanDoc
    };

    const finalWebhookUrl = webhookUrl || config.publicWebhookUrl;
    if (finalWebhookUrl) {
      payload.webhook_url = finalWebhookUrl;
    }

    try {
      const response = await axios.post(`${config.urlBase}/pix/cashOut`, payload, {
        headers: this.getHeaders(config),
        timeout: 15000
      });

      return response.data;
    } catch (error) {
      console.error('[PushinPay Error - pix/cashOut]:', error.response?.data || error.message);
      const msg = error.response?.data?.message || error.response?.data?.error || error.message || 'Falha ao processar saque na gateway PushinPay.';
      throw new Error(msg);
    }
  }

  /**
   * Testa a conectividade e autenticação com a API da PushinPay (health check)
   */
  async testConnection() {
    const config = this.getConfig();

    if (config.isMock) {
      return {
        success: true,
        mode: 'MOCK',
        message: 'Modo Mock ativo. Respostas simuladas localmente com sucesso.'
      };
    }

    if (!config.token) {
      return {
        success: false,
        mode: 'REAL',
        message: 'Token de autenticação da PushinPay (PUSHINPAY_TOKEN) não configurado.'
      };
    }

    try {
      // Dispara teste de criação de cobrança de teste de R$ 1,00 (100 centavos) para validar credencial
      const testPayload = {
        value: 100 // R$ 1,00 em centavos
      };

      const response = await axios.post(`${config.urlBase}/pix/cashIn`, testPayload, {
        headers: this.getHeaders(config),
        timeout: 8000
      });

      return {
        success: true,
        mode: `REAL (${config.urlBase.includes('sandbox') ? 'Sandbox' : 'Produção'})`,
        message: 'Conexão e autenticação estabelecidas com sucesso na PushinPay!',
        data: {
          id: response.data?.id,
          status: response.data?.status,
          value: response.data?.value
        }
      };
    } catch (error) {
      return {
        success: false,
        mode: 'REAL',
        statusCode: error.response?.status,
        message: error.response?.data?.message || error.response?.data?.error || error.message || 'Falha de autenticação com a PushinPay.'
      };
    }
  }
}

module.exports = new PushinpayService();

