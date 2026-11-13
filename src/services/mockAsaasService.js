/**
 * Mock local do gateway Asaas para desenvolvimento e testes sem credenciais.
 * Espelha o formato de resposta da API v3 usado pelo asaasService.
 */
class MockAsaasService {
  async requestPixCashIn({ amountCents, txId }) {
    const id = `pay_mock_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const amountFloat = (amountCents / 100).toFixed(2);
    const pixCopiaECola = `00020126580014br.gov.bcb.pix0136${id}520400005303986540${amountFloat}5802BR5920TIGRINHO VIA ASAAS6009SAO PAULO62070503***6304MOCK`;

    const svgQrCode = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
      <rect width="200" height="200" fill="#ffffff" />
      <rect x="20" y="20" width="50" height="50" fill="#111" />
      <rect x="30" y="30" width="30" height="30" fill="#fff" />
      <rect x="37" y="37" width="16" height="16" fill="#111" />
      <rect x="130" y="20" width="50" height="50" fill="#111" />
      <rect x="140" y="30" width="30" height="30" fill="#fff" />
      <rect x="147" y="37" width="16" height="16" fill="#111" />
      <rect x="20" y="130" width="50" height="50" fill="#111" />
      <rect x="30" y="140" width="30" height="30" fill="#fff" />
      <rect x="37" y="147" width="16" height="16" fill="#111" />
      <rect x="80" y="25" width="15" height="15" fill="#111"/>
      <rect x="100" y="45" width="15" height="15" fill="#111"/>
      <rect x="75" y="80" width="50" height="40" fill="#0030b9" rx="4"/>
      <text x="100" y="105" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle" fill="#fff">ASAAS</text>
      <rect x="135" y="100" width="15" height="15" fill="#111"/>
      <rect x="80" y="140" width="20" height="20" fill="#111"/>
      <rect x="120" y="140" width="15" height="15" fill="#111"/>
      <rect x="150" y="150" width="20" height="20" fill="#111"/>
    </svg>`;

    const qrCodeBase64 = `data:image/svg+xml;base64,${Buffer.from(svgQrCode).toString('base64')}`;

    return {
      id,
      status: 'PENDING',
      qr_code: pixCopiaECola,
      qr_code_base64: qrCodeBase64,
      expirationDate: null,
      externalReference: txId
    };
  }

  async requestPixCashOut({ amountCents, pixKey }) {
    return {
      id: `tra_mock_${Date.now()}`,
      status: 'DONE',
      value: Number((amountCents / 100).toFixed(2)),
      pixAddressKey: pixKey,
      pixAddressKeyType: 'CPF',
      operationType: 'PIX'
    };
  }

  async getPayment(paymentId) {
    // Em modo mock o webhook local é confiável (rota protegida por autenticação)
    return { id: paymentId, status: 'RECEIVED', mock: true };
  }

  async getTransfer(transferId) {
    return { id: transferId, status: 'DONE', mock: true };
  }
}

module.exports = new MockAsaasService();
