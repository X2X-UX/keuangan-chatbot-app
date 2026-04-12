function parseCsvText(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;
  const delimiter = detectCsvDelimiter(text);

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current);
      if (row.some((cell) => String(cell || "").trim())) {
        rows.push(row);
      }
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  row.push(current);
  if (row.some((cell) => String(cell || "").trim())) {
    rows.push(row);
  }

  return rows;
}

function buildImportRecords(parsedRows) {
  if (!Array.isArray(parsedRows) || parsedRows.length < 2) {
    return null;
  }

  const headers = parsedRows[0].map((header, index) => normalizeImportHeader(header, index));
  const rows = parsedRows
    .slice(1)
    .map((values, index) => ({
      index,
      values: headers.map((_, headerIndex) => String(values[headerIndex] || "").trim())
    }))
    .filter((entry) => entry.values.some((value) => value));

  if (!rows.length) {
    return null;
  }

  return { headers, rows };
}

function guessImportColumnIndex(headers, field) {
  const keywords = IMPORT_FIELD_KEYWORDS[field] || [];
  return headers.findIndex((header) => {
    const normalized = normalizeImportHeaderToken(header);
    return keywords.some((keyword) => normalized.includes(keyword));
  });
}

function findImportColumnIndexByAliases(headers, aliases) {
  if (!Array.isArray(aliases) || aliases.length === 0) {
    return -1;
  }

  return headers.findIndex((header) => {
    const normalized = normalizeImportHeaderToken(header);
    return aliases.some((alias) => normalized.includes(normalizeImportHeaderToken(alias)));
  });
}

function buildImportPresetMappings(headers, presetId) {
  const preset = IMPORT_PRESETS[presetId] || IMPORT_PRESETS.generic;
  const mappings = {};

  for (const field of IMPORT_COLUMN_FIELDS) {
    const aliases = preset.fieldAliases?.[field] || [];
    const presetMatch = findImportColumnIndexByAliases(headers, aliases);
    const genericMatch = guessImportColumnIndex(headers, field);
    mappings[field] = presetMatch >= 0 ? presetMatch : genericMatch >= 0 ? genericMatch : null;
  }

  return mappings;
}

function scoreImportPreset(headers, fileName, presetId) {
  const preset = IMPORT_PRESETS[presetId];
  if (!preset || presetId === "generic") {
    return 0;
  }

  let score = 0;
  const loweredFileName = String(fileName || "").toLowerCase();

  for (const hint of preset.fileHints || []) {
    if (loweredFileName.includes(String(hint).toLowerCase())) {
      score += 3;
    }
  }

  for (const aliases of Object.values(preset.fieldAliases || {})) {
    if (findImportColumnIndexByAliases(headers, aliases) >= 0) {
      score += 2;
    }
  }

  return score;
}

function detectImportPreset(headers, fileName) {
  let bestPresetId = "generic";
  let bestScore = 0;

  for (const presetId of Object.keys(IMPORT_PRESETS)) {
    if (presetId === "generic") {
      continue;
    }

    const score = scoreImportPreset(headers, fileName, presetId);
    if (score > bestScore) {
      bestScore = score;
      bestPresetId = presetId;
    }
  }

  return {
    confidence: bestScore,
    presetId: bestPresetId
  };
}

function renderImportColumnOptions(headers, preferredPresetId = "generic") {
  for (const element of Object.values(IMPORT_MAPPING_ELEMENTS)) {
    if (!element) {
      continue;
    }

    element.innerHTML = [
      '<option value="">Tidak dipakai</option>',
      ...headers.map((header, index) => `<option value="${index}">${escapeHTML(header)}</option>`)
    ].join("");

  }

  applyImportPreset(preferredPresetId);
}

function renderImportPresetOptions(selectedValue = "auto") {
  if (!elements.importPresetSelect) {
    return;
  }

  elements.importPresetSelect.innerHTML = [
    '<option value="auto">Otomatis</option>',
    ...Object.entries(IMPORT_PRESETS).map(
      ([presetId, preset]) => `<option value="${presetId}">${escapeHTML(preset.label)}</option>`
    )
  ].join("");
  elements.importPresetSelect.value = selectedValue;
  elements.importPresetSelect.disabled = false;
}

function applyImportPreset(requestedPresetId) {
  if (!state.csvImport) {
    return;
  }

  const presetId =
    requestedPresetId === "auto"
      ? state.csvImport.detectedPresetId || "generic"
      : IMPORT_PRESETS[requestedPresetId]
        ? requestedPresetId
        : "generic";
  const mappings = buildImportPresetMappings(state.csvImport.headers, presetId);

  for (const [field, element] of Object.entries(IMPORT_MAPPING_ELEMENTS)) {
    if (!element) {
      continue;
    }

    const columnIndex = mappings[field];
    element.value = columnIndex === null || columnIndex === undefined ? "" : String(columnIndex);
  }

  state.csvImport.activePresetId = presetId;
}

function getImportMappings() {
  return Object.fromEntries(
    Object.entries(IMPORT_MAPPING_ELEMENTS).map(([field, element]) => {
      const value = element ? element.value : "";
      return [field, value === "" ? null : Number(value)];
    })
  );
}

function getImportCellValue(record, columnIndex) {
  if (!record || columnIndex === null || columnIndex === undefined || columnIndex < 0) {
    return "";
  }

  return String(record.values[columnIndex] || "").trim();
}

function parseImportTypeToken(value) {
  const normalized = normalizeImportHeaderToken(value);
  if (!normalized) {
    return null;
  }

  if (/\b(?:income|pemasukan|kredit|credit|cr|masuk)\b/.test(normalized)) {
    return "income";
  }

  if (/\b(?:expense|pengeluaran|debit|db|keluar)\b/.test(normalized)) {
    return "expense";
  }

  return null;
}

function parseImportMoneyValue(value) {
  const raw = String(value || "")
    .replace(/[^\d,.\-+()]/g, "")
    .trim();

  if (!raw) {
    return null;
  }

  const unsigned = raw.replace(/[()+-]/g, "");
  const lastComma = unsigned.lastIndexOf(",");
  const lastDot = unsigned.lastIndexOf(".");
  const decimalIndex = Math.max(lastComma, lastDot);

  if (decimalIndex === -1) {
    const digits = unsigned.replace(/[^\d]/g, "");
    return digits ? Number.parseInt(digits, 10) : null;
  }

  const integerPart = unsigned.slice(0, decimalIndex).replace(/[^\d]/g, "");
  const decimalPart = unsigned.slice(decimalIndex + 1).replace(/[^\d]/g, "");

  if (!integerPart && !decimalPart) {
    return null;
  }

  if (decimalPart.length > 2) {
    return Number.parseInt(`${integerPart}${decimalPart}`, 10);
  }

  const normalized = Number(`${integerPart || "0"}.${decimalPart || "0"}`);
  return Number.isFinite(normalized) ? Math.round(normalized) : null;
}

function parseSignedImportAmount(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return { amount: null, sign: 0 };
  }

  const amount = parseImportMoneyValue(raw);
  if (!amount) {
    return { amount: null, sign: 0 };
  }

  if (/\(.*\)/.test(raw) || /-\s*\d/.test(raw)) {
    return { amount, sign: -1 };
  }

  if (/^\+/.test(raw)) {
    return { amount, sign: 1 };
  }

  return { amount, sign: 0 };
}

function formatDateParts(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseImportDate(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const normalized = raw.replace(/\./g, "/").replace(/-/g, "/");
  let match = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (match) {
    return formatDateParts(match[1], match[2], match[3]);
  }

  match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    return formatDateParts(year, month, day);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const offsetMs = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 10);
}

function inferImportCategory(type, rawCategory, description) {
  const preferred = rawCategory ? findCanonicalTransactionCategory(type, rawCategory) : null;
  if (preferred) {
    return preferred;
  }

  const inferred = findCanonicalTransactionCategory(type, description) || null;
  if (inferred) {
    return inferred;
  }

  return type === "expense" ? "Belanja" : "Hadiah";
}

function buildImportPreviewData() {
  if (!state.csvImport) {
    return null;
  }

  const mappings = getImportMappings();
  const previewRows = state.csvImport.rows.map((record) => {
    const rawDate = getImportCellValue(record, mappings.date);
    const rawDescription = getImportCellValue(record, mappings.description);
    const rawAmount = getImportCellValue(record, mappings.amount);
    const rawDebit = getImportCellValue(record, mappings.debit);
    const rawCredit = getImportCellValue(record, mappings.credit);
    const rawType = getImportCellValue(record, mappings.type);
    const rawCategory = getImportCellValue(record, mappings.category);
    const rawNotes = getImportCellValue(record, mappings.notes);

    const debit = parseSignedImportAmount(rawDebit);
    const credit = parseSignedImportAmount(rawCredit);
    const amount = parseSignedImportAmount(rawAmount);

    let type = parseImportTypeToken(rawType);
    let normalizedAmount = null;

    if (!type && debit.amount) {
      type = "expense";
      normalizedAmount = debit.amount;
    }

    if (!type && credit.amount) {
      type = "income";
      normalizedAmount = credit.amount;
    }

    if (!type && amount.sign === -1) {
      type = "expense";
      normalizedAmount = amount.amount;
    }

    if (!type && amount.sign === 1) {
      type = "income";
      normalizedAmount = amount.amount;
    }

    if (type && !normalizedAmount) {
      normalizedAmount = type === "expense" ? debit.amount || amount.amount : credit.amount || amount.amount;
    }

    const normalizedDate = parseImportDate(rawDate);
    const description = rawDescription || "Transaksi mutasi";
    const category = type ? inferImportCategory(type, rawCategory, `${description} ${rawNotes}`) : "";
    const notes = [rawNotes, `Import CSV: ${state.csvImport.fileName}`].filter(Boolean).join(" | ");

    if (!normalizedDate) {
      return { error: "Tanggal belum terbaca. Pilih kolom tanggal yang benar atau rapikan format tanggal di CSV.", ok: false, rowNumber: record.index + 2 };
    }

    if (!description.trim()) {
      return { error: "Deskripsi transaksi belum terbaca.", ok: false, rowNumber: record.index + 2 };
    }

    if (!type) {
      return {
        error: "Tipe transaksi belum bisa ditebak. Gunakan kolom debit/kredit, kolom tipe, atau nominal bertanda plus/minus.",
        ok: false,
        rowNumber: record.index + 2
      };
    }

    if (!normalizedAmount) {
      return { error: "Nominal belum bisa dibaca dari kolom yang dipilih.", ok: false, rowNumber: record.index + 2 };
    }

    return {
      ok: true,
      rowNumber: record.index + 2,
      transaction: {
        amount: String(normalizedAmount),
        category,
        date: normalizedDate,
        description,
        notes,
        type
      }
    };
  });

  const validRows = previewRows.filter((entry) => entry.ok).map((entry) => entry.transaction);
  const invalidCount = previewRows.length - validRows.length;

  return {
    invalidCount,
    previewRows: previewRows.slice(0, 12),
    totalRows: previewRows.length,
    validRows
  };
}

function renderImportPreview() {
  const preview = buildImportPreviewData();
  if (!preview) {
    return;
  }

  state.csvImport.preview = preview;
  elements.importPreviewSection.classList.remove("is-hidden");
  elements.importPreviewList.innerHTML = "";

  elements.importPreviewSummary.textContent = `${preview.validRows.length} valid, ${preview.invalidCount} perlu perhatian, dari ${preview.totalRows} baris.`;

  preview.previewRows.forEach((entry) => {
    const item = document.createElement("article");
    item.className = `import-preview-item ${entry.ok ? "valid" : "invalid"}`;

    if (entry.ok) {
      item.innerHTML = `
        <div class="import-preview-row">
          <div class="import-preview-title">
            <strong>${escapeHTML(entry.transaction.description)}</strong>
            <span>Baris CSV ${entry.rowNumber} • ${escapeHTML(formatDate(entry.transaction.date))}</span>
          </div>
          <span class="import-status valid">Siap impor</span>
        </div>
        <div class="import-preview-meta">
          <span class="import-chip">${entry.transaction.type === "income" ? "Pemasukan" : "Pengeluaran"}</span>
          <span class="import-chip">${escapeHTML(entry.transaction.category)}</span>
          <span class="import-chip">${escapeHTML(formatCurrency(entry.transaction.amount))}</span>
        </div>
      `;
    } else {
      item.innerHTML = `
        <div class="import-preview-row">
          <div class="import-preview-title">
            <strong>Baris CSV ${entry.rowNumber}</strong>
            <span>Baris ini belum bisa diimpor.</span>
          </div>
          <span class="import-status invalid">Perlu cek</span>
        </div>
        <div class="import-preview-error">${escapeHTML(entry.error)}</div>
      `;
    }

    elements.importPreviewList.appendChild(item);
  });

  if (preview.totalRows > preview.previewRows.length) {
    const tail = document.createElement("div");
    tail.className = "empty-state";
    tail.textContent = `Preview menampilkan ${preview.previewRows.length} baris pertama dari ${preview.totalRows} baris CSV.`;
    elements.importPreviewList.appendChild(tail);
  }

  elements.importSubmitButton.disabled = preview.validRows.length === 0;
}

async function handleImportFileChange(event) {
  const file = event.target.files?.[0];
  resetImportState({ preserveMessage: true });

  if (!file) {
    setImportMessage("");
    return;
  }

  try {
    const text = await file.text();
    const records = buildImportRecords(parseCsvText(text.replace(/^\uFEFF/, "")));

    if (!records) {
      throw new Error("File CSV belum berisi header dan baris transaksi yang bisa diproses.");
    }

    state.csvImport = {
      activePresetId: "generic",
      detectedPresetId: "generic",
      fileName: file.name,
      headers: records.headers,
      preview: null,
      rows: records.rows
    };

    const detectedPreset = detectImportPreset(records.headers, file.name);
    state.csvImport.detectedPresetId = detectedPreset.presetId;
    state.csvImport.activePresetId = detectedPreset.presetId;

    renderImportPresetOptions(detectedPreset.confidence > 0 ? "auto" : "generic");
    renderImportColumnOptions(records.headers, detectedPreset.presetId);
    elements.importMappingSection.classList.remove("is-hidden");
    elements.importPreviewButton.disabled = false;
    elements.importFileName.textContent = file.name;
    const presetLabel = IMPORT_PRESETS[detectedPreset.presetId]?.label || "Generic CSV";
    elements.importMetaText.textContent =
      detectedPreset.confidence > 0
        ? `${records.rows.length} baris transaksi terdeteksi. Preset ${presetLabel} dipilih otomatis, silakan cek lalu preview.`
        : `${records.rows.length} baris transaksi terdeteksi. Tidak ada preset spesifik yang cocok, gunakan Generic CSV lalu cek mapping.`;
    setImportMessage("File CSV berhasil dibaca. Lanjutkan ke preview untuk mengecek hasil normalisasi.", "success");
  } catch (error) {
    resetImportState();
    if (elements.importFileInput) {
      elements.importFileInput.value = "";
    }
    setImportMessage(error.message, "error");
  }
}

function handleImportPreview() {
  if (!state.csvImport) {
    setImportMessage("Unggah file CSV terlebih dahulu sebelum melihat preview.", "error");
    return;
  }

  renderImportPreview();
  setImportMessage("Preview import berhasil diperbarui.", "success");
}

function handleImportMappingChange() {
  if (!state.csvImport) {
    return;
  }

  state.csvImport.preview = null;
  if (elements.importPresetSelect && elements.importPresetSelect.value !== "auto") {
    state.csvImport.activePresetId = elements.importPresetSelect.value;
  }
  elements.importSubmitButton.disabled = true;
  if (!elements.importPreviewSection.classList.contains("is-hidden")) {
    setImportMessage("Mapping kolom berubah. Jalankan preview lagi sebelum import.", "");
  }
}

function handleImportPresetChange() {
  if (!state.csvImport) {
    return;
  }

  applyImportPreset(elements.importPresetSelect.value);
  state.csvImport.preview = null;
  elements.importSubmitButton.disabled = true;
  const activePresetId =
    elements.importPresetSelect.value === "auto"
      ? state.csvImport.detectedPresetId || "generic"
      : elements.importPresetSelect.value;
  const presetLabel = IMPORT_PRESETS[activePresetId]?.label || "Generic CSV";
  setImportMessage(`Preset ${presetLabel} diterapkan. Jalankan preview untuk memeriksa hasilnya.`, "success");
}

