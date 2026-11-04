const axios = require('axios');
const settingsService = require('./settingsService');
const mockSuitpayService = require('./mockSuitpayService');

class SuitpayService {
  getConfig() {
    return settingsService.getSuitpayConfig();
  }

  /**
   * Pay-in: Gera QR Code e Pix Copia e Cola via SuitPay
   * Endpoint: POST /request-qrcode
   */
  async requestPixQrCode({ requestNumber, amountCents, user }) {
    const config = this.getConfig();
    const amountFloat = parseFloat((amountCents / 100).toFixed(2));

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dueDate = tomorrow.toISOString().split('T')[0];

    const payload = {
      requestNumber,
      dueDate,
      amount: amountFloat,
      client: {
        name: user.name,
        document: user.document.replace(/\D/g, ''),
        email: user.email
      }
    };

    if (config.isMock || !config.clientId || !config.clientSecret) {
      return mockSuitpayService.requestPixQrCode(payload);
    }

    try {
      const response = await axios.post(`${config.urlBase}/request-qrcode`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'ci': config.clientId,
          'cs': config.clientSecret
        },
        timeout: 12000
      });

      return response.data;
    } catch (error) {
      console.error('[SuitPay Error - request-qrcode]:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || error.message || 'Falha na comunicação com gateway SuitPay.');
    }
  }

  /**
   * Pay-out: Dispara transferência Pix de Saque via SuitPay
   * Endpoint: POST /pix-payment
   */
  async requestPixPayment({ key, typeKey, amountCents }) {
    const config = this.getConfig();
    const amountFloat = parseFloat((amountCents / 100).toFixed(2));
    const cleanKey = key.replace(/\D/g, '');

    const payload = {
      key: cleanKey,
      typeKey: typeKey.toUpperCase(),
      value: amountFloat
    };

    if (config.isMock || !config.clientId || !config.clientSecret) {
      return mockSuitpayService.requestPixPayment(payload);
    }

    try {
      const response = await axios.post(`${config.urlBase}/pix-payment`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'ci': config.clientId,
          'cs': config.clientSecret
        },
        timeout: 15000
      });

      return response.data;
    } catch (error) {
      console.error('[SuitPay Error - pix-payment]:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || error.message || 'Falha ao processar saque na gateway SuitPay.');
    }
  }

  /**
   * Testa a conectividade com a API da SuitPay (health check)
   */
  async testConnection() {
    const config = this.getConfig();
    if (config.isMock) {
      return {
        success: true,
        mode: 'MOCK',
        message: 'Modo Mock ativo. Respostas simuladas localmente.'
      };
    }

    if (!config.clientId || !config.clientSecret) {
      return {
        success: false,
        mode: 'REAL',
        message: 'Credenciais SUITPAY_CLIENT_ID e/ou SUITPAY_CLIENT_SECRET não configuradas.'
      };
    }

    try {
      // Dispara teste de validação de payload na SuitPay
      const dummyPayload = {
        requestNumber: `ping_${Date.now()}`,
        dueDate: new Date().toISOString().split('T')[0],
        amount: 5.00,
        client: {
          name: 'Teste Ping',
          document: '12345678909',
          email: 'ping@teste.com'
        }
      };

      const response = await axios.post(`${config.urlBase}/request-qrcode`, dummyPayload, {
        headers: {
          'Content-Type': 'application/json',
          'ci': config.clientId,
          'cs': config.clientSecret
        },
        timeout: 8000
      });

      return {
        success: true,
        mode: 'REAL (Sandbox/Produção)',
        message: 'Conexão estabelecida com sucesso com a SuitPay!',
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        mode: 'REAL',
        statusCode: error.response?.status,
        message: error.response?.data?.message || error.message || 'Falha de comunicação com a SuitPay.'
      };
    }
  }
}

module.exports = new SuitpayService();
