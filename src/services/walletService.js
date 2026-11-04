const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/database');
const settingsService = require('./settingsService');
const { spinReels } = require('../engine/slotEngine');

class WalletService {
  /**
   * Obtém os dados da carteira do usuário com status de rollover
   */
  getUserWallet(userId) {
    const user = db.prepare(`
      SELECT id, name, document, email, balance_cents, total_deposited_cents, total_wagered_cents, role, status, created_at
      FROM users WHERE id = ?
    `).get(userId);

    if (!user) {
      throw new Error('Usuário não encontrado.');
    }

    const rolloverFactor = settingsService.getRolloverFactor();
    const requiredWager = Math.round(user.total_deposited_cents * rolloverFactor);
    const rolloverRemaining = Math.max(0, requiredWager - user.total_wagered_cents);
    const rolloverMet = user.total_wagered_cents >= requiredWager;
    const rolloverProgress = requiredWager > 0
      ? Math.min(100, (user.total_wagered_cents / requiredWager) * 100)
      : 100;

    return {
      userId: user.id,
      name: user.name,
      document: user.document,
      email: user.email,
      role: user.role,
      status: user.status,
      balanceCents: user.balance_cents,
      balanceFormatted: (user.balance_cents / 100).toFixed(2),
      totalDepositedCents: user.total_deposited_cents,
      totalWageredCents: user.total_wagered_cents,
      rollover: {
        factor: rolloverFactor,
        requiredCents: requiredWager,
        remainingCents: rolloverRemaining,
        isMet: rolloverMet,
        progressPercent: parseFloat(rolloverProgress.toFixed(1))
      }
    };
  }

  /**
   * Processa uma aposta e giro do caça-níqueis com controle estrito de concorrência
   * Saldo decrementado ANTES do cálculo do PRNG (SecOps 4.1)
   */
  processSpin(userId, betCents, clientSeed = 'default_seed') {
    if (!Number.isInteger(betCents) || betCents <= 0) {
      throw new Error('Valor da aposta inválido.');
    }

    // Transação imediata: adquire trava exclusiva impedindo qualquer race condition
    const executeSpinTransaction = db.transaction(() => {
      // 1. Busca usuário sob lock exclusivo
      const user = db.prepare(`
        SELECT id, balance_cents, total_wagered_cents, status
        FROM users WHERE id = ?
      `).get(userId);

      if (!user) {
        throw new Error('Usuário não encontrado.');
      }

      if (user.status === 'blocked') {
        throw new Error('Esta conta está temporariamente bloqueada. Contate o suporte.');
      }

      if (user.balance_cents < betCents) {
        throw new Error('Saldo insuficiente para realizar esta aposta.');
      }

      // 2. Decrementa o saldo e incrementa o total apostado ANTES do sorteio
      db.prepare(`
        UPDATE users
        SET balance_cents = balance_cents - ?,
            total_wagered_cents = total_wagered_cents + ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(betCents, betCents, userId);

      // 3. Registra a transação de débito da aposta
      const betTxId = uuidv4();
      db.prepare(`
        INSERT INTO transactions (id, user_id, type, amount_cents, status, external_reference, metadata)
        VALUES (?, ?, 'BET', ?, 'COMPLETED', ?, ?)
      `).run(
        betTxId,
        userId,
        betCents,
        null,
        JSON.stringify({ reason: 'Slot Spin Bet' })
      );

      // 4. Obtém o número da rodada (nonce) para Provably Fair
      const roundCountRow = db.prepare(`
        SELECT COUNT(id) as total FROM game_rounds WHERE user_id = ?
      `).get(userId);
      const nonce = (roundCountRow?.total || 0) + 1;

      // 5. Executa o sorteio CSPRNG
      const spinResult = spinReels(betCents, clientSeed, nonce);

      // 6. Se houver premiação, credita no saldo
      if (spinResult.payoutCents > 0) {
        db.prepare(`
          UPDATE users
          SET balance_cents = balance_cents + ?,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(spinResult.payoutCents, userId);

        const winTxId = uuidv4();
        db.prepare(`
          INSERT INTO transactions (id, user_id, type, amount_cents, status, external_reference, metadata)
          VALUES (?, ?, 'WIN', ?, 'COMPLETED', ?, ?)
        `).run(
          winTxId,
          userId,
          spinResult.payoutCents,
          null,
          JSON.stringify({
            multiplier: spinResult.multiplier,
            hits: spinResult.hits
          })
        );
      }

      // 7. Registra a rodada do jogo para auditoria
      const roundId = uuidv4();
      db.prepare(`
        INSERT INTO game_rounds (id, user_id, bet_cents, payout_cents, multiplier, reels_matrix, paylines_hit, server_seed_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        roundId,
        userId,
        betCents,
        spinResult.payoutCents,
        spinResult.multiplier,
        JSON.stringify(spinResult.matrix),
        JSON.stringify(spinResult.hits),
        spinResult.serverSeedHash
      );

      // 8. Consulta o saldo final pós-giro
      const updatedUser = db.prepare(`SELECT balance_cents FROM users WHERE id = ?`).get(userId);

      return {
        roundId,
        spinResult,
        newBalanceCents: updatedUser.balance_cents,
        newBalanceFormatted: (updatedUser.balance_cents / 100).toFixed(2)
      };
    });

    return executeSpinTransaction.immediate();
  }

  /**
   * Valida e reserva saldo para saque com travas rigorosas (SecOps 4.1, 4.2 e 4.3)
   */
  reserveWithdrawal(userId, amountCents, pixKey, pixType) {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new Error('Valor de saque inválido.');
    }

    const cleanPixKey = (pixKey || '').replace(/\D/g, '');
    const cleanPixType = (pixType || '').toUpperCase().trim();

    // Trava de Concorrência e Dedução Imediata
    const executeWithdrawalTx = db.transaction(() => {
      const user = db.prepare(`
        SELECT id, name, document, email, balance_cents, total_deposited_cents, total_wagered_cents, status
        FROM users WHERE id = ?
      `).get(userId);

      if (!user) {
        throw new Error('Usuário não encontrado.');
      }

      if (user.status === 'blocked') {
        throw new Error('Conta bloqueada para movimentações.');
      }

      // Trava 4.3: CPF Casado Obrigatório
      if (cleanPixType !== 'CPF') {
        throw new Error('Operação negada: Saques são permitidos exclusivamente para chave Pix do tipo CPF.');
      }

      const cleanUserDoc = user.document.replace(/\D/g, '');
      if (cleanPixKey !== cleanUserDoc) {
        throw new Error('Operação negada: A chave Pix informada não coincide com o CPF do titular cadastrado na conta.');
      }

      // Trava 4.2: Regra de Rollover Estrita
      const rolloverFactor = settingsService.getRolloverFactor();
      const requiredWager = Math.round(user.total_deposited_cents * rolloverFactor);
      if (user.total_wagered_cents < requiredWager) {
        const remaining = ((requiredWager - user.total_wagered_cents) / 100).toFixed(2);
        throw new Error(`Rollover insuficiente: É necessário apostar mais R$ ${remaining} antes de solicitar o saque.`);
      }

      // Trava 4.1: Saldo Disponível
      if (user.balance_cents < amountCents) {
        throw new Error('Saldo insuficiente para realizar este saque.');
      }

      // Deduz saldo preventivamente colocando a transação como PENDING
      db.prepare(`
        UPDATE users
        SET balance_cents = balance_cents - ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(amountCents, userId);

      const txId = uuidv4();
      db.prepare(`
        INSERT INTO transactions (id, user_id, type, amount_cents, status, external_reference, pix_key, pix_type, metadata)
        VALUES (?, ?, 'WITHDRAWAL', ?, 'PENDING', ?, ?, ?, ?)
      `).run(
        txId,
        userId,
        amountCents,
        null,
        cleanPixKey,
        cleanPixType,
        JSON.stringify({ requestedAt: new Date().toISOString() })
      );

      return {
        transactionId: txId,
        amountCents,
        pixKey: cleanPixKey,
        pixType: cleanPixType,
        user
      };
    });

    return executeWithdrawalTx.immediate();
  }

  /**
   * Finaliza um saque após confirmação da gateway ou estorna em caso de recusa
   */
  finalizeWithdrawal(transactionId, success, externalRef = null, errorReason = null) {
    const executeFinalize = db.transaction(() => {
      const tx = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(transactionId);
      if (!tx || tx.status !== 'PENDING') {
        return;
      }

      if (success) {
        db.prepare(`
          UPDATE transactions
          SET status = 'COMPLETED',
              external_reference = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(externalRef, transactionId);
      } else {
        // Estorno atômico do saldo em caso de falha da gateway
        db.prepare(`
          UPDATE users
          SET balance_cents = balance_cents + ?,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(tx.amount_cents, tx.user_id);

        db.prepare(`
          UPDATE transactions
          SET status = 'FAILED',
              metadata = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(JSON.stringify({ errorReason }), transactionId);
      }
    });

    return executeFinalize.immediate();
  }

  /**
   * Credita depósito confirmado via Webhook da SuitPay
   */
  creditDeposit(transactionId, amountCents, externalRef = null) {
    const executeCredit = db.transaction(() => {
      const tx = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(transactionId);
      if (!tx) {
        throw new Error('Transação de depósito não localizada.');
      }

      if (tx.status === 'COMPLETED') {
        return { alreadyProcessed: true };
      }

      db.prepare(`
        UPDATE users
        SET balance_cents = balance_cents + ?,
            total_deposited_cents = total_deposited_cents + ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(amountCents, amountCents, tx.user_id);

      db.prepare(`
        UPDATE transactions
        SET status = 'COMPLETED',
            external_reference = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(externalRef, transactionId);

      return {
        alreadyProcessed: false,
        userId: tx.user_id,
        amountCents
      };
    });

    return executeCredit.immediate();
  }

  // ==========================================
  // MÉTODOS DE ADMINISTRAÇÃO E DASHBOARD
  // ==========================================

  /**
   * Consolida métricas financeiras globais (GGR, Turnover, Payout, RTP Real, House Edge)
   */
  adminGetDashboardMetrics() {
    const wagerRow = db.prepare('SELECT COALESCE(SUM(bet_cents), 0) as total FROM game_rounds').get();
    const payoutRow = db.prepare('SELECT COALESCE(SUM(payout_cents), 0) as total FROM game_rounds').get();
    const spinsCountRow = db.prepare('SELECT COUNT(id) as total FROM game_rounds').get();
    const winsCountRow = db.prepare('SELECT COUNT(id) as total FROM game_rounds WHERE payout_cents > 0').get();
    const usersCountRow = db.prepare('SELECT COUNT(id) as total FROM users').get();
    const depositsRow = db.prepare("SELECT COALESCE(SUM(amount_cents), 0) as total FROM transactions WHERE type = 'DEPOSIT' AND status = 'COMPLETED'").get();
    const withdrawalsRow = db.prepare("SELECT COALESCE(SUM(amount_cents), 0) as total FROM transactions WHERE type = 'WITHDRAWAL' AND status = 'COMPLETED'").get();

    const totalWageredCents = wagerRow.total;
    const totalPayoutCents = payoutRow.total;
    const ggrCents = totalWageredCents - totalPayoutCents; // Gross Gaming Revenue

    const realRtp = totalWageredCents > 0
      ? parseFloat(((totalPayoutCents / totalWageredCents) * 100).toFixed(2))
      : 0.0;

    const houseEdge = parseFloat((100 - realRtp).toFixed(2));

    const hitFrequency = spinsCountRow.total > 0
      ? parseFloat(((winsCountRow.total / spinsCountRow.total) * 100).toFixed(2))
      : 0.0;

    const mathConfig = settingsService.getMathConfig();

    return {
      totalWageredCents,
      totalWageredFormatted: (totalWageredCents / 100).toFixed(2),
      totalPayoutCents,
      totalPayoutFormatted: (totalPayoutCents / 100).toFixed(2),
      ggrCents,
      ggrFormatted: (ggrCents / 100).toFixed(2),
      totalDepositedFormatted: (depositsRow.total / 100).toFixed(2),
      totalWithdrawnFormatted: (withdrawalsRow.total / 100).toFixed(2),
      totalSpins: spinsCountRow.total,
      totalWins: winsCountRow.total,
      totalUsers: usersCountRow.total,
      realRtp,
      targetRtp: mathConfig.rtpTarget,
      houseEdge,
      targetHouseEdge: mathConfig.houseEdge,
      hitFrequency,
      bonusChance: mathConfig.bonusChance
    };
  }

  /**
   * Lista usuários com paginação, busca e status de rollover
   */
  adminListUsers(search = '', page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const rolloverFactor = settingsService.getRolloverFactor();

    let query = `
      SELECT id, name, document, email, balance_cents, total_deposited_cents, total_wagered_cents, role, status, created_at
      FROM users
    `;
    let countQuery = `SELECT COUNT(id) as total FROM users`;
    const params = [];

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += ` WHERE name LIKE ? OR email LIKE ? OR document LIKE ?`;
      countQuery += ` WHERE name LIKE ? OR email LIKE ? OR document LIKE ?`;
      params.push(term, term, term);
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const rows = db.prepare(query).all(...params, limit, offset);
    const totalCount = db.prepare(countQuery).get(...params).total;

    const formattedUsers = rows.map(u => {
      const requiredWager = Math.round(u.total_deposited_cents * rolloverFactor);
      const isMet = u.total_wagered_cents >= requiredWager;
      const progress = requiredWager > 0 ? Math.min(100, (u.total_wagered_cents / requiredWager) * 100) : 100;

      return {
        ...u,
        balanceFormatted: (u.balance_cents / 100).toFixed(2),
        depositedFormatted: (u.total_deposited_cents / 100).toFixed(2),
        wageredFormatted: (u.total_wagered_cents / 100).toFixed(2),
        rolloverMet: isMet,
        rolloverProgress: parseFloat(progress.toFixed(1)),
        rolloverRequiredFormatted: (requiredWager / 100).toFixed(2)
      };
    });

    return {
      users: formattedUsers,
      total: totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit)
    };
  }

  /**
   * Ajuste manual de saldo de usuário com registro auditável
   */
  adminAdjustUserBalance(userId, deltaCents, reason = 'Ajuste manual administrativo') {
    const executeAdjustment = db.transaction(() => {
      const user = db.prepare('SELECT id, balance_cents FROM users WHERE id = ?').get(userId);
      if (!user) throw new Error('Usuário não encontrado.');

      const newBalance = user.balance_cents + deltaCents;
      if (newBalance < 0) {
        throw new Error('O saldo resultante não pode ser negativo.');
      }

      db.prepare(`
        UPDATE users
        SET balance_cents = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(newBalance, userId);

      const txId = uuidv4();
      db.prepare(`
        INSERT INTO transactions (id, user_id, type, amount_cents, status, metadata)
        VALUES (?, ?, 'ADJUSTMENT', ?, 'COMPLETED', ?)
      `).run(
        txId,
        userId,
        Math.abs(deltaCents),
        JSON.stringify({ reason, deltaCents, date: new Date().toISOString() })
      );

      return { userId, newBalanceFormatted: (newBalance / 100).toFixed(2) };
    });

    return executeAdjustment.immediate();
  }

  /**
   * Reseta/cumpre o rollover de um usuário
   */
  adminResetRollover(userId) {
    const user = db.prepare('SELECT id, total_deposited_cents FROM users WHERE id = ?').get(userId);
    if (!user) throw new Error('Usuário não encontrado.');

    const rolloverFactor = settingsService.getRolloverFactor();
    const targetWager = Math.round(user.total_deposited_cents * rolloverFactor);

    db.prepare(`
      UPDATE users
      SET total_wagered_cents = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(targetWager, userId);

    return { success: true };
  }

  /**
   * Alterna status do usuário (active <-> blocked)
   */
  adminToggleUserStatus(userId) {
    const user = db.prepare('SELECT id, status FROM users WHERE id = ?').get(userId);
    if (!user) throw new Error('Usuário não encontrado.');

    const newStatus = user.status === 'blocked' ? 'active' : 'blocked';
    db.prepare(`UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(newStatus, userId);
    return { userId, newStatus };
  }

  /**
   * Alterna papel do usuário (user <-> admin)
   */
  adminToggleUserRole(userId) {
    const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId);
    if (!user) throw new Error('Usuário não encontrado.');

    const newRole = user.role === 'admin' ? 'user' : 'admin';
    db.prepare(`UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?`).run(newRole, userId);
    return { userId, newRole };
  }
}

module.exports = new WalletService();
