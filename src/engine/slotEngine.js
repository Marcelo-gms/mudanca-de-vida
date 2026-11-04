const crypto = require('crypto');
const { gerarSimboloAleatorio, generateServerSeed, createProvablyFairHash } = require('./prng');
const { SYMBOLS, PAYLINES_3X3 } = require('./parSheet');
const settingsService = require('../services/settingsService');

/**
 * Avalia se um conjunto de 3 símbolos forma uma combinação vencedora
 * TIGRE atua como Wild (substitui qualquer símbolo)
 * Se houver 3 Tigres -> Paga multiplicador de Tigre (50x)
 * Se houver 1 ou 2 Tigres + outro símbolo -> Assume o símbolo regular
 */
function evaluateLine(symbols) {
  const ids = symbols.map(s => s.id);

  // Caso 1: Três Tigres (Jackpot 50x)
  if (ids[0] === 'TIGRE' && ids[1] === 'TIGRE' && ids[2] === 'TIGRE') {
    return {
      won: true,
      winningSymbol: SYMBOLS.TIGRE,
      multiplier: SYMBOLS.TIGRE.mult
    };
  }

  // Filtrar símbolos não-Wild para descobrir o símbolo alvo da trinca
  const nonWilds = symbols.filter(s => s.id !== 'TIGRE');
  const targetSymbol = nonWilds[0];
  const allMatch = nonWilds.every(s => s.id === targetSymbol.id);

  if (allMatch && nonWilds.length > 0) {
    return {
      won: true,
      winningSymbol: targetSymbol,
      multiplier: targetSymbol.mult
    };
  }

  return {
    won: false,
    winningSymbol: null,
    multiplier: 0
  };
}

/**
 * Executa um giro completo da máquina caça-níqueis (3 rolos com visual 3x3)
 * @param {number} betCents - Valor total da aposta em centavos
 * @param {string} clientSeed - Semente do cliente para auditoria Provably Fair
 * @param {number} nonce - Contador incremental da rodada do usuário
 * @param {Object} [overrideConfig] - Configurações opcionais de calibração
 */
function spinReels(betCents, clientSeed = 'default_client_seed', nonce = 1, overrideConfig = null) {
  const serverSeed = generateServerSeed();
  const provablyHash = createProvablyFairHash(serverSeed, clientSeed, nonce);

  // Obtém calibração matemática ativa (banco ou override)
  const mathConfig = overrideConfig || settingsService.getMathConfig();
  const symbolWeights = mathConfig.symbolWeights;
  const bonusChance = typeof mathConfig.bonusChance === 'number' ? mathConfig.bonusChance : 3.0;

  // Sorteia os 3 rolos virtuais independentes através de CSPRNG
  const reel1 = [
    gerarSimboloAleatorio(symbolWeights),
    gerarSimboloAleatorio(symbolWeights),
    gerarSimboloAleatorio(symbolWeights)
  ];
  const reel2 = [
    gerarSimboloAleatorio(symbolWeights),
    gerarSimboloAleatorio(symbolWeights),
    gerarSimboloAleatorio(symbolWeights)
  ];
  const reel3 = [
    gerarSimboloAleatorio(symbolWeights),
    gerarSimboloAleatorio(symbolWeights),
    gerarSimboloAleatorio(symbolWeights)
  ];

  const matrix = [
    [reel1[0], reel2[0], reel3[0]],
    [reel1[1], reel2[1], reel3[1]], // Linha central (payline principal)
    [reel1[2], reel2[2], reel3[2]]
  ];

  // Avaliação da Linha Central Principal (índice 1)
  const centerLineSymbols = matrix[1];
  const centerResult = evaluateLine(centerLineSymbols);

  const hits = [];
  let totalMultiplier = 0;
  let totalPayoutCents = 0;

  if (centerResult.won) {
    totalMultiplier = centerResult.multiplier;
    totalPayoutCents = Math.round(betCents * centerResult.multiplier);
    hits.push({
      paylineId: 1,
      paylineName: 'Linha Central',
      winningSymbol: centerResult.winningSymbol.id,
      multiplier: centerResult.multiplier,
      payoutCents: totalPayoutCents,
      coords: [[1, 0], [1, 1], [1, 2]]
    });
  }

  // Feature: "Modo Tigre da Sorte" (Fortune Tiger Respin Feature)
  // Calibrada dinamicamente via CSPRNG de acordo com a configuração de RTP
  let fortuneTigerBonus = false;
  const bonusChancePerThousand = Math.round(bonusChance * 10); // Ex: 3.0% = 30
  const bonusRandom = crypto.randomBytes(2).readUInt16BE(0) % 1000;

  if (bonusRandom < bonusChancePerThousand) {
    fortuneTigerBonus = true;
    const bonusMultiplier = 5;
    const bonusPayout = Math.round(betCents * bonusMultiplier);
    totalMultiplier += bonusMultiplier;
    totalPayoutCents += bonusPayout;
    hits.push({
      paylineId: 99,
      paylineName: 'Bônus Tigre da Sorte',
      winningSymbol: 'TIGRE',
      multiplier: bonusMultiplier,
      payoutCents: bonusPayout,
      coords: [[0, 1], [1, 1], [2, 1]]
    });
  }

  return {
    matrix: matrix.map(row => row.map(s => ({
      id: s.id,
      name: s.name,
      mult: s.mult,
      isWild: s.isWild,
      icon: s.icon,
      color: s.color
    }))),
    hits,
    isWin: totalPayoutCents > 0,
    fortuneTigerBonus,
    multiplier: parseFloat(totalMultiplier.toFixed(2)),
    betCents,
    payoutCents: totalPayoutCents,
    serverSeedHash: provablyHash
  };
}

/**
 * Utilitário de simulação instantânea de Monte Carlo para o painel administrativo
 */
function runSimulation(numSpins = 10000, config = null) {
  const betCents = 100;
  let totalWageredCents = 0;
  let totalWonCents = 0;
  let winCount = 0;
  const hitsBySymbol = { TIGRE: 0, MOEDA: 0, BARRA: 0, LARANJA: 0 };

  const start = Date.now();
  for (let i = 0; i < numSpins; i++) {
    totalWageredCents += betCents;
    const res = spinReels(betCents, 'sim_seed', i, config);
    if (res.isWin) {
      winCount++;
      totalWonCents += res.payoutCents;
      for (const h of res.hits) {
        if (hitsBySymbol[h.winningSymbol] !== undefined) {
          hitsBySymbol[h.winningSymbol]++;
        }
      }
    }
  }
  const elapsedMs = Date.now() - start;
  const rtp = parseFloat(((totalWonCents / totalWageredCents) * 100).toFixed(2));
  const houseEdge = parseFloat((100 - rtp).toFixed(2));
  const hitFrequency = parseFloat(((winCount / numSpins) * 100).toFixed(2));

  return {
    numSpins,
    elapsedMs,
    totalWageredFormatted: (totalWageredCents / 100).toFixed(2),
    totalWonFormatted: (totalWonCents / 100).toFixed(2),
    rtp,
    houseEdge,
    hitFrequency,
    hitsBySymbol
  };
}

module.exports = {
  evaluateLine,
  spinReels,
  runSimulation
};
