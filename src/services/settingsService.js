const { db } = require('../config/database');
const env = require('../config/env');

const DEFAULT_SETTINGS = {
  rtp_target: '96.0',
  bonus_chance: '3.0',
  rollover_factor: String(env.rolloverFactor || 1.0),
  symbol_weights: JSON.stringify({ TIGRE: 2, MOEDA: 8, BARRA: 20, LARANJA: 70 }),
  min_deposit_cents: '500',
  min_withdraw_cents: '1000',
  pushinpay_token: env.pushinpay?.token || '',
  pushinpay_url_base: env.pushinpay?.urlBase || 'https://api.pushinpay.com.br/api',
  pushinpay_mock_mode: String(env.pushinpay?.enableMock ?? true),
  public_webhook_url: ''
};

class SettingsService {
  constructor() {
    this.cache = new Map();
    this.initDefaults();
    this.loadCache();
  }

  initDefaults() {
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)
    `);

    for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
      insertStmt.run(key, val);
    }
  }

  loadCache() {
    const rows = db.prepare('SELECT key, value FROM system_settings').all();
    for (const row of rows) {
      this.cache.set(row.key, row.value);
    }
  }

  get(key) {
    if (!this.cache.has(key)) {
      const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
      if (row) {
        this.cache.set(key, row.value);
      } else {
        return DEFAULT_SETTINGS[key];
      }
    }
    return this.cache.get(key);
  }

  set(key, value) {
    const strVal = String(value);
    db.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run(key, strVal);
    this.cache.set(key, strVal);
  }

  getAll() {
    this.loadCache();
    const result = {};
    for (const [key, val] of this.cache.entries()) {
      result[key] = val;
    }
    return result;
  }

  getMathConfig() {
    const rtpTarget = parseFloat(this.get('rtp_target')) || 96.0;
    const bonusChance = parseFloat(this.get('bonus_chance')) || 3.0;
    const houseEdge = parseFloat((100 - rtpTarget).toFixed(2));
    let symbolWeights = { TIGRE: 2, MOEDA: 8, BARRA: 20, LARANJA: 70 };

    try {
      symbolWeights = JSON.parse(this.get('symbol_weights'));
    } catch (e) {
      // fallback
    }

    return {
      rtpTarget,
      houseEdge,
      bonusChance,
      symbolWeights
    };
  }

  getRolloverFactor() {
    return parseFloat(this.get('rollover_factor')) || 1.0;
  }

  getPushinpayConfig() {
    return {
      token: this.get('pushinpay_token'),
      urlBase: this.get('pushinpay_url_base'),
      isMock: this.get('pushinpay_mock_mode') === 'true',
      publicWebhookUrl: this.get('public_webhook_url')
    };
  }

  // Compatibilidade legada
  getSuitpayConfig() {
    return this.getPushinpayConfig();
  }
}

module.exports = new SettingsService();
