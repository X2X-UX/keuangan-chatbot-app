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
  function getExportLocale(value) {
    return String(value || "").trim().toLowerCase() === "en" ? "en" : "id";
  }

  function getIntlLocale(locale) {
    return locale === "en" ? "en-US" : "id-ID";
  }

  function getTransactionTypeLabel(type, locale) {
    if (type === "income") {
      return locale === "en" ? "Income" : "Pemasukan";
    }

    return locale === "en" ? "Expense" : "Pengeluaran";
  }

  function getExportCopy(locale) {
    return locale === "en"
      ? {
          amount: "Amount",
          category: "Category",
          date: "Date",
          description: "Description",
          exportedAt: "Exported at",
          filters: "Filters",
          noNotes: "No additional notes",
          notes: "Notes",
          query: "Search",
          recapTitle: "Transaction History Recap",
          totalExpense: "Total expense",
          totalIncome: "Total income",
          totalNet: "Net balance",
          totalRows: "Transactions",
          type: "Type",
          typeAll: "All types"
        }
      : {
          amount: "Nominal",
          category: "Kategori",
          date: "Tanggal",
          description: "Deskripsi",
          exportedAt: "Diekspor pada",
          filters: "Filter",
          noNotes: "Tanpa catatan tambahan",
          notes: "Catatan",
          query: "Pencarian",
          recapTitle: "Rekap Riwayat Transaksi",
          totalExpense: "Total pengeluaran",
          totalIncome: "Total pemasukan",
          totalNet: "Saldo net",
          totalRows: "Jumlah transaksi",
          type: "Tipe",
          typeAll: "Semua tipe"
        };
  }

  function filterTransactions(items, typeFilter, searchQuery) {
    const normalizedQuery = String(searchQuery || "").trim().toLowerCase();
    const normalizedType = typeFilter === "income" || typeFilter === "expense" ? typeFilter : "all";

    return items.filter((item) => {
      const haystack = `${item.description} ${item.category} ${item.notes || ""}`.toLowerCase();
      return (normalizedType === "all" || item.type === normalizedType) && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }

  function buildExportSnapshot(items, query, locale) {
    const copy = getExportCopy(locale);
    const typeFilter = query.get("type") === "income" || query.get("type") === "expense" ? query.get("type") : "all";
    const searchQuery = String(query.get("search") || "").trim();
    const rows = filterTransactions(items, typeFilter, searchQuery);
    const totals = rows.reduce(
      (result, item) => {
        const amount = Number(item.amount) || 0;
        if (item.type === "income") {
          result.income += amount;
        } else {
          result.expense += amount;
        }
        return result;
      },
      { expense: 0, income: 0 }
    );
    totals.net = totals.income - totals.expense;

    return {
      copy,
      exportedAt: new Date(),
      locale,
      rows,
      searchQuery,
      totals,
      typeFilter,
      typeFilterLabel: typeFilter === "all" ? copy.typeAll : getTransactionTypeLabel(typeFilter, locale)
    };
  }

  function formatExportDate(value, locale) {
    return new Intl.DateTimeFormat(getIntlLocale(locale), {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(new Date(value));
  }

  function formatExportDateTime(value, locale) {
    return new Intl.DateTimeFormat(getIntlLocale(locale), {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(value);
  }

  function formatCurrency(value, locale) {
    return new Intl.NumberFormat(getIntlLocale(locale), {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(Number(value) || 0);
  }

  function formatSignedCurrency(value, locale) {
    const amount = Number(value) || 0;
    return `${amount < 0 ? "-" : "+"}${formatCurrency(Math.abs(amount), locale)}`;
  }

  function escapeCsv(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function buildCsvContent(snapshot) {
    const { copy, locale } = snapshot;
    const lines = [
      [copy.recapTitle, ""],
      [copy.exportedAt, formatExportDateTime(snapshot.exportedAt, locale)],
      [`${copy.filters} ${copy.type}`, snapshot.typeFilterLabel],
      [copy.query, snapshot.searchQuery || "-"],
      [copy.totalRows, String(snapshot.rows.length)],
      [copy.totalIncome, formatCurrency(snapshot.totals.income, locale)],
      [copy.totalExpense, formatCurrency(snapshot.totals.expense, locale)],
      [copy.totalNet, formatSignedCurrency(snapshot.totals.net, locale)],
      [],
      [copy.date, copy.description, copy.category, copy.type, copy.amount, copy.notes]
    ];

    snapshot.rows.forEach((item) => {
      lines.push([
        formatExportDate(item.date, locale),
        item.description,
        item.category,
        getTransactionTypeLabel(item.type, locale),
        `${item.type === "income" ? "+" : "-"}${formatCurrency(item.amount, locale)}`,
        item.notes || copy.noNotes
      ]);
    });

    return `\uFEFF${lines.map((row) => row.map(escapeCsv).join(",")).join("\r\n")}`;
  }

  function sanitizePdfText(value) {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7E]/g, "?")
      .replaceAll("\\", "\\\\")
      .replaceAll("(", "\\(")
      .replaceAll(")", "\\)");
  }

  function wrapPdfLine(value, maxLength = 92) {
    const words = String(value || "").split(/\s+/).filter(Boolean);
    if (!words.length) {
      return [""];
    }

    const lines = [];
    let current = "";

    words.forEach((word) => {
      if (!current) {
        current = word;
        return;
      }

      if (`${current} ${word}`.length <= maxLength) {
        current = `${current} ${word}`;
        return;
      }

      lines.push(current);
      current = word;
    });

    if (current) {
      lines.push(current);
    }

    return lines;
  }

  function buildPdfLines(snapshot) {
    const { copy, locale } = snapshot;
    const lines = [
      copy.recapTitle,
      "",
      `${copy.exportedAt}: ${formatExportDateTime(snapshot.exportedAt, locale)}`,
      `${copy.filters} ${copy.type}: ${snapshot.typeFilterLabel}`,
      `${copy.query}: ${snapshot.searchQuery || "-"}`,
      `${copy.totalRows}: ${snapshot.rows.length}`,
      `${copy.totalIncome}: ${formatCurrency(snapshot.totals.income, locale)}`,
      `${copy.totalExpense}: ${formatCurrency(snapshot.totals.expense, locale)}`,
      `${copy.totalNet}: ${formatSignedCurrency(snapshot.totals.net, locale)}`,
      "",
      `${copy.date} | ${copy.description} | ${copy.category} | ${copy.type} | ${copy.amount}`,
      "--------------------------------------------------------------------------------"
    ];

    snapshot.rows.forEach((item) => {
      const base = `${formatExportDate(item.date, locale)} | ${item.description} | ${item.category} | ${getTransactionTypeLabel(item.type, locale)} | ${item.type === "income" ? "+" : "-"}${formatCurrency(item.amount, locale)}`;
      wrapPdfLine(base).forEach((line) => lines.push(line));
      wrapPdfLine(`${copy.notes}: ${item.notes || copy.noNotes}`).forEach((line) => lines.push(line));
      lines.push("");
    });

    if (!snapshot.rows.length) {
      lines.push(locale === "en" ? "No transactions matched the selected filters." : "Tidak ada transaksi yang cocok dengan filter terpilih.");
    }

    return lines;
  }

  function buildPdfBuffer(lines) {
    const pageHeight = 792;
    const marginTop = 760;
    const lineHeight = 14;
    const linesPerPage = 48;
    const chunks = [];

    for (let index = 0; index < lines.length; index += linesPerPage) {
      chunks.push(lines.slice(index, index + linesPerPage));
    }

    if (!chunks.length) {
      chunks.push([""]);
    }

    const objects = [];
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>";

    const pageRefs = [];
    let objectNumber = 4;

    chunks.forEach((chunk) => {
      const pageObjectNumber = objectNumber;
      const contentObjectNumber = objectNumber + 1;
      pageRefs.push(`${pageObjectNumber} 0 R`);

      const contentLines = ["BT", "/F1 10 Tf", `48 ${marginTop} Td`, `${lineHeight} TL`];
      chunk.forEach((line, lineIndex) => {
        if (lineIndex > 0) {
          contentLines.push("T*");
        }
        contentLines.push(`(${sanitizePdfText(line)}) Tj`);
      });
      contentLines.push("ET");
      const stream = contentLines.join("\n");

      objects[pageObjectNumber] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`;
      objects[contentObjectNumber] = `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`;
      objectNumber += 2;
    });

    objects[2] = `<< /Type /Pages /Count ${chunks.length} /Kids [${pageRefs.join(" ")}] >>`;

    let pdf = "%PDF-1.4\n";
    const offsets = [0];

    for (let index = 1; index < objects.length; index += 1) {
      if (!objects[index]) {
        continue;
      }

      offsets[index] = Buffer.byteLength(pdf, "utf8");
      pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
    }

    const xrefOffset = Buffer.byteLength(pdf, "utf8");
    pdf += `xref\n0 ${objects.length}\n`;
    pdf += "0000000000 65535 f \n";

    for (let index = 1; index < objects.length; index += 1) {
      const offset = offsets[index] || 0;
      pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    }

    pdf += `trailer << /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return Buffer.from(pdf, "utf8");
  }

  function buildExportFileName(snapshot, format) {
    const stamp = snapshot.exportedAt.toISOString().slice(0, 10);
    const typeStamp = snapshot.typeFilter === "all" ? "all" : snapshot.typeFilter;
    return `transaction-recap-${typeStamp}-${stamp}.${format}`;
  }

  function sendExportFile(req, res, content, fileName, contentType) {
    res.writeHead(200, {
      ...getSecurityHeaders(req),
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Type": contentType,
      "Content-Length": Buffer.byteLength(content)
    });
    res.end(content);
  }

  async function handleTransactionRoute(req, res, url, session) {
    const pathname = typeof url === "string" ? url : url.pathname;
    if (!session) {
      return false;
    }

    if (req.method === "GET" && pathname === "/api/transactions") {
      sendJson(req, res, 200, { transactions: listTransactionsByUser(session.user.id) });
      return true;
    }

    if (req.method === "GET" && pathname === "/api/transactions/export") {
      const locale = getExportLocale(typeof url === "string" ? "id" : url.searchParams.get("locale"));
      const format = typeof url === "string" ? "csv" : String(url.searchParams.get("format") || "csv").trim().toLowerCase();
      const snapshot = buildExportSnapshot(listTransactionsByUser(session.user.id), typeof url === "string" ? new URLSearchParams() : url.searchParams, locale);

      if (format === "csv") {
        sendExportFile(req, res, buildCsvContent(snapshot), buildExportFileName(snapshot, "csv"), "text/csv; charset=utf-8");
        return true;
      }

      if (format === "pdf") {
        sendExportFile(req, res, buildPdfBuffer(buildPdfLines(snapshot)), buildExportFileName(snapshot, "pdf"), "application/pdf");
        return true;
      }

      sendJson(req, res, 400, { error: locale === "en" ? "Unsupported export format." : "Format export tidak didukung." });
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
