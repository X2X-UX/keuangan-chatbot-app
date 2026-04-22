const http = require("http");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const { URL } = require("url");

const ROOT = path.resolve(__dirname, "../..");
const PUBLIC_DIR = path.join(ROOT, "public");
const ENV_FILE = path.join(ROOT, ".env");

loadEnvFile(ENV_FILE);

const {
  DATA_DIR,
  SESSION_MAX_AGE_SECONDS,
  createTelegramLinkCode,
  authenticateUser,
  createSession,
  createTransactionForUser,
  createUser,
  deleteTelegramReceiptDraft,
  deleteSession,
  deleteTransactionForUser,
  getTelegramReceiptDraft,
  getSessionWithUser,
  getTransactionByIdForUser,
  getTelegramLinkByChatId,
  getTelegramLinkByUserId,
  initializeDatabase,
  linkTelegramChatByCode,
  listTransactionsByUser,
  saveTelegramReceiptDraft,
  unlinkTelegramByChatId,
  unlinkTelegramByUserId,
  updateTransactionForUser
} = require("./data/database");
const {
  findCanonicalCategory,
  formatTransactionCategoryList,
  inferTransactionCategory
} = require("../../transaction-categories");
const { parseFlexibleAmount } = require("../../transaction-amount");
const { createSessionAuth } = require("./auth/session");
const { buildAllowedOrigins, createHttpService } = require("./http");
const { createLogger, getRequestId } = require("./observability/logger");
const { createAuthRoutes } = require("./routes/auth");
const { createChatRoutes } = require("./routes/chat");
const { createSystemRoutes } = require("./routes/system");
const { createTelegramRoutes } = require("./routes/telegram");
const { createTransactionRoutes } = require("./routes/transactions");
const { createReceiptAnalyzer } = require("./services/receipts/analyzer");
const { createReceiptParser } = require("./services/receipts/parser");
const { createTelegramService } = require("./services/telegram/service");
const { createTransactionService } = require("./services/transactions/service");

const RECEIPTS_DIR = path.join(DATA_DIR, "receipts");

const PORT = Number(process.env.PORT || 3000);
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const CHAT_ASSISTANT_MODEL = "local-finance-assistant";
const OCR_SPACE_API_KEY = String(process.env.OCR_SPACE_API_KEY || "").trim();
const OCR_SPACE_API_URL = "https://api.ocr.space/parse/image";
const COOKIE_NAME = "session_id";
const SESSION_COOKIE_SAME_SITE = parseCookieSameSite(process.env.SESSION_COOKIE_SAME_SITE);
const BODY_LIMIT_BYTES = readPositiveIntEnv(process.env.BODY_LIMIT_BYTES, 5_000_000);
const STATIC_CACHE_MAX_AGE_SECONDS = readPositiveIntEnv(process.env.STATIC_CACHE_MAX_AGE_SECONDS, 300);
const SLOW_REQUEST_THRESHOLD_MS = readPositiveIntEnv(process.env.SLOW_REQUEST_THRESHOLD_MS, 1_000);
const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_WEBHOOK_SECRET = String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
const TELEGRAM_BOT_USERNAME = String(process.env.TELEGRAM_BOT_USERNAME || "").trim();
const APP_BASE_URL = String(process.env.APP_BASE_URL || "").trim();
const TELEGRAM_AUTO_SET_WEBHOOK = String(process.env.TELEGRAM_AUTO_SET_WEBHOOK || "").trim().toLowerCase() === "true";
const TELEGRAM_RECEIPT_DRAFT_TTL_MS = readPositiveIntEnv(process.env.TELEGRAM_RECEIPT_DRAFT_TTL_MS, 15 * 60_000);
const ALLOWED_ORIGINS = buildAllowedOrigins({
  appBaseUrl: APP_BASE_URL,
  envAllowedOrigins: process.env.ALLOWED_ORIGINS,
  port: PORT,
  URLClass: URL
});
const RATE_LIMIT_STORE = new Map();
const LOGGER = createLogger({
  nodeEnv: process.env.NODE_ENV,
  serviceName: "arunika-finance"
});
const RATE_LIMITS = {
  api: readRateLimitEnv("API", { max: 240, windowMs: 60_000 }),
  auth: readRateLimitEnv("AUTH", { max: 20, windowMs: 10 * 60_000 }),
  chat: readRateLimitEnv("CHAT", { max: 50, windowMs: 60_000 }),
  telegramWebhook: readRateLimitEnv("TELEGRAM_WEBHOOK", { max: 1_200, windowMs: 60_000 }),
  transactionWrite: readRateLimitEnv("TRANSACTION_WRITE", { max: 60, windowMs: 60_000 })
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

const {
  enforceRateLimit,
  getCorsHeaders,
  getSecurityHeaders,
  isTrustedRequestOrigin,
  isUnsafeApiMutation,
  parseJsonBody,
  sendJson,
  sendText,
  sendUnauthorized
} = createHttpService({
  allowedOrigins: ALLOWED_ORIGINS,
  bodyLimitBytes: BODY_LIMIT_BYTES,
  getRequestId,
  nodeEnv: process.env.NODE_ENV,
  rateLimits: RATE_LIMITS,
  rateLimitStore: RATE_LIMIT_STORE,
  securityProfile: {
    bodyLimitBytes: BODY_LIMIT_BYTES,
    sameSite: SESSION_COOKIE_SAME_SITE,
    staticCacheMaxAgeSeconds: STATIC_CACHE_MAX_AGE_SECONDS
  }
});

const { buildClearCookie, buildSessionCookie, getSessionFromRequest } = createSessionAuth({
  cookieName: COOKIE_NAME,
  getSessionWithUser,
  nodeEnv: process.env.NODE_ENV,
  sameSite: SESSION_COOKIE_SAME_SITE,
  sessionMaxAgeSeconds: SESSION_MAX_AGE_SECONDS
});

const { handleAuthRoute } = createAuthRoutes({
  authenticateUser,
  buildClearCookie,
  buildSessionCookie,
  createSession,
  createUser,
  deleteSession,
  enforceRateLimit,
  getSessionFromRequest,
  parseJsonBody,
  sendJson,
  sendUnauthorized
});

const { handleSystemRoute, serveStatic } = createSystemRoutes({
  appName: "Arunika Finance",
  chatModeResolver: () => "local",
  fs,
  fsp,
  getCorsHeaders,
  getSecurityHeaders,
  hasTelegramWebhookConfig: () => hasTelegramWebhookConfig(),
  isTelegramConfigured: () => isTelegramConfigured(),
  mimeTypes: MIME_TYPES,
  model: CHAT_ASSISTANT_MODEL,
  path,
  publicDir: PUBLIC_DIR,
  securityProfile: {
    appBaseUrlConfigured: Boolean(APP_BASE_URL),
    allowedOriginCount: ALLOWED_ORIGINS.size,
    bodyLimitBytes: BODY_LIMIT_BYTES,
    sameSite: SESSION_COOKIE_SAME_SITE,
    staticCacheMaxAgeSeconds: STATIC_CACHE_MAX_AGE_SECONDS
  },
  staticCacheMaxAgeSeconds: STATIC_CACHE_MAX_AGE_SECONDS,
  sendJson,
  sendText
});

const { handleChatRoute } = createChatRoutes({
  buildChatReply,
  enforceRateLimit,
  parseJsonBody,
  sendJson
});

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

const {
  buildTransactionFingerprint,
  enrichTransactionPayloadWithReceipt,
  removeReceiptFile,
  sanitizeImportedTransaction,
  sanitizeReceiptUpload,
  saveReceiptUpload
} = createTransactionService({
  findCanonicalCategory,
  fsp,
  inferTransactionCategory,
  parseFlexibleAmount,
  path,
  receiptsDir: RECEIPTS_DIR,
  rootDir: ROOT,
  sanitizeText,
  sanitizeTransaction
});

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

const { buildReceiptSuggestionFromOcrText, normalizeReceiptDate, sanitizeReceiptSuggestion } = createReceiptParser({
  findCanonicalCategory,
  inferTransactionCategory,
  parseFlexibleAmount,
  sanitizeText,
  sanitizeTransaction,
  todayDateValue
});

const { analyzeReceipt, formatReceiptSuggestionForTelegram } = createReceiptAnalyzer({
  buildReceiptSuggestionFromOcrText,
  extractJsonObject,
  extractOpenAIText,
  formatCurrency,
  openAiBaseUrl: OPENAI_BASE_URL,
  openAiModel: OPENAI_MODEL,
  ocrSpaceApiKey: OCR_SPACE_API_KEY,
  ocrSpaceApiUrl: OCR_SPACE_API_URL,
  sanitizeReceiptSuggestion,
  sanitizeText
});

const {
  buildTelegramStatus,
  ensureTelegramWebhook,
  handleTelegramUpdate,
  hasTelegramWebhookConfig,
  isTelegramConfigured,
  validateTelegramWebhookRequest
} = createTelegramService({
  analyzeReceipt,
  appBaseUrl: APP_BASE_URL,
  botToken: TELEGRAM_BOT_TOKEN,
  botUsername: TELEGRAM_BOT_USERNAME,
  buildChatReply,
  computeSummary,
  createTransactionForUser,
  deleteTelegramReceiptDraft,
  draftTtlMs: TELEGRAM_RECEIPT_DRAFT_TTL_MS,
  findCanonicalCategory,
  formatCurrency,
  formatReceiptSuggestionForTelegram,
  getTelegramReceiptDraft,
  getTelegramLinkByChatId,
  getTelegramLinkByUserId,
  inferTransactionCategory,
  linkTelegramChatByCode,
  listTransactionsByUser,
  mimeTypes: MIME_TYPES,
  normalizeReceiptDate,
  removeReceiptFile,
  saveTelegramReceiptDraft,
  sanitizeText,
  sanitizeTransaction,
  saveReceiptUpload,
  secretToken: TELEGRAM_WEBHOOK_SECRET,
  unlinkTelegramByChatId
});

const { handleTelegramRoute } = createTelegramRoutes({
  buildTelegramStatus,
  createTelegramLinkCode,
  handleTelegramUpdate,
  isTelegramConfigured,
  parseJsonBody,
  sendJson,
  unlinkTelegramByUserId,
  validateTelegramWebhookRequest
});

const { handleTransactionRoute } = createTransactionRoutes({
  analyzeReceipt,
  buildTransactionFingerprint,
  computeSummary,
  createTransactionForUser,
  deleteTransactionForUser,
  enforceRateLimit,
  enrichTransactionPayloadWithReceipt,
  fs,
  fsp,
  getSecurityHeaders,
  getTransactionByIdForUser,
  listTransactionsByUser,
  mimeTypes: MIME_TYPES,
  parseJsonBody,
  path,
  removeReceiptFile,
  rootDir: ROOT,
  sanitizeImportedTransaction,
  sanitizeReceiptUpload,
  sanitizeText,
  sendJson,
  updateTransactionForUser
});

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

async function buildChatReply(message, user) {
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

  return {
    mode: "local",
    reply: generateLocalReply(message, summary)
  };
}

function readPositiveIntEnv(value, fallback) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readRateLimitEnv(prefix, fallback) {
  return {
    max: readPositiveIntEnv(process.env[`RATE_LIMIT_${prefix}_MAX`], fallback.max),
    windowMs: readPositiveIntEnv(process.env[`RATE_LIMIT_${prefix}_WINDOW_MS`], fallback.windowMs)
  };
}

function parseCookieSameSite(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["strict", "none"].includes(normalized)) {
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  return "Lax";
}

async function handleRequest(req, res) {
  if (!req.url) {
    sendText(req, res, 400, "Permintaan tidak valid.");
    return;
  }

  let pathname = "";

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
  pathname = url.pathname;

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

    if (await handleTelegramRoute(req, res, pathname)) {
      return;
    }

    if (await handleSystemRoute(req, res, pathname)) {
      return;
    }

    if (await handleAuthRoute(req, res, pathname)) {
      return;
    }

    const session = getSessionFromRequest(req);
    if (!session && pathname.startsWith("/api/")) {
      sendUnauthorized(req, res);
      return;
    }

    if (await handleTelegramRoute(req, res, pathname, session)) {
      return;
    }

    if (await handleTransactionRoute(req, res, url, session)) {
      return;
    }

    if (await handleChatRoute(req, res, pathname, session)) {
      return;
    }

    await serveStatic(req, res, pathname);
  } catch (error) {
    const requestId = getRequestId(req);
    const statusCode = /wajib|harus|valid|password|email|telegram|kategori|nominal|tanggal|transaksi/i.test(error.message)
      ? 400
      : 500;
    if (statusCode >= 500) {
      LOGGER.error("unhandled-server-error", {
        errorMessage: error?.message || "Unknown error",
        method: req.method,
        pathname,
        requestId
      });
      sendJson(req, res, 500, { error: "Terjadi kesalahan pada server. Silakan coba kembali." });
      return;
    }

    sendJson(req, res, statusCode, { error: error.message || "Permintaan tidak dapat diproses." });
  }
}

function createAppServer() {
  return http.createServer((req, res) => {
    const requestId = getRequestId(req);
    const startedAt = Date.now();

    res.setHeader("X-Request-Id", requestId);
    res.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      const pathname = req.url ? new URL(req.url, "http://localhost").pathname : "";
      if (!pathname.startsWith("/api/")) {
        return;
      }

      if (res.statusCode >= 500) {
        LOGGER.error("api-request-failed", {
          durationMs,
          method: req.method,
          pathname,
          requestId,
          statusCode: res.statusCode
        });
        return;
      }

      if (res.statusCode >= 400) {
        LOGGER.warn("api-request-warning", {
          durationMs,
          method: req.method,
          pathname,
          requestId,
          statusCode: res.statusCode
        });
        return;
      }

      if (durationMs >= SLOW_REQUEST_THRESHOLD_MS) {
        LOGGER.info("api-request-slow", {
          durationMs,
          method: req.method,
          pathname,
          requestId,
          statusCode: res.statusCode
        });
      }
    });

    Promise.resolve(handleRequest(req, res)).catch((error) => {
      LOGGER.error("request-dispatch-failed", {
        errorMessage: error?.message || "Unknown error",
        method: req.method,
        pathname: req.url || "",
        requestId
      });
      if (!res.headersSent) {
        sendJson(req, res, 500, { error: "Terjadi kesalahan pada server. Silakan coba kembali." });
      } else {
        res.end();
      }
    });
  });
}

async function startServer(port = PORT) {
  initializeDatabase();
  LOGGER.info("server-starting", {
    port
  });

  if (TELEGRAM_AUTO_SET_WEBHOOK && hasTelegramWebhookConfig()) {
    try {
      await ensureTelegramWebhook();
    } catch (error) {
      LOGGER.warn("telegram-webhook-setup-failed", {
        errorMessage: error?.message || "Unknown error"
      });
    }
  }

  const server = createAppServer();
  await new Promise((resolve) => server.listen(port, "0.0.0.0", resolve));
  LOGGER.info("server-ready", {
    port
  });
  return server;
}

if (require.main === module) {
  startServer()
    .then(() => {
      LOGGER.info("server-announced", {
        port: PORT,
        url: `http://localhost:${PORT}`
      });
    })
    .catch((error) => {
      LOGGER.error("server-start-failed", {
        errorMessage: error?.message || "Unknown error"
      });
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
