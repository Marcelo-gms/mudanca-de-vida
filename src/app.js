const express = require('express');
const path = require('path');
const helmet = require('helmet');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const { authMiddleware, optionalAuthMiddleware } = require('./middlewares/authMiddleware');
const walletService = require('./services/walletService');
const settingsService = require('./services/settingsService');

const authRoutes = require('./routes/authRoutes');
const gameRoutes = require('./routes/gameRoutes');
const walletRoutes = require('./routes/walletRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

// Em produção o app roda atrás de um proxy reverso (Passenger/Nginx da hospedagem)
// que termina o HTTPS. Sem isso, req.secure é false e o cookie `secure` da sessão
// nunca é enviado (login quebra), e o rate limiter vê o IP do proxy para todos.
if (env.nodeEnv === 'production') {
  app.set('trust proxy', 1);
}

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
      secure: env.cookieSecure,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dias
    }
  })
);

// Diagnóstico: com cookie `secure`, uma requisição que o app não enxerga como HTTPS
// (acesso por http:// ou proxy sem X-Forwarded-Proto) nunca recebe a sessão,
// e o usuário fica preso na tela de login. Avisa no log uma vez.
if (env.cookieSecure) {
  let warned = false;
  app.use((req, res, next) => {
    if (!warned && !req.secure && req.method === 'POST' && ['/login', '/register'].includes(req.path)) {
      warned = true;
      console.warn(`[Session] ${req.path} recebido sem HTTPS (protocol=${req.protocol}, x-forwarded-proto=${req.headers['x-forwarded-proto'] || 'ausente'}). ` +
        'O cookie de sessão secure não será gravado e o login não persiste. Acesse por https:// com certificado válido.');
    }
    next();
  });
}

// Template Engine EJS
app.set('view engine', 'ejs');
// Pré-preenche o login com a conta demo só fora de produção (em produção ela não existe).
app.locals.prefillDemo = env.nodeEnv !== 'production';
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
    // Botão "simular pagamento" só aparece com mock ativo e fora de produção
    isMockEnabled: settingsService.getAsaasConfig().isMock && env.nodeEnv !== 'production'
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

