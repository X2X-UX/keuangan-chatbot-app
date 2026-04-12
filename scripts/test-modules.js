const assert = require("assert");

const { findCanonicalCategory, inferTransactionCategory } = require("../transaction-categories");
const { parseFlexibleAmount } = require("../transaction-amount");
const { createReceiptParser } = require("../src/server/services/receipts/parser");
const { createTransactionService } = require("../src/server/services/transactions/service");

runAmountTests();
runReceiptParserTests();
runTransactionServiceTests();

console.log("Module tests OK");

function runAmountTests() {
  assert.strictEqual(parseFlexibleAmount("15rb"), 15000);
  assert.strictEqual(parseFlexibleAmount("1,5jt"), 1500000);
  assert.strictEqual(parseFlexibleAmount("200.000,00"), 200000);
  assert.strictEqual(parseFlexibleAmount("50,000.00"), 50000);
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
