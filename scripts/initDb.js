const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const env = require('../src/config/env');
const { db, initSchema } = require('../src/config/database');

const isProduction = env.nodeEnv === 'production';

// Contas de demonstração com senhas públicas (estão no repositório e nos docs).
const DEMO_ACCOUNTS = ['demo@tigrinho.com', 'admin@tigrinho.com'];
const WEAK_PASSWORDS = ['demo1234', 'admin1234', 'troque_esta_senha'];
const MIN_ADMIN_PASSWORD_PROD = 12;

console.log(`Initializing database schema (NODE_ENV=${env.nodeEnv})...`);
initSchema();

function findUser(email) {
  return db.prepare('SELECT id, role, status FROM users WHERE email = ?').get(email);
}

function insertUser({ name, document, email, password, balanceCents = 0, role = 'user' }) {
  db.prepare(`
    INSERT INTO users (id, name, document, email, password_hash, balance_cents, total_deposited_cents, total_wagered_cents, role, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `).run(uuidv4(), name, document, email, bcrypt.hashSync(password, 10), balanceCents, balanceCents, balanceCents, role);
}

// ---------------------------------------------------------------------------
// 1. Contas demo: só fora de produção.
// ---------------------------------------------------------------------------
function seedDemoAccounts() {
  const demo = findUser('demo@tigrinho.com');
  if (demo) {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(demo.id);
  } else {
    insertUser({
      name: 'Jogador Demonstração',
      document: '12345678909',
      email: 'demo@tigrinho.com',
      password: 'demo1234',
      balanceCents: 10000,
      role: 'admin'
    });
    console.log('Created demo admin user: demo@tigrinho.com / demo1234');
  }

  if (!findUser('admin@tigrinho.com')) {
    insertUser({
      name: 'Administrador Chefe',
      document: '00011122233',
      email: 'admin@tigrinho.com',
      password: 'admin1234',
      role: 'admin'
    });
    console.log('Created demo admin: admin@tigrinho.com / admin1234');
  }
}

// Em produção, neutraliza contas demo que tenham vindo de um banco de dev:
// tira o papel de admin, bloqueia e troca a senha por uma aleatória.
function disableDemoAccounts() {
  for (const email of DEMO_ACCOUNTS) {
    const user = findUser(email);
    if (!user || (user.role === 'user' && user.status === 'blocked')) continue;
    const randomHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
    db.prepare(`
      UPDATE users
      SET role = 'user', status = 'blocked', password_hash = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(randomHash, user.id);
    console.warn(`[SECURITY] Demo account ${email} found in production: demoted, blocked and password randomized.`);
  }
}

// ---------------------------------------------------------------------------
// 2. Admin definido por variáveis de ambiente (ADMIN_*).
// ---------------------------------------------------------------------------
function seedEnvAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  const name = (process.env.ADMIN_NAME || 'Administrador').trim();
  const document = (process.env.ADMIN_DOCUMENT || '').replace(/\D/g, '') || '00000000000';
  const resetPassword = process.env.ADMIN_RESET_PASSWORD === 'true';

  if (!email && !password) {
    if (isProduction) {
      console.warn('[SECURITY] ADMIN_EMAIL/ADMIN_PASSWORD not set: no admin account was created. Set them in .env and restart.');
    }
    return;
  }
  if (!email || !password) {
    console.error('[ADMIN] Set both ADMIN_EMAIL and ADMIN_PASSWORD. Admin seed skipped.');
    return;
  }
  if (DEMO_ACCOUNTS.includes(email)) {
    console.error(`[ADMIN] ${email} is a demo account; choose another ADMIN_EMAIL. Admin seed skipped.`);
    return;
  }
  if (isProduction && (password.length < MIN_ADMIN_PASSWORD_PROD || WEAK_PASSWORDS.includes(password))) {
    console.error(`[ADMIN] ADMIN_PASSWORD too weak for production (min ${MIN_ADMIN_PASSWORD_PROD} chars, no default passwords). Admin seed skipped.`);
    return;
  }

  const existing = findUser(email);
  if (!existing) {
    try {
      insertUser({ name, document, email, password, role: 'admin' });
      console.log(`Created admin from env: ${email}`);
    } catch (err) {
      console.error(`[ADMIN] Could not create ${email}: ${err.message} (CPF em ADMIN_DOCUMENT já usado por outra conta?)`);
    }
    return;
  }

  // A conta já existe (ex.: criada em /register): garante que é admin e está ativa.
  // A senha só é sobrescrita se ADMIN_RESET_PASSWORD=true.
  if (existing.role !== 'admin' || existing.status !== 'active') {
    db.prepare("UPDATE users SET role = 'admin', status = 'active', updated_at = datetime('now') WHERE id = ?").run(existing.id);
    console.log(`Promoted ${email} to admin.`);
  }
  if (resetPassword) {
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
      .run(bcrypt.hashSync(password, 10), existing.id);
    console.log(`Password reset for ${email} (remove ADMIN_RESET_PASSWORD from .env now).`);
  }
}

if (isProduction) {
  disableDemoAccounts();
} else {
  seedDemoAccounts();
}
seedEnvAdmin();

console.log('Database initialized successfully.');
