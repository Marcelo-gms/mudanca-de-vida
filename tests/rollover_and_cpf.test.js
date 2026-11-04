const test = require('node:test');
const assert = require('node:assert');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../src/config/database');
const walletService = require('../src/services/walletService');

test('SecOps 4.3: Trava de CPF Casado Obrigatório no Saque', () => {
  const userId = uuidv4();
  const userCpf = String(Math.floor(10000000000 + Math.random() * 89999999999));

  db.prepare(`
    INSERT INTO users (id, name, document, email, password_hash, balance_cents, total_deposited_cents, total_wagered_cents)
    VALUES (?, 'Usuario CPF Teste', ?, ?, 'hash', 10000, 5000, 10000)
  `).run(userId, userCpf, `${userId}@teste.com`);

  // Caso 1: Tenta sacar com chave EMAIL -> Rejeitado
  assert.throws(
    () => walletService.reserveWithdrawal(userId, 2000, 'pix@outro.com', 'EMAIL'),
    /exclusivamente para chave Pix do tipo CPF/
  );

  // Caso 2: Tenta sacar com CPF de terceiro (divergente) -> Rejeitado
  assert.throws(
    () => walletService.reserveWithdrawal(userId, 2000, '99988877766', 'CPF'),
    /não coincide com o CPF do titular cadastrado/
  );

  // Caso 3: Tenta sacar com o CPF correto cadastrado -> Aprovado
  const reservation = walletService.reserveWithdrawal(userId, 2000, userCpf, 'CPF');
  assert.ok(reservation.transactionId);
  assert.strictEqual(reservation.pixKey, userCpf);
});

test('SecOps 4.2: Trava de Rollover Estrito no Saque', () => {
  const userId = uuidv4();
  const userCpf = String(Math.floor(10000000000 + Math.random() * 89999999999));

  // Usuário depositou R$ 100,00 (10000 cents) e apostou apenas R$ 20,00 (2000 cents)
  db.prepare(`
    INSERT INTO users (id, name, document, email, password_hash, balance_cents, total_deposited_cents, total_wagered_cents)
    VALUES (?, 'Usuario Rollover Teste', ?, ?, 'hash', 15000, 10000, 2000)
  `).run(userId, userCpf, `${userId}@teste.com`);

  // Tentativa de saque de R$ 50,00 antes de cumprir o rollover -> Rejeitado
  assert.throws(
    () => walletService.reserveWithdrawal(userId, 5000, userCpf, 'CPF'),
    /Rollover insuficiente: É necessário apostar mais/
  );

  // Simula apostas adicionais de R$ 80,00 cumprindo o rollover (total_wagered = 10000)
  db.prepare(`
    UPDATE users SET total_wagered_cents = 10000 WHERE id = ?
  `).run(userId);

  // Agora a solicitação de saque de R$ 50,00 deve ser liberada com sucesso
  const res = walletService.reserveWithdrawal(userId, 5000, userCpf, 'CPF');
  assert.ok(res.transactionId);
  assert.strictEqual(res.amountCents, 5000);
});

