function createTransactionRoutes({
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
  mimeTypes,
  parseJsonBody,
  path,
  removeReceiptFile,
  rootDir,
  sanitizeImportedTransaction,
  sanitizeReceiptUpload,
  sanitizeText,
  sendJson,
  updateTransactionForUser
}) {
  async function handleTransactionRoute(req, res, pathname, session) {
    if (!session) {
      return false;
    }

    if (req.method === "GET" && pathname === "/api/transactions") {
      sendJson(req, res, 200, { transactions: listTransactionsByUser(session.user.id) });
      return true;
    }

    if (req.method === "GET" && pathname.startsWith("/api/transactions/") && pathname.endsWith("/receipt")) {
      const transactionId = pathname.split("/")[3];
      const transaction = getTransactionByIdForUser(session.user.id, transactionId);

      if (!transaction || !transaction.receiptPath) {
        sendJson(req, res, 404, { error: "Struk tidak ditemukan." });
        return true;
      }

      const filePath = path.join(rootDir, transaction.receiptPath);
      const relativePath = path.relative(rootDir, filePath);
      if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        sendJson(req, res, 403, { error: "Akses struk ditolak." });
        return true;
      }

      try {
        const stat = await fsp.stat(filePath);
        if (!stat.isFile()) {
          sendJson(req, res, 404, { error: "Struk tidak ditemukan." });
          return true;
        }

        const extension = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          ...getSecurityHeaders(req),
          "Cache-Control": "private, max-age=300",
          "Content-Type": mimeTypes[extension] || "application/octet-stream"
        });
        fs.createReadStream(filePath).pipe(res);
        return true;
      } catch {
        sendJson(req, res, 404, { error: "Struk tidak ditemukan." });
        return true;
      }
    }

    if (req.method === "POST" && pathname === "/api/transactions/receipt-analyze") {
      if (enforceRateLimit(req, res, "transactionWrite", `user:${session.user.id}`)) {
        return true;
      }

      const payload = await parseJsonBody(req);
      const receiptUpload = sanitizeReceiptUpload(payload.receiptUpload);
      if (!receiptUpload) {
        sendJson(req, res, 400, { error: "Unggah struk terlebih dahulu sebelum menjalankan analisis AI." });
        return true;
      }

      const preferredType = payload.preferredType === "income" ? "income" : payload.preferredType === "expense" ? "expense" : "";
      let suggestion;
      try {
        suggestion = await analyzeReceipt(receiptUpload, preferredType);
      } catch (error) {
        sendJson(req, res, 400, { error: error.message || "Struk belum bisa dianalisis saat ini." });
        return true;
      }

      sendJson(req, res, 200, {
        message:
          suggestion.reviewLevel && suggestion.reviewLevel !== "high"
            ? suggestion.reviewAlert || "Nominal dari struk perlu dicek lagi sebelum menyimpan transaksi."
            : "Struk berhasil dibaca. Silakan cek kembali hasil isian sebelum menyimpan transaksi.",
        suggestion
      });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/transactions") {
      if (enforceRateLimit(req, res, "transactionWrite", `user:${session.user.id}`)) {
        return true;
      }

      const payload = await parseJsonBody(req);
      const { sanitized } = await enrichTransactionPayloadWithReceipt(session.user.id, payload);
      const transaction = createTransactionForUser(session.user.id, sanitized);
      sendJson(req, res, 201, {
        message: "Transaksi berhasil disimpan.",
        summary: computeSummary(listTransactionsByUser(session.user.id)),
        transaction
      });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/transactions/import") {
      if (enforceRateLimit(req, res, "transactionWrite", `user:${session.user.id}`)) {
        return true;
      }

      const payload = await parseJsonBody(req);
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      const sourceLabel = sanitizeText(payload.source, 80);

      if (!rows.length) {
        sendJson(req, res, 400, { error: "Tidak ada baris transaksi valid untuk diimport." });
        return true;
      }

      if (rows.length > 500) {
        sendJson(req, res, 400, { error: "Maksimal 500 transaksi per sekali import." });
        return true;
      }

      const existingTransactions = listTransactionsByUser(session.user.id);
      const fingerprints = new Set(existingTransactions.map((item) => buildTransactionFingerprint(item)));
      let importedCount = 0;
      let skippedDuplicates = 0;
      let skippedInvalid = 0;
      const importedTransactions = [];

      for (const row of rows) {
        try {
          const transaction = sanitizeImportedTransaction(row, sourceLabel);
          const fingerprint = buildTransactionFingerprint(transaction);

          if (fingerprints.has(fingerprint)) {
            skippedDuplicates += 1;
            continue;
          }

          fingerprints.add(fingerprint);
          importedTransactions.push(createTransactionForUser(session.user.id, transaction));
          importedCount += 1;
        } catch {
          skippedInvalid += 1;
        }
      }

      const summary = computeSummary(listTransactionsByUser(session.user.id));
      const detailParts = [];
      if (skippedDuplicates) {
        detailParts.push(`${skippedDuplicates} duplikat dilewati`);
      }
      if (skippedInvalid) {
        detailParts.push(`${skippedInvalid} baris gagal validasi akhir`);
      }

      const message = importedCount
        ? `Import selesai. ${importedCount} transaksi berhasil ditambahkan${detailParts.length ? `, ${detailParts.join(", ")}.` : "."}`
        : `Import tidak menambah transaksi baru${detailParts.length ? ` karena ${detailParts.join(" dan ")}.` : "."}`;

      sendJson(req, res, 200, {
        importedCount,
        message,
        skippedDuplicates,
        skippedInvalid,
        summary,
        transactions: importedTransactions.slice(0, 10)
      });
      return true;
    }

    if (req.method === "PUT" && pathname.startsWith("/api/transactions/")) {
      if (enforceRateLimit(req, res, "transactionWrite", `user:${session.user.id}`)) {
        return true;
      }

      const id = pathname.split("/").pop();
      const payload = await parseJsonBody(req);
      const existing = getTransactionByIdForUser(session.user.id, id);
      if (!existing) {
        sendJson(req, res, 404, { error: "Transaksi tidak ditemukan." });
        return true;
      }

      const { sanitized } = await enrichTransactionPayloadWithReceipt(session.user.id, payload, existing.receiptPath || "");
      const transaction = updateTransactionForUser(session.user.id, id, sanitized);

      if (!transaction) {
        sendJson(req, res, 404, { error: "Transaksi tidak ditemukan." });
        return true;
      }

      if ((transaction.previousReceiptPath || "") && transaction.previousReceiptPath !== (transaction.receiptPath || "")) {
        await removeReceiptFile(transaction.previousReceiptPath);
      }

      sendJson(req, res, 200, {
        message: "Transaksi berhasil diperbarui.",
        summary: computeSummary(listTransactionsByUser(session.user.id)),
        transaction
      });
      return true;
    }

    if (req.method === "DELETE" && pathname.startsWith("/api/transactions/")) {
      const id = pathname.split("/").pop();
      const deleted = deleteTransactionForUser(session.user.id, id);

      if (!deleted) {
        sendJson(req, res, 404, { error: "Transaksi tidak ditemukan." });
        return true;
      }

      if (deleted.receiptPath) {
        await removeReceiptFile(deleted.receiptPath);
      }

      sendJson(req, res, 200, {
        message: "Transaksi berhasil dihapus.",
        summary: computeSummary(listTransactionsByUser(session.user.id))
      });
      return true;
    }

    if (req.method === "GET" && pathname === "/api/summary") {
      sendJson(req, res, 200, { summary: computeSummary(listTransactionsByUser(session.user.id)) });
      return true;
    }

    return false;
  }

  return {
    handleTransactionRoute
  };
}

module.exports = {
  createTransactionRoutes
};
