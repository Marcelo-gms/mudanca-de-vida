const crypto = require('crypto');
const { SYMBOLS, ROLO_CONFIG, TOTAL_WEIGHT } = require('./parSheet');

/**
 * Algoritmo CSPRNG nativo do Node.js
 * Suporta pesos dinâmicos configuráveis via painel de administração
 * @param {Object} [customWeights] - Ex: { TIGRE: 2, MOEDA: 8, BARRA: 20, LARANJA: 70 }
 */
function gerarSimboloAleatorio(customWeights = null) {
  let config = ROLO_CONFIG;
  let totalWeight = TOTAL_WEIGHT;

  if (customWeights && typeof customWeights === 'object') {
    config = [
      { ...SYMBOLS.TIGRE, peso: Number(customWeights.TIGRE) || 2 },
      { ...SYMBOLS.MOEDA, peso: Number(customWeights.MOEDA) || 8 },
      { ...SYMBOLS.BARRA, peso: Number(customWeights.BARRA) || 20 },
      { ...SYMBOLS.LARANJA, peso: Number(customWeights.LARANJA) || 70 }
    ];
    totalWeight = config.reduce((acc, c) => acc + c.peso, 0);
  }

  // Geração de bytes aleatórios seguros sem Math.random()
  const randomByte = crypto.randomBytes(4).readUInt32BE(0);
  const numeroSorteado = randomByte % totalWeight;

  let somaPesos = 0;
  for (const simbolo of config) {
    somaPesos += simbolo.peso;
    if (numeroSorteado < somaPesos) {
      return simbolo;
    }
  }

  return config[config.length - 1];
}

/**
 * Gera semente criptográfica Provably Fair (SHA-256)
 */
function createProvablyFairHash(serverSeed, clientSeed, nonce) {
  return crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest('hex');
}

/**
 * Gera um segredo aleatório seguro para a rodada
 */
function generateServerSeed() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  gerarSimboloAleatorio,
  createProvablyFairHash,
  generateServerSeed
};
