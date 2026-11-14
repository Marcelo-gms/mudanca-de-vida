const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const env = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  // Cookie de sessão `secure` (só trafega por HTTPS). Padrão: ligado em produção.
  // COOKIE_SECURE=false é uma saída de emergência enquanto o SSL não está pronto.
  cookieSecure: process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : (process.env.NODE_ENV || 'development') === 'production',
  sessionSecret:process.env.SESSION_SECRET || 'tigrinho-monolith-fallback-secret-key-12345',
  asaas: {
    apiKey: process.env.ASAAS_API_KEY || '',
    urlBase: process.env.ASAAS_URL_BASE || 'https://api.asaas.com/v3',
    webhookToken: process.env.ASAAS_WEBHOOK_TOKEN || '',
    enableMock: process.env.ENABLE_ASAAS_MOCK === 'true' || !process.env.ASAAS_API_KEY
  },
  rolloverFactor: parseFloat(process.env.ROLLOVER_FACTOR) || 1.0,
  dbFile: process.env.DB_FILE || 'data/tigrinho.sqlite'
};

module.exports = env;
