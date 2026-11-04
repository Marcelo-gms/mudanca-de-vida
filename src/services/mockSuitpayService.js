/**
 * Mock Service para simulação local do SuitPay sem credenciais reais
 */
class MockSuitpayService {
  async requestPixQrCode({ requestNumber, dueDate, amount, client }) {
    // Gera mock de chave Pix Copia e Cola padrão BACEN
    const pixCopiaECola = `00020126580014br.gov.bcb.pix0136${requestNumber}520400005303986540${amount.toFixed(2)}5802BR5925${client.name.substring(0, 25)}6009SAO PAULO62070503***6304MOCK`;
    
    // QR Code em SVG simples codificado em Base64 para exibição limpa
    const svgQrCode = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
      <rect width="200" height="200" fill="#ffffff" />
      <!-- Top Left Marker -->
      <rect x="20" y="20" width="50" height="50" fill="#111" />
      <rect x="30" y="30" width="30" height="30" fill="#fff" />
      <rect x="37" y="37" width="16" height="16" fill="#111" />
      <!-- Top Right Marker -->
      <rect x="130" y="20" width="50" height="50" fill="#111" />
      <rect x="140" y="30" width="30" height="30" fill="#fff" />
      <rect x="147" y="37" width="16" height="16" fill="#111" />
      <!-- Bottom Left Marker -->
      <rect x="20" y="130" width="50" height="50" fill="#111" />
      <rect x="30" y="140" width="30" height="30" fill="#fff" />
      <rect x="37" y="147" width="16" height="16" fill="#111" />
      <!-- Mock Pixel pattern -->
      <rect x="80" y="25" width="15" height="15" fill="#111"/>
      <rect x="100" y="45" width="15" height="15" fill="#111"/>
      <rect x="85" y="85" width="30" height="30" fill="#FF8C00"/>
      <text x="100" y="105" font-family="sans-serif" font-size="16" text-anchor="middle" fill="#fff">PIX</text>
      <rect x="135" y="100" width="15" height="15" fill="#111"/>
      <rect x="80" y="140" width="20" height="20" fill="#111"/>
      <rect x="120" y="140" width="15" height="15" fill="#111"/>
      <rect x="150" y="150" width="20" height="20" fill="#111"/>
    </svg>`;

    const base64Svg = Buffer.from(svgQrCode).toString('base64');
    const paymentCodeBase64 = `data:image/svg+xml;base64,${base64Svg}`;

    return {
      response: 'OK',
      idTransaction: `mock_tx_${Date.now()}`,
      requestNumber,
      paymentCode: pixCopiaECola,
      paymentCodeBase64
    };
  }

  async requestPixPayment({ key, typeKey, value }) {
    // Simula resposta de sucesso de saque
    return {
      response: 'OK',
      idTransaction: `mock_payout_${Date.now()}`,
      status: 'PAID',
      message: 'Transferência Pix mock realizada com sucesso.'
    };
  }
}

module.exports = new MockSuitpayService();

