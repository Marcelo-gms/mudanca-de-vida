const { db } = require('../config/database');
const env = require('../config/env');

const DEFAULT_SETTINGS = {
  rtp_target: '96.0',
  bonus_chance: '3.0',
  rollover_factor: String(env.rolloverFactor || 1.0),
  symbol_weights: JSON.stringify({ TIGRE: 2, MOEDA: 8, BARRA: 20, LARANJA: 70 }),
  min_deposit_cents: '500',
  min_withdraw_cents: '1000',
  asaas_api_key: env.asaas?.apiKey || '',
  asaas_url_base: env.asaas?.urlBase || 'https://api.asaas.com/v3',
  asaas_webhook_token: env.asaas?.webhookToken || '',
  asaas_mock_mode: String(env.asaas?.enableMock ?? true),
  public_webhook_url: ''
};

// Chaves do gateway antigo (PushinPay/SuitPay) removidas na migração para o Asaas
const LEGACY_SETTING_KEYS = [
  'pushinpay_token',
  'pushinpay_url_base',
  'pushinpay_mock_mode',
  'suitpay_client_id',
  'suitpay_client_secret',
  'suitpay_url_base',
  'suitpay_mock_mode'
];

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

    // Limpa configurações do gateway legado
    const deleteStmt = db.prepare('DELETE FROM system_settings WHERE key = ?');
    for (const key of LEGACY_SETTING_KEYS) {
      deleteStmt.run(key);
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

  getAsaasConfig() {
    return {
      apiKey: this.get('asaas_api_key'),
      urlBase: this.get('asaas_url_base'),
      webhookToken: this.get('asaas_webhook_token'),
      isMock: this.get('asaas_mock_mode') === 'true',
      publicWebhookUrl: this.get('public_webhook_url')
    };
  }
}

module.exports = new SettingsService();
