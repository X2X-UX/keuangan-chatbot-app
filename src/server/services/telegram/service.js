const { createTelegramApiService } = require("./api");
const { createTelegramDraftService } = require("./draft");

function createTelegramService({
  analyzeReceipt,
  appBaseUrl,
  botToken,
  botUsername,
  buildChatReply,
  computeSummary,
  computeUserSummary,
  createTransactionForUser,
  deleteTelegramReceiptDraft,
  draftTtlMs,
  findCanonicalCategory,
  formatCurrency,
  formatReceiptSuggestionForTelegram,
  getTelegramReceiptDraft,
  getTelegramLinkByChatId,
  getTelegramLinkByUserId,
  inferTransactionCategory,
  linkTelegramChatByCode,
  listTransactionsByUser,
  mimeTypes,
  normalizeReceiptDate,
  receiptAnalyzer,
  removeReceiptFile,
  saveTelegramReceiptDraft,
  saveReceiptUpload,
  sanitizeText,
  sanitizeTransaction,
  secretToken,
  unlinkTelegramByChatId
}) {
  const activeReceiptAnalyzer =
    receiptAnalyzer ||
    (typeof analyzeReceipt === "function"
      ? {
          analyzeReceipt
        }
      : null);

  const {
    applyTelegramReceiptDraftPatch,
    buildReceiptDraftReplyMarkup,
    clearTelegramReceiptDraft,
    confirmReceiptDraftChecks,
    createReceiptDraftReviewState,
    formatTelegramReceiptDraftReply,
    parseTelegramReceiptDraftCommand,
    resetTelegramReceiptDraft,
    resolveDefaultDraftCategory,
    setTelegramReceiptDraft,
    validateReceiptDraftBeforeSave
  } = createTelegramDraftService({
    deleteTelegramReceiptDraft,
    draftTtlMs,
    findCanonicalCategory,
    formatReceiptSuggestionForTelegram,
    inferTransactionCategory,
    normalizeReceiptDate,
    sanitizeText,
    sanitizeTransaction,
    saveTelegramReceiptDraft
  });

  const {
    buildTelegramStatus,
    downloadTelegramPhotoUpload,
    ensureTelegramWebhook,
    getTelegramBotUrl,
    hasTelegramWebhookConfig,
    isTelegramConfigured,
    sendTelegramApiRequest,
    sendTelegramMessage,
    validateTelegramWebhookRequest
  } = createTelegramApiService({
    appBaseUrl,
    botToken,
    botUsername,
    getTelegramLinkByUserId,
    mimeTypes,
    secretToken
  });

  function getPreferredReceiptTypeFromText(text = "") {
    const raw = String(text || "").toLowerCase();
    if (/\b(pemasukan|income|uang masuk|transfer masuk)\b/.test(raw)) {
      return "income";
    }

    if (/\b(pengeluaran|expense|bayar|belanja|topup|transfer|qris)\b/.test(raw)) {
      return "expense";
    }

    return "";
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

  async function saveTelegramReceiptDraftTransaction(userId, draft) {
    let receiptPath = "";

    try {
      if (draft.receiptUpload) {
        receiptPath = await saveReceiptUpload(userId, draft.receiptUpload);
      }

      return createTransactionForUser(
        userId,
        sanitizeTransaction({
          ...draft.suggestion,
          receiptPath
        })
      );
    } catch (error) {
      if (receiptPath) {
        await removeReceiptFile(receiptPath);
      }

      throw error;
    }
  }

  function telegramHelpText() {
    return [
      "Bot Telegram Arunika membaca pesan teks biasa.",
      "Bot juga bisa menerima foto struk atau bukti transfer untuk dibacakan OCR.",
      "Setelah OCR selesai, balas `simpan` untuk mencatat transaksi atau `batal` untuk membuang draft.",
      "Shortcut tombol cepat juga tersedia: Simpan, Batal, dan Lihat Draft.",
      "Jika tipe transaksi perlu dibetulkan, balas `tipe pemasukan` atau `tipe pengeluaran`.",
      "Anda juga bisa balas `lihat draft`, `reset draft`, `merchant ...`, `catatan ...`, `hapus kategori`, atau `set default kategori` untuk mengoreksi hasil OCR.",
      "Jika confidence OCR masih rendah, cek manual dulu dengan `cek nominal`, `cek tanggal`, `cek kategori`, atau `cek semua`.",
      "Kategori transaksi mengikuti pilihan utama di form web.",
      "Anda bisa langsung kirim:",
      "- kode tautan dari dashboard web untuk menghubungkan akun",
      "- `pengeluaran 25rb makan siang kategori Makanan`",
      "- `pemasukan 1,5jt gaji kategori Gaji`",
      "- foto struk dengan caption opsional seperti `pengeluaran` atau `pemasukan`",
      "- pertanyaan bebas seperti `ringkasan keuangan saya`",
      "- pertanyaan bebas seperti `detail keuangan saya`",
      "",
      "Format nominal fleksibel: 15000, 15.000, Rp15.000, 15rb, 1,5jt",
      "",
      "Perintah opsional yang masih didukung:",
      "/start - lihat panduan singkat",
      "/summary - minta ringkasan keuangan",
      "/detail - minta detail kondisi keuangan",
      "/unlink - putuskan koneksi Telegram dari akun",
      "/help - tampilkan bantuan",
      "",
      "Anda juga tetap bisa memakai format `catat ...` jika lebih nyaman."
    ].join("\n");
  }

  async function handleTelegramPhotoMessage(message) {
    const chatId = message.chat?.id;
    if (!chatId) {
      return;
    }

    const linked = getTelegramLinkByChatId(chatId);
    if (!linked) {
      await sendTelegramMessage(
        chatId,
        "Chat ini belum terhubung ke akun Arunika Finance. Masuk ke web app, buat kode Telegram, lalu kirim atau tempel kode tautan ke bot ini."
      );
      return;
    }

    try {
      await sendTelegramMessage(chatId, "Sedang membaca foto struk...");
      const receiptUpload = await downloadTelegramPhotoUpload(message);
      if (!receiptUpload) {
        await sendTelegramMessage(chatId, "Foto struk belum ditemukan. Coba kirim ulang sebagai gambar.");
        return;
      }

      const preferredType = getPreferredReceiptTypeFromText(message.caption || "");
      if (!activeReceiptAnalyzer?.analyzeReceipt) {
        throw new Error("Receipt analyzer belum siap.");
      }

      const suggestion = await activeReceiptAnalyzer.analyzeReceipt(receiptUpload, preferredType);
      const reviewState = createReceiptDraftReviewState(suggestion);
      setTelegramReceiptDraft(chatId, {
        linkedUserId: linked.user.id,
        originalSuggestion: {
          ...suggestion
        },
        receiptUpload,
        reviewState,
        suggestion
      });
      await sendTelegramMessage(chatId, formatTelegramReceiptDraftReply({
        reviewState,
        suggestion
      }), {
        replyMarkup: buildReceiptDraftReplyMarkup({
          reviewState
        })
      });
    } catch (error) {
      await sendTelegramMessage(chatId, `Foto belum bisa dibaca: ${error.message || "Terjadi kesalahan saat OCR."}`);
    }
  }

  async function handleTelegramTextMessage(message) {
    const chatId = message.chat?.id;
    const text = String(message.text || "").trim();

    if (!chatId || !text) {
      return;
    }

    const linked = getTelegramLinkByChatId(chatId);
    const receiptDraft = getTelegramReceiptDraft(chatId);

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
      clearTelegramReceiptDraft(chatId);
      await sendTelegramMessage(
        chatId,
        unlinked ? "Koneksi Telegram ke akun Arunika Finance sudah diputus." : "Chat ini belum terhubung ke akun mana pun."
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

    const draftCommand = receiptDraft ? parseTelegramReceiptDraftCommand(text) : null;
    if (draftCommand) {
      if (receiptDraft.linkedUserId !== linked.user.id) {
        clearTelegramReceiptDraft(chatId);
        await sendTelegramMessage(chatId, "Draft struk sebelumnya sudah tidak berlaku. Silakan kirim foto lagi.");
        return;
      }

      if (draftCommand.action === "cancel") {
        clearTelegramReceiptDraft(chatId);
        await sendTelegramMessage(chatId, "Draft hasil baca struk dibatalkan. Kirim foto baru kapan saja jika ingin mencoba lagi.");
        return;
      }

      if (draftCommand.action === "preview") {
        await sendTelegramMessage(chatId, formatTelegramReceiptDraftReply(receiptDraft), {
          replyMarkup: buildReceiptDraftReplyMarkup(receiptDraft)
        });
        return;
      }

      if (draftCommand.action === "reset") {
        const resetDraft = resetTelegramReceiptDraft(receiptDraft);
        setTelegramReceiptDraft(chatId, resetDraft);
        await sendTelegramMessage(chatId, formatTelegramReceiptDraftReply(resetDraft), {
          replyMarkup: buildReceiptDraftReplyMarkup(resetDraft)
        });
        return;
      }

      if (draftCommand.action === "confirm") {
        const confirmedDraft = confirmReceiptDraftChecks(receiptDraft, draftCommand.field);
        setTelegramReceiptDraft(chatId, confirmedDraft);
        await sendTelegramMessage(chatId, formatTelegramReceiptDraftReply(confirmedDraft), {
          replyMarkup: buildReceiptDraftReplyMarkup(confirmedDraft)
        });
        return;
      }

      if (draftCommand.action === "default-category") {
        try {
          const updatedDraft = applyTelegramReceiptDraftPatch(receiptDraft, {
            category: resolveDefaultDraftCategory(receiptDraft)
          });
          setTelegramReceiptDraft(chatId, updatedDraft);
          await sendTelegramMessage(chatId, formatTelegramReceiptDraftReply(updatedDraft), {
            replyMarkup: buildReceiptDraftReplyMarkup(updatedDraft)
          });
        } catch (error) {
          await sendTelegramMessage(chatId, `Kategori default belum bisa dipakai: ${error.message || "Terjadi kesalahan."}`);
        }

        return;
      }

      if (draftCommand.action === "save") {
        const draftValidation = validateReceiptDraftBeforeSave(receiptDraft);
        if (!draftValidation.ok) {
          await sendTelegramMessage(
            chatId,
            `Sebelum simpan, mohon cek manual ${draftValidation.missing.join(", ")} dulu karena confidence OCR masih perlu verifikasi. Balas \`cek nominal\`, \`cek tanggal\`, \`cek kategori\`, atau \`cek semua\`.`,
            {
              replyMarkup: buildReceiptDraftReplyMarkup(receiptDraft)
            }
          );
          return;
        }

        try {
          const transaction = await saveTelegramReceiptDraftTransaction(linked.user.id, receiptDraft);
          clearTelegramReceiptDraft(chatId);
          const summary =
            typeof computeUserSummary === "function"
              ? computeUserSummary(linked.user.id)
              : computeSummary(listTransactionsByUser(linked.user.id));
          const chatReply = await buildChatReply("Buat ringkasan budget terbaru saya.", linked.user);
          const budgetAlert =
            String(chatReply?.reply || "")
              .split(/\s+/)
              .join(" ")
              .match(/Budget .*?(?:\.|$)|Semua \d+ budget kategori .*?(?:\.|$)/)?.[0] || "";
          await sendTelegramMessage(
            chatId,
            [
              "Transaksi dari hasil OCR berhasil disimpan.",
              `${transaction.type === "income" ? "Pemasukan" : "Pengeluaran"} ${formatCurrency(transaction.amount)} untuk ${transaction.description}.`,
              `Kategori: ${transaction.category}. Tanggal: ${transaction.date}.`,
              `Saldo terbaru: ${formatCurrency(summary.balance)}.`,
              budgetAlert
            ].join(" ")
          );
        } catch (error) {
          await sendTelegramMessage(chatId, `Draft belum bisa disimpan: ${error.message || "Terjadi kesalahan."}`);
        }

        return;
      }

      if (draftCommand.action === "patch") {
        try {
          const updatedDraft = applyTelegramReceiptDraftPatch(receiptDraft, draftCommand.patch);
          setTelegramReceiptDraft(chatId, updatedDraft);
          await sendTelegramMessage(chatId, formatTelegramReceiptDraftReply(updatedDraft), {
            replyMarkup: buildReceiptDraftReplyMarkup(updatedDraft)
          });
        } catch (error) {
          await sendTelegramMessage(chatId, `Perubahan draft belum bisa dipakai: ${error.message || "Format belum sesuai."}`);
        }

        return;
      }
    }

    if (receiptDraft) {
      await sendTelegramMessage(
        chatId,
        "Masih ada draft hasil OCR yang belum diputuskan. Balas `simpan`, `batal`, `lihat draft`, `reset draft`, `cek nominal/tanggal/kategori/semua`, atau ubah dengan `tipe ...`, `kategori ...`, `hapus kategori`, `set default kategori`, `merchant ...`, `deskripsi ...`, `catatan ...`, `hapus catatan`, `nominal ...`, `tanggal ...`."
      );
      return;
    }

    if (/^\/summary\b/i.test(text)) {
      const result = await buildChatReply("Buat ringkasan keuangan saya.", linked.user);
      await sendTelegramMessage(chatId, result.reply);
      return;
    }

    if (/^\/detail\b/i.test(text)) {
      const result = await buildChatReply("Buat detail keuangan saya.", linked.user);
      await sendTelegramMessage(chatId, result.reply);
      return;
    }

    const cleanedText = text.replace(/^\/\w+(?:@\w+)?\s*/i, "").trim() || text;
    const result = await buildChatReply(cleanedText, linked.user);
    await sendTelegramMessage(chatId, result.reply);
  }

  async function handleTelegramCallbackQuery(callbackQuery) {
    const callbackId = callbackQuery?.id;
    const chatId = callbackQuery?.message?.chat?.id;
    const data = String(callbackQuery?.data || "").trim().toLowerCase();

    if (!callbackId || !chatId) {
      return;
    }

    const mappedText =
      data === "draft_save"
        ? "simpan"
        : data === "draft_cancel"
          ? "batal"
          : data === "draft_preview"
            ? "lihat draft"
            : data === "draft_check_all"
              ? "cek semua"
              : "";

    await sendTelegramApiRequest("answerCallbackQuery", {
      callback_query_id: callbackId
    });

    if (!mappedText) {
      return;
    }

    await handleTelegramTextMessage({
      chat: { id: chatId },
      text: mappedText
    });
  }

  async function handleTelegramUpdate(update) {
    if (update?.callback_query) {
      await handleTelegramCallbackQuery(update.callback_query);
      return;
    }

    if (!update?.message) {
      return;
    }

    if (Array.isArray(update.message.photo) && update.message.photo.length > 0) {
      await handleTelegramPhotoMessage(update.message);
      return;
    }

    await handleTelegramTextMessage(update.message);
  }

  return {
    buildTelegramStatus,
    ensureTelegramWebhook,
    handleTelegramUpdate,
    hasTelegramWebhookConfig,
    isTelegramConfigured,
    validateTelegramWebhookRequest
  };
}

module.exports = {
  createTelegramService
};
