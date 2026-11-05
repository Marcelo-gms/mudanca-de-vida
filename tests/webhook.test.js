const test = require('node:test');
const assert = require('node:assert');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../src/config/database');
const walletService = require('../src/services/walletService');

test('Webhook & Idempotência: Depósito creditado apenas uma única vez', () => {
  const userId = uuidv4();
  const txId = uuidv4();
  const uniqueDoc = String(Math.floor(10000000000 + Math.random() * 89999999999));
  const depositAmount = 5000; // R$ 50,00

  db.prepare(`
    INSERT INTO users (id, name, document, email, password_hash, balance_cents, total_deposited_cents, total_wagered_cents)
    VALUES (?, 'Usuario Webhook Teste', ?, ?, 'hash', 0, 0, 0)
  `).run(userId, uniqueDoc, `${userId}@webhook.com`);

  db.prepare(`
    INSERT INTO transactions (id, user_id, type, amount_cents, status)
    VALUES (?, ?, 'DEPOSIT', ?, 'PENDING')
  `).run(txId, userId, depositAmount);

  // 1ª Chamada do Webhook
  const firstCredit = walletService.creditDeposit(txId, depositAmount, 'ext_pushinpay_123');
  assert.strictEqual(firstCredit.alreadyProcessed, false);

  const userAfterFirst = db.prepare(`SELECT balance_cents, total_deposited_cents FROM users WHERE id = ?`).get(userId);
  assert.strictEqual(userAfterFirst.balance_cents, 5000, 'Saldo deve ser R$ 50,00');
  assert.strictEqual(userAfterFirst.total_deposited_cents, 5000, 'Total depositado deve ser R$ 50,00');

  // 2ª Chamada do Webhook com o mesmo requestNumber (duplicado/replay attack)
  const secondCredit = walletService.creditDeposit(txId, depositAmount, 'ext_pushinpay_123');
  assert.strictEqual(secondCredit.alreadyProcessed, true, 'Deve identificar transação já processada');

  const userAfterSecond = db.prepare(`SELECT balance_cents, total_deposited_cents FROM users WHERE id = ?`).get(userId);
  assert.strictEqual(userAfterSecond.balance_cents, 5000, 'Saldo NÃO PODE ser creditado em dobro!');
  assert.strictEqual(userAfterSecond.total_deposited_cents, 5000, 'Total depositado NÃO PODE ser incrementado em dobro!');
});

