const test = require('node:test');
const assert = require('node:assert');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../src/config/database');
const walletService = require('../src/services/walletService');

test('SecOps 4.1: Prevenção de Concorrência & Double Spending (Race Condition)', async () => {
  const userId = uuidv4();
  const uniqueDoc = String(Math.floor(10000000000 + Math.random() * 89999999999));
  const initialBalance = 100; // Saldo de apenas R$ 1,00 (100 centavos)

  db.prepare(`
    INSERT INTO users (id, name, document, email, password_hash, balance_cents, total_deposited_cents, total_wagered_cents)
    VALUES (?, 'Usuario Race Condition', ?, ?, 'hash', ?, 100, 100)
  `).run(userId, uniqueDoc, `${userId}@race.com`, initialBalance);

  const CONCURRENT_REQUESTS = 25;
  const betCents = 100; // Cada requisição tenta apostar R$ 1,00

  // Dispara 25 requisições assíncronas concorrentes de giro ao mesmo tempo
  const promises = Array.from({ length: CONCURRENT_REQUESTS }, (_, idx) => {
    return new Promise((resolve) => {
      // Disparo com delay zero para garantir concorrência de microtask
      setImmediate(() => {
        try {
          const res = walletService.processSpin(userId, betCents, `race_seed_${idx}`);
          resolve({ success: true, result: res });
        } catch (err) {
          resolve({ success: false, error: err.message });
        }
      });
    });
  });

  const results = await Promise.all(promises);

  const successCount = results.filter(r => r.success).length;
  const failedCount = results.filter(r => !r.success).length;

  console.log(`[Teste de Concorrência] Sucessos: ${successCount} | Falhas por saldo insuficiente: ${failedCount}`);

  // Como o usuário só tinha saldo para exatamente 1 aposta, no momento inicial apenas 1 aposta pode ocorrer
  // (a menos que a primeira aposta gere um prêmio, o qual aumentaria o saldo para apostas subsequentes)
  // O teste crucial é: o saldo final JAMAIS pode ser negativo!
  const finalUser = db.prepare(`SELECT balance_cents FROM users WHERE id = ?`).get(userId);

  assert.ok(finalUser.balance_cents >= 0, `Saldo final não pode ser negativo! Saldo: ${finalUser.balance_cents}`);
  assert.ok(failedCount > 0, 'As requisições concorrentes sem saldo devem falhar com segurança');
  assert.strictEqual(successCount + failedCount, CONCURRENT_REQUESTS, 'Todas as requisições devem ser contabilizadas');
});

