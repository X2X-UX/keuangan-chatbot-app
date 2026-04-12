const path = require("path");

function createTelegramService({
  analyzeReceipt,
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
  const activeReceiptAnalyzer =
    receiptAnalyzer ||
    (typeof analyzeReceipt === "function"
      ? {
          analyzeReceipt
        }
      : null);

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

  async function sendTelegramMessage(chatId, text, options = {}) {
    const chunks = chunkTelegramText(text);

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const isLastChunk = index === chunks.length - 1;
      await sendTelegramApiRequest("sendMessage", {
        chat_id: chatId,
        text: chunk,
        ...(isLastChunk && options.replyMarkup ? { reply_markup: options.replyMarkup } : {})
      });
    }
  }

  function buildReceiptDraftReplyMarkup(draft) {
    const inlineKeyboard = [
      [
        { text: "Simpan", callback_data: "draft_save" },
        { text: "Batal", callback_data: "draft_cancel" },
        { text: "Lihat Draft", callback_data: "draft_preview" }
      ]
    ];

    if (draft?.reviewState?.required) {
      inlineKeyboard.push([{ text: "Cek Semua", callback_data: "draft_check_all" }]);
    }

    return {
      inline_keyboard: inlineKeyboard
    };
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

  function formatTelegramReceiptDraftReply(draft) {
    const suggestion = draft?.suggestion || {};
    const lines = [
      formatReceiptSuggestionForTelegram(suggestion),
      "",
      "Balas `simpan` untuk mencatat transaksi ini.",
      "Balas `batal` untuk membuang hasil OCR.",
      "Balas `lihat draft` untuk melihat draft saat ini.",
      "Balas `reset draft` untuk kembali ke hasil OCR awal.",
      "Balas `cek nominal`, `cek tanggal`, `cek kategori`, atau `cek semua` untuk konfirmasi cek manual.",
      "Edit cepat juga didukung:",
      "- `tipe pemasukan`",
      "- `tipe pengeluaran`",
      "- `kategori Makanan`",
      "- `hapus kategori`",
      "- `set default kategori`",
      "- `deskripsi Topup GoPay`",
      "- `merchant Alfamart`",
      "- `toko Indomaret Fresh`",
      "- `catatan dibayar tunai`",
      "- `hapus catatan`",
      "- `nominal 800000`",
      "- `tanggal 2026-04-12`"
    ];

    const reviewState = draft?.reviewState || null;
    if (reviewState?.required) {
      lines.push("");
      lines.push("Checklist verifikasi (wajib karena confidence OCR belum tinggi):");
      lines.push(`- Nominal: ${reviewState.checks.amount ? "Sudah dicek" : "Perlu dicek"}`);
      lines.push(`- Tanggal: ${reviewState.checks.date ? "Sudah dicek" : "Perlu dicek"}`);
      lines.push(`- Kategori: ${reviewState.checks.category ? "Sudah dicek" : "Perlu dicek"}`);
    }

    return lines.join("\n");
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

    if (/^lihat\s+draft$/i.test(command)) {
      return { action: "preview" };
    }

    if (/^reset\s+draft$/i.test(command)) {
      return { action: "reset" };
    }

    const checkMatch = command.match(/^cek\s+(nominal|tanggal|kategori|semua)$/i);
    if (checkMatch?.[1]) {
      return {
        action: "confirm",
        field: checkMatch[1].toLowerCase()
      };
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

    if (/^hapus\s+kategori$/i.test(command) || /^set\s+default\s+kategori$/i.test(command) || /^default\s+kategori$/i.test(command)) {
      return { action: "default-category" };
    }

    const merchantMatch = command.match(/^(?:merchant|toko)\s+(.+)$/i);
    if (merchantMatch?.[1]) {
      return {
        action: "patch",
        patch: {
          description: sanitizeText(merchantMatch[1], 120)
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

    const notesMatch = command.match(/^catatan\s+(.+)$/i);
    if (notesMatch?.[1]) {
      return {
        action: "patch",
        patch: {
          notes: sanitizeText(notesMatch[1], 240)
        }
      };
    }

    if (/^hapus\s+catatan$/i.test(command)) {
      return {
        action: "patch",
        patch: {
          notes: ""
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
    const nextReviewChecks = {
      amount: Boolean(draft?.reviewState?.checks?.amount),
      category: Boolean(draft?.reviewState?.checks?.category),
      date: Boolean(draft?.reviewState?.checks?.date)
    };

    if (Object.prototype.hasOwnProperty.call(patch, "amount")) {
      nextReviewChecks.amount = true;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "date")) {
      nextReviewChecks.date = true;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "category")) {
      nextReviewChecks.category = true;
    }

    return {
      ...draft,
      reviewState: {
        checks: nextReviewChecks,
        required: Boolean(draft?.reviewState?.required)
      },
      suggestion: {
        ...nextSuggestion,
        reviewAlert: draft.suggestion.reviewAlert || "",
        reviewFlags: Array.isArray(draft.suggestion.reviewFlags) ? [...draft.suggestion.reviewFlags] : [],
        reviewLevel: draft.suggestion.reviewLevel || "high"
      },
      expiresAt: Date.now() + draftTtlMs
    };
  }

  function resetTelegramReceiptDraft(draft) {
    return {
      ...draft,
      reviewState: createReceiptDraftReviewState(draft.originalSuggestion),
      suggestion: {
        ...draft.originalSuggestion
      },
      expiresAt: Date.now() + draftTtlMs
    };
  }

  function resolveDefaultDraftCategory(draft) {
    const type = draft?.suggestion?.type === "income" ? "income" : "expense";
    return (
      inferTransactionCategory(type, `${draft?.suggestion?.description || ""} ${draft?.suggestion?.notes || ""}`) ||
      (type === "income" ? "Hadiah" : "Belanja")
    );
  }

  function createReceiptDraftReviewState(suggestion) {
    const reviewLevel = suggestion?.reviewLevel === "low" ? "low" : suggestion?.reviewLevel === "medium" ? "medium" : "high";
    const required = reviewLevel !== "high";
    return {
      checks: {
        amount: !required,
        category: !required,
        date: !required
      },
      required
    };
  }

  function confirmReceiptDraftChecks(draft, field) {
    const nextChecks = {
      amount: Boolean(draft?.reviewState?.checks?.amount),
      category: Boolean(draft?.reviewState?.checks?.category),
      date: Boolean(draft?.reviewState?.checks?.date)
    };

    if (field === "semua") {
      nextChecks.amount = true;
      nextChecks.category = true;
      nextChecks.date = true;
    } else if (field === "nominal") {
      nextChecks.amount = true;
    } else if (field === "tanggal") {
      nextChecks.date = true;
    } else if (field === "kategori") {
      nextChecks.category = true;
    }

    return {
      ...draft,
      reviewState: {
        checks: nextChecks,
        required: Boolean(draft?.reviewState?.required)
      },
      expiresAt: Date.now() + draftTtlMs
    };
  }

  function validateReceiptDraftBeforeSave(draft) {
    if (!draft?.reviewState?.required) {
      return {
        ok: true
      };
    }

    const missing = [];
    if (!draft.reviewState.checks.amount) {
      missing.push("nominal");
    }

    if (!draft.reviewState.checks.date) {
      missing.push("tanggal");
    }

    if (!draft.reviewState.checks.category) {
      missing.push("kategori");
    }

    return {
      missing,
      ok: missing.length === 0
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
      allowed_updates: ["message", "callback_query"]
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
      const result = await buildChatReply("Buat ringkasan keuangan saya.", [], linked.user);
      await sendTelegramMessage(chatId, result.reply);
      return;
    }

    const cleanedText = text.replace(/^\/\w+(?:@\w+)?\s*/i, "").trim() || text;
    const result = await buildChatReply(cleanedText, [], linked.user);
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
