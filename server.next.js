const http = require("http");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const { URL } = require("url");

const {
  SESSION_MAX_AGE_SECONDS,
  createTelegramLinkCode,
  authenticateUser,
  createSession,
  createTransactionForUser,
  createUser,
  deleteSession,
  deleteTransactionForUser,
  getSessionWithUser,
  getTransactionByIdForUser,
  getTelegramLinkByChatId,
  getTelegramLinkByUserId,
  initializeDatabase,
  linkTelegramChatByCode,
  listTransactionsByUser,
  unlinkTelegramByChatId,
  unlinkTelegramByUserId,
  updateTransactionForUser
} = require("./database.next");
const {
  findCanonicalCategory,
  formatTransactionCategoryList,
  inferTransactionCategory
} = require("./transaction-categories");
const { parseFlexibleAmount } = require("./transaction-amount");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const RECEIPTS_DIR = path.join(ROOT, "data", "receipts");
const ENV_FILE = path.join(ROOT, ".env");

loadEnvFile(ENV_FILE);

const PORT = Number(process.env.PORT || 3000);
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const OCR_SPACE_API_KEY = String(process.env.OCR_SPACE_API_KEY || "").trim();
const OCR_SPACE_API_URL = "https://api.ocr.space/parse/image";
const COOKIE_NAME = "session_id";
const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_WEBHOOK_SECRET = String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
const TELEGRAM_BOT_USERNAME = String(process.env.TELEGRAM_BOT_USERNAME || "").trim();
const APP_BASE_URL = String(process.env.APP_BASE_URL || "").trim();
const TELEGRAM_AUTO_SET_WEBHOOK = String(process.env.TELEGRAM_AUTO_SET_WEBHOOK || "").trim().toLowerCase() === "true";
const ALLOWED_ORIGINS = buildAllowedOrigins();
const RATE_LIMIT_STORE = new Map();
const RATE_LIMITS = {
  api: { max: 240, windowMs: 60_000 },
  auth: { max: 20, windowMs: 10 * 60_000 },
  chat: { max: 50, windowMs: 60_000 },
  telegramWebhook: { max: 1_200, windowMs: 60_000 },
  transactionWrite: { max: 60, windowMs: 60_000 }
};

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function parseEnvOrigins(value) {
  const items = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const origins = new Set();
  for (const item of items) {
    try {
      origins.add(new URL(item).origin);
    } catch {
      // ignore malformed origin values from env
    }
  }

  return origins;
}

function buildAllowedOrigins() {
  const origins = new Set();
  const defaults = [
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ];

  for (const item of defaults) {
    origins.add(item);
  }

  try {
    if (APP_BASE_URL) {
      origins.add(new URL(APP_BASE_URL).origin);
    }
  } catch {
    // APP_BASE_URL validation is handled elsewhere
  }

  const extraOrigins = parseEnvOrigins(process.env.ALLOWED_ORIGINS);
  for (const origin of extraOrigins) {
    origins.add(origin);
  }

  return origins;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const index = trimmed.indexOf("=");
    if (index === -1) {
      continue;
    }

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function sortTransactions(items) {
  return [...items].sort((left, right) => {
    const timeDiff = new Date(right.date).getTime() - new Date(left.date).getTime();
    if (timeDiff !== 0) {
      return timeDiff;
    }

    return String(right.id).localeCompare(String(left.id));
  });
}

function computeSummary(items) {
  const sorted = sortTransactions(items);
  const expenseCounts = sorted.filter((item) => item.type === "expense").length;
  const incomeCounts = sorted.filter((item) => item.type === "income").length;
  const totals = { income: 0, expense: 0 };
  const expenseCategories = new Map();
  const incomeCategories = new Map();
  const monthlyMap = new Map();
  let biggestExpense = null;

  for (const item of sorted) {
    const amount = Number(item.amount) || 0;
    const month = String(item.date || "").slice(0, 7);

    if (!monthlyMap.has(month)) {
      monthlyMap.set(month, { month, income: 0, expense: 0, net: 0 });
    }

    if (item.type === "income") {
      totals.income += amount;
      monthlyMap.get(month).income += amount;
      incomeCategories.set(item.category, (incomeCategories.get(item.category) || 0) + amount);
    } else {
      totals.expense += amount;
      monthlyMap.get(month).expense += amount;
      expenseCategories.set(item.category, (expenseCategories.get(item.category) || 0) + amount);
      if (!biggestExpense || amount > biggestExpense.amount) {
        biggestExpense = item;
      }
    }
  }

  const monthlyCashflow = Array.from(monthlyMap.values())
    .filter((entry) => entry.month)
    .map((entry) => ({ ...entry, net: entry.income - entry.expense }))
    .sort((left, right) => left.month.localeCompare(right.month))
    .slice(-6);

  const expenseList = Array.from(expenseCategories.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      share: totals.expense ? Number(((amount / totals.expense) * 100).toFixed(1)) : 0
    }))
    .sort((left, right) => right.amount - left.amount);

  const incomeList = Array.from(incomeCategories.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((left, right) => right.amount - left.amount);

  const balance = totals.income - totals.expense;
  const savingsRate = totals.income ? Number(((balance / totals.income) * 100).toFixed(1)) : 0;

  return {
    averageExpense: expenseCounts ? Math.round(totals.expense / expenseCounts) : 0,
    averageIncome: incomeCounts ? Math.round(totals.income / incomeCounts) : 0,
    balance,
    biggestExpense,
    expenseCategories: expenseList,
    incomeCategories: incomeList,
    monthlyCashflow,
    recentTransactions: sorted.slice(0, 6),
    savingsRate,
    topExpenseCategory: expenseList[0] || null,
    totalExpense: totals.expense,
    totalIncome: totals.income,
    transactionCount: sorted.length
  };
}

function getRequestOrigin(req) {
  const origin = String(req?.headers?.origin || "").trim();
  if (origin) {
    try {
      return new URL(origin).origin;
    } catch {
      return "";
    }
  }

  const referer = String(req?.headers?.referer || "").trim();
  if (!referer) {
    return "";
  }

  try {
    return new URL(referer).origin;
  } catch {
    return "";
  }
}

function getCorsHeaders(req) {
  const origin = getRequestOrigin(req);
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return {};
  }

  return {
    "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin"
  };
}

function getSecurityHeaders(req) {
  const headers = {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  };

  headers["Content-Security-Policy"] = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'"
  ].join("; ");

  if (process.env.NODE_ENV === "production") {
    const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "").toLowerCase();
    if (forwardedProto.includes("https")) {
      headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
    }
  }

  return headers;
}

function sweepRateLimitStore(now = Date.now()) {
  for (const [key, entry] of RATE_LIMIT_STORE.entries()) {
    if (entry.resetAt <= now) {
      RATE_LIMIT_STORE.delete(key);
    }
  }
}

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").trim();
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return String(req.socket?.remoteAddress || "unknown");
}

function takeRateLimit(bucket, identifier) {
  const config = RATE_LIMITS[bucket];
  if (!config) {
    return { limited: false, retryAfterSeconds: 0 };
  }

  const now = Date.now();
  if (RATE_LIMIT_STORE.size > 10_000) {
    sweepRateLimitStore(now);
  }

  const key = `${bucket}:${identifier}`;
  const current = RATE_LIMIT_STORE.get(key);
  if (!current || current.resetAt <= now) {
    RATE_LIMIT_STORE.set(key, { count: 1, resetAt: now + config.windowMs });
    return { limited: false, retryAfterSeconds: 0 };
  }

  current.count += 1;
  RATE_LIMIT_STORE.set(key, current);
  if (current.count <= config.max) {
    return { limited: false, retryAfterSeconds: 0 };
  }

  return {
    limited: true,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
  };
}

function isUnsafeApiMutation(method) {
  return method === "POST" || method === "DELETE" || method === "PUT" || method === "PATCH";
}

function isTrustedRequestOrigin(req) {
  const secFetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (secFetchSite && !["same-origin", "same-site", "none"].includes(secFetchSite)) {
    return false;
  }

  const origin = getRequestOrigin(req);
  if (!origin) {
    return true;
  }

  return ALLOWED_ORIGINS.has(origin);
}

function enforceRateLimit(req, res, bucket, identifierSuffix = "") {
  const identifier = `${getClientIp(req)}:${identifierSuffix}`;
  const { limited, retryAfterSeconds } = takeRateLimit(bucket, identifier);
  if (!limited) {
    return false;
  }

  sendJson(req, res, 429, { error: "Terlalu banyak permintaan. Silakan coba kembali beberapa saat lagi." }, {
    "Retry-After": String(retryAfterSeconds)
  });
  return true;
}

function sendJson(arg1, arg2, arg3, arg4, arg5) {
  const hasReq = Boolean(arg1 && typeof arg1.method === "string" && arg1.headers);
  const req = hasReq ? arg1 : null;
  const res = hasReq ? arg2 : arg1;
  const statusCode = hasReq ? arg3 : arg2;
  const payload = hasReq ? arg4 : arg3;
  const extraHeaders = hasReq ? arg5 || {} : arg4 || {};

  res.writeHead(statusCode, {
    ...getSecurityHeaders(req),
    ...getCorsHeaders(req),
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

function sendText(arg1, arg2, arg3, arg4) {
  const hasReq = Boolean(arg1 && typeof arg1.method === "string" && arg1.headers);
  const req = hasReq ? arg1 : null;
  const res = hasReq ? arg2 : arg1;
  const statusCode = hasReq ? arg3 : arg2;
  const text = hasReq ? arg4 : arg3;

  res.writeHead(statusCode, {
    ...getSecurityHeaders(req),
    ...getCorsHeaders(req),
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end(text);
}

function sendUnauthorized(req, res) {
  sendJson(req, res, 401, { error: "Silakan masuk terlebih dahulu." });
}

function isTelegramConfigured() {
  return Boolean(TELEGRAM_BOT_TOKEN);
}

function hasTelegramWebhookConfig() {
  return isTelegramConfigured() && Boolean(APP_BASE_URL);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) {
        reject(new Error("Payload terlalu besar."));
        req.destroy();
      }
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function parseJsonBody(req) {
  const raw = await readBody(req);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Body JSON tidak valid.");
  }
}

function todayDateValue() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function sanitizeText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizeTransaction(payload) {
  const type = payload.type === "income" ? "income" : payload.type === "expense" ? "expense" : null;
  const amount = parseFlexibleAmount(payload.amount);
  const description = sanitizeText(payload.description, 120);
  const rawCategory = sanitizeText(payload.category, 60);
  const category = type ? findCanonicalCategory(type, rawCategory) : null;
  const notes = sanitizeText(payload.notes, 240);
  const date = sanitizeText(payload.date, 10) || todayDateValue();

  if (!type) {
    throw new Error("Tipe transaksi harus income atau expense.");
  }

  if (!description) {
    throw new Error("Deskripsi transaksi wajib diisi.");
  }

  if (!rawCategory) {
    throw new Error("Kategori transaksi wajib diisi.");
  }

  if (!category) {
    throw new Error(
      `Kategori transaksi tidak sesuai daftar ${type === "income" ? "pemasukan" : "pengeluaran"}: ${formatTransactionCategoryList(type)}.`
    );
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Nominal transaksi harus lebih besar dari nol.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Format tanggal harus YYYY-MM-DD.");
  }

  return {
    amount: Math.round(amount),
    category,
    date,
    description,
    notes,
    receiptPath: sanitizeText(payload.receiptPath, 260),
    type
  };
}

function sanitizeReceiptUpload(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const dataUrl = String(payload.dataUrl || "").trim();
  const fileName = sanitizeText(payload.fileName, 120);
  if (!dataUrl) {
    return null;
  }

  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) {
    throw new Error("Format struk harus gambar PNG, JPG, atau WEBP.");
  }

  const mimeType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length) {
    throw new Error("File struk tidak valid.");
  }

  if (buffer.length > 2 * 1024 * 1024) {
    throw new Error("Ukuran struk maksimal 2 MB.");
  }

  return {
    buffer,
    fileName,
    mimeType
  };
}

function getReceiptExtension(mimeType) {
  if (mimeType === "image/png") {
    return ".png";
  }

  if (mimeType === "image/webp") {
    return ".webp";
  }

  return ".jpg";
}

async function saveReceiptUpload(userId, receiptUpload) {
  if (!receiptUpload) {
    return "";
  }

  const userDir = path.join(RECEIPTS_DIR, userId);
  await fsp.mkdir(userDir, { recursive: true });

  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${getReceiptExtension(receiptUpload.mimeType)}`;
  const absolutePath = path.join(userDir, fileName);
  await fsp.writeFile(absolutePath, receiptUpload.buffer);

  return path.relative(ROOT, absolutePath).replaceAll("\\", "/");
}

async function removeReceiptFile(receiptPath) {
  const safeRelative = String(receiptPath || "").replace(/^([/\\])+/, "");
  if (!safeRelative) {
    return;
  }

  const absolutePath = path.join(ROOT, safeRelative);
  const relativePath = path.relative(ROOT, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return;
  }

  try {
    await fsp.unlink(absolutePath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

async function enrichTransactionPayloadWithReceipt(userId, payload, existingReceiptPath = "") {
  const receiptAction = payload.receiptAction === "remove" ? "remove" : payload.receiptAction === "replace" ? "replace" : "keep";
  let receiptPath = existingReceiptPath || "";

  if (receiptAction === "remove") {
    receiptPath = "";
  }

  const receiptUpload = sanitizeReceiptUpload(payload.receiptUpload);
  const draft = sanitizeTransaction({
    ...payload,
    receiptPath
  });

  if (receiptUpload) {
    receiptPath = await saveReceiptUpload(userId, receiptUpload);
  }

  const sanitized = {
    ...draft,
    receiptPath
  };

  return {
    receiptAction,
    receiptPath,
    sanitized
  };
}

function buildTransactionFingerprint(transaction) {
  return [
    transaction.type,
    transaction.date,
    String(Math.round(Number(transaction.amount) || 0)),
    sanitizeText(transaction.description, 120).toLowerCase()
  ].join("|");
}

function sanitizeImportedTransaction(payload, sourceLabel) {
  const type = payload.type === "income" ? "income" : payload.type === "expense" ? "expense" : null;
  const description = sanitizeText(payload.description, 120);
  const rawCategory = sanitizeText(payload.category, 60);
  const inferredCategory = type ? inferTransactionCategory(type, `${description} ${rawCategory}`) : null;
  const fallbackCategory = type === "expense" ? "Belanja" : type === "income" ? "Hadiah" : "";
  const sourceNote = sourceLabel ? `Import CSV: ${sanitizeText(sourceLabel, 80)}` : "Import CSV";
  const rawNotes = sanitizeText(payload.notes, 240);
  const notes = [sourceNote, rawNotes].filter(Boolean).join(" | ").slice(0, 240);

  return sanitizeTransaction({
    ...payload,
    category: rawCategory || inferredCategory || fallbackCategory,
    description,
    notes
  });
}

function parseTransactionTypeToken(value) {
  if (/\b(?:pemasukan|income)\b/i.test(value)) {
    return "income";
  }

  if (/\b(?:pengeluaran|expense)\b/i.test(value)) {
    return "expense";
  }

  return null;
}

function parseChatTransactionCommand(message) {
  const raw = String(message || "").trim();
  if (!raw) {
    return null;
  }

  const commandMatch = raw.match(/^\/?catat(?:@\w+)?\b|^(?:tambah|input)\b/i);
  const directTypeMatch = raw.match(/^(pemasukan|income|pengeluaran|expense)\b/i);
  if (!commandMatch && !directTypeMatch) {
    return null;
  }

  const parseMode = commandMatch ? "command" : "direct";
  let type = null;
  let remainder = raw;

  if (commandMatch) {
    remainder = raw.slice(commandMatch[0].length).trim();
    const commandTypeMatch = remainder.match(/^(pemasukan|income|pengeluaran|expense)\b/i);
    type = parseTransactionTypeToken(commandTypeMatch?.[0] || "");
    if (!type || !commandTypeMatch) {
      return {
        error: "Perintah input dikenali, tetapi tipe transaksi belum jelas. Gunakan `pemasukan` atau `pengeluaran`."
      };
    }

    remainder = remainder.slice(commandTypeMatch[0].length).trim();
  } else {
    type = parseTransactionTypeToken(directTypeMatch?.[0] || "");
    remainder = raw.slice(directTypeMatch[0].length).trim();
  }

  if (!type) {
    return {
      error: "Perintah input dikenali, tetapi tipe transaksi belum jelas. Gunakan `pemasukan` atau `pengeluaran`."
    };
  }

  const amountMatch = remainder.match(
    /^(?:[:=-]\s*)?(?:rp\.?\s*)?(\d+(?:[\d.,\s]*\d)?(?:\s*(?:rb|ribu|k|jt|juta|m|j))?)(?=\s|$)/i
  );
  if (!amountMatch && parseMode === "direct") {
    return null;
  }

  const amount = amountMatch ? parseFlexibleAmount(amountMatch[1]) : null;
  if (!amount || amount <= 0) {
    return {
      error: "Nominal transaksi belum valid. Gunakan contoh seperti `15000`, `15.000`, `15rb`, atau `1,5jt`."
    };
  }

  const content = remainder.slice(amountMatch[0].length).trim();
  const dateMatch = content.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const categoryMatch = content.match(
    /(?:kategori|category)\s*[:=]?\s*(.+?)(?=(?:\s+(?:tanggal|date|catatan|note|notes|deskripsi|keterangan)\b)|$)/i
  );
  const descriptionMatch = content.match(
    /(?:deskripsi|keterangan|desc)\s*[:=]?\s*(.+?)(?=(?:\s+(?:kategori|category|tanggal|date|catatan|note|notes)\b)|$)/i
  );
  const notesMatch = content.match(/(?:catatan|note|notes)\s*[:=]?\s*(.+)$/i);

  let description = descriptionMatch ? sanitizeText(descriptionMatch[1], 120) : "";
  if (!description) {
    description = content
      .replace(/(?:kategori|category)\s*[:=]?\s*.+$/i, "")
      .replace(/(?:tanggal|date)\s*[:=]?\s*\d{4}-\d{2}-\d{2}/i, "")
      .replace(/(?:catatan|note|notes)\s*[:=]?\s*.+$/i, "")
      .trim();
    description = sanitizeText(description, 120);
  }

  const rawCategory = categoryMatch ? sanitizeText(categoryMatch[1], 60) : "";
  const inferredCategory = inferTransactionCategory(type, `${description} ${rawCategory}`) || null;
  const category = rawCategory ? findCanonicalCategory(type, rawCategory) : inferredCategory;

  if (rawCategory && !category) {
    return {
      error: `Kategori \`${rawCategory}\` belum cocok dengan daftar ${type === "income" ? "pemasukan" : "pengeluaran"}. Pilih salah satu: ${formatTransactionCategoryList(type)}.`
    };
  }

  if (!category) {
    return {
      error: `Kategori transaksi belum dikenali. Gunakan salah satu kategori ${type === "income" ? "pemasukan" : "pengeluaran"}: ${formatTransactionCategoryList(type)}.`
    };
  }

  return {
    payload: {
      amount,
      category,
      date: dateMatch ? dateMatch[1] : todayDateValue(),
      description: description || (type === "income" ? "Pemasukan" : "Pengeluaran"),
      notes: notesMatch ? sanitizeText(notesMatch[1], 240) : "",
      type
    }
  };
}

function buildTransactionInputGuide() {
  return [
    "Format input yang didukung:",
    "- `pengeluaran 25000 makan siang kategori Makanan tanggal 2026-04-03`",
    "- `pemasukan 1,5jt gaji kategori Gaji`",
    "- `catat pengeluaran 80rb bensin kategori Transportasi`",
    "",
    "Format nominal fleksibel: 15000, 15.000, Rp15.000, 15rb, 1,5jt",
    "",
    `Kategori pengeluaran: ${formatTransactionCategoryList("expense")}`,
    `Kategori pemasukan: ${formatTransactionCategoryList("income")}`
  ].join("\n");
}

function formatCurrency(value) {
  return new Intl.NumberFormat("id-ID", {
    currency: "IDR",
    maximumFractionDigits: 0,
    style: "currency"
  }).format(Number(value) || 0);
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function getTelegramBotUrl() {
  return TELEGRAM_BOT_USERNAME ? `https://t.me/${TELEGRAM_BOT_USERNAME}` : null;
}

function getTelegramWebhookUrl() {
  if (!hasTelegramWebhookConfig()) {
    return null;
  }

  return new URL("/api/telegram/webhook", APP_BASE_URL).toString();
}

function extractTelegramLinkCode(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return "";
  }

  const directMatch = raw.match(/\b(?:\/?link|hubungkan|tautkan|kode)\s+([A-HJ-NP-Z2-9-]{8,})\b/i);
  if (directMatch) {
    return directMatch[1].replace(/-/g, "").toUpperCase();
  }

  if (/^[A-HJ-NP-Z2-9-]{8,}$/.test(raw)) {
    return raw.replace(/-/g, "").toUpperCase();
  }

  return "";
}

function createFinanceContext(summary, items, history, user) {
  const recentTransactions = sortTransactions(items).slice(0, 8).map((item) => ({
    amount: item.amount,
    category: item.category,
    date: item.date,
    description: item.description,
    type: item.type
  }));

  const recentHistory = Array.isArray(history)
    ? history
        .slice(-6)
        .map((entry) => `${entry.role === "assistant" ? "Asisten" : "Pengguna"}: ${String(entry.content || "").trim()}`)
        .join("\n")
    : "";

  return [
    `Nama pengguna: ${user.name}`,
    "Konteks aplikasi keuangan:",
    JSON.stringify(
      {
        summary: {
          totalIncome: summary.totalIncome,
          totalExpense: summary.totalExpense,
          balance: summary.balance,
          savingsRate: summary.savingsRate,
          topExpenseCategory: summary.topExpenseCategory,
          biggestExpense: summary.biggestExpense
        },
        expenseCategories: summary.expenseCategories.slice(0, 5),
        monthlyCashflow: summary.monthlyCashflow,
        recentTransactions
      },
      null,
      2
    ),
    recentHistory ? `Riwayat percakapan:\n${recentHistory}` : "",
    "Jawab dalam Bahasa Indonesia yang profesional, ringkas, dan fokus pada data yang tersedia. Jangan mengarang data transaksi."
  ]
    .filter(Boolean)
    .join("\n\n");
}

function extractOpenAIText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const message = Array.isArray(payload?.output)
    ? payload.output.find((entry) => entry.type === "message" && Array.isArray(entry.content))
    : null;

  if (!message) {
    return "";
  }

  return message.content
    .filter((entry) => entry.type === "output_text" && entry.text)
    .map((entry) => entry.text)
    .join("\n")
    .trim();
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return "";
  }

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const startIndex = raw.indexOf("{");
  const endIndex = raw.lastIndexOf("}");
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return raw;
  }

  return raw.slice(startIndex, endIndex + 1);
}

function normalizeReceiptDate(value) {
  const raw = sanitizeText(value, 24);
  if (!raw) {
    return todayDateValue();
  }

  const directMatch = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (directMatch) {
    return `${directMatch[1]}-${directMatch[2]}-${directMatch[3]}`;
  }

  const localMatch = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (localMatch) {
    return `${localMatch[3]}-${localMatch[2]}-${localMatch[1]}`;
  }

  return todayDateValue();
}

function sanitizeReceiptSuggestion(payload, preferredType = "") {
  const suggestedType = payload?.type === "income" ? "income" : payload?.type === "expense" ? "expense" : null;
  const type = suggestedType || (preferredType === "income" || preferredType === "expense" ? preferredType : "expense");
  const description =
    sanitizeText(payload?.description || payload?.merchant || payload?.title, 120) ||
    (type === "income" ? "Pemasukan dari struk" : "Transaksi dari struk");
  const amount = parseFlexibleAmount(payload?.amount);
  const rawCategory = sanitizeText(payload?.category, 60);
  const notes = sanitizeText(payload?.notes, 240);
  const inferredCategory = inferTransactionCategory(type, `${description} ${rawCategory} ${notes}`) || null;
  const fallbackCategory = type === "income" ? "Hadiah" : "Belanja";
  const category = rawCategory ? findCanonicalCategory(type, rawCategory) || inferredCategory : inferredCategory;

  return sanitizeTransaction({
    amount,
    category: category || fallbackCategory,
    date: normalizeReceiptDate(payload?.date),
    description,
    notes,
    type
  });
}

function normalizeReceiptOcrLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => sanitizeText(line, 160))
    .filter(Boolean);
}

function extractReceiptDateFromText(text) {
  const raw = String(text || "");
  const patterns = [
    /\b(\d{4}[/-]\d{2}[/-]\d{2})\b/,
    /\b(\d{2}[/-]\d{2}[/-]\d{4})\b/
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      return normalizeReceiptDate(match[1]);
    }
  }

  return todayDateValue();
}

function scoreReceiptAmountLine(line) {
  const text = String(line || "").toLowerCase();
  let score = 0;

  if (/\b(total|grand total|jumlah|tagihan|total bayar|amount due|net total)\b/.test(text)) {
    score += 6;
  }

  if (/\b(paid|payment|debit|kartu|qris|cash|tunai|bayar)\b/.test(text)) {
    score += 2;
  }

  if (/\b(subtotal|tax|ppn|pb1|service|diskon|discount|voucher|kembalian|change|rounding|admin)\b/.test(text)) {
    score -= 4;
  }

  return score;
}

function extractReceiptAmountFromText(text) {
  const lines = normalizeReceiptOcrLines(text);
  let bestCandidate = null;

  for (const line of lines) {
    const matches = line.match(/(?:rp\.?\s*)?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|(?:rp\.?\s*)?\d{4,}(?:[.,]\d{2})?/gi) || [];
    for (const match of matches) {
      const amount = parseFlexibleAmount(match);
      if (!amount || amount <= 0) {
        continue;
      }

      const candidate = {
        amount,
        line,
        score: scoreReceiptAmountLine(line)
      };

      if (
        !bestCandidate ||
        candidate.score > bestCandidate.score ||
        (candidate.score === bestCandidate.score && candidate.amount > bestCandidate.amount)
      ) {
        bestCandidate = candidate;
      }
    }
  }

  if (bestCandidate) {
    return bestCandidate.amount;
  }

  const fallbackMatches = String(text || "").match(/\d+/g) || [];
  const fallbackAmounts = fallbackMatches.map((item) => Number(item)).filter((item) => item >= 1000);
  return fallbackAmounts.length ? Math.max(...fallbackAmounts) : null;
}

function inferReceiptTypeFromText(text, preferredType = "") {
  if (preferredType === "income" || preferredType === "expense") {
    return preferredType;
  }

  const raw = String(text || "").toLowerCase();
  if (/\b(transfer masuk|uang masuk|kredit masuk|received|payment received|gaji|salary|bonus|income)\b/.test(raw)) {
    return "income";
  }

  return "expense";
}

function pickReceiptDescriptionFromText(text, preferredType = "") {
  const lines = normalizeReceiptOcrLines(text);
  const skipPattern =
    /\b(struk|receipt|invoice|nota|tanggal|date|jam|time|kasir|cashier|total|subtotal|tax|ppn|service|discount|diskon|payment|metode|change|kembalian|qris|debit|credit)\b/i;

  for (const line of lines) {
    if (!/[a-z]/i.test(line)) {
      continue;
    }

    if (skipPattern.test(line)) {
      continue;
    }

    if (line.length < 3) {
      continue;
    }

    return line;
  }

  return preferredType === "income" ? "Pemasukan dari OCR" : "Belanja dari OCR";
}

function pickReceiptNotesFromText(text) {
  const lines = normalizeReceiptOcrLines(text);
  const noteLine = lines.find((line) => /\b(inv|invoice|ref|trx|transaction|order|kasir|payment|metode)\b/i.test(line));
  return noteLine || "Hasil OCR.space";
}

function buildReceiptSuggestionFromOcrText(text, preferredType = "") {
  const type = inferReceiptTypeFromText(text, preferredType);
  const description = pickReceiptDescriptionFromText(text, type);
  const amount = extractReceiptAmountFromText(text);
  const date = extractReceiptDateFromText(text);
  const notes = pickReceiptNotesFromText(text);
  const category = inferTransactionCategory(type, `${description} ${notes}`) || (type === "income" ? "Hadiah" : "Belanja");

  return sanitizeReceiptSuggestion(
    {
      amount,
      category,
      date,
      description,
      notes,
      type
    },
    preferredType
  );
}

function normalizeOcrSpaceMessage(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeText(item, 200)).filter(Boolean).join(" ");
  }

  return sanitizeText(value, 200);
}

function humanizeOpenAIErrorMessage(message) {
  const raw = String(message || "");
  if (/quota|billing/i.test(raw)) {
    return "Kuota OpenAI sedang habis. Isi billing OpenAI atau gunakan OCR.space sebagai alternatif.";
  }

  return raw || "Gagal menghubungi layanan AI untuk membaca struk.";
}

async function analyzeReceiptWithOCRSpace(receiptUpload, preferredType = "") {
  if (!OCR_SPACE_API_KEY) {
    throw new Error("OCR.space belum aktif. Isi OCR_SPACE_API_KEY terlebih dahulu.");
  }

  if (receiptUpload.buffer.length > 1024 * 1024) {
    throw new Error("Ukuran gambar untuk OCR.space free maksimal 1 MB. Kompres struk lalu coba lagi.");
  }

  const base64Image = `data:${receiptUpload.mimeType};base64,${receiptUpload.buffer.toString("base64")}`;
  const formData = new FormData();
  formData.append("base64Image", base64Image);
  formData.append("language", "eng");
  formData.append("isOverlayRequired", "false");
  formData.append("detectOrientation", "true");
  formData.append("scale", "true");

  const response = await fetch(OCR_SPACE_API_URL, {
    method: "POST",
    headers: {
      apikey: OCR_SPACE_API_KEY
    },
    body: formData,
    signal: AbortSignal.timeout(25_000)
  });

  const payload = await response.json();
  const topLevelError = normalizeOcrSpaceMessage(payload?.ErrorMessage) || normalizeOcrSpaceMessage(payload?.ErrorDetails);
  if (!response.ok) {
    throw new Error(topLevelError || "Gagal menghubungi OCR.space.");
  }

  if (payload?.IsErroredOnProcessing) {
    throw new Error(topLevelError || "OCR.space belum bisa membaca struk ini.");
  }

  const parsedResults = Array.isArray(payload?.ParsedResults) ? payload.ParsedResults : [];
  const parsedText = parsedResults
    .filter((entry) => Number(entry?.FileParseExitCode) === 1 && entry?.ParsedText)
    .map((entry) => String(entry.ParsedText || "").trim())
    .filter(Boolean)
    .join("\n");

  if (!parsedText) {
    const firstEntry = parsedResults[0] || {};
    const entryError =
      normalizeOcrSpaceMessage(firstEntry?.ErrorMessage) || normalizeOcrSpaceMessage(firstEntry?.ErrorDetails);
    throw new Error(entryError || "Teks pada struk belum berhasil dibaca OCR.space.");
  }

  return buildReceiptSuggestionFromOcrText(parsedText, preferredType);
}

async function analyzeReceiptWithOpenAI(receiptUpload, preferredType = "") {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Fitur baca struk AI belum aktif. Isi OPENAI_API_KEY terlebih dahulu.");
  }

  const imageDataUrl = `data:${receiptUpload.mimeType};base64,${receiptUpload.buffer.toString("base64")}`;
  const preferredTypeNote =
    preferredType === "income" || preferredType === "expense"
      ? `Jika memungkinkan, selaraskan tipe transaksi dengan pilihan pengguna saat ini: ${preferredType}.`
      : "Tentukan tipe transaksi paling masuk akal dari gambar.";

  const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions: [
        "Anda membaca struk atau bukti transfer untuk aplikasi pencatatan keuangan pribadi berbahasa Indonesia.",
        "Balas JSON saja tanpa markdown.",
        "Gunakan schema: {\"type\":\"income|expense\",\"description\":\"string\",\"amount\":\"number or string\",\"date\":\"YYYY-MM-DD\",\"category\":\"string\",\"notes\":\"string\"}.",
        "Amount harus nominal utama transaksi dalam Rupiah tanpa simbol mata uang jika memungkinkan.",
        "Description harus ringkas dan mudah dipahami pengguna.",
        "Category harus salah satu kategori yang wajar untuk aplikasi keuangan pribadi Indonesia.",
        preferredTypeNote
      ].join(" "),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Baca gambar struk ini dan ekstrak data transaksi. Jika ada pajak atau biaya tambahan, pakai total akhir yang harus dibayar atau diterima."
            },
            {
              type: "input_image",
              image_url: imageDataUrl
            }
          ]
        }
      ],
      max_output_tokens: 300,
      text: {
        format: {
          type: "text"
        }
      }
    }),
    signal: AbortSignal.timeout(25_000)
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(humanizeOpenAIErrorMessage(payload?.error?.message));
  }

  const rawText = extractOpenAIText(payload);
  if (!rawText) {
    throw new Error("Respons AI untuk struk kosong.");
  }

  let structured;
  try {
    structured = JSON.parse(extractJsonObject(rawText));
  } catch {
    throw new Error("Respons AI untuk struk belum bisa dipahami sebagai JSON.");
  }

  return sanitizeReceiptSuggestion(structured, preferredType);
}

async function analyzeReceipt(receiptUpload, preferredType = "") {
  if (OCR_SPACE_API_KEY) {
    return analyzeReceiptWithOCRSpace(receiptUpload, preferredType);
  }

  if (process.env.OPENAI_API_KEY) {
    return analyzeReceiptWithOpenAI(receiptUpload, preferredType);
  }

  throw new Error("Fitur baca struk belum aktif. Isi OCR_SPACE_API_KEY atau OPENAI_API_KEY terlebih dahulu.");
}

function generateLocalReply(message, summary) {
  const lower = String(message || "").toLowerCase();
  const topCategory = summary.topExpenseCategory;
  const biggestExpense = summary.biggestExpense;
  const advice = [];

  if (topCategory && topCategory.share >= 25) {
    advice.push(`Kategori ${topCategory.category} menyerap ${formatPercent(topCategory.share)} dari total pengeluaran.`);
  }

  if (summary.savingsRate < 20) {
    advice.push("Rasio tabungan masih di bawah 20%, jadi pengeluaran fleksibel seperti hiburan, makan di luar, dan transportasi layak dipantau lebih ketat.");
  } else {
    advice.push(`Rasio tabungan ${formatPercent(summary.savingsRate)} menunjukkan arus kas Anda masih cukup sehat.`);
  }

  if (biggestExpense) {
    advice.push(`Pengeluaran terbesar saat ini adalah ${biggestExpense.description} senilai ${formatCurrency(biggestExpense.amount)}.`);
  }

  if (lower.includes("saldo") || lower.includes("ringkasan") || lower.includes("summary")) {
    return [
      `Pemasukan tercatat ${formatCurrency(summary.totalIncome)}, pengeluaran ${formatCurrency(summary.totalExpense)}, dan saldo bersih ${formatCurrency(summary.balance)}.`,
      `Rasio tabungan berada di ${formatPercent(summary.savingsRate)}.`,
      topCategory ? `Kategori pengeluaran terbesar adalah ${topCategory.category}.` : "Belum ada kategori pengeluaran yang dominan."
    ].join(" ");
  }

  if (lower.includes("terbesar")) {
    if (!biggestExpense) {
      return "Belum ada data pengeluaran untuk dianalisis.";
    }

    return [
      `Pengeluaran terbesar Anda adalah ${biggestExpense.description} di kategori ${biggestExpense.category} sebesar ${formatCurrency(biggestExpense.amount)}.`,
      topCategory ? `Secara kategori, ${topCategory.category} juga menjadi penyumbang utama pengeluaran.` : ""
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (lower.includes("hemat") || lower.includes("anggaran") || lower.includes("budget") || lower.includes("saran")) {
    return ["Rekomendasi singkat berdasarkan data Anda:", ...advice.map((entry) => `- ${entry}`)].join("\n");
  }

  return [
    `Saldo Anda saat ini ${formatCurrency(summary.balance)} dari ${summary.transactionCount} transaksi.`,
    advice[0] || "Arus kas masih bisa dioptimalkan dengan menjaga pengeluaran rutin tetap proporsional.",
    "Anda dapat meminta ringkasan, melihat pengeluaran terbesar, meminta rekomendasi penghematan, atau mencatat transaksi lewat format `catat ...`."
  ].join(" ");
}

async function requestOpenAI(message, history, summary, userTransactions, user) {
  const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions: "Anda adalah asisten keuangan profesional di aplikasi web. Jawab dalam Bahasa Indonesia, fokus pada analisis data transaksi pengguna, dan berikan langkah yang praktis.",
      input: `${createFinanceContext(summary, userTransactions, history, user)}\n\nPertanyaan pengguna:\n${message}`,
      max_output_tokens: 350,
      text: {
        format: {
          type: "text"
        }
      }
    }),
    signal: AbortSignal.timeout(20_000)
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || "Gagal menghubungi layanan AI.");
  }

  const text = extractOpenAIText(payload);
  if (!text) {
    throw new Error("Respons AI kosong.");
  }

  return text;
}

async function buildChatReply(message, history, user) {
  const parsedInput = parseChatTransactionCommand(message);
  if (parsedInput) {
    if (parsedInput.error) {
      return {
        action: "transaction-input-invalid",
        mode: "local",
        reply: `${parsedInput.error}\n\n${buildTransactionInputGuide()}`
      };
    }

    try {
      const transaction = createTransactionForUser(user.id, sanitizeTransaction(parsedInput.payload));
      const summary = computeSummary(listTransactionsByUser(user.id));

      return {
        action: "transaction-created",
        mode: "local",
        reply: [
          "Transaksi berhasil dicatat.",
          `${transaction.type === "income" ? "Pemasukan" : "Pengeluaran"} ${formatCurrency(transaction.amount)} untuk ${transaction.description}.`,
          `Kategori: ${transaction.category}. Tanggal: ${transaction.date}.`,
          `Saldo terbaru: ${formatCurrency(summary.balance)}.`
        ].join(" "),
        summary,
        transaction
      };
    } catch (error) {
      return {
        action: "transaction-input-invalid",
        mode: "local",
        reply: `Data belum dapat disimpan: ${error.message}\n\n${buildTransactionInputGuide()}`
      };
    }
  }

  const userTransactions = listTransactionsByUser(user.id);
  const summary = computeSummary(userTransactions);

  if (!process.env.OPENAI_API_KEY) {
    return {
      mode: "local",
      reply: generateLocalReply(message, summary)
    };
  }

  try {
    const reply = await requestOpenAI(message, history, summary, userTransactions, user);
    return { mode: "openai", reply };
  } catch (error) {
    console.error("OpenAI request failed:", error.message);
    return {
      mode: "local-fallback",
      reply: `${generateLocalReply(message, summary)}\n\nCatatan: layanan AI eksternal saat ini tidak tersedia, sehingga jawaban disusun menggunakan analisis lokal aplikasi.`
    };
  }
}

function parseCookies(req) {
  const cookieHeader = String(req.headers.cookie || "");
  if (!cookieHeader) {
    return {};
  }

  return Object.fromEntries(
    cookieHeader.split(";").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, decodeURIComponent(rest.join("="))];
    })
  );
}

function getSessionFromRequest(req) {
  const cookies = parseCookies(req);
  return getSessionWithUser(cookies[COOKIE_NAME]);
}

function buildSessionCookie(sessionId) {
  const parts = [
    `${COOKIE_NAME}=${sessionId}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`
  ];

  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function buildClearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function buildTelegramStatus(userId) {
  const link = userId ? getTelegramLinkByUserId(userId) : null;
  return {
    botUrl: getTelegramBotUrl(),
    botUsername: TELEGRAM_BOT_USERNAME || null,
    configured: isTelegramConfigured(),
    linked: Boolean(link),
    link,
    webhookReady: hasTelegramWebhookConfig()
  };
}

function validateTelegramWebhookRequest(req) {
  if (!isTelegramConfigured()) {
    return false;
  }

  if (!TELEGRAM_WEBHOOK_SECRET) {
    return true;
  }

  const incomingSecret = String(req.headers["x-telegram-bot-api-secret-token"] || "");
  return incomingSecret === TELEGRAM_WEBHOOK_SECRET;
}

async function sendTelegramApiRequest(method, payload) {
  if (!isTelegramConfigured()) {
    throw new Error("Telegram bot belum dikonfigurasi.");
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000)
  });

  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(data?.description || `Telegram API ${method} gagal.`);
  }

  return data.result;
}

function chunkTelegramText(text) {
  const chunks = [];
  const normalized = String(text || "").trim() || "-";
  const limit = 3500;

  for (let index = 0; index < normalized.length; index += limit) {
    chunks.push(normalized.slice(index, index + limit));
  }

  return chunks.length > 0 ? chunks : ["-"];
}

async function sendTelegramMessage(chatId, text) {
  for (const chunk of chunkTelegramText(text)) {
    await sendTelegramApiRequest("sendMessage", {
      chat_id: chatId,
      text: chunk
    });
  }
}

async function ensureTelegramWebhook() {
  if (!hasTelegramWebhookConfig()) {
    return null;
  }

  const payload = {
    url: getTelegramWebhookUrl(),
    allowed_updates: ["message"]
  };

  if (TELEGRAM_WEBHOOK_SECRET) {
    payload.secret_token = TELEGRAM_WEBHOOK_SECRET;
  }

  return sendTelegramApiRequest("setWebhook", payload);
}

function telegramHelpText() {
  return [
    "Bot Telegram Arunika membaca pesan teks biasa.",
    "Kategori transaksi mengikuti pilihan utama di form web.",
    "Anda bisa langsung kirim:",
    "- kode tautan dari dashboard web untuk menghubungkan akun",
    "- `pengeluaran 25rb makan siang kategori Makanan`",
    "- `pemasukan 1,5jt gaji kategori Gaji`",
    "- pertanyaan bebas seperti `ringkasan keuangan saya`",
    "",
    "Format nominal fleksibel: 15000, 15.000, Rp15.000, 15rb, 1,5jt",
    "",
    "Perintah opsional yang masih didukung:",
    "/start - lihat panduan singkat",
    "/summary - minta ringkasan keuangan",
    "/unlink - putuskan koneksi Telegram dari akun",
    "/help - tampilkan bantuan",
    "",
    "Anda juga tetap bisa memakai format `catat ...` jika lebih nyaman."
  ].join("\n");
}

async function handleTelegramTextMessage(message) {
  const chatId = message.chat?.id;
  const text = String(message.text || "").trim();

  if (!chatId || !text) {
    return;
  }

  const linked = getTelegramLinkByChatId(chatId);

  if (/^\/start\b/i.test(text)) {
    const lines = [
      "Halo, saya bot Arunika Finance.",
      linked
        ? `Akun Telegram ini sudah terhubung ke ${linked.user.email}. Anda dapat langsung bertanya mengenai kondisi keuangan.`
        : "Untuk memulai, masuk ke web app lalu buat kode Telegram di panel Telegram. Setelah itu kirim atau tempel kode tautan ke bot ini.",
      getTelegramBotUrl() ? `Buka bot: ${getTelegramBotUrl()}` : "",
      "Ketik /help untuk melihat daftar perintah."
    ].filter(Boolean);

    await sendTelegramMessage(chatId, lines.join("\n"));
    return;
  }

  if (/^\/help\b/i.test(text)) {
    await sendTelegramMessage(chatId, telegramHelpText());
    return;
  }

  const linkCode = extractTelegramLinkCode(text);
  if (linkCode) {
    const result = linkTelegramChatByCode(linkCode, message.chat);
    if (!result) {
      await sendTelegramMessage(
        chatId,
        "Kode link tidak valid atau sudah kedaluwarsa. Buat kode baru dari dashboard web Arunika Finance lalu coba lagi."
      );
      return;
    }

    await sendTelegramMessage(
      chatId,
      `Berhasil terhubung ke akun ${result.user.email}. Sekarang Anda dapat bertanya langsung mengenai ringkasan dan pengeluaran.`
    );
    return;
  }

  if (/^\/unlink\b/i.test(text)) {
    const unlinked = unlinkTelegramByChatId(chatId);
    await sendTelegramMessage(
      chatId,
      unlinked
        ? "Koneksi Telegram ke akun Arunika Finance sudah diputus."
        : "Chat ini belum terhubung ke akun mana pun."
    );
    return;
  }

  if (!linked) {
    await sendTelegramMessage(
      chatId,
      "Chat ini belum terhubung ke akun Arunika Finance. Masuk ke web app, buat kode Telegram, lalu kirim atau tempel kode tautan ke bot ini."
    );
    return;
  }

  if (/^\/summary\b/i.test(text)) {
    const result = await buildChatReply("Buat ringkasan keuangan saya.", [], linked.user);
    await sendTelegramMessage(chatId, result.reply);
    return;
  }

  const cleanedText = text.replace(/^\/\w+(?:@\w+)?\s*/i, "").trim() || text;
  const result = await buildChatReply(cleanedText, [], linked.user);
  await sendTelegramMessage(chatId, result.reply);
}

async function handleTelegramUpdate(update) {
  if (!update?.message) {
    return;
  }

  await handleTelegramTextMessage(update.message);
}

async function serveStatic(req, res, pathname) {
  const targetPath = pathname === "/" ? "/index.html" : pathname;
  const safeRelative = path
    .normalize(decodeURIComponent(targetPath))
    .replace(/^([/\\])+/, "")
    .replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safeRelative);
  const relativePath = path.relative(PUBLIC_DIR, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    sendText(req, res, 403, "Akses file ditolak.");
    return;
  }

  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) {
      sendText(req, res, 404, "File tidak ditemukan.");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      ...getSecurityHeaders(req),
      ...getCorsHeaders(req),
      "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=300",
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream"
    });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    sendText(req, res, 404, "File tidak ditemukan.");
  }
}

async function handleRequest(req, res) {
  if (!req.url) {
    sendText(req, res, 400, "Permintaan tidak valid.");
    return;
  }

  if (req.method === "OPTIONS") {
    const corsHeaders = getCorsHeaders(req);
    const hasOrigin = Boolean(String(req.headers.origin || "").trim());
    if (hasOrigin && Object.keys(corsHeaders).length === 0) {
      sendJson(req, res, 403, { error: "Origin tidak diizinkan." });
      return;
    }

    res.writeHead(204, {
      ...getSecurityHeaders(req),
      ...corsHeaders,
      "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
    });
    res.end();
    return;
  }

  const url = new URL(req.url, "http://localhost");
  const { pathname } = url;

  try {
    const isApiPath = pathname.startsWith("/api/");
    const isWebhookPath = pathname === "/api/telegram/webhook";

    if (isApiPath && isUnsafeApiMutation(req.method) && !isWebhookPath && !isTrustedRequestOrigin(req)) {
      sendJson(req, res, 403, { error: "Origin permintaan tidak diizinkan." });
      return;
    }

    if (isWebhookPath) {
      if (enforceRateLimit(req, res, "telegramWebhook")) {
        return;
      }
    } else if (isApiPath && enforceRateLimit(req, res, "api")) {
      return;
    }

    if (req.method === "POST" && pathname === "/api/telegram/webhook") {
      if (!isTelegramConfigured()) {
        sendJson(req, res, 503, { error: "Telegram bot belum dikonfigurasi." });
        return;
      }

      if (!validateTelegramWebhookRequest(req)) {
        sendJson(req, res, 403, { error: "Webhook Telegram ditolak." });
        return;
      }

      const payload = await parseJsonBody(req);
      sendJson(req, res, 200, { ok: true });
      handleTelegramUpdate(payload).catch((error) => {
        console.error("Telegram update failed:", error.message);
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/health") {
      sendJson(req, res, 200, {
        appName: "Arunika Finance",
        authRequired: true,
        chatMode: process.env.OPENAI_API_KEY ? "openai" : "local",
        database: "sqlite",
        model: OPENAI_MODEL,
        status: "ok",
        telegramConfigured: isTelegramConfigured(),
        telegramWebhookReady: hasTelegramWebhookConfig()
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/auth/register") {
      if (enforceRateLimit(req, res, "auth", "register")) {
        return;
      }

      const payload = await parseJsonBody(req);
      const user = createUser(payload);
      const session = createSession(user.id);

      sendJson(
        req,
        res,
        201,
        { message: "Akun berhasil dibuat.", user },
        { "Set-Cookie": buildSessionCookie(session.id) }
      );
      return;
    }

    if (req.method === "POST" && pathname === "/api/auth/login") {
      const payload = await parseJsonBody(req);
      if (enforceRateLimit(req, res, "auth", `login:${String(payload.email || "").toLowerCase()}`)) {
        return;
      }

      const user = authenticateUser(payload.email, payload.password);

      if (!user) {
        sendJson(req, res, 401, { error: "Email atau password salah." });
        return;
      }

      const session = createSession(user.id);
      sendJson(
        req,
        res,
        200,
        { message: "Berhasil masuk.", user },
        { "Set-Cookie": buildSessionCookie(session.id) }
      );
      return;
    }

    if (req.method === "POST" && pathname === "/api/auth/logout") {
      const session = getSessionFromRequest(req);
      if (session?.sessionId) {
        deleteSession(session.sessionId);
      }

      sendJson(
        req,
        res,
        200,
        { message: "Berhasil keluar." },
        { "Set-Cookie": buildClearCookie() }
      );
      return;
    }

    if (req.method === "GET" && pathname === "/api/auth/me") {
      const session = getSessionFromRequest(req);
      if (!session) {
        sendUnauthorized(req, res);
        return;
      }

      sendJson(req, res, 200, { user: session.user });
      return;
    }

    const session = getSessionFromRequest(req);
    if (!session && pathname.startsWith("/api/")) {
      sendUnauthorized(req, res);
      return;
    }

    if (req.method === "GET" && pathname === "/api/telegram/status") {
      sendJson(req, res, 200, buildTelegramStatus(session.user.id));
      return;
    }

    if (req.method === "POST" && pathname === "/api/telegram/link-code") {
      if (!isTelegramConfigured()) {
        sendJson(req, res, 400, {
          error: "Telegram belum siap. Isi TELEGRAM_BOT_TOKEN setelah aplikasi dihosting."
        });
        return;
      }

      const code = createTelegramLinkCode(session.user.id);
      sendJson(req, res, 201, {
        ...buildTelegramStatus(session.user.id),
        command: code.code,
        expiresAt: code.expiresAt,
        linkCode: code.code
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/telegram/unlink") {
      const removed = unlinkTelegramByUserId(session.user.id);
      sendJson(req, res, 200, {
        ...buildTelegramStatus(session.user.id),
        message: removed ? "Telegram berhasil diputus dari akun ini." : "Akun ini belum terhubung ke Telegram."
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/transactions") {
      sendJson(req, res, 200, { transactions: listTransactionsByUser(session.user.id) });
      return;
    }

    if (req.method === "GET" && pathname.startsWith("/api/transactions/") && pathname.endsWith("/receipt")) {
      const transactionId = pathname.split("/")[3];
      const transaction = getTransactionByIdForUser(session.user.id, transactionId);

      if (!transaction || !transaction.receiptPath) {
        sendJson(req, res, 404, { error: "Struk tidak ditemukan." });
        return;
      }

      const filePath = path.join(ROOT, transaction.receiptPath);
      const relativePath = path.relative(ROOT, filePath);
      if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        sendJson(req, res, 403, { error: "Akses struk ditolak." });
        return;
      }

      try {
        const stat = await fsp.stat(filePath);
        if (!stat.isFile()) {
          sendJson(req, res, 404, { error: "Struk tidak ditemukan." });
          return;
        }

        const extension = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          ...getSecurityHeaders(req),
          "Cache-Control": "private, max-age=300",
          "Content-Type": MIME_TYPES[extension] || "application/octet-stream"
        });
        fs.createReadStream(filePath).pipe(res);
        return;
      } catch {
        sendJson(req, res, 404, { error: "Struk tidak ditemukan." });
        return;
      }
    }

    if (req.method === "POST" && pathname === "/api/transactions/receipt-analyze") {
      if (enforceRateLimit(req, res, "transactionWrite", `user:${session.user.id}`)) {
        return;
      }

      const payload = await parseJsonBody(req);
      const receiptUpload = sanitizeReceiptUpload(payload.receiptUpload);
      if (!receiptUpload) {
        sendJson(req, res, 400, { error: "Unggah struk terlebih dahulu sebelum menjalankan analisis AI." });
        return;
      }

      const preferredType = payload.preferredType === "income" ? "income" : payload.preferredType === "expense" ? "expense" : "";
      let suggestion;
      try {
        suggestion = await analyzeReceipt(receiptUpload, preferredType);
      } catch (error) {
        sendJson(req, res, 400, { error: error.message || "Struk belum bisa dianalisis saat ini." });
        return;
      }

      sendJson(req, res, 200, {
        message: "Struk berhasil dibaca. Silakan cek kembali hasil isian sebelum menyimpan transaksi.",
        suggestion
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/transactions") {
      if (enforceRateLimit(req, res, "transactionWrite", `user:${session.user.id}`)) {
        return;
      }

      const payload = await parseJsonBody(req);
      const { sanitized } = await enrichTransactionPayloadWithReceipt(session.user.id, payload);
      const transaction = createTransactionForUser(session.user.id, sanitized);
      sendJson(req, res, 201, {
        message: "Transaksi berhasil disimpan.",
        summary: computeSummary(listTransactionsByUser(session.user.id)),
        transaction
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/transactions/import") {
      if (enforceRateLimit(req, res, "transactionWrite", `user:${session.user.id}`)) {
        return;
      }

      const payload = await parseJsonBody(req);
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      const sourceLabel = sanitizeText(payload.source, 80);

      if (!rows.length) {
        sendJson(req, res, 400, { error: "Tidak ada baris transaksi valid untuk diimport." });
        return;
      }

      if (rows.length > 500) {
        sendJson(req, res, 400, { error: "Maksimal 500 transaksi per sekali import." });
        return;
      }

      const existingTransactions = listTransactionsByUser(session.user.id);
      const fingerprints = new Set(existingTransactions.map((item) => buildTransactionFingerprint(item)));
      let importedCount = 0;
      let skippedDuplicates = 0;
      let skippedInvalid = 0;
      const importedTransactions = [];

      for (const row of rows) {
        try {
          const transaction = sanitizeImportedTransaction(row, sourceLabel);
          const fingerprint = buildTransactionFingerprint(transaction);

          if (fingerprints.has(fingerprint)) {
            skippedDuplicates += 1;
            continue;
          }

          fingerprints.add(fingerprint);
          importedTransactions.push(createTransactionForUser(session.user.id, transaction));
          importedCount += 1;
        } catch {
          skippedInvalid += 1;
        }
      }

      const summary = computeSummary(listTransactionsByUser(session.user.id));
      const detailParts = [];
      if (skippedDuplicates) {
        detailParts.push(`${skippedDuplicates} duplikat dilewati`);
      }
      if (skippedInvalid) {
        detailParts.push(`${skippedInvalid} baris gagal validasi akhir`);
      }

      const message = importedCount
        ? `Import selesai. ${importedCount} transaksi berhasil ditambahkan${detailParts.length ? `, ${detailParts.join(", ")}.` : "."}`
        : `Import tidak menambah transaksi baru${detailParts.length ? ` karena ${detailParts.join(" dan ")}.` : "."}`;

      sendJson(req, res, 200, {
        importedCount,
        message,
        skippedDuplicates,
        skippedInvalid,
        summary,
        transactions: importedTransactions.slice(0, 10)
      });
      return;
    }

    if (req.method === "PUT" && pathname.startsWith("/api/transactions/")) {
      if (enforceRateLimit(req, res, "transactionWrite", `user:${session.user.id}`)) {
        return;
      }

      const id = pathname.split("/").pop();
      const payload = await parseJsonBody(req);
      const existing = getTransactionByIdForUser(session.user.id, id);
      if (!existing) {
        sendJson(req, res, 404, { error: "Transaksi tidak ditemukan." });
        return;
      }

      const { sanitized } = await enrichTransactionPayloadWithReceipt(session.user.id, payload, existing.receiptPath || "");
      const transaction = updateTransactionForUser(session.user.id, id, sanitized);

      if (!transaction) {
        sendJson(req, res, 404, { error: "Transaksi tidak ditemukan." });
        return;
      }

      if ((transaction.previousReceiptPath || "") && transaction.previousReceiptPath !== (transaction.receiptPath || "")) {
        await removeReceiptFile(transaction.previousReceiptPath);
      }

      sendJson(req, res, 200, {
        message: "Transaksi berhasil diperbarui.",
        summary: computeSummary(listTransactionsByUser(session.user.id)),
        transaction
      });
      return;
    }

    if (req.method === "DELETE" && pathname.startsWith("/api/transactions/")) {
      const id = pathname.split("/").pop();
      const deleted = deleteTransactionForUser(session.user.id, id);

      if (!deleted) {
        sendJson(req, res, 404, { error: "Transaksi tidak ditemukan." });
        return;
      }

      if (deleted.receiptPath) {
        await removeReceiptFile(deleted.receiptPath);
      }

      sendJson(req, res, 200, {
        message: "Transaksi berhasil dihapus.",
        summary: computeSummary(listTransactionsByUser(session.user.id))
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/summary") {
      sendJson(req, res, 200, { summary: computeSummary(listTransactionsByUser(session.user.id)) });
      return;
    }

    if (req.method === "POST" && pathname === "/api/chat") {
      if (enforceRateLimit(req, res, "chat", `user:${session.user.id}`)) {
        return;
      }

      const payload = await parseJsonBody(req);
      const message = String(payload.message || "").trim();
      if (!message) {
        sendJson(req, res, 400, { error: "Pesan asisten tidak boleh kosong." });
        return;
      }

      const result = await buildChatReply(message, Array.isArray(payload.history) ? payload.history : [], session.user);
      sendJson(req, res, 200, result);
      return;
    }

    await serveStatic(req, res, pathname);
  } catch (error) {
    const statusCode = /wajib|harus|valid|password|email|telegram|kategori|nominal|tanggal|transaksi/i.test(error.message)
      ? 400
      : 500;
    if (statusCode >= 500) {
      console.error("Unhandled server error:", error);
      sendJson(req, res, 500, { error: "Terjadi kesalahan pada server. Silakan coba kembali." });
      return;
    }

    sendJson(req, res, statusCode, { error: error.message || "Permintaan tidak dapat diproses." });
  }
}

function createAppServer() {
  return http.createServer((req, res) => {
    handleRequest(req, res);
  });
}

async function startServer(port = PORT) {
  initializeDatabase();

  if (TELEGRAM_AUTO_SET_WEBHOOK && hasTelegramWebhookConfig()) {
    try {
      await ensureTelegramWebhook();
    } catch (error) {
      console.error("Gagal memasang webhook Telegram:", error.message);
    }
  }

  const server = createAppServer();
  await new Promise((resolve) => server.listen(port, "0.0.0.0", resolve));
  return server;
}

if (require.main === module) {
  startServer()
    .then(() => {
      console.log(`Arunika Finance berjalan di http://localhost:${PORT}`);
    })
    .catch((error) => {
      console.error("Gagal menjalankan server:", error);
      process.exitCode = 1;
    });
}

module.exports = {
  buildChatReply,
  computeSummary,
  createAppServer,
  ensureTelegramWebhook,
  generateLocalReply,
  startServer
};
