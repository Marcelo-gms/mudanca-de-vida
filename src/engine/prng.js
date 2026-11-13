const crypto = require('crypto');
const { SYMBOLS, ROLO_CONFIG, TOTAL_WEIGHT } = require('./parSheet');

/**
 * Algoritmo CSPRNG nativo do Node.js
 * Suporta pesos dinâmicos configuráveis via painel de administração
 * @param {Object} [customWeights] - Ex: { TIGRE: 2, MOEDA: 8, BARRA: 20, LARANJA: 70 }
 */
// Normaliza um peso vindo do painel admin: inteiro >= 0, senão usa o padrão
function sanitizeWeight(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function gerarSimboloAleatorio(customWeights = null) {
  let config = ROLO_CONFIG;
  let totalWeight = TOTAL_WEIGHT;

  if (customWeights && typeof customWeights === 'object') {
    config = [
      { ...SYMBOLS.TIGRE, peso: sanitizeWeight(customWeights.TIGRE, 2) },
      { ...SYMBOLS.MOEDA, peso: sanitizeWeight(customWeights.MOEDA, 8) },
      { ...SYMBOLS.BARRA, peso: sanitizeWeight(customWeights.BARRA, 20) },
      { ...SYMBOLS.LARANJA, peso: sanitizeWeight(customWeights.LARANJA, 70) }
    ];
    totalWeight = config.reduce((acc, c) => acc + c.peso, 0);

    // Pesos zerados/inválidos no total: volta para a configuração padrão segura
    if (!Number.isInteger(totalWeight) || totalWeight <= 0) {
      config = ROLO_CONFIG;
      totalWeight = TOTAL_WEIGHT;
    }
  }

  // crypto.randomInt: CSPRNG uniforme sem viés de módulo
  const numeroSorteado = crypto.randomInt(totalWeight);

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
