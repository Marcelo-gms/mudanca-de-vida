const test = require('node:test');
const assert = require('node:assert');
const { gerarSimboloAleatorio, createProvablyFairHash, generateServerSeed } = require('../src/engine/prng');
const { SYMBOLS } = require('../src/engine/parSheet');

test('CSPRNG: nunca deve utilizar Math.random()', () => {
  const originalMathRandom = Math.random;
  let mathRandomCalled = false;
  
  Math.random = () => {
    mathRandomCalled = true;
    throw new Error('VIOLAÇÃO CRÍTICA DE SECOPS: Math.random() foi invocado no motor CSPRNG!');
  };

  try {
    for (let i = 0; i < 1000; i++) {
      const simbolo = gerarSimboloAleatorio();
      assert.ok(simbolo && simbolo.id, 'Símbolo válido retornado');
    }
    assert.strictEqual(mathRandomCalled, false, 'Math.random() não deve ser chamado');
  } finally {
    Math.random = originalMathRandom;
  }
});

test('CSPRNG: distribuição de símbolos respeita a matriz PAR', () => {
  const counts = { TIGRE: 0, MOEDA: 0, BARRA: 0, LARANJA: 0 };
  const SAMPLES = 20000;

  for (let i = 0; i < SAMPLES; i++) {
    const s = gerarSimboloAleatorio();
    counts[s.id]++;
  }

  // TIGRE: ~2% (esperado ~400 em 20k)
  assert.ok(counts.TIGRE > 250 && counts.TIGRE < 600, `Tigre: ${counts.TIGRE}`);
  // MOEDA: ~8% (esperado ~1600 em 20k)
  assert.ok(counts.MOEDA > 1200 && counts.MOEDA < 2000, `Moeda: ${counts.MOEDA}`);
  // BARRA: ~20% (esperado ~4000 em 20k)
  assert.ok(counts.BARRA > 3400 && counts.BARRA < 4600, `Barra: ${counts.BARRA}`);
  // LARANJA: ~70% (esperado ~14000 em 20k)
  assert.ok(counts.LARANJA > 13000 && counts.LARANJA < 15000, `Laranja: ${counts.LARANJA}`);
});

test('Provably Fair: geração de hash SHA-256 HMAC consistente', () => {
  const serverSeed = generateServerSeed();
  assert.strictEqual(serverSeed.length, 64, 'Server seed deve ser hex de 32 bytes (64 chars)');

  const hash1 = createProvablyFairHash(serverSeed, 'client123', 1);
  const hash2 = createProvablyFairHash(serverSeed, 'client123', 1);
  const hashDiff = createProvablyFairHash(serverSeed, 'client123', 2);

  assert.strictEqual(hash1, hash2, 'Mesmos parâmetros devem gerar o mesmo hash');
  assert.notStrictEqual(hash1, hashDiff, 'Parâmetros diferentes devem gerar hashes distintos');
  assert.strictEqual(hash1.length, 64, 'Hash HMAC SHA-256 deve ter 64 caracteres hexadecimais');
});

