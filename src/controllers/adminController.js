const walletService = require('../services/walletService');
const settingsService = require('../services/settingsService');
const suitpayService = require('../services/suitpayService');
const { runSimulation } = require('../engine/slotEngine');
const { db } = require('../config/database');

class AdminController {
  renderDashboard(req, res) {
    try {
      const metrics = walletService.adminGetDashboardMetrics();
      const recentRounds = db.prepare(`
        SELECT gr.id, gr.bet_cents, gr.payout_cents, gr.multiplier, gr.created_at, u.name, u.email
        FROM game_rounds gr
        JOIN users u ON gr.user_id = u.id
        ORDER BY gr.created_at DESC
        LIMIT 10
      `).all();

      const formattedRounds = recentRounds.map(r => ({
        ...r,
        betFormatted: (r.bet_cents / 100).toFixed(2),
        payoutFormatted: (r.payout_cents / 100).toFixed(2)
      }));

      res.render('admin/dashboard', {
        user: req.user,
        metrics,
        recentRounds: formattedRounds,
        activeTab: 'dashboard'
      });
    } catch (err) {
      console.error('[Admin Dashboard Error]:', err);
      res.status(500).send('Erro ao carregar dashboard administrativo.');
    }
  }

  renderUsers(req, res) {
    try {
      const search = req.query.q || '';
      const page = parseInt(req.query.p, 10) || 1;
      const data = walletService.adminListUsers(search, page, 20);

      res.render('admin/users', {
        user: req.user,
        data,
        search,
        activeTab: 'users'
      });
    } catch (err) {
      console.error('[Admin Users Error]:', err);
      res.status(500).send('Erro ao carregar usuários.');
    }
  }

  renderRtpSettings(req, res) {
    try {
      const mathConfig = settingsService.getMathConfig();
      const rolloverFactor = settingsService.getRolloverFactor();

      res.render('admin/rtp', {
        user: req.user,
        mathConfig,
        rolloverFactor,
        activeTab: 'rtp'
      });
    } catch (err) {
      console.error('[Admin RTP Error]:', err);
      res.status(500).send('Erro ao carregar configurações de RTP.');
    }
  }

  renderSuitpaySettings(req, res) {
    try {
      const suitpayConfig = settingsService.getSuitpayConfig();
      const recentWebhooks = db.prepare(`
        SELECT id, user_id, amount_cents, status, external_reference, created_at, metadata
        FROM transactions
        WHERE type = 'DEPOSIT'
        ORDER BY created_at DESC
        LIMIT 10
      `).all();

      res.render('admin/suitpay', {
        user: req.user,
        suitpayConfig,
        recentWebhooks,
        activeTab: 'suitpay'
      });
    } catch (err) {
      console.error('[Admin SuitPay Error]:', err);
      res.status(500).send('Erro ao carregar configurações da SuitPay.');
    }
  }

  // --- Ações de API ---

  adjustBalance(req, res) {
    try {
      const { userId, deltaAmount, reason } = req.body;
      const deltaCents = Math.round(parseFloat(deltaAmount) * 100);

      if (isNaN(deltaCents) || deltaCents === 0) {
        return res.status(400).json({ error: 'Valor de ajuste inválido.' });
      }

      const result = walletService.adminAdjustUserBalance(userId, deltaCents, reason);
      return res.json({ success: true, ...result });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  resetRollover(req, res) {
    try {
      const { userId } = req.body;
      const result = walletService.adminResetRollover(userId);
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  toggleUserStatus(req, res) {
    try {
      const { userId } = req.body;
      const result = walletService.adminToggleUserStatus(userId);
      return res.json({ success: true, ...result });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  toggleUserRole(req, res) {
    try {
      const { userId } = req.body;
      const result = walletService.adminToggleUserRole(userId);
      return res.json({ success: true, ...result });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  saveRtpSettings(req, res) {
    try {
      const { rtpTarget, bonusChance, rolloverFactor, symbolWeights } = req.body;

      if (rtpTarget !== undefined) {
        const val = parseFloat(rtpTarget);
        if (isNaN(val) || val < 70 || val > 120) {
          return res.status(400).json({ error: 'RTP Alvo deve estar entre 70% e 120%.' });
        }
        settingsService.set('rtp_target', val.toFixed(1));
      }

      if (bonusChance !== undefined) {
        const val = parseFloat(bonusChance);
        if (isNaN(val) || val < 0 || val > 20) {
          return res.status(400).json({ error: 'Frequência do Tigre da Sorte deve estar entre 0% e 20%.' });
        }
        settingsService.set('bonus_chance', val.toFixed(1));
      }

      if (rolloverFactor !== undefined) {
        const val = parseFloat(rolloverFactor);
        if (isNaN(val) || val < 0) {
          return res.status(400).json({ error: 'Fator de Rollover inválido.' });
        }
        settingsService.set('rollover_factor', val.toFixed(1));
      }

      if (symbolWeights && typeof symbolWeights === 'object') {
        settingsService.set('symbol_weights', JSON.stringify({
          TIGRE: parseInt(symbolWeights.TIGRE, 10) || 2,
          MOEDA: parseInt(symbolWeights.MOEDA, 10) || 8,
          BARRA: parseInt(symbolWeights.BARRA, 10) || 20,
          LARANJA: parseInt(symbolWeights.LARANJA, 10) || 70
        }));
      }

      return res.json({ success: true, message: 'Configurações de RTP e House Edge salvas com sucesso!' });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  simulateLive(req, res) {
    try {
      const { spins, bonusChance, symbolWeights } = req.body;
      const numSpins = parseInt(spins, 10) || 10000;

      const overrideConfig = {
        bonusChance: parseFloat(bonusChance) || 3.0,
        symbolWeights: symbolWeights || { TIGRE: 2, MOEDA: 8, BARRA: 20, LARANJA: 70 }
      };

      const result = runSimulation(Math.min(numSpins, 50000), overrideConfig);
      return res.json({ success: true, simulation: result });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  saveSuitpaySettings(req, res) {
    try {
      const { clientId, clientSecret, urlBase, isMock, publicWebhookUrl } = req.body;

      if (clientId !== undefined) settingsService.set('suitpay_client_id', clientId.trim());
      if (clientSecret !== undefined) settingsService.set('suitpay_client_secret', clientSecret.trim());
      if (urlBase !== undefined) settingsService.set('suitpay_url_base', urlBase.trim());
      if (isMock !== undefined) settingsService.set('suitpay_mock_mode', String(isMock));
      if (publicWebhookUrl !== undefined) settingsService.set('public_webhook_url', publicWebhookUrl.trim());

      return res.json({ success: true, message: 'Configurações da SuitPay atualizadas com sucesso!' });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  async testSuitpayConnection(req, res) {
    try {
      const result = await suitpayService.testConnection();
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}

module.exports = new AdminController();

