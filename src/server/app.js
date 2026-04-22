const http = require("http");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const { URL } = require("url");
const { loadEnvFile, parseCookieSameSite, readPositiveIntEnv, readRateLimitEnv } = require("./config/runtime");

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
const { createFinanceAssistantService } = require("./services/finance-assistant/service");
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

const {
  buildChatReply,
  computeSummary,
  formatCurrency,
  generateLocalReply,
  sanitizeText,
  sanitizeTransaction,
  todayDateValue
} = createFinanceAssistantService({
  createTransactionForUser,
  findCanonicalCategory,
  formatTransactionCategoryList,
  inferTransactionCategory,
  listTransactionsByUser,
  parseFlexibleAmount
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
