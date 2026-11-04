const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const env = require('./env');

const dbPath = path.isAbsolute(env.dbFile)
  ? env.dbFile
  : path.resolve(__dirname, '../../', env.dbFile);

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode and foreign keys for performance and data integrity
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      document TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      balance_cents INTEGER NOT NULL DEFAULT 0,
      total_deposited_cents INTEGER NOT NULL DEFAULT 0,
      total_wagered_cents INTEGER NOT NULL DEFAULT 0,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL CHECK(type IN ('DEPOSIT', 'WITHDRAWAL', 'BET', 'WIN', 'ADJUSTMENT')),
      amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED')),
      external_reference TEXT,
      pix_key TEXT,
      pix_type TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS game_rounds (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      bet_cents INTEGER NOT NULL,
      payout_cents INTEGER NOT NULL,
      multiplier REAL NOT NULL,
      reels_matrix TEXT NOT NULL,
      paylines_hit TEXT NOT NULL,
      server_seed_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_ext_ref ON transactions(external_reference);
    CREATE INDEX IF NOT EXISTS idx_game_rounds_user ON game_rounds(user_id);
    CREATE INDEX IF NOT EXISTS idx_game_rounds_created ON game_rounds(created_at);
  `);

  // Migrações seguras caso a tabela users já exista sem role ou status
  try {
    const tableInfo = db.prepare('PRAGMA table_info(users)').all();
    const hasRole = tableInfo.some(col => col.name === 'role');
    const hasStatus = tableInfo.some(col => col.name === 'status');
    if (!hasRole) {
      db.prepare("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'").run();
    }
    if (!hasStatus) {
      db.prepare("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'").run();
    }

    // Migração de transactions para suportar ADJUSTMENT
    const txSqlRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'").get();
    if (txSqlRow && !txSqlRow.sql.includes('ADJUSTMENT')) {
      db.exec(`
        PRAGMA foreign_keys=off;
        ALTER TABLE transactions RENAME TO _transactions_old;
        CREATE TABLE transactions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          type TEXT NOT NULL CHECK(type IN ('DEPOSIT', 'WITHDRAWAL', 'BET', 'WIN', 'ADJUSTMENT')),
          amount_cents INTEGER NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED')),
          external_reference TEXT,
          pix_key TEXT,
          pix_type TEXT,
          metadata TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO transactions SELECT * FROM _transactions_old;
        DROP TABLE _transactions_old;
        PRAGMA foreign_keys=on;
      `);
    }
  } catch (err) {
    console.error('Migration notice:', err.message);
  }
}

initSchema();

module.exports = {
  db,
  initSchema
};

