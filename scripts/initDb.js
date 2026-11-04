const { db, initSchema } = require('../src/config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

console.log('Initializing database schema...');
initSchema();

// Promote demo@tigrinho.com to admin if exists
const demoUser = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@tigrinho.com');
if (demoUser) {
  db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(demoUser.id);
  console.log('Promoted demo@tigrinho.com to admin.');
} else {
  const hash = bcrypt.hashSync('demo1234', 10);
  const userId = uuidv4();
  db.prepare(`
    INSERT INTO users (id, name, document, email, password_hash, balance_cents, total_deposited_cents, total_wagered_cents, role, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'admin', 'active')
  `).run(
    userId,
    'Jogador Demonstração',
    '12345678909',
    'demo@tigrinho.com',
    hash,
    10000,
    10000,
    10000
  );
  console.log('Created demo admin user: demo@tigrinho.com / demo1234');
}

// Create dedicated admin@tigrinho.com
const adminUser = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@tigrinho.com');
if (!adminUser) {
  const adminHash = bcrypt.hashSync('admin1234', 10);
  const adminId = uuidv4();
  db.prepare(`
    INSERT INTO users (id, name, document, email, password_hash, balance_cents, total_deposited_cents, total_wagered_cents, role, status)
    VALUES (?, ?, ?, ?, ?, 0, 0, 0, 'admin', 'active')
  `).run(
    adminId,
    'Administrador Chefe',
    '00011122233',
    'admin@tigrinho.com',
    adminHash
  );
  console.log('Created dedicated admin: admin@tigrinho.com / admin1234');
}

console.log('Database initialized successfully.');
