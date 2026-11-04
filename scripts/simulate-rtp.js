const { spinReels } = require('../src/engine/slotEngine');

const TOTAL_SPINS = 100000;
const BET_CENTS = 100; // R$ 1,00 por giro

console.log(`=======================================================`);
console.log(` Iniciando Simulação Monte Carlo de RTP do Tigrinho`);
console.log(` Rodadas a simular: ${TOTAL_SPINS.toLocaleString()}`);
console.log(` Aposta por rodada: R$ ${(BET_CENTS / 100).toFixed(2)}`);
console.log(`=======================================================\n`);

let totalWageredCents = 0;
let totalWonCents = 0;
let winsCount = 0;
let fullScreenBonuses = 0;

const symbolHits = {
  TIGRE: 0,
  MOEDA: 0,
  BARRA: 0,
  LARANJA: 0
};

const startTime = Date.now();

for (let i = 0; i < TOTAL_SPINS; i++) {
  totalWageredCents += BET_CENTS;
  const result = spinReels(BET_CENTS, 'test_seed', i);

  if (result.isWin) {
    winsCount++;
    totalWonCents += result.payoutCents;

    for (const hit of result.hits) {
      if (symbolHits[hit.winningSymbol] !== undefined) {
        symbolHits[hit.winningSymbol]++;
      }
    }
  }

  if (result.fullScreenBonus) {
    fullScreenBonuses++;
  }
}

const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
const rtp = ((totalWonCents / totalWageredCents) * 100).toFixed(2);
const hitFrequency = ((winsCount / TOTAL_SPINS) * 100).toFixed(2);

console.log(`--- Resultados da Simulação ---`);
console.log(`Tempo decorrido: ${elapsedSec}s (${(TOTAL_SPINS / elapsedSec).toFixed(0)} giros/segundo)`);
console.log(`Total Apostado:  R$ ${(totalWageredCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
console.log(`Total Retornado: R$ ${(totalWonCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
console.log(`RTP Medido:      ${rtp}%`);
console.log(`Hit Frequency:   ${hitFrequency}% (${winsCount.toLocaleString()} giros com premiação)`);
console.log(`Bônus Tela Cheia: ${fullScreenBonuses} vezes\n`);
console.log(`Linhas premiadas por símbolo:`);
console.log(`- TIGRE (50x):   ${symbolHits.TIGRE.toLocaleString()}`);
console.log(`- MOEDA (10x):   ${symbolHits.MOEDA.toLocaleString()}`);
console.log(`- BARRA (5x):    ${symbolHits.BARRA.toLocaleString()}`);
console.log(`- LARANJA (2x):  ${symbolHits.LARANJA.toLocaleString()}`);
console.log(`=======================================================`);

