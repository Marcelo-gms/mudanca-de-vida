const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const env = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionSecret: process.env.SESSION_SECRET || 'tigrinho-monolith-fallback-secret-key-12345',
  pushinpay: {
    token: process.env.PUSHINPAY_TOKEN || '',
    urlBase: process.env.PUSHINPAY_URL_BASE || 'https://api.pushinpay.com.br/api',
    enableMock: process.env.ENABLE_PUSHINPAY_MOCK === 'true' || !process.env.PUSHINPAY_TOKEN || process.env.PUSHINPAY_TOKEN === 'mock_pushinpay_token'
  },
  rolloverFactor: parseFloat(process.env.ROLLOVER_FACTOR) || 1.0,
  dbFile: process.env.DB_FILE || 'data/tigrinho.sqlite'
};

module.exports = env;
