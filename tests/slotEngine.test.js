const test = require('node:test');
const assert = require('node:assert');
const { evaluateLine, spinReels } = require('../src/engine/slotEngine');
const { SYMBOLS } = require('../src/engine/parSheet');

test('SlotEngine: Avaliação de linhas com Wild e símbolos regulares', () => {
  // Três Tigres -> 50x
  const tigres = evaluateLine([SYMBOLS.TIGRE, SYMBOLS.TIGRE, SYMBOLS.TIGRE]);
  assert.strictEqual(tigres.won, true);
  assert.strictEqual(tigres.multiplier, 50);

  // Duas Moedas + Um Tigre (Wild) -> 10x
  const moedasComWild = evaluateLine([SYMBOLS.MOEDA, SYMBOLS.TIGRE, SYMBOLS.MOEDA]);
  assert.strictEqual(moedasComWild.won, true);
  assert.strictEqual(moedasComWild.multiplier, 10);
  assert.strictEqual(moedasComWild.winningSymbol.id, 'MOEDA');

  // Duas Barras + Um Tigre (Wild) -> 5x
  const barrasComWild = evaluateLine([SYMBOLS.TIGRE, SYMBOLS.BARRA, SYMBOLS.BARRA]);
  assert.strictEqual(barrasComWild.won, true);
  assert.strictEqual(barrasComWild.multiplier, 5);

  // Três Laranjas -> 2x
  const laranjas = evaluateLine([SYMBOLS.LARANJA, SYMBOLS.LARANJA, SYMBOLS.LARANJA]);
  assert.strictEqual(laranjas.won, true);
  assert.strictEqual(laranjas.multiplier, 2);

  // Símbolos divergentes sem Wild suficiente -> Não premiado (0x)
  const semPremio = evaluateLine([SYMBOLS.LARANJA, SYMBOLS.BARRA, SYMBOLS.MOEDA]);
  assert.strictEqual(semPremio.won, false);
  assert.strictEqual(semPremio.multiplier, 0);
});

test('SlotEngine: spinReels retorna estrutura de matriz 3x3 e auditoria', () => {
  const result = spinReels(100, 'client_audit_test', 5);

  assert.ok(result.matrix, 'Matriz presente');
  assert.strictEqual(result.matrix.length, 3, '3 linhas');
  assert.strictEqual(result.matrix[0].length, 3, '3 colunas');
  assert.strictEqual(result.matrix[1].length, 3);
  assert.strictEqual(result.matrix[2].length, 3);

  assert.ok(typeof result.isWin === 'boolean');
  assert.ok(typeof result.payoutCents === 'number');
  assert.ok(typeof result.serverSeedHash === 'string');
  assert.strictEqual(result.serverSeedHash.length, 64);
});

