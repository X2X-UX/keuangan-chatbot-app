const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");
const { pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } = require("crypto");

const ROOT = path.resolve(__dirname, "../../..");
const CONFIGURED_DATA_DIR = String(process.env.ARUNIKA_DATA_DIR || "").trim();
const CONFIGURED_DB_FILE = String(process.env.ARUNIKA_DB_FILE || "").trim();
const DATA_DIR = CONFIGURED_DATA_DIR ? path.resolve(CONFIGURED_DATA_DIR) : path.join(ROOT, "data");
const DB_FILE = CONFIGURED_DB_FILE ? path.resolve(CONFIGURED_DB_FILE) : path.join(DATA_DIR, "arunika.sqlite");
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
      receipt_path TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS category_budgets (
      user_id TEXT NOT NULL,
      month TEXT NOT NULL,
      category TEXT NOT NULL,
      amount INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, month, category),
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

    CREATE TABLE IF NOT EXISTS telegram_receipt_drafts (
      chat_id TEXT PRIMARY KEY,
      linked_user_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (linked_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_category_budgets_user_month ON category_budgets(user_id, month);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_user_id ON telegram_link_codes(user_id);
    CREATE INDEX IF NOT EXISTS idx_telegram_receipt_drafts_user_id ON telegram_receipt_drafts(linked_user_id);
    CREATE INDEX IF NOT EXISTS idx_telegram_receipt_drafts_expires_at ON telegram_receipt_drafts(expires_at);
  `);

  ensureTransactionReceiptColumn(db);

  seedDemoAccount();
  return db;
}

function ensureTransactionReceiptColumn(database) {
  const columns = database.prepare("PRAGMA table_info(transactions)").all();
  if (!columns.some((column) => column.name === "receipt_path")) {
    database.exec("ALTER TABLE transactions ADD COLUMN receipt_path TEXT NOT NULL DEFAULT '';");
  }
}

function getDatabase() {
  return initializeDatabase();
}

function closeDatabase() {
  if (!db) {
    return;
  }

  db.close();
  db = undefined;
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

function sanitizeCategoryBudget(row) {
  if (!row) {
    return null;
  }

  return {
    amount: Number(row.amount) || 0,
    category: String(row.category || ""),
    month: String(row.month || ""),
    updatedAt: row.updated_at
  };
}

function serializeTelegramReceiptDraft(draft) {
  if (!draft || typeof draft !== "object") {
    return "{}";
  }

  const payload = {
    ...draft,
    receiptUpload: draft.receiptUpload
      ? {
          bufferBase64: Buffer.isBuffer(draft.receiptUpload.buffer)
            ? draft.receiptUpload.buffer.toString("base64")
            : String(draft.receiptUpload.bufferBase64 || ""),
          fileName: String(draft.receiptUpload.fileName || ""),
          mimeType: String(draft.receiptUpload.mimeType || "")
        }
      : null
  };

  return JSON.stringify(payload);
}

function deserializeTelegramReceiptDraft(payloadJson) {
  if (!payloadJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(payloadJson);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return {
      ...parsed,
      receiptUpload: parsed.receiptUpload
        ? {
            buffer: Buffer.from(String(parsed.receiptUpload.bufferBase64 || ""), "base64"),
            fileName: String(parsed.receiptUpload.fileName || ""),
            mimeType: String(parsed.receiptUpload.mimeType || "")
          }
        : null
    };
  } catch {
    return null;
  }
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
          receipt_path AS receiptPath,
          created_at AS createdAt
        FROM transactions
        WHERE user_id = ?
        ORDER BY date DESC, created_at DESC
      `
    )
    .all(userId);
}

function getTransactionByIdForUser(userId, transactionId) {
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
          receipt_path AS receiptPath,
          created_at AS createdAt
        FROM transactions
        WHERE user_id = ? AND id = ?
      `
    )
    .get(userId, transactionId);
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
          receipt_path,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      transaction.receiptPath || "",
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
        SELECT id, created_at AS createdAt, receipt_path AS receiptPath
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
          notes = ?,
          receipt_path = ?
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
      transaction.receiptPath || "",
      transactionId,
      userId
    );

  return {
    createdAt: existing.createdAt,
    previousReceiptPath: existing.receiptPath || "",
    ...transaction,
    id: transactionId
  };
}

function deleteTransactionForUser(userId, transactionId) {
  const database = getDatabase();
  const existing = getTransactionByIdForUser(userId, transactionId);
  if (!existing) {
    return null;
  }

  database.prepare("DELETE FROM transactions WHERE id = ? AND user_id = ?").run(transactionId, userId);
  return existing;
}

function listCategoryBudgetsByUser(userId, month = "") {
  const database = getDatabase();
  const cleanMonth = String(month || "").trim();
  const rows = cleanMonth
    ? database
        .prepare(
          `
            SELECT user_id, month, category, amount, updated_at
            FROM category_budgets
            WHERE user_id = ? AND month = ?
            ORDER BY category COLLATE NOCASE ASC
          `
        )
        .all(userId, cleanMonth)
    : database
        .prepare(
          `
            SELECT user_id, month, category, amount, updated_at
            FROM category_budgets
            WHERE user_id = ?
            ORDER BY month DESC, category COLLATE NOCASE ASC
          `
        )
        .all(userId);

  return rows.map((row) => sanitizeCategoryBudget(row));
}

function upsertCategoryBudgetForUser(userId, budget) {
  const database = getDatabase();
  const month = String(budget?.month || "").trim();
  const category = String(budget?.category || "").trim();
  const amount = Math.round(Number(budget?.amount) || 0);

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("Periode budget harus memakai format YYYY-MM.");
  }

  if (!category) {
    throw new Error("Kategori budget wajib diisi.");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Nominal budget harus lebih besar dari nol.");
  }

  const updatedAt = new Date().toISOString();
  database
    .prepare(
      `
        INSERT INTO category_budgets (user_id, month, category, amount, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, month, category) DO UPDATE SET
          amount = excluded.amount,
          updated_at = excluded.updated_at
      `
    )
    .run(userId, month, category, amount, updatedAt);

  return sanitizeCategoryBudget({
    amount,
    category,
    month,
    updated_at: updatedAt
  });
}

function deleteCategoryBudgetForUser(userId, month, category) {
  const database = getDatabase();
  const result = database
    .prepare("DELETE FROM category_budgets WHERE user_id = ? AND month = ? AND category = ?")
    .run(userId, String(month || "").trim(), String(category || "").trim());
  return result.changes > 0;
}

function cleanupExpiredTelegramLinkCodes() {
  const database = getDatabase();
  database.prepare("DELETE FROM telegram_link_codes WHERE expires_at <= ?").run(new Date().toISOString());
}

function cleanupExpiredTelegramReceiptDrafts() {
  const database = getDatabase();
  database.prepare("DELETE FROM telegram_receipt_drafts WHERE expires_at <= ?").run(new Date().toISOString());
}

function saveTelegramReceiptDraft(chatId, draft) {
  const database = getDatabase();
  const cleanChatId = String(chatId || "").trim();
  const linkedUserId = String(draft?.linkedUserId || "").trim();
  const createdAt = new Date(Number(draft?.createdAt || Date.now())).toISOString();
  const expiresAt = new Date(Number(draft?.expiresAt || Date.now())).toISOString();

  if (!cleanChatId || !linkedUserId) {
    throw new Error("Draft Telegram tidak valid.");
  }

  database
    .prepare(
      `
        INSERT INTO telegram_receipt_drafts (
          chat_id,
          linked_user_id,
          payload_json,
          created_at,
          expires_at
        )
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(chat_id) DO UPDATE SET
          linked_user_id = excluded.linked_user_id,
          payload_json = excluded.payload_json,
          created_at = excluded.created_at,
          expires_at = excluded.expires_at
      `
    )
    .run(cleanChatId, linkedUserId, serializeTelegramReceiptDraft(draft), createdAt, expiresAt);
}

function getTelegramReceiptDraft(chatId) {
  cleanupExpiredTelegramReceiptDrafts();

  const database = getDatabase();
  const row = database
    .prepare(
      `
        SELECT
          chat_id,
          linked_user_id,
          payload_json,
          created_at,
          expires_at
        FROM telegram_receipt_drafts
        WHERE chat_id = ?
      `
    )
    .get(String(chatId || "").trim());

  if (!row) {
    return null;
  }

  const draft = deserializeTelegramReceiptDraft(row.payload_json);
  if (!draft) {
    deleteTelegramReceiptDraft(chatId);
    return null;
  }

  return {
    ...draft,
    createdAt: new Date(row.created_at).getTime(),
    expiresAt: new Date(row.expires_at).getTime(),
    linkedUserId: row.linked_user_id
  };
}

function deleteTelegramReceiptDraft(chatId) {
  const database = getDatabase();
  const result = database.prepare("DELETE FROM telegram_receipt_drafts WHERE chat_id = ?").run(String(chatId || "").trim());
  return result.changes > 0;
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
  const existingDemoUser = getUserByEmail("demo@arunika.local");
  const demoUser =
    existingDemoUser ||
    createUser(
      {
        email: "demo@arunika.local",
        name: "Demo User",
        password: "demo12345"
      },
      { allowEmptyName: false }
    );

  const demoTransactionCount = database
    .prepare("SELECT COUNT(*) AS count FROM transactions WHERE user_id = ?")
    .get(demoUser.id);
  if (demoTransactionCount.count > 0) {
    return;
  }

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
  DATA_DIR,
  DB_FILE,
  SESSION_MAX_AGE_SECONDS,
  TELEGRAM_LINK_CODE_TTL_SECONDS,
  authenticateUser,
  closeDatabase,
  deleteCategoryBudgetForUser,
  deleteTelegramReceiptDraft,
  createSession,
  createTelegramLinkCode: generateTelegramLinkCode,
  createTransactionForUser,
  createUser,
  deleteSession,
  deleteTransactionForUser,
  getTelegramReceiptDraft,
  getSessionWithUser,
  getTelegramLinkByChatId,
  getTelegramLinkByUserId,
  initializeDatabase,
  getTransactionByIdForUser,
  linkTelegramChatByCode,
  listCategoryBudgetsByUser,
  listTransactionsByUser,
  saveTelegramReceiptDraft,
  unlinkTelegramByChatId,
  unlinkTelegramByUserId,
  upsertCategoryBudgetForUser,
  updateTransactionForUser
};
