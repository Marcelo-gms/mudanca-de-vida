function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ error: 'Acesso negado: Requer privilégios de administrador.' });
    }
    return res.status(403).render('login', {
      error: 'Acesso restrito: Sua conta não possui permissão de administrador.'
    });
  }
  next();
}

module.exports = {
  adminMiddleware
};

