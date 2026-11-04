const walletService = require('../services/walletService');
const { db } = require('../config/database');

class GameController {
  async spin(req, res) {
    try {
      const { betCents, clientSeed } = req.body;
      const parsedBet = parseInt(betCents, 10);

      if (isNaN(parsedBet) || parsedBet <= 0) {
        return res.status(400).json({ error: 'Valor da aposta inválido.' });
      }

      // Limites de aposta: de R$ 0,50 a R$ 500,00 por giro
      if (parsedBet < 50 || parsedBet > 50000) {
        return res.status(400).json({ error: 'Apostas permitidas apenas entre R$ 0,50 e R$ 500,00.' });
      }

      const result = walletService.processSpin(req.user.id, parsedBet, clientSeed);

      return res.json({
        success: true,
        roundId: result.roundId,
        spin: result.spinResult,
        newBalanceCents: result.newBalanceCents,
        newBalanceFormatted: result.newBalanceFormatted
      });
    } catch (err) {
      console.error('[Spin Error]:', err.message);
      return res.status(400).json({
        success: false,
        error: err.message || 'Erro ao processar giro.'
      });
    }
  }

  getHistory(req, res) {
    try {
      const rounds = db.prepare(`
        SELECT id, bet_cents, payout_cents, multiplier, reels_matrix, paylines_hit, server_seed_hash, created_at
        FROM game_rounds
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 20
      `).all(req.user.id);

      const formatted = rounds.map(r => ({
        ...r,
        betFormatted: (r.bet_cents / 100).toFixed(2),
        payoutFormatted: (r.payout_cents / 100).toFixed(2),
        reelsMatrix: JSON.parse(r.reels_matrix),
        paylinesHit: JSON.parse(r.paylines_hit)
      }));

      return res.json({ success: true, history: formatted });
    } catch (err) {
      console.error('[History Error]:', err);
      return res.status(500).json({ error: 'Erro ao carregar histórico.' });
    }
  }
}

module.exports = new GameController();

