const path = require("path");

function createTelegramService({
  appBaseUrl,
  botToken,
  botUsername,
  buildChatReply,
  computeSummary,
  createTransactionForUser,
  drafts,
  draftTtlMs,
  findCanonicalCategory,
  formatCurrency,
  formatReceiptSuggestionForTelegram,
  getTelegramLinkByChatId,
  getTelegramLinkByUserId,
  inferTransactionCategory,
  linkTelegramChatByCode,
  listTransactionsByUser,
  mimeTypes,
  normalizeReceiptDate,
  receiptAnalyzer,
  removeReceiptFile,
  saveReceiptUpload,
  sanitizeText,
  sanitizeTransaction,
  secretToken,
  unlinkTelegramByChatId
}) {
  function isTelegramConfigured() {
    return Boolean(botToken);
  }

  function hasTelegramWebhookConfig() {
    return isTelegramConfigured() && Boolean(appBaseUrl);
  }

  function getTelegramBotUrl() {
    return botUsername ? `https://t.me/${botUsername}` : null;
  }

  function getTelegramWebhookUrl() {
    if (!hasTelegramWebhookConfig()) {
      return null;
    }

    return new URL("/api/telegram/webhook", appBaseUrl).toString();
  }

  function buildTelegramStatus(userId) {
    const link = userId ? getTelegramLinkByUserId(userId) : null;
    return {
      botUrl: getTelegramBotUrl(),
      botUsername: botUsername || null,
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

    if (!secretToken) {
      return true;
    }

    const incomingSecret = String(req.headers["x-telegram-bot-api-secret-token"] || "");
    return incomingSecret === secretToken;
  }

  async function sendTelegramApiRequest(method, payload) {
    if (!isTelegramConfigured()) {
      throw new Error("Telegram bot belum dikonfigurasi.");
    }

    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
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

  function getMimeTypeFromTelegramFilePath(filePath) {
    return mimeTypes[path.extname(String(filePath || "")).toLowerCase()] || "image/jpeg";
  }

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

  function cleanupExpiredTelegramReceiptDrafts() {
    const now = Date.now();

    for (const [chatId, draft] of drafts.entries()) {
      if (!draft || Number(draft.expiresAt || 0) <= now) {
        drafts.delete(chatId);
      }
    }
  }

  function setTelegramReceiptDraft(chatId, draft) {
    cleanupExpiredTelegramReceiptDrafts();
    drafts.set(String(chatId), {
      ...draft,
      createdAt: Date.now(),
      expiresAt: Date.now() + draftTtlMs
    });
  }

  function getTelegramReceiptDraft(chatId) {
    cleanupExpiredTelegramReceiptDrafts();
    return drafts.get(String(chatId)) || null;
  }

  function clearTelegramReceiptDraft(chatId) {
    drafts.delete(String(chatId));
  }

  function formatTelegramReceiptDraftReply(suggestion) {
    return [
      formatReceiptSuggestionForTelegram(suggestion),
      "",
      "Balas `simpan` untuk mencatat transaksi ini.",
      "Balas `batal` untuk membuang hasil OCR.",
      "Edit cepat juga didukung:",
      "- `tipe pemasukan`",
      "- `tipe pengeluaran`",
      "- `kategori Makanan`",
      "- `deskripsi Topup GoPay`",
      "- `nominal 800000`",
      "- `tanggal 2026-04-12`"
    ].join("\n");
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

  function parseTelegramReceiptDraftCommand(text) {
    const normalized = String(text || "").trim();
    if (!normalized) {
      return null;
    }

    const command = normalized.replace(/^\/(\w+)(?:@\w+)?\s*/, "$1 ").trim();

    if (/^simpan$/i.test(command)) {
      return { action: "save" };
    }

    if (/^batal$/i.test(command)) {
      return { action: "cancel" };
    }

    const typeMatch = command.match(/^tipe\s+(pemasukan|pengeluaran|income|expense)$/i);
    if (typeMatch?.[1]) {
      return {
        action: "patch",
        patch: {
          type: /^(pemasukan|income)$/i.test(typeMatch[1]) ? "income" : "expense"
        }
      };
    }

    const categoryMatch = command.match(/^kategori\s+(.+)$/i);
    if (categoryMatch?.[1]) {
      return {
        action: "patch",
        patch: {
          category: sanitizeText(categoryMatch[1], 60)
        }
      };
    }

    const descriptionMatch = command.match(/^deskripsi\s+(.+)$/i);
    if (descriptionMatch?.[1]) {
      return {
        action: "patch",
        patch: {
          description: sanitizeText(descriptionMatch[1], 120)
        }
      };
    }

    const amountMatch = command.match(/^(?:nominal|jumlah)\s+(.+)$/i);
    if (amountMatch?.[1]) {
      return {
        action: "patch",
        patch: {
          amount: amountMatch[1]
        }
      };
    }

    const dateMatch = command.match(/^tanggal\s+(.+)$/i);
    if (dateMatch?.[1]) {
      return {
        action: "patch",
        patch: {
          date: normalizeReceiptDate(dateMatch[1])
        }
      };
    }

    return null;
  }

  function applyTelegramReceiptDraftPatch(draft, patch) {
    const nextPayload = {
      ...draft.suggestion,
      ...patch
    };

    if (patch.type && patch.type !== draft.suggestion.type) {
      const nextType = patch.type;
      const nextCategory = findCanonicalCategory(nextType, nextPayload.category);

      if (!nextCategory) {
        nextPayload.category =
          inferTransactionCategory(nextType, `${nextPayload.description} ${nextPayload.notes}`) ||
          (nextType === "income" ? "Hadiah" : "Belanja");
      }
    }

    const nextSuggestion = sanitizeTransaction(nextPayload);

    return {
      ...draft,
      suggestion: {
        ...nextSuggestion,
        reviewAlert: draft.suggestion.reviewAlert || "",
        reviewFlags: Array.isArray(draft.suggestion.reviewFlags) ? [...draft.suggestion.reviewFlags] : [],
        reviewLevel: draft.suggestion.reviewLevel || "high"
      },
      expiresAt: Date.now() + draftTtlMs
    };
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

  async function downloadTelegramPhotoUpload(message) {
    const photoList = Array.isArray(message?.photo) ? message.photo : [];
    const picked = photoList[photoList.length - 1];
    if (!picked?.file_id) {
      return null;
    }

    const file = await sendTelegramApiRequest("getFile", {
      file_id: picked.file_id
    });

    if (!file?.file_path) {
      throw new Error("Telegram tidak mengembalikan path file foto.");
    }

    const response = await fetch(`https://api.telegram.org/file/bot${botToken}/${file.file_path}`, {
      signal: AbortSignal.timeout(25_000)
    });

    if (!response.ok) {
      throw new Error("Gagal mengunduh foto struk dari Telegram.");
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      fileName: path.basename(file.file_path),
      mimeType: getMimeTypeFromTelegramFilePath(file.file_path)
    };
  }

  async function ensureTelegramWebhook() {
    if (!hasTelegramWebhookConfig()) {
      return null;
    }

    const payload = {
      url: getTelegramWebhookUrl(),
      allowed_updates: ["message"]
    };

    if (secretToken) {
      payload.secret_token = secretToken;
    }

    return sendTelegramApiRequest("setWebhook", payload);
  }

  function telegramHelpText() {
    return [
      "Bot Telegram Arunika membaca pesan teks biasa.",
      "Bot juga bisa menerima foto struk atau bukti transfer untuk dibacakan OCR.",
      "Setelah OCR selesai, balas `simpan` untuk mencatat transaksi atau `batal` untuk membuang draft.",
      "Jika tipe transaksi perlu dibetulkan, balas `tipe pemasukan` atau `tipe pengeluaran`.",
      "Kategori transaksi mengikuti pilihan utama di form web.",
      "Anda bisa langsung kirim:",
      "- kode tautan dari dashboard web untuk menghubungkan akun",
      "- `pengeluaran 25rb makan siang kategori Makanan`",
      "- `pemasukan 1,5jt gaji kategori Gaji`",
      "- foto struk dengan caption opsional seperti `pengeluaran` atau `pemasukan`",
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
      const suggestion = await receiptAnalyzer.analyzeReceipt(receiptUpload, preferredType);
      setTelegramReceiptDraft(chatId, {
        linkedUserId: linked.user.id,
        receiptUpload,
        suggestion
      });
      await sendTelegramMessage(chatId, formatTelegramReceiptDraftReply(suggestion));
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

      if (draftCommand.action === "save") {
        try {
          const transaction = await saveTelegramReceiptDraftTransaction(linked.user.id, receiptDraft);
          clearTelegramReceiptDraft(chatId);
          const summary = computeSummary(listTransactionsByUser(linked.user.id));
          await sendTelegramMessage(
            chatId,
            [
              "Transaksi dari hasil OCR berhasil disimpan.",
              `${transaction.type === "income" ? "Pemasukan" : "Pengeluaran"} ${formatCurrency(transaction.amount)} untuk ${transaction.description}.`,
              `Kategori: ${transaction.category}. Tanggal: ${transaction.date}.`,
              `Saldo terbaru: ${formatCurrency(summary.balance)}.`
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
          await sendTelegramMessage(chatId, formatTelegramReceiptDraftReply(updatedDraft.suggestion));
        } catch (error) {
          await sendTelegramMessage(chatId, `Perubahan draft belum bisa dipakai: ${error.message || "Format belum sesuai."}`);
        }

        return;
      }
    }

    if (receiptDraft) {
      await sendTelegramMessage(
        chatId,
        "Masih ada draft hasil OCR yang belum diputuskan. Balas `simpan`, `batal`, atau ubah dengan `tipe ...`, `kategori ...`, `deskripsi ...`, `nominal ...`, `tanggal ...`."
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
