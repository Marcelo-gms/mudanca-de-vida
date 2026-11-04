const test = require('node:test');
const assert = require('node:assert');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../src/config/database');
const settingsService = require('../src/services/settingsService');
const walletService = require('../src/services/walletService');
const { runSimulation } = require('../src/engine/slotEngine');

test('Admin: Gerenciamento dinâmico de configurações de RTP e House Edge', () => {
  settingsService.set('rtp_target', '94.0');
  settingsService.set('bonus_chance', '2.5');

  const config = settingsService.getMathConfig();
  assert.strictEqual(config.rtpTarget, 94.0);
  assert.strictEqual(config.houseEdge, 6.0); // 100 - 94 = 6.0%
  assert.strictEqual(config.bonusChance, 2.5);

  // Restaura padrão
  settingsService.set('rtp_target', '96.0');
  settingsService.set('bonus_chance', '3.0');
});

test('Admin: Ajuste manual de saldo de jogador com auditoria', () => {
  const userId = uuidv4();
  const doc = String(Math.floor(10000000000 + Math.random() * 89999999999));

  db.prepare(`
    INSERT INTO users (id, name, document, email, password_hash, balance_cents, total_deposited_cents, total_wagered_cents)
    VALUES (?, 'Usuario Ajuste', ?, ?, 'hash', 1000, 1000, 1000)
  `).run(userId, doc, `${userId}@ajuste.com`);

  // Credita R$ 50,00 (+5000 centavos)
  const creditRes = walletService.adminAdjustUserBalance(userId, 5000, 'Bônus de teste VIP');
  assert.strictEqual(creditRes.newBalanceFormatted, '60.00');

  // Debita R$ 20,00 (-2000 centavos)
  const debitRes = walletService.adminAdjustUserBalance(userId, -2000, 'Estorno administrativo');
  assert.strictEqual(debitRes.newBalanceFormatted, '40.00');

  // Tenta debitar mais que o saldo -> Erro
  assert.throws(
    () => walletService.adminAdjustUserBalance(userId, -10000, 'Debito excessivo'),
    /O saldo resultante não pode ser negativo/
  );
});

test('Admin: Métricas de Dashboard (GGR, Turnover e Payout)', () => {
  const metrics = walletService.adminGetDashboardMetrics();

  assert.ok(typeof metrics.ggrFormatted === 'string');
  assert.ok(typeof metrics.totalWageredFormatted === 'string');
  assert.ok(typeof metrics.totalPayoutFormatted === 'string');
  assert.ok(typeof metrics.realRtp === 'number');
  assert.ok(typeof metrics.houseEdge === 'number');
  assert.ok(typeof metrics.hitFrequency === 'number');
});

test('Admin: Simulador instantâneo de Monte Carlo', () => {
  const sim = runSimulation(2000, {
    bonusChance: 3.0,
    symbolWeights: { TIGRE: 2, MOEDA: 8, BARRA: 20, LARANJA: 70 }
  });

  assert.strictEqual(sim.numSpins, 2000);
  assert.ok(sim.rtp > 80 && sim.rtp < 115, `RTP: ${sim.rtp}`);
  assert.ok(sim.hitFrequency > 25 && sim.hitFrequency < 55, `Hit Freq: ${sim.hitFrequency}`);
  assert.ok(sim.elapsedMs >= 0);
});
