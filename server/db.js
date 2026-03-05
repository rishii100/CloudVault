const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.VERCEL
  ? path.join('/tmp', 'app.db')
  : path.join(__dirname, '..', 'data', 'app.db');

const db = new Database(dbPath);

// Enable WAL mode for better concurrent access (only for persistent local disk, not Vercel /tmp)
if (!process.env.VERCEL) {
  db.pragma('journal_mode = WAL');
}

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reference_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    content TEXT NOT NULL,
    is_default INTEGER DEFAULT 0,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    questionnaire_filename TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    version_label TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    question_index INTEGER NOT NULL,
    question TEXT NOT NULL,
    answer TEXT,
    citations TEXT,
    confidence REAL,
    edited INTEGER DEFAULT 0
  );
`);

module.exports = db;
