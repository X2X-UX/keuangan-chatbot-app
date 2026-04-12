function createTransactionService({
  findCanonicalCategory,
  fsp,
  inferTransactionCategory,
  parseFlexibleAmount,
  path,
  receiptsDir,
  rootDir,
  sanitizeText,
  sanitizeTransaction
}) {
  function sanitizeReceiptUpload(payload) {
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const rawDataUrl = String(payload.dataUrl || "").trim();
    if (!rawDataUrl) {
      return null;
    }

    const fileName = sanitizeText(payload.fileName || "receipt.jpg", 120) || "receipt.jpg";
    const match = rawDataUrl.match(/^data:(image\/(?:png|jpe?g|webp));base64,([a-z0-9+/=\r\n]+)$/i);
    if (!match) {
      throw new Error("Format file struk belum didukung. Gunakan PNG, JPG, atau WEBP.");
    }

    const mimeType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
    const buffer = Buffer.from(match[2], "base64");
    if (!buffer.length) {
      throw new Error("File struk tidak valid.");
    }

    if (buffer.length > 2 * 1024 * 1024) {
      throw new Error("Ukuran struk maksimal 2 MB.");
    }

    return {
      buffer,
      fileName,
      mimeType
    };
  }

  function getReceiptExtension(mimeType) {
    if (mimeType === "image/png") {
      return ".png";
    }

    if (mimeType === "image/webp") {
      return ".webp";
    }

    return ".jpg";
  }

  async function saveReceiptUpload(userId, receiptUpload) {
    if (!receiptUpload) {
      return "";
    }

    const userDir = path.join(receiptsDir, userId);
    await fsp.mkdir(userDir, { recursive: true });

    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${getReceiptExtension(receiptUpload.mimeType)}`;
    const absolutePath = path.join(userDir, fileName);
    await fsp.writeFile(absolutePath, receiptUpload.buffer);

    return path.relative(rootDir, absolutePath).replaceAll("\\", "/");
  }

  async function removeReceiptFile(receiptPath) {
    const safeRelative = String(receiptPath || "").replace(/^([/\\])+/, "");
    if (!safeRelative) {
      return;
    }

    const absolutePath = path.join(rootDir, safeRelative);
    const relativePath = path.relative(rootDir, absolutePath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      return;
    }

    try {
      await fsp.unlink(absolutePath);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  async function enrichTransactionPayloadWithReceipt(userId, payload, existingReceiptPath = "") {
    const receiptAction = payload.receiptAction === "remove" ? "remove" : payload.receiptAction === "replace" ? "replace" : "keep";
    let receiptPath = existingReceiptPath || "";

    if (receiptAction === "remove") {
      receiptPath = "";
    }

    const receiptUpload = sanitizeReceiptUpload(payload.receiptUpload);
    const draft = sanitizeTransaction({
      ...payload,
      receiptPath
    });

    if (receiptUpload) {
      receiptPath = await saveReceiptUpload(userId, receiptUpload);
    }

    const sanitized = {
      ...draft,
      receiptPath
    };

    return {
      receiptAction,
      receiptPath,
      sanitized
    };
  }

  function buildTransactionFingerprint(transaction) {
    return [
      transaction.type,
      transaction.date,
      String(Math.round(Number(transaction.amount) || 0)),
      sanitizeText(transaction.description, 120).toLowerCase()
    ].join("|");
  }

  function sanitizeImportedTransaction(payload, sourceLabel) {
    const type = payload.type === "income" ? "income" : payload.type === "expense" ? "expense" : null;
    const description = sanitizeText(payload.description, 120);
    const rawCategory = sanitizeText(payload.category, 60);
    const inferredCategory = type ? inferTransactionCategory(type, `${description} ${rawCategory}`) : null;
    const fallbackCategory = type === "expense" ? "Belanja" : type === "income" ? "Hadiah" : "";
    const sourceNote = sourceLabel ? `Import CSV: ${sanitizeText(sourceLabel, 80)}` : "Import CSV";
    const rawNotes = sanitizeText(payload.notes, 240);
    const notes = [sourceNote, rawNotes].filter(Boolean).join(" | ").slice(0, 240);

    return sanitizeTransaction({
      ...payload,
      category: rawCategory || inferredCategory || fallbackCategory,
      description,
      notes
    });
  }

  return {
    buildTransactionFingerprint,
    enrichTransactionPayloadWithReceipt,
    removeReceiptFile,
    sanitizeImportedTransaction,
    sanitizeReceiptUpload,
    saveReceiptUpload
  };
}

module.exports = {
  createTransactionService
};
