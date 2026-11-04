const { db } = require('../config/database');

function authMiddleware(req, res, next) {
  const userId = req.session?.userId;
  
  if (!userId) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }
    return res.redirect('/login');
  }

  const user = db.prepare('SELECT id, name, document, email, role, status FROM users WHERE id = ?').get(userId);
  if (!user) {
    req.session.destroy();
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Usuário não localizado.' });
    }
    return res.redirect('/login');
  }

  req.user = user;
  res.locals.user = user;
  next();
}

function optionalAuthMiddleware(req, res, next) {
  const userId = req.session?.userId;
  if (userId) {
    const user = db.prepare('SELECT id, name, document, email, role, status FROM users WHERE id = ?').get(userId);
    if (user) {
      req.user = user;
      res.locals.user = user;
    }
  }
  next();
}

module.exports = {
  authMiddleware,
  optionalAuthMiddleware
};

