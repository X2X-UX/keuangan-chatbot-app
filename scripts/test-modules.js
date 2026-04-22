const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { findCanonicalCategory, inferTransactionCategory } = require("../transaction-categories");
const { parseFlexibleAmount } = require("../transaction-amount");
const { createSessionAuth } = require("../src/server/auth/session");
const { createBackup, restoreBackup } = require("./sqlite-ops");
const { loadEnvFile, parseCookieSameSite, readPositiveIntEnv, readRateLimitEnv } = require("../src/server/config/runtime");
const { createFinanceAssistantService } = require("../src/server/services/finance-assistant/service");
const { createReceiptParser } = require("../src/server/services/receipts/parser");
const { createTransactionService } = require("../src/server/services/transactions/service");

runAmountTests();
runFinanceAssistantTests();
runReceiptParserTests();
runRuntimeConfigTests();
runSessionAuthTests();
runSqliteOpsTests();
runTransactionServiceTests();

console.log("Module tests OK");

function runAmountTests() {
  assert.strictEqual(parseFlexibleAmount("15rb"), 15000);
  assert.strictEqual(parseFlexibleAmount("1,5jt"), 1500000);
  assert.strictEqual(parseFlexibleAmount("200.000,00"), 200000);
  assert.strictEqual(parseFlexibleAmount("50,000.00"), 50000);
}

function runFinanceAssistantTests() {
  const transactions = [
    {
      amount: 5000000,
      category: "Gaji",
      date: "2026-04-10",
      description: "Gaji bulanan",
      id: "tx-income",
      notes: "",
      type: "income"
    },
    {
      amount: 75000,
      category: "Makanan",
      date: "2026-04-11",
      description: "Makan siang",
      id: "tx-expense",
      notes: "",
      type: "expense"
    }
  ];

  const financeAssistant = createFinanceAssistantService({
    createTransactionForUser: () => {
      throw new Error("createTransactionForUser should not be called in this test");
    },
    findCanonicalCategory,
    formatTransactionCategoryList: (type) => (type === "income" ? "Gaji, Hadiah" : "Makanan, Transportasi, Belanja"),
    inferTransactionCategory,
    listTransactionsByUser: () => transactions,
    parseFlexibleAmount
  });

  const summary = financeAssistant.computeSummary(transactions);
  assert.strictEqual(summary.totalIncome, 5000000);
  assert.strictEqual(summary.totalExpense, 75000);
  assert.strictEqual(summary.topExpenseCategory.category, "Makanan");

  const parsed = financeAssistant.parseChatTransactionCommand("pengeluaran 25rb makan siang kategori makanan tanggal 2026-04-03");
  assert.strictEqual(parsed.payload.amount, 25000);
  assert.strictEqual(parsed.payload.category, "Makanan");
  assert.strictEqual(parsed.payload.type, "expense");

  const reply = financeAssistant.generateLocalReply("ringkasan saldo", summary);
  assert.match(reply, /Pemasukan tercatat/);
  assert.match(reply, /saldo bersih/i);
}

function runReceiptParserTests() {
  const parser = createReceiptParser({
    findCanonicalCategory,
    inferTransactionCategory,
    parseFlexibleAmount,
    sanitizeText,
    sanitizeTransaction,
    todayDateValue: () => "2026-04-12"
  });

  const retailSuggestion = parser.buildReceiptSuggestionFromOcrText(
    [
      "Alfamart",
      "Status Order",
      "Selesai",
      "TAMAN DADAP",
      "Ref. S-260301-AGTNQLW",
      "Subtotal 113,800",
      "Total Diskon -14,000",
      "Biaya Pengiriman 0",
      "Total 99,800",
      "Tgl. 03-01-2026 11:43:48"
    ].join("\n"),
    "expense"
  );

  assert.strictEqual(retailSuggestion.amount, 99800);
  assert.strictEqual(retailSuggestion.date, "2026-03-01");
  assert.strictEqual(retailSuggestion.type, "expense");
  assert.ok(/alfamart/i.test(retailSuggestion.description));

  const noisyRetailSuggestion = parser.buildReceiptSuggestionFromOcrText(
    [
      "JATINANGOR KM.20 SUMEDA",
      "14.09.16-06:46 2.0.31 914115/ALIA MU/01",
      "S/ROTI KRIM KEJU 72G 4 4500 18,000",
      "CMORY MIX BERRY 225 1 8500 8,500",
      "HARGA JUAL : 35,200",
      "TOTAL : 33,900",
      "TUNAI : 40,000",
      "KEMBALI : 6,100",
      "LAYANAN KONSUMEN INDOMARET",
      "CALL 1500580"
    ].join("\n"),
    "expense"
  );

  assert.strictEqual(noisyRetailSuggestion.amount, 33900);
  assert.ok(/indomaret/i.test(noisyRetailSuggestion.description));
  assert.ok(!/layanan konsumen/i.test(noisyRetailSuggestion.description));

  const atmSuggestion = parser.buildReceiptSuggestionFromOcrText(
    [
      "ATM BCA",
      "08/01/26 12:15:35",
      "DADAP RESIDENCE",
      "NO. URUT : 2327",
      "SETORAN",
      "JUMLAH : RP 1,500,000.00",
      "SALDO : RP 2,513,009.00"
    ].join("\n"),
    ""
  );

  assert.strictEqual(atmSuggestion.type, "income");
  assert.strictEqual(atmSuggestion.amount, 1500000);
  assert.ok(/setoran tunai/i.test(atmSuggestion.description));

  const transferSuggestion = parser.buildReceiptSuggestionFromOcrText(
    [
      "m-Transfer:",
      "BERHASIL",
      "09/04/2026 19:21:07",
      "Ke 7580639181",
      "DADI SOBANA",
      "Rp 200.000,00"
    ].join("\n"),
    ""
  );

  assert.strictEqual(transferSuggestion.amount, 200000);
  assert.strictEqual(transferSuggestion.type, "expense");
  assert.ok(/transfer/i.test(transferSuggestion.description));
}

function runRuntimeConfigTests() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arunika-runtime-config-"));

  try {
    const envFile = path.join(tempRoot, ".env");
    fs.writeFileSync(envFile, "TEST_RUNTIME_KEY=loaded-value\nTEST_QUOTED_KEY=\"quoted\"\n");

    delete process.env.TEST_RUNTIME_KEY;
    delete process.env.TEST_QUOTED_KEY;
    delete process.env.RATE_LIMIT_SAMPLE_MAX;
    delete process.env.RATE_LIMIT_SAMPLE_WINDOW_MS;

    loadEnvFile(envFile);

    assert.strictEqual(process.env.TEST_RUNTIME_KEY, "loaded-value");
    assert.strictEqual(process.env.TEST_QUOTED_KEY, "quoted");
    assert.strictEqual(readPositiveIntEnv("42", 9), 42);
    assert.strictEqual(readPositiveIntEnv("0", 9), 9);
    assert.strictEqual(parseCookieSameSite("strict"), "Strict");
    assert.strictEqual(parseCookieSameSite("unknown"), "Lax");

    process.env.RATE_LIMIT_SAMPLE_MAX = "7";
    process.env.RATE_LIMIT_SAMPLE_WINDOW_MS = "1234";
    assert.deepStrictEqual(readRateLimitEnv("SAMPLE", { max: 1, windowMs: 2 }), {
      max: 7,
      windowMs: 1234
    });
  } finally {
    delete process.env.TEST_RUNTIME_KEY;
    delete process.env.TEST_QUOTED_KEY;
    delete process.env.RATE_LIMIT_SAMPLE_MAX;
    delete process.env.RATE_LIMIT_SAMPLE_WINDOW_MS;
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
}

function runSessionAuthTests() {
  const testSessionAuth = createSessionAuth({
    cookieName: "session_id",
    getSessionWithUser: (sessionId) => (sessionId ? { sessionId, user: { id: "user-1" } } : null),
    nodeEnv: "test",
    sameSite: "Lax",
    sessionMaxAgeSeconds: 3600
  });

  assert.deepStrictEqual(testSessionAuth.parseCookies({ headers: { cookie: "session_id=abc123; theme=dark" } }), {
    session_id: "abc123",
    theme: "dark"
  });
  assert.strictEqual(testSessionAuth.getSessionFromRequest({ headers: { cookie: "session_id=abc123" } }).sessionId, "abc123");
  assert.match(testSessionAuth.buildSessionCookie("abc123"), /HttpOnly/);
  assert.match(testSessionAuth.buildSessionCookie("abc123"), /SameSite=Lax/);
  assert.doesNotMatch(testSessionAuth.buildSessionCookie("abc123"), /Secure/);

  const productionSessionAuth = createSessionAuth({
    cookieName: "session_id",
    getSessionWithUser: () => null,
    nodeEnv: "production",
    sameSite: "Strict",
    sessionMaxAgeSeconds: 7200
  });

  assert.match(productionSessionAuth.buildSessionCookie("prod-session"), /Secure/);
  assert.match(productionSessionAuth.buildClearCookie(), /Secure/);
  assert.match(productionSessionAuth.buildClearCookie(), /Max-Age=0/);
}

function runSqliteOpsTests() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arunika-sqlite-ops-"));

  try {
    const activeDataDir = path.join(tempRoot, "active-data");
    const activeReceiptsDir = path.join(activeDataDir, "receipts");
    const dbFile = path.join(activeDataDir, "arunika.sqlite");
    const backupRootDir = path.join(tempRoot, "backups");
    const snapshotRootDir = path.join(tempRoot, "snapshots");

    fs.mkdirSync(activeReceiptsDir, { recursive: true });
    fs.writeFileSync(dbFile, "active-db");
    fs.writeFileSync(`${dbFile}-wal`, "wal-data");
    fs.writeFileSync(path.join(activeReceiptsDir, "receipt.txt"), "active-receipt");

    const backup = createBackup({
      backupRootDir,
      cwd: tempRoot,
      dataDir: activeDataDir,
      dbFile,
      label: "module-test",
      now: new Date("2026-04-22T00:00:00Z"),
      receiptsDir: activeReceiptsDir
    });

    assert.ok(fs.existsSync(path.join(backup.backupDir, "arunika.sqlite")));
    assert.ok(fs.existsSync(path.join(backup.backupDir, "arunika.sqlite-wal")));
    assert.ok(fs.existsSync(path.join(backup.backupDir, "receipts", "receipt.txt")));
    assert.ok(fs.existsSync(path.join(backup.backupDir, "metadata.json")));

    fs.writeFileSync(path.join(backup.backupDir, "arunika.sqlite"), "restored-db");
    fs.writeFileSync(path.join(backup.backupDir, "receipts", "receipt.txt"), "restored-receipt");
    fs.writeFileSync(dbFile, "broken-db");
    fs.writeFileSync(path.join(activeReceiptsDir, "receipt.txt"), "broken-receipt");

    const restore = restoreBackup({
      confirmRestore: true,
      cwd: tempRoot,
      dataDir: activeDataDir,
      dbFile,
      now: new Date("2026-04-22T01:00:00Z"),
      receiptsDir: activeReceiptsDir,
      snapshotRootDir,
      sourceDir: backup.backupDir
    });

    assert.strictEqual(fs.readFileSync(dbFile, "utf8"), "restored-db");
    assert.strictEqual(fs.readFileSync(path.join(activeReceiptsDir, "receipt.txt"), "utf8"), "restored-receipt");
    assert.ok(restore.snapshotDir);
    assert.strictEqual(fs.readFileSync(path.join(restore.snapshotDir, "arunika.sqlite"), "utf8"), "broken-db");
  } finally {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
}

function runTransactionServiceTests() {
  const transactionService = createTransactionService({
    findCanonicalCategory,
    fsp: { mkdir: async () => {}, unlink: async () => {}, writeFile: async () => {} },
    inferTransactionCategory,
    parseFlexibleAmount,
    path: require("path"),
    receiptsDir: "receipts",
    rootDir: process.cwd(),
    sanitizeText,
    sanitizeTransaction
  });

  const pngDataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0qUAAAAASUVORK5CYII=";
  const upload = transactionService.sanitizeReceiptUpload({
    dataUrl: pngDataUrl,
    fileName: "struk.png"
  });

  assert.strictEqual(upload.mimeType, "image/png");
  assert.ok(Buffer.isBuffer(upload.buffer));

  const fingerprint = transactionService.buildTransactionFingerprint({
    type: "expense",
    date: "2026-04-12",
    amount: 50000,
    description: "Belanja Alfamart"
  });

  assert.strictEqual(fingerprint, "expense|2026-04-12|50000|belanja alfamart");
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
  const date = sanitizeText(payload.date, 10) || "2026-04-12";

  if (!type || !description || !rawCategory || !category || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid test payload");
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
