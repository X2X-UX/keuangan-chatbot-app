function createReceiptParser({
  findCanonicalCategory,
  inferTransactionCategory,
  parseFlexibleAmount,
  sanitizeText,
  sanitizeTransaction,
  todayDateValue
}) {
  function normalizeReceiptDate(value) {
    const raw = sanitizeText(value, 24);
    if (!raw) {
      return todayDateValue();
    }

    const directMatch = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
    if (directMatch) {
      return `${directMatch[1]}-${directMatch[2]}-${directMatch[3]}`;
    }

    const localMatch = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    if (localMatch) {
      return `${localMatch[3]}-${localMatch[2]}-${localMatch[1]}`;
    }

    return todayDateValue();
  }

  function sanitizeReceiptSuggestion(payload, preferredType = "") {
    const suggestedType = payload?.type === "income" ? "income" : payload?.type === "expense" ? "expense" : null;
    const type = suggestedType || (preferredType === "income" || preferredType === "expense" ? preferredType : "expense");
    const description =
      sanitizeText(payload?.description || payload?.merchant || payload?.title, 120) ||
      (type === "income" ? "Pemasukan dari struk" : "Transaksi dari struk");
    const amount = parseFlexibleAmount(payload?.amount);
    const rawCategory = sanitizeText(payload?.category, 60);
    const notes = sanitizeText(payload?.notes, 240);
    const inferredCategory = inferTransactionCategory(type, `${description} ${rawCategory} ${notes}`) || null;
    const fallbackCategory = type === "income" ? "Hadiah" : "Belanja";
    const category = rawCategory ? findCanonicalCategory(type, rawCategory) || inferredCategory : inferredCategory;
    const transaction = sanitizeTransaction({
      amount,
      category: category || fallbackCategory,
      date: normalizeReceiptDate(payload?.date),
      description,
      notes,
      type
    });

    const reviewLevel = payload?.reviewLevel === "low" ? "low" : payload?.reviewLevel === "medium" ? "medium" : "high";
    const reviewAlert = sanitizeText(payload?.reviewAlert, 200);
    const reviewFlags = Array.isArray(payload?.reviewFlags)
      ? [...new Set(payload.reviewFlags.map((item) => sanitizeText(item, 40)).filter(Boolean))].slice(0, 6)
      : [];

    return {
      ...transaction,
      reviewAlert,
      reviewFlags,
      reviewLevel
    };
  }

  function normalizeReceiptOcrLines(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => sanitizeText(line, 160))
      .filter(Boolean);
  }

  function escapeReceiptRegex(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function extractReceiptValueByLabels(text, labels = []) {
    const lines = normalizeReceiptOcrLines(text);

    for (const label of labels) {
      const pattern = new RegExp(`^${escapeReceiptRegex(label)}\\s*[:=]?\\s*(.+)$`, "i");
      for (const line of lines) {
        const match = line.match(pattern);
        if (match?.[1]) {
          return sanitizeText(match[1], 160);
        }
      }
    }

    return "";
  }

  function extractReceiptValueAfterStandaloneLabels(text, labels = []) {
    const lines = normalizeReceiptOcrLines(text);

    for (const label of labels) {
      const exactPattern = new RegExp(`^${escapeReceiptRegex(label)}\\s*[:=]?$`, "i");
      for (let index = 0; index < lines.length; index += 1) {
        if (!exactPattern.test(lines[index])) {
          continue;
        }

        const nextValue = sanitizeText(lines[index + 1] || "", 160);
        if (nextValue) {
          return nextValue;
        }
      }
    }

    return "";
  }

  function extractReceiptLineMatching(text, pattern) {
    return normalizeReceiptOcrLines(text).find((line) => pattern.test(line)) || "";
  }

  const FINAL_RECEIPT_AMOUNT_LABEL_SPECS = [
    { label: "Total Amount", score: 16 },
    { label: "Total Belanja", score: 16 },
    { label: "Grand Total", score: 16 },
    { label: "Jumlah", score: 15 },
    { label: "Total", score: 15 },
    { label: "Total Bayar", score: 15 },
    { label: "Rp. Bayar", score: 14 },
    { label: "Rp Bayar", score: 14 },
    { label: "Amount Due", score: 14 },
    { label: "Net Total", score: 14 },
    { label: "Tunai", score: 12 },
    { label: "Paid Amount", score: 12 }
  ];

  const STRICT_RETAIL_FINAL_AMOUNT_LABEL_SPECS = [
    { label: "Total Amount", score: 18 },
    { label: "Total Belanja", score: 18 },
    { label: "Grand Total", score: 18 },
    { label: "Total Bayar", score: 17 },
    { label: "Jumlah", score: 17 },
    { label: "Net Total", score: 17 },
    { label: "Amount Due", score: 17 },
    { label: "Total", score: 16 }
  ];

  const SECONDARY_RECEIPT_AMOUNT_LABEL_SPECS = [
    { label: "Amount", score: 8 },
    { label: "Nominal", score: 8 }
  ];

  const FINAL_RECEIPT_AMOUNT_PATTERN =
    /\b(total amount|total belanja|grand total|jumlah|total bayar|amount due|net total|rp\.?\s*bayar|paid amount|total|tunai)\b/i;

  function extractReceiptAmountCandidatesFromLine(line) {
    const matches =
      String(line || "").match(/(?:rp\.?\s*)?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|(?:rp\.?\s*)?\d{4,}(?:[.,]\d{2})?/gi) || [];

    return matches
      .map((raw) => {
        const amount = parseFlexibleAmount(raw);
        if (!amount || amount <= 0) {
          return null;
        }

        return {
          amount,
          digitsLength: raw.replace(/[^\d]/g, "").length,
          raw
        };
      })
      .filter(Boolean);
  }

  function lineContainsReceiptAmount(line, amount) {
    return extractReceiptAmountCandidatesFromLine(line).some((candidate) => candidate.amount === amount);
  }

  function isReceiptSubtotalLine(line) {
    return /\bsub\s*total\b|\bsubtotal\b/i.test(String(line || ""));
  }

  function isReceiptNonFinalSummaryLine(line) {
    return /\b(total diskon|diskon total|discount total|biaya pengiriman|ongkir|delivery fee|service charge|admin fee|biaya admin|pajak|tax|ppn|saldo|kembali|change)\b/i.test(
      String(line || "")
    );
  }

  function hasReceiptStrongFinalAmountLine(text) {
    const lines = normalizeReceiptOcrLines(text);
    return lines.some((line) => {
      if (isReceiptSubtotalLine(line) || isReceiptNonFinalSummaryLine(line)) {
        return false;
      }

      return /\b(total amount|total belanja|grand total|total bayar|jumlah|net total|amount due|rp\.?\s*bayar|paid amount|^total\b)\b/i.test(
        line
      );
    });
  }

  function isReceiptFinalAmountLine(line) {
    return FINAL_RECEIPT_AMOUNT_PATTERN.test(String(line || ""));
  }

  function looksLikeReceiptItemPriceLine(line) {
    const text = String(line || "").toLowerCase();
    if (!text || isReceiptFinalAmountLine(text)) {
      return false;
    }

    const amountCandidates = extractReceiptAmountCandidatesFromLine(line);
    if (amountCandidates.length >= 2) {
      return true;
    }

    if (/\b\d+\s*[x*]\s*(?:rp\.?\s*)?\d/i.test(text) || /\bqty\b|\bpcs\b|\bitem\b/.test(text)) {
      return true;
    }

    return false;
  }

  function scoreReceiptAmountValue(rawAmount, amount, line = "") {
    const digitsLength = String(rawAmount || "").replace(/[^\d]/g, "").length;
    const normalizedLine = String(line || "").toLowerCase();
    let score = 0;

    if (/\brp\b/i.test(rawAmount)) {
      score += 3;
    }

    if (/\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?/i.test(rawAmount)) {
      score += 3;
    }

    if (/[.,]\d{2}$/.test(rawAmount)) {
      score += 1;
    }

    if (digitsLength >= 12) {
      score -= 14;
    } else if (digitsLength >= 10 && !/[.,]/.test(rawAmount)) {
      score -= 9;
    }

    if (amount >= 1_000 && amount <= 5_000_000_000) {
      score += 2;
    }

    if (amount > 5_000_000_000) {
      score -= 6;
    }

    if (
      /\b(ref|referensi|reference|kode pembayaran|payment code|npwp|pan|terminal|merchant pan|customer pan|id transaksi|id order|rekening|account|akun dana|nomor|no\.?)\b/i.test(
        line
      )
    ) {
      score -= 4;
    }

    if (/\d{2}[./-]\d{2}[./-]\d{2,4}/.test(normalizedLine) || /\d{2}:\d{2}/.test(normalizedLine)) {
      score -= 6;
    }

    if ((normalizedLine.match(/\//g) || []).length >= 2) {
      score -= 8;
    }

    if (/\b[a-z]{2,}\d{2,}|\d{4,}\/[a-z]/i.test(line)) {
      score -= 6;
    }

    return score;
  }

  function scoreReceiptAmountLine(line, lineIndex = 0, totalLines = 1) {
    const text = String(line || "").toLowerCase();
    let score = 0;
    const isBottomHalf = lineIndex >= Math.floor(totalLines / 2);
    const isBottomQuarter = lineIndex >= Math.floor(totalLines * 0.75);

    if (/\b(total|grand total|jumlah|tagihan|total bayar|amount due|net total|rp\.?\s*bayar|paid amount|tunai)\b/.test(text)) {
      score += 8;
    }

    if (/\b(paid|payment|debit|kartu|qris|cash|tunai|bayar)\b/.test(text)) {
      score += 2;
    }

    if (/\b(amount|nominal|topup|top up|transfer berhasil|transaksi berhasil)\b/.test(text)) {
      score += 2;
    }

    if (/^\s*(rp\.?\s*)?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?\s*$/i.test(text)) {
      score += 4;
    }

    if (isReceiptFinalAmountLine(text) && isBottomHalf) {
      score += 4;
    }

    if (isBottomQuarter && extractReceiptAmountCandidatesFromLine(line).length > 0) {
      score += 2;
    }

    if (looksLikeReceiptItemPriceLine(line)) {
      score -= 10;
    }

    if (isReceiptSubtotalLine(line)) {
      score -= 14;
    }

    if (isReceiptNonFinalSummaryLine(line)) {
      score -= 12;
    }

    if (/\b(tax|ppn|pb1|service|diskon|discount|voucher|rounding|admin)\b/.test(text)) {
      score -= 4;
    }

    if (/\b(ref|referensi|reference|kode pembayaran|payment code|npwp|pan|terminal|merchant pan|customer pan|id transaksi|id order|nomor|rekening|account|akun dana)\b/.test(text)) {
      score -= 8;
    }

    return score;
  }

  function extractReceiptAmountByLabels(text, labels = []) {
    const lines = normalizeReceiptOcrLines(text);
    const hasStrongFinalLine = hasReceiptStrongFinalAmountLine(text);
    let bestCandidate = null;

    for (const labelSpec of labels) {
      const label = typeof labelSpec === "string" ? labelSpec : String(labelSpec?.label || "");
      const labelScore = typeof labelSpec === "object" && Number.isFinite(labelSpec.score) ? labelSpec.score : 0;
      if (!label) {
        continue;
      }

      const pattern = new RegExp(`^${escapeReceiptRegex(label)}\\s*[:=]?\\s*(.+)$`, "i");
      const standalonePattern = new RegExp(`^${escapeReceiptRegex(label)}\\s*[:=]?$`, "i");

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (hasStrongFinalLine && (isReceiptSubtotalLine(line) || isReceiptNonFinalSummaryLine(line))) {
          continue;
        }

        const match = line.match(pattern);
        if (match?.[1]) {
          for (const candidate of extractReceiptAmountCandidatesFromLine(match[1])) {
            const scoredCandidate = {
              amount: candidate.amount,
              score:
                labelScore +
                scoreReceiptAmountLine(line, index, lines.length) +
                scoreReceiptAmountValue(candidate.raw, candidate.amount, line),
              line
            };

            if (
              !bestCandidate ||
              scoredCandidate.score > bestCandidate.score ||
              (scoredCandidate.score === bestCandidate.score && scoredCandidate.amount > bestCandidate.amount)
            ) {
              bestCandidate = scoredCandidate;
            }
          }
        }
      }

      for (let index = 0; index < lines.length; index += 1) {
        if (!standalonePattern.test(lines[index])) {
          continue;
        }

        if (hasStrongFinalLine && (isReceiptSubtotalLine(lines[index]) || isReceiptNonFinalSummaryLine(lines[index]))) {
          continue;
        }

        for (const candidate of extractReceiptAmountCandidatesFromLine(lines[index + 1] || "")) {
          const scoredCandidate = {
            amount: candidate.amount,
            score:
              labelScore +
              1 +
              scoreReceiptAmountLine(lines[index], index, lines.length) +
              scoreReceiptAmountValue(candidate.raw, candidate.amount, lines[index + 1] || ""),
            line: lines[index + 1] || ""
          };

          if (
            !bestCandidate ||
            scoredCandidate.score > bestCandidate.score ||
            (scoredCandidate.score === bestCandidate.score && scoredCandidate.amount > bestCandidate.amount)
          ) {
            bestCandidate = scoredCandidate;
          }
        }
      }
    }

    if (bestCandidate) {
      return bestCandidate.amount;
    }

    return null;
  }

  function extractReceiptStoreName(text) {
    const lines = normalizeReceiptOcrLines(text);
    const skipPattern =
      /\b(layanan konsumen|kontak|email|promo|www\.|website|bantuan|customer service|call|sms)\b/i;

    const exactMerchantLine = lines.find(
      (line) =>
        !skipPattern.test(line) &&
        /^(indomaret|indomaret fresh|alfamart|alfamidi|superindo|hypermart|bca|dana|gopay|ovo|tokopedia)\b/i.test(line)
    );
    if (exactMerchantLine) {
      return exactMerchantLine;
    }

    return (
      lines.find(
        (line) =>
          !skipPattern.test(line) &&
          /\b(indomaret|alfamart|alfamidi|superindo|hypermart|minimarket|bca|dana|gopay|ovo|tokopedia)\b/i.test(line)
      ) || ""
    );
  }

  function isBcaAtmReceipt(text) {
    const raw = String(text || "");
    return /\batm bca\b/i.test(raw) || (/\bbca\b/i.test(raw) && /\b(no\.?\s*urut|setoran|saldo)\b/i.test(raw));
  }

  function isRetailOrderReceipt(text) {
    const raw = String(text || "");
    return /\balfamart\b/i.test(raw) && /\bstatus order\b/i.test(raw);
  }

  function isThermalRetailReceipt(text) {
    const raw = String(text || "");
    return /\b(indomaret|indomaret fresh|alfamart|alfamidi)\b/i.test(raw) && /\b(total|tunai|kembali|harga jual)\b/i.test(raw);
  }

  function extractReceiptReference(text) {
    const labeledReference =
      extractReceiptValueByLabels(text, ["No. Referensi", "No Referensi", "Referensi", "Reference", "Ref", "Ref."]) ||
      extractReceiptValueAfterStandaloneLabels(text, ["Reference", "Referensi"]);

    if (labeledReference) {
      return labeledReference;
    }

    const directMatch = extractReceiptLineMatching(text, /^ref\.?\s+(.+)$/i);
    if (directMatch) {
      return sanitizeText(directMatch.replace(/^ref\.?\s+/i, ""), 120);
    }

    const thermalTxnMatch = extractReceiptLineMatching(text, /^\d{2}[./-]\d{2}[./-]\d{2,4}-\d{2}:\d{2}\/.+$/i);
    if (thermalTxnMatch) {
      return sanitizeText(thermalTxnMatch, 120);
    }

    return "";
  }

  function extractReceiptSequence(text) {
    return (
      extractReceiptValueByLabels(text, ["No. Urut", "NO. URUT", "No Urut"]) ||
      sanitizeText((extractReceiptLineMatching(text, /^no\.?\s*urut\s*:\s*.+$/i) || "").replace(/^no\.?\s*urut\s*:\s*/i, ""), 80)
    );
  }

  function extractReceiptBalance(text) {
    return extractReceiptAmountByLabels(text, [{ label: "Saldo", score: 4 }]) || null;
  }

  function extractReceiptBranchName(text) {
    const lines = normalizeReceiptOcrLines(text);
    const skipPattern =
      /\b(pt|gedung|npwp|jl\.|jalan|kec\.|kab|kota|jakarta|slip|pembayaran|merchant|biller|deskripsi|amount|total|tunai|referensi|kode pembayaran|layanan konsumen|call|sms|email|promo|www\.|website|bantuan)\b/i;

    return (
      lines.find((line) => {
        if (line.length < 4 || line.length > 40) {
          return false;
        }

        if (skipPattern.test(line)) {
          return false;
        }

        return /^[A-Z0-9\s.-]+$/.test(line);
      }) || ""
    );
  }

  function buildIsoDate(year, month, day) {
    const yearValue = Number(year);
    const monthValue = Number(month);
    const dayValue = Number(day);

    if (
      !Number.isInteger(yearValue) ||
      !Number.isInteger(monthValue) ||
      !Number.isInteger(dayValue) ||
      monthValue < 1 ||
      monthValue > 12 ||
      dayValue < 1 ||
      dayValue > 31
    ) {
      return "";
    }

    return `${String(yearValue).padStart(4, "0")}-${String(monthValue).padStart(2, "0")}-${String(dayValue).padStart(2, "0")}`;
  }

  function parseReceiptReferenceDate(reference) {
    const raw = String(reference || "");
    const match = raw.match(/\b(\d{2})(\d{2})(\d{2})\b/);
    if (!match) {
      return "";
    }

    const year = Number(`20${match[1]}`);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return buildIsoDate(year, month, day);
  }

  function parseReceiptTglDate(text) {
    const raw = String(text || "");
    const match = raw.match(/\btgl\.?\s*(\d{2})[/-](\d{2})[/-](\d{4})\b/i);
    if (!match) {
      return "";
    }

    return buildIsoDate(match[3], match[2], match[1]);
  }

  function parseShortLocalReceiptDate(text) {
    const raw = String(text || "");
    const match = raw.match(/\b(\d{2})[/-](\d{2})[/-](\d{2})\b/);
    if (!match) {
      return "";
    }

    return buildIsoDate(`20${match[3]}`, match[2], match[1]);
  }

  function parseThermalReceiptHeaderDate(text) {
    const raw = String(text || "");
    const match = raw.match(/\b(\d{2})[./-](\d{2})[./-](\d{2,4})-\d{2}:\d{2}\b/);
    if (!match) {
      return "";
    }

    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return buildIsoDate(year, match[2], match[1]);
  }

  function extractReceiptDateFromText(text) {
    const referenceDate = parseReceiptReferenceDate(extractReceiptReference(text));
    const tglDate = parseReceiptTglDate(text);
    const shortLocalDate = parseShortLocalReceiptDate(text);
    const thermalDate = parseThermalReceiptHeaderDate(text);

    if (isRetailOrderReceipt(text)) {
      return referenceDate || tglDate || todayDateValue();
    }

    if (isThermalRetailReceipt(text)) {
      return thermalDate || referenceDate || tglDate || todayDateValue();
    }

    if (tglDate) {
      return tglDate;
    }

    if (shortLocalDate) {
      return shortLocalDate;
    }

    if (thermalDate) {
      return thermalDate;
    }

    if (referenceDate) {
      return referenceDate;
    }

    const raw = String(text || "");
    const patterns = [/\b(\d{4}[/-]\d{2}[/-]\d{2})\b/, /\b(\d{2}[/-]\d{2}[/-]\d{4})\b/];

    for (const pattern of patterns) {
      const match = raw.match(pattern);
      if (match?.[1]) {
        return normalizeReceiptDate(match[1]);
      }
    }

    return todayDateValue();
  }

  function extractReceiptAmountFromText(text) {
    const isRetailReceipt = isRetailOrderReceipt(text) || isThermalRetailReceipt(text);
    const hasStrongFinalLine = hasReceiptStrongFinalAmountLine(text);
    const labeledAmount =
      (isRetailReceipt ? extractReceiptAmountByLabels(text, STRICT_RETAIL_FINAL_AMOUNT_LABEL_SPECS) : null) ||
      extractReceiptAmountByLabels(text, FINAL_RECEIPT_AMOUNT_LABEL_SPECS) ||
      extractReceiptAmountByLabels(text, SECONDARY_RECEIPT_AMOUNT_LABEL_SPECS);

    if (labeledAmount) {
      return labeledAmount;
    }

    const lines = normalizeReceiptOcrLines(text);
    let bestCandidate = null;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (hasStrongFinalLine && (isReceiptSubtotalLine(line) || isReceiptNonFinalSummaryLine(line))) {
        continue;
      }

      for (const match of extractReceiptAmountCandidatesFromLine(line)) {
        const candidate = {
          amount: match.amount,
          line,
          score: scoreReceiptAmountLine(line, index, lines.length) + scoreReceiptAmountValue(match.raw, match.amount, line)
        };

        if (
          !bestCandidate ||
          candidate.score > bestCandidate.score ||
          (candidate.score === bestCandidate.score && candidate.amount > bestCandidate.amount)
        ) {
          bestCandidate = candidate;
        }
      }
    }

    if (bestCandidate) {
      return bestCandidate.amount;
    }

    const fallbackMatches =
      String(text || "").match(/(?:rp\.?\s*)?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|(?:rp\.?\s*)?\d{4,}(?:[.,]\d{2})?/gi) || [];
    const fallbackAmounts = fallbackMatches
      .map((item) => ({
        amount: parseFlexibleAmount(item),
        raw: item
      }))
      .filter((item) => item.amount && item.amount >= 1000 && item.raw.replace(/[^\d]/g, "").length <= 9)
      .map((item) => item.amount);
    return fallbackAmounts.length ? Math.max(...fallbackAmounts) : null;
  }

  function assessReceiptAmountConfidence(text, amount) {
    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        reviewAlert: "Nominal OCR perlu dicek. Total akhir belum terbaca dengan yakin dari struk.",
        reviewFlags: ["amount"],
        reviewLevel: "low"
      };
    }

    const lines = normalizeReceiptOcrLines(text);
    const strongFinalLines = lines.filter(
      (line) => !isReceiptSubtotalLine(line) && !isReceiptNonFinalSummaryLine(line) && isReceiptFinalAmountLine(line)
    );
    const matchingFinalLines = strongFinalLines.filter((line) => lineContainsReceiptAmount(line, amount));
    const conflictingFinalAmounts = [
      ...new Set(
        strongFinalLines
          .flatMap((line) => extractReceiptAmountCandidatesFromLine(line).map((candidate) => candidate.amount))
          .filter((candidateAmount) => candidateAmount && candidateAmount !== amount)
      )
    ];
    const matchingSubtotalOrSummary = lines.filter(
      (line) => (isReceiptSubtotalLine(line) || isReceiptNonFinalSummaryLine(line)) && lineContainsReceiptAmount(line, amount)
    );

    if (strongFinalLines.length === 0) {
      return {
        reviewAlert: "Nominal OCR perlu dicek. Baris total akhir belum terbaca jelas, jadi sistem masih menebak dari kandidat angka lain.",
        reviewFlags: ["amount"],
        reviewLevel: "low"
      };
    }

    if (matchingFinalLines.length === 0) {
      return {
        reviewAlert: "Nominal OCR perlu dicek. Ada baris total pada struk, tetapi nominal terpilih belum cocok persis dengan total akhir.",
        reviewFlags: ["amount"],
        reviewLevel: "low"
      };
    }

    if (conflictingFinalAmounts.length > 0 || matchingSubtotalOrSummary.length > 0) {
      return {
        reviewAlert: "Nominal terdeteksi dari baris total, tetapi ada angka ringkasan lain yang mirip. Mohon cek total akhir sebelum menyimpan.",
        reviewFlags: ["amount"],
        reviewLevel: "medium"
      };
    }

    return {
      reviewAlert: "",
      reviewFlags: [],
      reviewLevel: "high"
    };
  }

  function inferReceiptTypeFromText(text, preferredType = "") {
    if (preferredType === "income" || preferredType === "expense") {
      return preferredType;
    }

    const raw = String(text || "").toLowerCase();
    if (isBcaAtmReceipt(text)) {
      if (/\bsetoran\b/.test(raw)) {
        return "income";
      }

      if (/\btarik tunai\b/.test(raw) && !/\bsetoran\b/.test(raw)) {
        return "expense";
      }
    }

    if (/\b(transfer masuk|uang masuk|kredit masuk|received|payment received|gaji|salary|bonus|income)\b/.test(raw)) {
      return "income";
    }

    return "expense";
  }

  function extractBcaTransferRecipient(text) {
    const lines = normalizeReceiptOcrLines(text);

    for (let index = 0; index < lines.length; index += 1) {
      if (!/^ke\s+\d+/i.test(lines[index])) {
        continue;
      }

      const nextLine = sanitizeText(lines[index + 1] || "", 120);
      if (nextLine && !/\b(rp|jumlah|berhasil|m-?transfer)\b/i.test(nextLine)) {
        return nextLine;
      }
    }

    if (lines.some((line) => /^dana$/i.test(line))) {
      return "DANA";
    }

    return "";
  }

  function pickReceiptDescriptionFromText(text, preferredType = "") {
    const raw = String(text || "");
    const storeName = extractReceiptStoreName(text);
    const branchName = extractReceiptBranchName(text);
    const isBcaAtm = isBcaAtmReceipt(text);

    if (isBcaAtm && /\bsetoran\b/i.test(raw)) {
      return sanitizeText(`Setoran tunai ATM BCA${branchName ? ` ${branchName}` : ""}`, 120);
    }

    if (isBcaAtm && /\btarik tunai\b/i.test(raw) && !/\bsetoran\b/i.test(raw)) {
      return sanitizeText(`Tarik tunai ATM BCA${branchName ? ` ${branchName}` : ""}`, 120);
    }

    if (isRetailOrderReceipt(text) && /\balfamart\b/i.test(storeName || raw)) {
      return sanitizeText(`Belanja Alfamart${branchName ? ` ${branchName}` : ""}`, 120);
    }

    if (isThermalRetailReceipt(text)) {
      if (/\bindomaret\b/i.test(storeName || raw)) {
        return sanitizeText(`Belanja ${storeName || "Indomaret"}${branchName ? ` ${branchName}` : ""}`, 120);
      }

      if (/\balfamart|alfamidi\b/i.test(storeName || raw)) {
        return sanitizeText(`Belanja ${storeName || "Retail"}${branchName ? ` ${branchName}` : ""}`, 120);
      }
    }

    if (/\bpembayaran qris berhasil\b/i.test(raw)) {
      const qrisMerchant =
        extractReceiptValueByLabels(text, ["Pembayaran ke"]) || extractReceiptValueAfterStandaloneLabels(text, ["Pembayaran ke"]);
      if (qrisMerchant) {
        return `Pembayaran QRIS ke ${qrisMerchant}`;
      }

      return "Pembayaran QRIS";
    }

    const danaTransferMatch = raw.match(/kirim uang(?:\s+rp[\d.,]+)?\s+ke\s+(.+?)(?=\s*-\s*\d|\s*$)/i);
    if (danaTransferMatch?.[1]) {
      return sanitizeText(`Kirim Uang ke ${danaTransferMatch[1]}`, 120);
    }

    if (/\bm-?transfer\b/i.test(raw)) {
      const recipient = extractBcaTransferRecipient(text);
      if (recipient) {
        return `Transfer ke ${recipient}`;
      }

      return "Transfer BCA";
    }

    const explicitDescription = extractReceiptValueByLabels(text, ["Deskripsi", "Description", "Keterangan", "Desc"]);
    if (explicitDescription) {
      return explicitDescription;
    }

    const merchantBiller = extractReceiptValueByLabels(text, ["Merchant/Biller", "Merchant", "Biller"]);
    if (merchantBiller) {
      if (/\b(top\s*up|topup|isi saldo)\b/i.test(text)) {
        return `Topup ${merchantBiller}`;
      }

      return merchantBiller;
    }

    const lines = normalizeReceiptOcrLines(text);
    const skipPattern =
      /\b(struk|receipt|invoice|nota|tanggal|date|jam|time|kasir|cashier|total|subtotal|tax|ppn|service|discount|diskon|payment|metode|change|kembalian|qris|debit|credit|merchant|biller|referensi|kode pembayaran|pelanggan)\b/i;

    for (const line of lines) {
      if (!/[a-z]/i.test(line)) {
        continue;
      }

      if (skipPattern.test(line)) {
        continue;
      }

      if (line.length < 3) {
        continue;
      }

      return line;
    }

    return preferredType === "income" ? "Pemasukan dari OCR" : "Belanja dari OCR";
  }

  function pickReceiptNotesFromText(text) {
    const merchantBiller = extractReceiptValueByLabels(text, ["Merchant/Biller", "Merchant", "Biller"]);
    const customerName = extractReceiptValueByLabels(text, ["Nama Pelanggan", "Pelanggan", "Customer"]);
    const reference = extractReceiptReference(text);
    const paymentCode = extractReceiptValueByLabels(text, ["Kode Pembayaran", "Payment Code"]);
    const danaAccount =
      extractReceiptValueByLabels(text, ["Akun DANA"]) || extractReceiptValueAfterStandaloneLabels(text, ["Akun DANA"]);
    const transactionId =
      extractReceiptValueByLabels(text, ["ID Transaksi"]) || extractReceiptValueAfterStandaloneLabels(text, ["ID Transaksi"]);
    const qrisMerchant =
      extractReceiptValueByLabels(text, ["Pembayaran ke"]) || extractReceiptValueAfterStandaloneLabels(text, ["Pembayaran ke"]);
    const qrisAcquirer =
      extractReceiptValueByLabels(text, ["Pengakuisisi"]) || extractReceiptValueAfterStandaloneLabels(text, ["Pengakuisisi"]);
    const orderStatus =
      extractReceiptValueByLabels(text, ["Status Order", "Status"]) ||
      extractReceiptValueAfterStandaloneLabels(text, ["Status Order", "Status"]);
    const thermalTxnCode = extractReceiptLineMatching(text, /^\d{2}[./-]\d{2}[./-]\d{2,4}-\d{2}:\d{2}\/.+$/i);
    const atmSequence = extractReceiptSequence(text);
    const atmBalance = extractReceiptBalance(text);
    const transferDestination = extractReceiptLineMatching(text, /^ke\s+\d+/i);
    const danaDnid = extractReceiptLineMatching(text, /^dnid\b/i);
    const storeName = extractReceiptStoreName(text);
    const branchName = extractReceiptBranchName(text);
    const parts = [storeName, branchName];

    if (merchantBiller) {
      parts.push(`Merchant ${merchantBiller}`);
    }

    if (customerName) {
      parts.push(`Pelanggan ${customerName}`);
    }

    if (reference) {
      parts.push(`Ref ${reference}`);
    }

    if (orderStatus) {
      parts.push(`Status ${orderStatus}`);
    }

    if (thermalTxnCode) {
      parts.push(`Trx ${thermalTxnCode}`);
    }

    if (atmSequence) {
      parts.push(`No. Urut ${atmSequence}`);
    }

    if (atmBalance) {
      parts.push(`Saldo ${atmBalance}`);
    }

    if (paymentCode) {
      parts.push(`Kode ${paymentCode}`);
    }

    if (transferDestination) {
      parts.push(transferDestination);
    }

    if (danaDnid) {
      parts.push(danaDnid);
    }

    if (danaAccount) {
      parts.push(`Akun ${danaAccount}`);
    }

    if (transactionId) {
      parts.push(`Trx ${transactionId}`);
    }

    if (qrisMerchant) {
      parts.push(`Merchant ${qrisMerchant}`);
    }

    if (qrisAcquirer) {
      parts.push(`Akuisisi ${qrisAcquirer}`);
    }

    const note = sanitizeText(
      [...new Set(parts.filter(Boolean))]
        .join(" - ")
        .replace(/\s+-\s+-/g, " - "),
      240
    );

    if (note) {
      return note;
    }

    const lines = normalizeReceiptOcrLines(text);
    const noteLine = lines.find((line) => /\b(inv|invoice|ref|trx|transaction|order|kasir|payment|metode)\b/i.test(line));
    return noteLine || "Hasil OCR.space";
  }

  function buildReceiptSuggestionFromOcrText(text, preferredType = "") {
    const type = inferReceiptTypeFromText(text, preferredType);
    const merchant = extractReceiptValueByLabels(text, ["Merchant/Biller", "Merchant", "Biller"]);
    const description = pickReceiptDescriptionFromText(text, type);
    const amount = extractReceiptAmountFromText(text);
    const date = extractReceiptDateFromText(text);
    const notes = pickReceiptNotesFromText(text);
    const category =
      inferTransactionCategory(type, `${description} ${merchant} ${notes}`) || (type === "income" ? "Hadiah" : "Belanja");
    const amountReview = assessReceiptAmountConfidence(text, amount);

    return sanitizeReceiptSuggestion(
      {
        amount,
        category,
        date,
        description,
        merchant,
        notes,
        reviewAlert: amountReview.reviewAlert,
        reviewFlags: amountReview.reviewFlags,
        reviewLevel: amountReview.reviewLevel,
        type
      },
      preferredType
    );
  }

  return {
    buildReceiptSuggestionFromOcrText,
    normalizeReceiptDate,
    sanitizeReceiptSuggestion
  };
}

module.exports = {
  createReceiptParser
};
