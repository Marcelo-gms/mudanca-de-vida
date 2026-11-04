const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { db } = require('../config/database');

const registerSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  document: z.string().min(11, 'CPF inválido').transform(v => v.replace(/\D/g, '')),
  email: z.string().email('E-mail inválido').toLowerCase(),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres')
});

const loginSchema = z.object({
  email: z.string().email('E-mail inválido').toLowerCase(),
  password: z.string().min(1, 'Informe a senha')
});

class AuthController {
  renderLoginPage(req, res) {
    if (req.session?.userId) return res.redirect('/');
    res.render('login', { error: null });
  }

  renderRegisterPage(req, res) {
    if (req.session?.userId) return res.redirect('/');
    res.render('register', { error: null });
  }

  async register(req, res) {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).render('register', {
          error: parsed.error.issues[0]?.message || 'Dados inválidos.'
        });
      }

      const { name, document, email, password } = parsed.data;

      // Verifica duplicidade de CPF ou e-mail
      const existingUser = db.prepare('SELECT id, email, document FROM users WHERE email = ? OR document = ?').get(email, document);
      if (existingUser) {
        const msg = existingUser.email === email
          ? 'Este e-mail já está cadastrado.'
          : 'Este CPF já está cadastrado.';
        return res.status(400).render('register', { error: msg });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const userId = uuidv4();

      db.prepare(`
        INSERT INTO users (id, name, document, email, password_hash, balance_cents, total_deposited_cents, total_wagered_cents)
        VALUES (?, ?, ?, ?, ?, 0, 0, 0)
      `).run(userId, name, document, email, passwordHash);

      req.session.userId = userId;
      return res.redirect('/');
    } catch (err) {
      console.error('[Register Error]:', err);
      return res.status(500).render('register', { error: 'Ocorreu um erro ao processar o cadastro.' });
    }
  }

  async login(req, res) {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).render('login', { error: 'Credenciais inválidas.' });
      }

      const { email, password } = parsed.data;
      const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);

      if (!user) {
        return res.status(400).render('login', { error: 'E-mail ou senha incorretos.' });
      }

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        return res.status(400).render('login', { error: 'E-mail ou senha incorretos.' });
      }

      req.session.userId = user.id;
      return res.redirect('/');
    } catch (err) {
      console.error('[Login Error]:', err);
      return res.status(500).render('login', { error: 'Erro ao autenticar.' });
    }
  }

  logout(req, res) {
    req.session.destroy(() => {
      res.redirect('/login');
    });
  }
}

module.exports = new AuthController();

