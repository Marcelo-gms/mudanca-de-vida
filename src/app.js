const express = require('express');
const path = require('path');
const helmet = require('helmet');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const { authMiddleware, optionalAuthMiddleware } = require('./middlewares/authMiddleware');
const walletService = require('./services/walletService');

const authRoutes = require('./routes/authRoutes');
const gameRoutes = require('./routes/gameRoutes');
const walletRoutes = require('./routes/walletRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

// Segurança de Headers HTTP com Helmet
app.use(
  helmet({
    contentSecurityPolicy: false // Permite execução dos scripts Canvas inline e estilos
  })
);

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Configuração de Sessão em Memória / Cookie
app.use(
  session({
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: env.nodeEnv === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dias
    }
  })
);

// Template Engine EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Arquivos Estáticos (CSS, JS, Imagens, Áudios)
app.use(express.static(path.join(__dirname, '../public')));

// Injeta dados globais nas views
app.use(optionalAuthMiddleware);

// Rotas de Autenticação
app.use('/', authRoutes);

// Rota Principal do Jogo (Dashboard)
app.get('/', authMiddleware, (req, res) => {
  const wallet = walletService.getUserWallet(req.user.id);
  res.render('index', {
    user: req.user,
    wallet,
    isMockEnabled: env.pushinpay.enableMock
  });
});

// Rotas de API
app.use('/api/game', gameRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/webhooks', webhookRoutes);

// Painel Administrativo
app.use('/admin', adminRoutes);

// 404 Handler
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint não encontrado.' });
  }
  res.status(404).render('login', { error: 'Página não encontrada.' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]:', err);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
  res.status(500).send('Erro interno no servidor.');
});

module.exports = app;

