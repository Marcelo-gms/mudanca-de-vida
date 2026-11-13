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
  const firstCredit = walletService.creditDeposit(txId, depositAmount, 'ext_asaas_123');
  assert.strictEqual(firstCredit.alreadyProcessed, false);

  const userAfterFirst = db.prepare(`SELECT balance_cents, total_deposited_cents FROM users WHERE id = ?`).get(userId);
  assert.strictEqual(userAfterFirst.balance_cents, 5000, 'Saldo deve ser R$ 50,00');
  assert.strictEqual(userAfterFirst.total_deposited_cents, 5000, 'Total depositado deve ser R$ 50,00');

  // 2ª Chamada do Webhook com o mesmo requestNumber (duplicado/replay attack)
  const secondCredit = walletService.creditDeposit(txId, depositAmount, 'ext_asaas_123');
  assert.strictEqual(secondCredit.alreadyProcessed, true, 'Deve identificar transação já processada');

  const userAfterSecond = db.prepare(`SELECT balance_cents, total_deposited_cents FROM users WHERE id = ?`).get(userId);
  assert.strictEqual(userAfterSecond.balance_cents, 5000, 'Saldo NÃO PODE ser creditado em dobro!');
  assert.strictEqual(userAfterSecond.total_deposited_cents, 5000, 'Total depositado NÃO PODE ser incrementado em dobro!');
});


test('Webhook Segurança: transação de SAQUE nunca pode ser creditada como depósito', () => {
  const userId = uuidv4();
  const txId = uuidv4();
  const uniqueDoc = String(Math.floor(10000000000 + Math.random() * 89999999999));

  db.prepare(`
    INSERT INTO users (id, name, document, email, password_hash, balance_cents, total_deposited_cents, total_wagered_cents)
    VALUES (?, 'Usuario Saque Webhook', ?, ?, 'hash', 1000, 0, 0)
  `).run(userId, uniqueDoc, `${userId}@webhook-saque.com`);

  db.prepare(`
    INSERT INTO transactions (id, user_id, type, amount_cents, status)
    VALUES (?, ?, 'WITHDRAWAL', 5000, 'PENDING')
  `).run(txId, userId);

  assert.throws(
    () => walletService.creditDeposit(txId, 5000, 'ext_fake'),
    /não é um depósito/i,
    'creditDeposit deve recusar transação que não seja DEPOSIT'
  );

  const user = db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(userId);
  assert.strictEqual(user.balance_cents, 1000, 'Saldo não pode mudar');
});

test('Webhook Segurança: valor creditado é sempre o registrado no banco, nunca o do payload', () => {
  const userId = uuidv4();
  const txId = uuidv4();
  const uniqueDoc = String(Math.floor(10000000000 + Math.random() * 89999999999));

  db.prepare(`
    INSERT INTO users (id, name, document, email, password_hash, balance_cents, total_deposited_cents, total_wagered_cents)
    VALUES (?, 'Usuario Valor Webhook', ?, ?, 'hash', 0, 0, 0)
  `).run(userId, uniqueDoc, `${userId}@webhook-valor.com`);

  db.prepare(`
    INSERT INTO transactions (id, user_id, type, amount_cents, status)
    VALUES (?, ?, 'DEPOSIT', 1000, 'PENDING')
  `).run(txId, userId);

  // Payload malicioso tenta creditar 1 milhão de centavos
  walletService.creditDeposit(txId, 100000000, 'ext_tampered');

  const user = db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(userId);
  assert.strictEqual(user.balance_cents, 1000, 'Deve creditar apenas o valor registrado (R$ 10,00)');
});

test('Asaas Transfers: saque PENDING é concluído por TRANSFER_DONE e estornado uma única vez por TRANSFER_FAILED', () => {
  const makeWithdrawal = () => {
    const userId = uuidv4();
    const txId = uuidv4();
    const uniqueDoc = String(Math.floor(10000000000 + Math.random() * 89999999999));
    db.prepare(`
      INSERT INTO users (id, name, document, email, password_hash, balance_cents, total_deposited_cents, total_wagered_cents)
      VALUES (?, 'Usuario Transfer', ?, ?, 'hash', 0, 0, 0)
    `).run(userId, uniqueDoc, `${userId}@transfer.com`);
    db.prepare(`
      INSERT INTO transactions (id, user_id, type, amount_cents, status, pix_key, pix_type)
      VALUES (?, ?, 'WITHDRAWAL', 2000, 'PENDING', ?, 'CPF')
    `).run(txId, userId, uniqueDoc);
    return { userId, txId };
  };

  // Caso 1: TRANSFER_DONE conclui sem mexer no saldo (já debitado na reserva)
  const a = makeWithdrawal();
  walletService.attachWithdrawalReference(a.txId, 'tra_done_1');
  walletService.finalizeWithdrawal(a.txId, true, 'tra_done_1');
  const txA = db.prepare('SELECT status FROM transactions WHERE id = ?').get(a.txId);
  assert.strictEqual(txA.status, 'COMPLETED');
  const userA = db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(a.userId);
  assert.strictEqual(userA.balance_cents, 0, 'Conclusão de saque não credita saldo');

  // Caso 2: TRANSFER_FAILED estorna, e replay do webhook não estorna em dobro
  const b = makeWithdrawal();
  walletService.finalizeWithdrawal(b.txId, false, 'tra_fail_1', 'Transferência FAILED no Asaas.');
  walletService.finalizeWithdrawal(b.txId, false, 'tra_fail_1', 'Transferência FAILED no Asaas.');
  const txB = db.prepare('SELECT status FROM transactions WHERE id = ?').get(b.txId);
  assert.strictEqual(txB.status, 'FAILED');
  const userB = db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(b.userId);
  assert.strictEqual(userB.balance_cents, 2000, 'Estorno deve ocorrer exatamente uma vez');
});
