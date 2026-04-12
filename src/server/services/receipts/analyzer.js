function createReceiptAnalyzer({
  buildReceiptSuggestionFromOcrText,
  extractJsonObject,
  extractOpenAIText,
  formatCurrency,
  openAiBaseUrl,
  openAiModel,
  ocrSpaceApiKey,
  ocrSpaceApiUrl,
  sanitizeReceiptSuggestion,
  sanitizeText
}) {
  function normalizeOcrSpaceMessage(value) {
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeText(item, 200)).filter(Boolean).join(" ");
    }

    return sanitizeText(value, 200);
  }

  function humanizeOpenAIErrorMessage(message) {
    const raw = String(message || "");
    if (/quota|billing/i.test(raw)) {
      return "Kuota OpenAI sedang habis. Isi billing OpenAI atau gunakan OCR.space sebagai alternatif.";
    }

    return raw || "Gagal menghubungi layanan AI untuk membaca struk.";
  }

  async function analyzeReceiptWithOCRSpace(receiptUpload, preferredType = "") {
    if (!ocrSpaceApiKey) {
      throw new Error("OCR.space belum aktif. Isi OCR_SPACE_API_KEY terlebih dahulu.");
    }

    if (receiptUpload.buffer.length > 1024 * 1024) {
      throw new Error("Ukuran gambar untuk OCR.space free maksimal 1 MB. Kompres struk lalu coba lagi.");
    }

    const base64Image = `data:${receiptUpload.mimeType};base64,${receiptUpload.buffer.toString("base64")}`;
    const formData = new FormData();
    formData.append("base64Image", base64Image);
    formData.append("language", "eng");
    formData.append("isOverlayRequired", "false");
    formData.append("detectOrientation", "true");
    formData.append("scale", "true");

    const response = await fetch(ocrSpaceApiUrl, {
      method: "POST",
      headers: {
        apikey: ocrSpaceApiKey
      },
      body: formData,
      signal: AbortSignal.timeout(25_000)
    });

    const payload = await response.json();
    const topLevelError = normalizeOcrSpaceMessage(payload?.ErrorMessage) || normalizeOcrSpaceMessage(payload?.ErrorDetails);
    if (!response.ok) {
      throw new Error(topLevelError || "Gagal menghubungi OCR.space.");
    }

    if (payload?.IsErroredOnProcessing) {
      throw new Error(topLevelError || "OCR.space belum bisa membaca struk ini.");
    }

    const parsedResults = Array.isArray(payload?.ParsedResults) ? payload.ParsedResults : [];
    const parsedText = parsedResults
      .filter((entry) => Number(entry?.FileParseExitCode) === 1 && entry?.ParsedText)
      .map((entry) => String(entry.ParsedText || "").trim())
      .filter(Boolean)
      .join("\n");

    if (!parsedText) {
      const firstEntry = parsedResults[0] || {};
      const entryError =
        normalizeOcrSpaceMessage(firstEntry?.ErrorMessage) || normalizeOcrSpaceMessage(firstEntry?.ErrorDetails);
      throw new Error(entryError || "Teks pada struk belum berhasil dibaca OCR.space.");
    }

    return buildReceiptSuggestionFromOcrText(parsedText, preferredType);
  }

  async function analyzeReceiptWithOpenAI(receiptUpload, preferredType = "") {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Fitur baca struk AI belum aktif. Isi OPENAI_API_KEY terlebih dahulu.");
    }

    const imageDataUrl = `data:${receiptUpload.mimeType};base64,${receiptUpload.buffer.toString("base64")}`;
    const preferredTypeNote =
      preferredType === "income" || preferredType === "expense"
        ? `Jika memungkinkan, selaraskan tipe transaksi dengan pilihan pengguna saat ini: ${preferredType}.`
        : "Tentukan tipe transaksi paling masuk akal dari gambar.";

    const response = await fetch(`${openAiBaseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: openAiModel,
        instructions: [
          "Anda membaca struk atau bukti transfer untuk aplikasi pencatatan keuangan pribadi berbahasa Indonesia.",
          "Balas JSON saja tanpa markdown.",
          'Gunakan schema: {"type":"income|expense","description":"string","amount":"number or string","date":"YYYY-MM-DD","category":"string","notes":"string"}.',
          "Amount harus nominal utama transaksi dalam Rupiah tanpa simbol mata uang jika memungkinkan.",
          "Description harus ringkas dan mudah dipahami pengguna.",
          "Category harus salah satu kategori yang wajar untuk aplikasi keuangan pribadi Indonesia.",
          preferredTypeNote
        ].join(" "),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "Baca gambar struk ini dan ekstrak data transaksi. Jika ada pajak atau biaya tambahan, pakai total akhir yang harus dibayar atau diterima."
              },
              {
                type: "input_image",
                image_url: imageDataUrl
              }
            ]
          }
        ],
        max_output_tokens: 300,
        text: {
          format: {
            type: "text"
          }
        }
      }),
      signal: AbortSignal.timeout(25_000)
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(humanizeOpenAIErrorMessage(payload?.error?.message));
    }

    const rawText = extractOpenAIText(payload);
    if (!rawText) {
      throw new Error("Respons AI untuk struk kosong.");
    }

    let structured;
    try {
      structured = JSON.parse(extractJsonObject(rawText));
    } catch {
      throw new Error("Respons AI untuk struk belum bisa dipahami sebagai JSON.");
    }

    return sanitizeReceiptSuggestion(structured, preferredType);
  }

  async function analyzeReceipt(receiptUpload, preferredType = "") {
    if (ocrSpaceApiKey) {
      return analyzeReceiptWithOCRSpace(receiptUpload, preferredType);
    }

    if (process.env.OPENAI_API_KEY) {
      return analyzeReceiptWithOpenAI(receiptUpload, preferredType);
    }

    throw new Error("Fitur baca struk belum aktif. Isi OCR_SPACE_API_KEY atau OPENAI_API_KEY terlebih dahulu.");
  }

  function formatReceiptSuggestionForTelegram(suggestion) {
    const lines = [
      "Hasil baca struk:",
      `- Tipe: ${suggestion.type === "income" ? "Pemasukan" : "Pengeluaran"}`,
      `- Deskripsi: ${suggestion.description || "-"}`,
      `- Nominal: ${formatCurrency(suggestion.amount)}${suggestion.reviewLevel && suggestion.reviewLevel !== "high" ? " (Perlu Dicek)" : ""}`,
      `- Tanggal: ${suggestion.date || "-"}`,
      `- Kategori: ${suggestion.category || "-"}`,
      `- Catatan: ${suggestion.notes || "-"}`
    ];

    if (suggestion.reviewAlert) {
      lines.push(`- Catatan OCR: ${suggestion.reviewAlert}`);
    }

    return lines.join("\n");
  }

  return {
    analyzeReceipt,
    formatReceiptSuggestionForTelegram
  };
}

module.exports = {
  createReceiptAnalyzer
};
