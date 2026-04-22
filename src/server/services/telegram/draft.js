function createTelegramDraftService({
  deleteTelegramReceiptDraft,
  draftTtlMs,
  findCanonicalCategory,
  formatReceiptSuggestionForTelegram,
  inferTransactionCategory,
  normalizeReceiptDate,
  sanitizeText,
  sanitizeTransaction,
  saveTelegramReceiptDraft
}) {
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

  function setTelegramReceiptDraft(chatId, draft) {
    const nextDraft = {
      ...draft,
      createdAt: Date.now(),
      expiresAt: Date.now() + draftTtlMs
    };
    saveTelegramReceiptDraft(String(chatId), nextDraft);
    return nextDraft;
  }

  function clearTelegramReceiptDraft(chatId) {
    deleteTelegramReceiptDraft(String(chatId));
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

  return {
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
  };
}

module.exports = {
  createTelegramDraftService
};
