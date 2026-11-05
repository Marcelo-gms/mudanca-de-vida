/**
 * Mock Service para simulação local do PushinPay sem credenciais reais
 */
class MockPushinpayService {
  async requestPixCashIn({ amountCents, webhookUrl }) {
    const id = `mock_pushin_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const amountFloat = (amountCents / 100).toFixed(2);
    const pixCopiaECola = `00020126580014br.gov.bcb.pix0136${id}520400005303986540${amountFloat}5802BR5925TIGRINHO PUSHINPAY6009SAO PAULO62070503***6304MOCK`;

    // QR Code em SVG Base64 estilizado com logo PushinPay
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
      <rect x="75" y="80" width="50" height="40" fill="#6366f1" rx="4"/>
      <text x="100" y="105" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle" fill="#fff">PUSHIN</text>
      <rect x="135" y="100" width="15" height="15" fill="#111"/>
      <rect x="80" y="140" width="20" height="20" fill="#111"/>
      <rect x="120" y="140" width="15" height="15" fill="#111"/>
      <rect x="150" y="150" width="20" height="20" fill="#111"/>
    </svg>`;

    const base64Svg = Buffer.from(svgQrCode).toString('base64');
    const qrCodeBase64 = `data:image/svg+xml;base64,${base64Svg}`;

    return {
      id,
      qr_code: pixCopiaECola,
      status: 'created',
      value: amountCents,
      webhook_url: webhookUrl,
      qr_code_base64: qrCodeBase64
    };
  }

  async requestPixCashOut({ amountCents, pixKey, receiverDocument, webhookUrl }) {
    return {
      id: `mock_cashout_${Date.now()}`,
      status: 'paid',
      value: amountCents,
      pix_key: pixKey,
      pix_key_type: 'national_registration',
      receiver_national_registration: receiverDocument,
      message: 'Transferência Pix mock realizada com sucesso.'
    };
  }
}

module.exports = new MockPushinpayService();

