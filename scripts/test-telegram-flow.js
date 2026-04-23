const assert = require("assert");

const { findCanonicalCategory, inferTransactionCategory } = require("../transaction-categories");
const { parseFlexibleAmount } = require("../transaction-amount");
const { createTelegramService } = require("../src/server/services/telegram/service");

const originalFetch = global.fetch;

run()
  .then(() => {
    console.log("Telegram flow tests OK");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    global.fetch = originalFetch;
  });

async function run() {
  const drafts = new Map();
  const storedTransactions = [];
  const sentMessages = [];
  const answeredCallbacks = [];
  const linkedUser = { id: "user-1", email: "telegram@example.com" };

  function saveTelegramReceiptDraft(chatId, draft) {
    drafts.set(String(chatId), {
      ...draft
    });
  }

  function getTelegramReceiptDraft(chatId) {
    return drafts.get(String(chatId)) || null;
  }

  function deleteTelegramReceiptDraft(chatId) {
    drafts.delete(String(chatId));
  }

  global.fetch = async (url, options = {}) => {
    const normalizedUrl = String(url);

    if (normalizedUrl.includes("/getFile")) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          result: {
            file_path: "photos/receipt.jpg"
          }
        })
      };
    }

    if (normalizedUrl.includes("/sendMessage")) {
      const payload = JSON.parse(String(options.body || "{}"));
      sentMessages.push({
        replyMarkup: payload.reply_markup || null,
        text: payload.text
      });
      return {
        ok: true,
        json: async () => ({
          ok: true,
          result: {
            message_id: sentMessages.length
          }
        })
      };
    }

    if (normalizedUrl.includes("/answerCallbackQuery")) {
      const payload = JSON.parse(String(options.body || "{}"));
      answeredCallbacks.push(payload.callback_query_id);
      return {
        ok: true,
        json: async () => ({
          ok: true,
          result: true
        })
      };
    }

    if (normalizedUrl.includes("/file/bottest-token/photos/receipt.jpg")) {
      return {
        ok: true,
        arrayBuffer: async () =>
          Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]).buffer
      };
    }

    throw new Error(`Unexpected fetch in telegram flow test: ${normalizedUrl}`);
  };

  const telegramService = createTelegramService({
    analyzeReceipt: async (_receiptUpload, preferredType) => ({
      amount: 50000,
      category: "Transfer",
      date: "2026-04-12",
      description: preferredType === "expense" ? "Transfer ke DANA" : "Transaksi OCR",
      notes: "OCR test",
      reviewAlert: "",
      reviewFlags: [],
      reviewLevel: "low",
      type: preferredType || "expense"
    }),
    appBaseUrl: "https://example.com",
    botToken: "test-token",
    botUsername: "arunika_bot",
    buildChatReply: async () => ({ reply: "ok" }),
    computeSummary: (transactions) => ({
      balance: transactions.reduce((sum, item) => sum + (item.type === "income" ? item.amount : -item.amount), 0)
    }),
    computeUserSummary: () => ({
      balance: -50000
    }),
    createTransactionForUser: (_userId, payload) => {
      const transaction = {
        id: `trx-${storedTransactions.length + 1}`,
        ...payload
      };
      storedTransactions.push(transaction);
      return transaction;
    },
    deleteTelegramReceiptDraft,
    draftTtlMs: 60_000,
    findCanonicalCategory,
    formatCurrency: (value) =>
      new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0
      }).format(Number(value) || 0),
    formatReceiptSuggestionForTelegram: (suggestion) =>
      [
        "Hasil baca struk:",
        `- Tipe: ${suggestion.type}`,
        `- Deskripsi: ${suggestion.description}`,
        `- Nominal: ${suggestion.amount}`,
        `- Kategori: ${suggestion.category}`,
        `- Catatan: ${suggestion.notes}`
      ].join("\n"),
    getTelegramReceiptDraft,
    getTelegramLinkByChatId: (chatId) =>
      String(chatId) === "123"
        ? {
            user: linkedUser
          }
        : null,
    getTelegramLinkByUserId: (userId) => (userId === linkedUser.id ? { chatId: "123" } : null),
    inferTransactionCategory,
    linkTelegramChatByCode: () => null,
    listTransactionsByUser: () => [...storedTransactions],
    mimeTypes: {
      ".jpg": "image/jpeg"
    },
    normalizeReceiptDate: (value) => String(value),
    removeReceiptFile: async () => {},
    saveTelegramReceiptDraft,
    sanitizeText,
    sanitizeTransaction,
    saveReceiptUpload: async () => "receipts/test-receipt.jpg",
    secretToken: "secret",
    unlinkTelegramByChatId: () => false
  });

  await telegramService.handleTelegramUpdate({
    message: {
      chat: { id: 123, type: "private" },
      caption: "pengeluaran",
      photo: [{ file_id: "small-photo" }, { file_id: "large-photo" }]
    }
  });

  assert.strictEqual(drafts.size, 1);
  assert.ok(sentMessages.some((entry) => /Sedang membaca foto struk/i.test(entry.text)));
  assert.ok(sentMessages.some((entry) => /Balas `simpan`/i.test(entry.text)));
  assert.ok(sentMessages.some((entry) => /Checklist verifikasi/i.test(entry.text)));
  assert.ok(
    sentMessages.some((entry) =>
      entry.replyMarkup?.inline_keyboard?.some((row) => row.some((button) => button.callback_data === "draft_save"))
    )
  );

  await telegramService.handleTelegramUpdate({
    message: {
      chat: { id: 123, type: "private" },
      text: "simpan"
    }
  });

  assert.strictEqual(storedTransactions.length, 0);
  assert.ok(sentMessages.some((entry) => /Sebelum simpan, mohon cek manual/i.test(entry.text)));

  await telegramService.handleTelegramUpdate({
    callback_query: {
      id: "cb-preview-1",
      data: "draft_preview",
      message: {
        chat: { id: 123, type: "private" }
      }
    }
  });

  assert.ok(answeredCallbacks.includes("cb-preview-1"));
  assert.ok(sentMessages.some((entry) => /Hasil baca struk:/i.test(entry.text)));

  await telegramService.handleTelegramUpdate({
    message: {
      chat: { id: 123, type: "private" },
      text: "kategori Belanja"
    }
  });

  assert.ok(sentMessages.some((entry) => /Belanja/i.test(entry.text)));

  await telegramService.handleTelegramUpdate({
    message: {
      chat: { id: 123, type: "private" },
      text: "hapus kategori"
    }
  });

  assert.ok(sentMessages.some((entry) => /Transfer/i.test(entry.text)));

  await telegramService.handleTelegramUpdate({
    message: {
      chat: { id: 123, type: "private" },
      text: "merchant Alfamart Dadap"
    }
  });

  assert.ok(sentMessages.some((entry) => /Alfamart Dadap/i.test(entry.text)));

  await telegramService.handleTelegramUpdate({
    message: {
      chat: { id: 123, type: "private" },
      text: "catatan dibayar tunai"
    }
  });

  assert.ok(sentMessages.some((entry) => /dibayar tunai/i.test(entry.text)));

  await telegramService.handleTelegramUpdate({
    message: {
      chat: { id: 123, type: "private" },
      text: "hapus catatan"
    }
  });

  assert.ok(sentMessages.some((entry) => /- Catatan: ?$/im.test(entry.text)));

  await telegramService.handleTelegramUpdate({
    message: {
      chat: { id: 123, type: "private" },
      text: "reset draft"
    }
  });

  assert.ok(sentMessages.some((entry) => /Transfer ke DANA/i.test(entry.text)));

  await telegramService.handleTelegramUpdate({
    callback_query: {
      id: "cb-check-all-1",
      data: "draft_check_all",
      message: {
        chat: { id: 123, type: "private" }
      }
    }
  });

  assert.ok(answeredCallbacks.includes("cb-check-all-1"));

  await telegramService.handleTelegramUpdate({
    callback_query: {
      id: "cb-save-1",
      data: "draft_save",
      message: {
        chat: { id: 123, type: "private" }
      }
    }
  });

  assert.ok(answeredCallbacks.includes("cb-save-1"));
  assert.strictEqual(drafts.size, 0);
  assert.strictEqual(storedTransactions.length, 1);
  assert.strictEqual(storedTransactions[0].category, "Transfer");
  assert.strictEqual(storedTransactions[0].description, "Transfer ke DANA");
  assert.strictEqual(storedTransactions[0].notes, "OCR test");
  assert.strictEqual(storedTransactions[0].receiptPath, "receipts/test-receipt.jpg");
  assert.ok(sentMessages.some((entry) => /berhasil disimpan/i.test(entry.text)));

  await telegramService.handleTelegramUpdate({
    message: {
      chat: { id: 123, type: "private" },
      caption: "pengeluaran",
      photo: [{ file_id: "small-photo" }, { file_id: "large-photo" }]
    }
  });

  assert.strictEqual(drafts.size, 1);

  await telegramService.handleTelegramUpdate({
    callback_query: {
      id: "cb-cancel-1",
      data: "draft_cancel",
      message: {
        chat: { id: 123, type: "private" }
      }
    }
  });

  assert.ok(answeredCallbacks.includes("cb-cancel-1"));
  assert.strictEqual(drafts.size, 0);
  assert.ok(sentMessages.some((entry) => /dibatalkan/i.test(entry.text)));
}

function sanitizeText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizeTransaction(payload) {
  const type = payload.type === "income" ? "income" : "expense";
  const amount = parseFlexibleAmount(payload.amount);
  const description = sanitizeText(payload.description, 120);
  const rawCategory = sanitizeText(payload.category, 60);
  const category = findCanonicalCategory(type, rawCategory) || inferTransactionCategory(type, description) || "Belanja";
  const notes = sanitizeText(payload.notes, 240);
  const date = sanitizeText(payload.date, 10) || "2026-04-12";

  if (!description || !amount || amount <= 0) {
    throw new Error("Invalid test payload");
  }

  return {
    amount,
    category,
    date,
    description,
    notes,
    receiptPath: sanitizeText(payload.receiptPath, 260),
    type
  };
}
