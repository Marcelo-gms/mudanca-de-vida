const rateLimit = require('express-rate-limit');

// Rate limiter para rota de giros (máximo 60 requisições por minuto por IP)
const spinLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Limite de giros por minuto excedido. Aguarde alguns instantes.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiter para operações financeiras (máximo 15 requisições por minuto)
const walletLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { error: 'Muitas operações financeiras simultâneas. Tente novamente em instantes.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiter para autenticação (máximo 20 tentativas por 15 minutos)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Muitas tentativas de acesso. Tente novamente mais tarde.' },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  spinLimiter,
  walletLimiter,
  authLimiter
};

