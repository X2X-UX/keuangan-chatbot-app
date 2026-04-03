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
  getTelegramLinkByChatId,
  getTelegramLinkByUserId,
  initializeDatabase,
  linkTelegramChatByCode,
  listTransactionsByUser,
  unlinkTelegramByChatId,
  unlinkTelegramByUserId
} = require("./database.next");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const ENV_FILE = path.join(ROOT, ".env");

loadEnvFile(ENV_FILE);

const PORT = Number(process.env.PORT || 3000);
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const COOKIE_NAME = "session_id";
const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_WEBHOOK_SECRET = String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
const TELEGRAM_BOT_USERNAME = String(process.env.TELEGRAM_BOT_USERNAME || "").trim();
const APP_BASE_URL = String(process.env.APP_BASE_URL || "").trim();
const TELEGRAM_AUTO_SET_WEBHOOK = String(process.env.TELEGRAM_AUTO_SET_WEBHOOK || "").trim().toLowerCase() === "true";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

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

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end(text);
}

function sendUnauthorized(res) {
  sendJson(res, 401, { error: "Silakan masuk terlebih dahulu." });
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
      if (body.length > 1_000_000) {
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
  const amount = Number(payload.amount);
  const description = sanitizeText(payload.description, 120);
  const category = sanitizeText(payload.category, 60);
  const notes = sanitizeText(payload.notes, 240);
  const date = sanitizeText(payload.date, 10) || todayDateValue();

  if (!type) {
    throw new Error("Tipe transaksi harus income atau expense.");
  }

  if (!description) {
    throw new Error("Deskripsi transaksi wajib diisi.");
  }

  if (!category) {
    throw new Error("Kategori transaksi wajib diisi.");
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
    type
  };
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
    "Anda dapat meminta ringkasan, melihat pengeluaran terbesar, atau meminta rekomendasi penghematan."
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
    "Perintah Telegram yang tersedia:",
    "/start - lihat panduan singkat",
    "/link KODE - hubungkan akun web ke Telegram",
    "/summary - minta ringkasan keuangan",
    "/unlink - putuskan koneksi Telegram dari akun",
    "/help - tampilkan bantuan",
    "",
    "Setelah akun terhubung, Anda juga dapat mengirim pertanyaan bebas seperti di web app."
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
        : "Untuk memulai, masuk ke web app lalu buat kode Telegram di panel Telegram. Setelah itu kirim `/link KODE` ke bot ini.",
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

  const linkMatch = text.match(/^\/link(?:@\w+)?\s+([A-Z0-9-]+)/i);
  if (linkMatch) {
    const result = linkTelegramChatByCode(linkMatch[1], message.chat);
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
      "Chat ini belum terhubung ke akun Arunika Finance. Masuk ke web app, buat kode Telegram, lalu kirim `/link KODE` ke bot ini."
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

async function serveStatic(res, pathname) {
  const targetPath = pathname === "/" ? "/index.html" : pathname;
  const safeRelative = path
    .normalize(decodeURIComponent(targetPath))
    .replace(/^([/\\])+/, "")
    .replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safeRelative);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Akses file ditolak.");
    return;
  }

  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) {
      sendText(res, 404, "File tidak ditemukan.");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=300",
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream"
    });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    sendText(res, 404, "File tidak ditemukan.");
  }
}

async function handleRequest(req, res) {
  if (!req.url) {
    sendText(res, 400, "Permintaan tidak valid.");
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Origin": "*"
    });
    res.end();
    return;
  }

  const url = new URL(req.url, "http://localhost");
  const { pathname } = url;

  try {
    if (req.method === "POST" && pathname === "/api/telegram/webhook") {
      if (!isTelegramConfigured()) {
        sendJson(res, 503, { error: "Telegram bot belum dikonfigurasi." });
        return;
      }

      if (!validateTelegramWebhookRequest(req)) {
        sendJson(res, 403, { error: "Webhook Telegram ditolak." });
        return;
      }

      const payload = await parseJsonBody(req);
      sendJson(res, 200, { ok: true });
      handleTelegramUpdate(payload).catch((error) => {
        console.error("Telegram update failed:", error.message);
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/health") {
      sendJson(res, 200, {
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
      const payload = await parseJsonBody(req);
      const user = createUser(payload);
      const session = createSession(user.id);

      sendJson(
        res,
        201,
        { message: "Akun berhasil dibuat.", user },
        { "Set-Cookie": buildSessionCookie(session.id) }
      );
      return;
    }

    if (req.method === "POST" && pathname === "/api/auth/login") {
      const payload = await parseJsonBody(req);
      const user = authenticateUser(payload.email, payload.password);

      if (!user) {
        sendJson(res, 401, { error: "Email atau password salah." });
        return;
      }

      const session = createSession(user.id);
      sendJson(
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
        sendUnauthorized(res);
        return;
      }

      sendJson(res, 200, { user: session.user });
      return;
    }

    const session = getSessionFromRequest(req);
    if (!session && pathname.startsWith("/api/")) {
      sendUnauthorized(res);
      return;
    }

    if (req.method === "GET" && pathname === "/api/telegram/status") {
      sendJson(res, 200, buildTelegramStatus(session.user.id));
      return;
    }

    if (req.method === "POST" && pathname === "/api/telegram/link-code") {
      if (!isTelegramConfigured()) {
        sendJson(res, 400, {
          error: "Telegram belum siap. Isi TELEGRAM_BOT_TOKEN setelah aplikasi dihosting."
        });
        return;
      }

      const code = createTelegramLinkCode(session.user.id);
      sendJson(res, 201, {
        ...buildTelegramStatus(session.user.id),
        command: `/link ${code.code}`,
        expiresAt: code.expiresAt,
        linkCode: code.code
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/telegram/unlink") {
      const removed = unlinkTelegramByUserId(session.user.id);
      sendJson(res, 200, {
        ...buildTelegramStatus(session.user.id),
        message: removed ? "Telegram berhasil diputus dari akun ini." : "Akun ini belum terhubung ke Telegram."
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/transactions") {
      sendJson(res, 200, { transactions: listTransactionsByUser(session.user.id) });
      return;
    }

    if (req.method === "POST" && pathname === "/api/transactions") {
      const payload = await parseJsonBody(req);
      const transaction = createTransactionForUser(session.user.id, sanitizeTransaction(payload));
      sendJson(res, 201, {
        message: "Transaksi berhasil disimpan.",
        summary: computeSummary(listTransactionsByUser(session.user.id)),
        transaction
      });
      return;
    }

    if (req.method === "DELETE" && pathname.startsWith("/api/transactions/")) {
      const id = pathname.split("/").pop();
      const deleted = deleteTransactionForUser(session.user.id, id);

      if (!deleted) {
        sendJson(res, 404, { error: "Transaksi tidak ditemukan." });
        return;
      }

      sendJson(res, 200, {
        message: "Transaksi berhasil dihapus.",
        summary: computeSummary(listTransactionsByUser(session.user.id))
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/summary") {
      sendJson(res, 200, { summary: computeSummary(listTransactionsByUser(session.user.id)) });
      return;
    }

    if (req.method === "POST" && pathname === "/api/chat") {
      const payload = await parseJsonBody(req);
      const message = String(payload.message || "").trim();
      if (!message) {
        sendJson(res, 400, { error: "Pesan asisten tidak boleh kosong." });
        return;
      }

      const result = await buildChatReply(message, Array.isArray(payload.history) ? payload.history : [], session.user);
      sendJson(res, 200, result);
      return;
    }

    await serveStatic(res, pathname);
  } catch (error) {
    const statusCode = /wajib|harus|valid|password|email|telegram/i.test(error.message) ? 400 : 500;
    sendJson(res, statusCode, { error: error.message || "Terjadi kesalahan pada server. Silakan coba kembali." });
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
