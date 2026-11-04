const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const env = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionSecret: process.env.SESSION_SECRET || 'tigrinho-monolith-fallback-secret-key-12345',
  suitpay: {
    clientId: process.env.SUITPAY_CLIENT_ID || '',
    clientSecret: process.env.SUITPAY_CLIENT_SECRET || '',
    urlBase: process.env.SUITPAY_URL_BASE || 'https://ws.suitpay.app/api/v1/gateway',
    enableMock: process.env.ENABLE_SUITPAY_MOCK === 'true' || !process.env.SUITPAY_CLIENT_ID
  },
  rolloverFactor: parseFloat(process.env.ROLLOVER_FACTOR) || 1.0,
  dbFile: process.env.DB_FILE || 'data/tigrinho.sqlite'
};

module.exports = env;

