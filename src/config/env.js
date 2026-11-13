const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const env = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionSecret: process.env.SESSION_SECRET || 'tigrinho-monolith-fallback-secret-key-12345',
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
