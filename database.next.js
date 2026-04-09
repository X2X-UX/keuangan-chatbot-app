const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");
const { pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } = require("crypto");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "arunika.sqlite");
const LEGACY_SEED_FILE = path.join(DATA_DIR, "transactions.json");
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const TELEGRAM_LINK_CODE_TTL_SECONDS = 60 * 10;

let db;

function initializeDatabase() {
  if (db) {
    return db;
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_FILE);
  db.exec("PRAGMA foreign_keys = ON;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_iterations INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      amount INTEGER NOT NULL,
      category TEXT NOT NULL,
      date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS telegram_links (
      user_id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL UNIQUE,
      chat_type TEXT NOT NULL,
      username TEXT,
      first_name TEXT,
      linked_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS telegram_link_codes (
      code TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_user_id ON telegram_link_codes(user_id);
  `);

  seedDemoAccount();
  return db;
}

function getDatabase() {
  return initializeDatabase();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function sanitizeName(name) {
  return String(name || "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const iterations = 210_000;
  const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
  return { hash, iterations, salt };
}

function verifyPassword(password, userRow) {
  const derived = pbkdf2Sync(
    String(password || ""),
    userRow.password_salt,
    userRow.password_iterations,
    32,
    "sha256"
  );
  const stored = Buffer.from(userRow.password_hash, "hex");

  return stored.length === derived.length && timingSafeEqual(stored, derived);
}

function sanitizeUser(row) {
  if (!row) {
    return null;
  }

  return {
    createdAt: row.created_at,
    email: row.email,
    id: row.id,
    lastLoginAt: row.last_login_at,
    name: row.name
  };
}

function sanitizeTelegramLink(row) {
  if (!row) {
    return null;
  }

  return {
    chatId: row.chat_id,
    chatType: row.chat_type,
    firstName: row.first_name,
    linkedAt: row.linked_at,
    username: row.username
  };
}

function getUserByEmail(email) {
  const database = getDatabase();
  return database.prepare("SELECT * FROM users WHERE email = ?").get(normalizeEmail(email));
}

function getUserById(id) {
  const database = getDatabase();
  return database.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

function validateCredentials({ name, email, password }, requireName) {
  const cleanName = sanitizeName(name);
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = String(password || "");

  if (requireName && !cleanName) {
    throw new Error("Nama lengkap wajib diisi.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error("Email tidak valid.");
  }

  if (cleanPassword.length < 8) {
    throw new Error("Password harus terdiri dari minimal 8 karakter.");
  }

  return {
    email: cleanEmail,
    name: cleanName,
    password: cleanPassword
  };
}

function createUser(credentials, options = {}) {
  const database = getDatabase();
  const { email, name, password } = validateCredentials(credentials, !options.allowEmptyName);

  if (getUserByEmail(email)) {
    throw new Error("Email sudah terdaftar pada sistem.");
  }

  const id = randomUUID();
  const timestamp = new Date().toISOString();
  const finalName = name || email.split("@")[0];
  const passwordRecord = hashPassword(password);

  database
    .prepare(
      `
        INSERT INTO users (
          id,
          name,
          email,
          password_hash,
          password_salt,
          password_iterations,
          created_at,
          last_login_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      id,
      finalName,
      email,
      passwordRecord.hash,
      passwordRecord.salt,
      passwordRecord.iterations,
      timestamp,
      null
    );

  return sanitizeUser(getUserById(id));
}

function authenticateUser(email, password) {
  const database = getDatabase();
  const userRow = getUserByEmail(email);

  if (!userRow || !verifyPassword(password, userRow)) {
    return null;
  }

  const lastLoginAt = new Date().toISOString();
  database.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(lastLoginAt, userRow.id);
  return sanitizeUser(getUserById(userRow.id));
}

function createSession(userId) {
  const database = getDatabase();
  const sessionId = randomBytes(32).toString("hex");
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();

  database
    .prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(sessionId, userId, createdAt.toISOString(), expiresAt);

  return {
    expiresAt,
    id: sessionId
  };
}

function getSessionWithUser(sessionId) {
  if (!sessionId) {
    return null;
  }

  const database = getDatabase();
  const row = database
    .prepare(
      `
        SELECT
          sessions.id AS session_id,
          sessions.expires_at,
          users.id,
          users.name,
          users.email,
          users.created_at,
          users.last_login_at
        FROM sessions
        INNER JOIN users ON users.id = sessions.user_id
        WHERE sessions.id = ?
      `
    )
    .get(sessionId);

  if (!row) {
    return null;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    deleteSession(sessionId);
    return null;
  }

  return {
    sessionId: row.session_id,
    user: sanitizeUser(row)
  };
}

function deleteSession(sessionId) {
  if (!sessionId) {
    return;
  }

  const database = getDatabase();
  database.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

function listTransactionsByUser(userId) {
  const database = getDatabase();
  return database
    .prepare(
      `
        SELECT
          id,
          type,
          description,
          amount,
          category,
          date,
          notes,
          created_at AS createdAt
        FROM transactions
        WHERE user_id = ?
        ORDER BY date DESC, created_at DESC
      `
    )
    .all(userId);
}

function createTransactionForUser(userId, transaction) {
  const database = getDatabase();
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  database
    .prepare(
      `
        INSERT INTO transactions (
          id,
          user_id,
          type,
          description,
          amount,
          category,
          date,
          notes,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      id,
      userId,
      transaction.type,
      transaction.description,
      transaction.amount,
      transaction.category,
      transaction.date,
      transaction.notes,
      createdAt
    );

  return {
    createdAt,
    ...transaction,
    id
  };
}

function updateTransactionForUser(userId, transactionId, transaction) {
  const database = getDatabase();
  const existing = database
    .prepare(
      `
        SELECT id, created_at AS createdAt
        FROM transactions
        WHERE id = ? AND user_id = ?
      `
    )
    .get(transactionId, userId);

  if (!existing) {
    return null;
  }

  database
    .prepare(
      `
        UPDATE transactions
        SET
          type = ?,
          description = ?,
          amount = ?,
          category = ?,
          date = ?,
          notes = ?
        WHERE id = ? AND user_id = ?
      `
    )
    .run(
      transaction.type,
      transaction.description,
      transaction.amount,
      transaction.category,
      transaction.date,
      transaction.notes,
      transactionId,
      userId
    );

  return {
    createdAt: existing.createdAt,
    ...transaction,
    id: transactionId
  };
}

function deleteTransactionForUser(userId, transactionId) {
  const database = getDatabase();
  const result = database.prepare("DELETE FROM transactions WHERE id = ? AND user_id = ?").run(transactionId, userId);
  return result.changes > 0;
}

function cleanupExpiredTelegramLinkCodes() {
  const database = getDatabase();
  database.prepare("DELETE FROM telegram_link_codes WHERE expires_at <= ?").run(new Date().toISOString());
}

function generateTelegramLinkCode(userId) {
  const database = getDatabase();
  cleanupExpiredTelegramLinkCodes();

  database.prepare("DELETE FROM telegram_link_codes WHERE user_id = ?").run(userId);

  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + TELEGRAM_LINK_CODE_TTL_SECONDS * 1000).toISOString();

  database
    .prepare("INSERT INTO telegram_link_codes (code, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(code, userId, createdAt.toISOString(), expiresAt);

  return {
    code,
    expiresAt
  };
}

function linkTelegramChatByCode(code, chat) {
  const database = getDatabase();
  cleanupExpiredTelegramLinkCodes();

  const normalizedCode = String(code || "").trim().toUpperCase();
  const row = database
    .prepare(
      `
        SELECT
          telegram_link_codes.code,
          telegram_link_codes.user_id,
          telegram_link_codes.expires_at,
          users.id,
          users.name,
          users.email,
          users.created_at,
          users.last_login_at
        FROM telegram_link_codes
        INNER JOIN users ON users.id = telegram_link_codes.user_id
        WHERE telegram_link_codes.code = ?
      `
    )
    .get(normalizedCode);

  if (!row) {
    return null;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    database.prepare("DELETE FROM telegram_link_codes WHERE code = ?").run(normalizedCode);
    return null;
  }

  const timestamp = new Date().toISOString();
  database.prepare("DELETE FROM telegram_links WHERE user_id = ? OR chat_id = ?").run(row.user_id, String(chat.id));
  database
    .prepare(
      `
        INSERT INTO telegram_links (
          user_id,
          chat_id,
          chat_type,
          username,
          first_name,
          linked_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      row.user_id,
      String(chat.id),
      String(chat.type || "private"),
      String(chat.username || ""),
      String(chat.first_name || ""),
      timestamp
    );

  database.prepare("DELETE FROM telegram_link_codes WHERE user_id = ?").run(row.user_id);

  return {
    link: getTelegramLinkByUserId(row.user_id),
    user: sanitizeUser(row)
  };
}

function getTelegramLinkByUserId(userId) {
  const database = getDatabase();
  const row = database.prepare("SELECT * FROM telegram_links WHERE user_id = ?").get(userId);
  return sanitizeTelegramLink(row);
}

function getTelegramLinkByChatId(chatId) {
  const database = getDatabase();
  const row = database
    .prepare(
      `
        SELECT
          telegram_links.chat_id,
          telegram_links.chat_type,
          telegram_links.username,
          telegram_links.first_name,
          telegram_links.linked_at,
          users.id,
          users.name,
          users.email,
          users.created_at,
          users.last_login_at
        FROM telegram_links
        INNER JOIN users ON users.id = telegram_links.user_id
        WHERE telegram_links.chat_id = ?
      `
    )
    .get(String(chatId));

  if (!row) {
    return null;
  }

  return {
    link: sanitizeTelegramLink(row),
    user: sanitizeUser(row)
  };
}

function unlinkTelegramByUserId(userId) {
  const database = getDatabase();
  const result = database.prepare("DELETE FROM telegram_links WHERE user_id = ?").run(userId);
  return result.changes > 0;
}

function unlinkTelegramByChatId(chatId) {
  const database = getDatabase();
  const result = database.prepare("DELETE FROM telegram_links WHERE chat_id = ?").run(String(chatId));
  return result.changes > 0;
}

function seedDemoAccount() {
  const database = getDatabase();
  const userCountRow = database.prepare("SELECT COUNT(*) AS count FROM users").get();

  if (userCountRow.count > 0) {
    return;
  }

  const demoUser = createUser(
    {
      email: "demo@arunika.local",
      name: "Demo User",
      password: "demo12345"
    },
    { allowEmptyName: false }
  );

  const seedTransactions = loadLegacySeedTransactions();
  for (const item of seedTransactions) {
    createTransactionForUser(demoUser.id, {
      amount: Number(item.amount) || 0,
      category: String(item.category || "Umum"),
      date: String(item.date || new Date().toISOString().slice(0, 10)),
      description: String(item.description || "Transaksi"),
      notes: String(item.notes || ""),
      type: item.type === "income" ? "income" : "expense"
    });
  }
}

function loadLegacySeedTransactions() {
  if (!fs.existsSync(LEGACY_SEED_FILE)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(LEGACY_SEED_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

module.exports = {
  SESSION_MAX_AGE_SECONDS,
  TELEGRAM_LINK_CODE_TTL_SECONDS,
  authenticateUser,
  createSession,
  createTelegramLinkCode: generateTelegramLinkCode,
  createTransactionForUser,
  createUser,
  deleteSession,
  deleteTransactionForUser,
  getSessionWithUser,
  getTelegramLinkByChatId,
  getTelegramLinkByUserId,
  initializeDatabase,
  linkTelegramChatByCode,
  listTransactionsByUser,
  unlinkTelegramByChatId,
  unlinkTelegramByUserId,
  updateTransactionForUser
};
