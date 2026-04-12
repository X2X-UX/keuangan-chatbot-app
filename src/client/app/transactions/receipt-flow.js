function renderTransactionAmountHint() {
  const rawValue = elements.transactionAmount.value.trim();
  if (!rawValue) {
    elements.transactionAmountHint.textContent =
      "Bisa isi nominal fleksibel seperti Rp15.000, 15rb, atau 1,5jt.";
    elements.transactionAmountHint.classList.remove("is-error");
    return;
  }

  const amount = parseFlexibleAmount(rawValue);
  if (!amount) {
    elements.transactionAmountHint.textContent =
      "Nominal belum terbaca. Coba format seperti 15000, 15.000, 15rb, atau 1,5jt.";
    elements.transactionAmountHint.classList.add("is-error");
    return;
  }

  elements.transactionAmountHint.textContent = `Akan disimpan sebagai ${formatFlexibleCurrency(amount)}.`;
  elements.transactionAmountHint.classList.remove("is-error");
}

function handleTransactionAmountFocus() {
  const amount = parseFlexibleAmount(elements.transactionAmount.value);
  if (!amount) {
    renderTransactionAmountHint();
    return;
  }

  elements.transactionAmount.value = String(amount);
  renderTransactionAmountHint();
}

function handleTransactionAmountBlur() {
  const amount = parseFlexibleAmount(elements.transactionAmount.value);
  if (!amount) {
    renderTransactionAmountHint();
    return;
  }

  elements.transactionAmount.value = formatFlexibleCurrency(amount);
  renderTransactionAmountHint();
}

function setTransactionFormMode(editing) {
  const isEditing = Boolean(editing);
  state.editingTransactionId = isEditing ? state.editingTransactionId : null;
  elements.transactionFormTitle.textContent = isEditing ? "Edit transaksi" : "Input transaksi baru";
  elements.transactionSubmitButton.textContent = isEditing ? "Simpan perubahan" : "Simpan transaksi";
  elements.transactionCancelButton.classList.toggle("is-hidden", !isEditing);
}

function getActiveTransactionReceiptPreview() {
  const receiptState = state.transactionReceipt || createTransactionReceiptState();

  if (receiptState.upload?.dataUrl) {
    return {
      label: receiptState.upload.fileName || "Struk baru",
      url: receiptState.upload.dataUrl
    };
  }

  if (receiptState.hasExisting && !receiptState.removeRequested && receiptState.existingUrl) {
    return {
      label: "Struk tersimpan",
      url: receiptState.existingUrl
    };
  }

  return null;
}

function renderTransactionReviewBanner() {
  const preview = getActiveTransactionReceiptPreview();
  const receiptState = state.transactionReceipt || createTransactionReceiptState();
  const hintFromAI = receiptState.analysisMessage || "";

  if (preview) {
    elements.transactionReviewStatus.textContent = preview.label;
    elements.transactionReviewHint.textContent =
      hintFromAI ||
      (receiptState.upload
        ? "Hasil scan siap diperiksa. Edit detail transaksi sebelum disimpan."
        : "Struk tersimpan dan bisa dibuka kembali kapan saja.");
    elements.transactionReviewManageButton.textContent = "Kelola struk";
    elements.transactionReviewReceiptLink.href = preview.url;
    elements.transactionReviewReceiptLink.classList.remove("is-hidden");
    elements.transactionReviewReceiptImage.src = preview.url;
    elements.transactionReviewReceiptImage.alt = `Preview ${preview.label}`;
    return;
  }

  elements.transactionReviewStatus.textContent = "Input manual aktif";
  elements.transactionReviewHint.textContent = "Isi detail inti dulu. Anda tetap bisa menambahkan struk kapan saja.";
  elements.transactionReviewManageButton.textContent = "Scan struk";
  elements.transactionReviewReceiptLink.classList.add("is-hidden");
  elements.transactionReviewReceiptLink.removeAttribute("href");
  elements.transactionReviewReceiptImage.removeAttribute("src");
}

function renderTransactionOCRState() {
  const isAnalyzing = state.transactionReceiptAnalyzing === true;
  const hasPreview = Boolean(getActiveTransactionReceiptPreview());

  elements.transactionOCRProcessing.classList.toggle("is-hidden", !isAnalyzing);
  elements.transactionOCRTitle.textContent = isAnalyzing ? "Sedang membaca struk" : "Pembacaan struk selesai";
  elements.transactionOCRText.textContent = isAnalyzing
    ? "OCR sedang memeriksa gambar, mengenali total, tanggal, dan detail transaksi."
    : "Hasil pembacaan sudah siap ditinjau di form review.";

  elements.transactionReceiptCameraInput.disabled = isAnalyzing;
  elements.transactionReceiptFile.disabled = isAnalyzing;
  elements.transactionReceiptCameraButton.disabled = isAnalyzing;
  elements.transactionReceiptGalleryButton.disabled = isAnalyzing;
  elements.transactionFlowBackButton.disabled = isAnalyzing;
  elements.transactionScanManualButton.disabled = isAnalyzing;
  elements.transactionReceiptRemoveButton.disabled = isAnalyzing;

  if (elements.transactionReceiptAnalyzeButton.classList.contains("is-hidden")) {
    return;
  }

  elements.transactionReceiptAnalyzeButton.disabled = isAnalyzing || !hasPreview;
  elements.transactionReceiptAnalyzeButton.textContent = isAnalyzing ? "Membaca struk..." : "Baca struk";
}

function setTransactionReceiptError(message = "") {
  state.transactionReceiptError = String(message || "").trim();
}

function getFriendlyTransactionReceiptError(message = "") {
  const raw = String(message || "").trim();
  const lower = raw.toLowerCase();

  if (!raw) {
    return "OCR belum berhasil membaca struk ini. Coba foto ulang dengan pencahayaan yang lebih jelas.";
  }

  if (/1 mb|ukuran gambar|maksimal 1 mb|kompres/i.test(raw)) {
    return "Ukuran gambar masih terlalu besar untuk dibaca AI. Kompres atau ambil ulang foto dengan resolusi lebih ringan.";
  }

  if (/png|jpg|jpeg|webp|format/i.test(raw)) {
    return "Format file belum cocok. Gunakan PNG, JPG, atau WEBP lalu coba lagi.";
  }

  if (/belum aktif|api[_ ]?key|fitur baca struk/i.test(lower)) {
    return "Layanan baca struk belum aktif di server. Anda masih bisa lanjut isi transaksi secara manual.";
  }

  if (/quota|billing|habis/i.test(lower)) {
    return "Kuota layanan AI sedang habis. Coba lagi nanti atau lanjut isi transaksi manual.";
  }

  if (/timeout|timed out|gagal menghubungi|network|fetch failed|socket|gateway|503|504|429/i.test(lower)) {
    return "Layanan OCR sedang lambat atau sibuk. Tunggu sebentar lalu coba lagi.";
  }

  if (/belum bisa membaca|belum berhasil dibaca|parsedtext|tidak terbaca|tidak terbaca jelas|respons ai untuk struk kosong|json/i.test(lower)) {
    return "Teks pada struk belum terbaca dengan jelas. Coba foto ulang dengan cahaya lebih terang dan posisi lebih tegak.";
  }

  return raw;
}

function renderTransactionOCRError() {
  const hasError = Boolean(state.transactionReceiptError);
  const isAnalyzing = state.transactionReceiptAnalyzing === true;

  elements.transactionOCRError.classList.toggle("is-hidden", !hasError);
  elements.transactionOCRErrorTitle.textContent = "Struk belum bisa dibaca";
  elements.transactionOCRErrorText.textContent =
    state.transactionReceiptError || "Coba foto ulang dengan pencahayaan yang lebih jelas atau lanjut isi manual.";
  elements.transactionOCRRetryButton.disabled = isAnalyzing;
  elements.transactionOCRErrorManualButton.disabled = isAnalyzing;
}

function setTransactionReviewChip(element, text = "", options = {}) {
  if (!element) {
    return;
  }

  const hasText = Boolean(String(text || "").trim());
  element.textContent = text;
  element.classList.toggle("is-ai-warning", hasText && options.tone === "ai");
  element.classList.toggle("is-hidden", !hasText);
}

function renderTransactionReviewAssist() {
  const description = elements.transactionForm.elements.description.value.trim();
  const amount = parseFlexibleAmount(elements.transactionAmount.value);
  const category = elements.transactionCategory.value.trim();
  const date = elements.transactionForm.elements.date.value.trim();
  const receiptState = state.transactionReceipt || createTransactionReceiptState();
  const requiresManualOcrReview =
    state.transactionEntryMethod === "scan" &&
    (receiptState.ocrReviewLevel === "low" || receiptState.ocrReviewLevel === "medium");
  const aiWarnings = {
    amount: requiresManualOcrReview && Boolean(amount),
    category: requiresManualOcrReview && Boolean(category),
    date: requiresManualOcrReview && Boolean(date),
    description: false
  };
  const states = {
    amount: amount ? (aiWarnings.amount ? "Verifikasi AI" : "") : "Cek nominal",
    category: category ? (aiWarnings.category ? "Verifikasi AI" : "") : "Pilih kategori",
    date: date ? (aiWarnings.date ? "Verifikasi AI" : "") : "Pilih tanggal",
    description: description ? "" : "Perlu diisi"
  };
  const issues = Object.entries(states).filter(([, message]) => Boolean(message) && message !== "Verifikasi AI");
  const isScanFlow = state.transactionEntryMethod === "scan";
  const reviewAlert = requiresManualOcrReview ? receiptState.ocrReviewAlert : "";

  setTransactionReviewChip(elements.transactionReviewChipAmount, states.amount, {
    tone: aiWarnings.amount ? "ai" : ""
  });
  setTransactionReviewChip(elements.transactionReviewChipCategory, states.category, {
    tone: aiWarnings.category ? "ai" : ""
  });
  setTransactionReviewChip(elements.transactionReviewChipDate, states.date, {
    tone: aiWarnings.date ? "ai" : ""
  });
  setTransactionReviewChip(elements.transactionReviewChipDescription, states.description);

  elements.transactionFieldAmount.classList.toggle("is-needs-review", Boolean(states.amount) && !aiWarnings.amount);
  elements.transactionFieldAmount.classList.toggle("is-ai-warning", aiWarnings.amount);
  elements.transactionFieldCategory.classList.toggle("is-needs-review", Boolean(states.category) && !aiWarnings.category);
  elements.transactionFieldCategory.classList.toggle("is-ai-warning", aiWarnings.category);
  elements.transactionFieldDate.classList.toggle("is-needs-review", Boolean(states.date) && !aiWarnings.date);
  elements.transactionFieldDate.classList.toggle("is-ai-warning", aiWarnings.date);
  elements.transactionFieldDescription.classList.toggle("is-needs-review", Boolean(states.description));
  elements.transactionReviewSummary.classList.toggle("is-ocr-warning", requiresManualOcrReview);
  elements.transactionReviewSummary.classList.toggle("is-ready", !requiresManualOcrReview && issues.length === 0);

  if (issues.length > 0 || requiresManualOcrReview) {
    if (requiresManualOcrReview && issues.length === 0) {
      elements.transactionReviewSummaryTitle.textContent = "Perlu verifikasi hasil OCR";
      elements.transactionReviewSummaryText.textContent =
        "Cek manual nominal, tanggal, dan kategori sebelum simpan. " +
        (reviewAlert ? `Catatan OCR: ${reviewAlert}` : "Klik field yang diberi label Verifikasi AI.");
      return;
    }

    elements.transactionReviewSummaryTitle.textContent =
      issues.length === 1 ? "1 field utama perlu dicek" : `${issues.length} field utama perlu dicek`;
    elements.transactionReviewSummaryText.textContent = `${requiresManualOcrReview ? "Selain itu, verifikasi AI juga diperlukan. " : ""}Periksa ${issues
      .map(([field]) => {
        if (field === "amount") return "nominal";
        if (field === "category") return "kategori";
        if (field === "date") return "tanggal";
        return "deskripsi";
      })
      .join(", ")} sebelum transaksi disimpan.${reviewAlert ? ` Catatan OCR: ${reviewAlert}` : ""}`;
    return;
  }

  elements.transactionReviewSummaryTitle.textContent = isScanFlow ? "Hasil scan siap disimpan" : "Form siap disimpan";
  elements.transactionReviewSummaryText.textContent = isScanFlow
    ? "Empat field utama sudah terisi. Review cepat selesai dan Anda bisa langsung simpan."
    : "Field utama sudah lengkap. Tambahkan catatan bila perlu lalu simpan transaksi.";
}

function getPreferredTransactionReviewFocusField() {
  const candidates = [
    { element: elements.transactionAmount, invalid: !parseFlexibleAmount(elements.transactionAmount.value) },
    { element: elements.transactionForm.elements.date, invalid: !elements.transactionForm.elements.date.value.trim() },
    { element: elements.transactionCategory, invalid: !elements.transactionCategory.value.trim() },
    { element: elements.transactionForm.elements.description, invalid: !elements.transactionForm.elements.description.value.trim() }
  ];

  return candidates.find((entry) => entry.invalid)?.element || elements.transactionForm.elements.description;
}

function renderTransactionEntryFlow() {
  const isEditing = Boolean(state.editingTransactionId);
  const step = isEditing
    ? state.transactionEntryStep === "scan"
      ? "scan"
      : "review"
    : state.transactionEntryStep || "chooser";
  const hasPreview = Boolean(getActiveTransactionReceiptPreview());
  const canReturnToReview = state.transactionReviewVisited || isEditing;

  elements.transactionEntryChooser.classList.toggle("is-hidden", step !== "chooser" || isEditing);
  elements.transactionScanStage.classList.toggle("is-hidden", step !== "scan");
  elements.transactionDetailsSection.classList.toggle("is-hidden", step !== "review");
  elements.transactionScanEmptyState.classList.toggle("is-hidden", hasPreview);
  elements.transactionScanReviewButton.disabled = !hasPreview || state.transactionReceiptAnalyzing;
  elements.transactionScanReviewButton.textContent = hasPreview ? "Lanjut ke review" : "Pilih foto dulu";
  elements.transactionFlowBackButton.textContent = canReturnToReview ? "Kembali ke detail" : "Ganti metode";
  elements.transactionScanManualButton.textContent = hasPreview
    ? "Lanjut tanpa AI"
    : canReturnToReview
      ? "Isi manual di form"
      : "Input manual";
  renderTransactionOCRState();
  renderTransactionOCRError();
  renderTransactionReviewBanner();
  renderTransactionReviewAssist();
}

function scrollTransactionFlowIntoView(target) {
  if (!target) {
    return;
  }

  requestAnimationFrame(() => {
    target.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start"
    });
  });
}

function openTransactionReceiptPicker(mode = "gallery") {
  const target =
    mode === "camera"
      ? elements.transactionReceiptCameraInput || elements.transactionReceiptFile
      : elements.transactionReceiptFile;

  if (!target || target.disabled) {
    return;
  }

  target.click();
}

function showTransactionReview(options = {}) {
  state.transactionEntryMethod = options.method || state.transactionEntryMethod || "manual";
  state.transactionEntryStep = "review";
  state.transactionReviewVisited = true;
  renderTransactionEntryFlow();
  scrollTransactionFlowIntoView(elements.transactionDetailsSection);

  const focusField = options.focusField || (state.transactionEntryMethod === "scan" ? getPreferredTransactionReviewFocusField() : null);
  if (focusField) {
    requestAnimationFrame(() => {
      focusField.focus();
    });
  }
}

function showTransactionChooser() {
  state.transactionEntryMethod = null;
  state.transactionEntryStep = "chooser";
  state.transactionReviewVisited = false;
  renderTransactionEntryFlow();
  scrollTransactionFlowIntoView(elements.transactionEntryChooser);
}

function showTransactionScanStage() {
  if (!state.transactionEntryMethod) {
    state.transactionEntryMethod = "scan";
  }

  state.transactionEntryStep = "scan";
  renderTransactionEntryFlow();
  scrollTransactionFlowIntoView(elements.transactionScanStage);
}

function applyPendingLaunchShortcut() {
  const shortcut = state.launchShortcut;
  if (!shortcut || !state.user) {
    return;
  }

  state.launchShortcut = null;
  resetTransactionForm();
  setTransactionReceiptError("");

  if (shortcut === "scan") {
    state.transactionEntryMethod = "scan";
    showTransactionScanStage();
  } else {
    showTransactionReview({
      focusField: elements.transactionForm.elements.description,
      method: "manual"
    });
  }

  clearLaunchShortcutFromUrl();
}

function createTransactionReceiptState() {
  return {
    analysisMessage: "",
    existingUrl: "",
    hasExisting: false,
    ocrReviewAlert: "",
    ocrReviewFlags: [],
    ocrReviewLevel: "high",
    removeRequested: false,
    upload: null
  };
}

function getTransactionReceiptUrl(transactionId) {
  return `/api/transactions/${transactionId}/receipt`;
}

function resetTransactionReceiptState(transaction = null) {
  state.transactionReceipt = createTransactionReceiptState();
  state.transactionReceiptAnalyzing = false;
  state.transactionReceiptError = "";

  if (transaction?.id && transaction.receiptPath) {
    state.transactionReceipt.existingUrl = getTransactionReceiptUrl(transaction.id);
    state.transactionReceipt.hasExisting = true;
  }

  if (elements.transactionReceiptCameraInput) {
    elements.transactionReceiptCameraInput.value = "";
  }

  if (elements.transactionReceiptFile) {
    elements.transactionReceiptFile.value = "";
  }

  renderTransactionReceiptPanel();
}

function renderTransactionReceiptPanel() {
  const receiptState = state.transactionReceipt || createTransactionReceiptState();
  const hasUpload = Boolean(receiptState.upload);
  const hasExisting = receiptState.hasExisting && !receiptState.removeRequested && !hasUpload;
  const showPanel = hasUpload || hasExisting || receiptState.removeRequested;

  elements.transactionReceiptPanel.classList.toggle("is-hidden", !showPanel);
  elements.transactionReceiptAnalyzeButton.classList.add("is-hidden");
  elements.transactionReceiptLink.classList.add("is-hidden");
  elements.transactionReceiptRemoveButton.classList.add("is-hidden");
  elements.transactionReceiptLink.classList.remove("receipt-link");
  elements.transactionReceiptLink.removeAttribute("href");

  if (!showPanel) {
    renderTransactionEntryFlow();
    return;
  }

  if (hasUpload) {
    elements.transactionReceiptStatus.textContent = receiptState.upload.fileName;
    elements.transactionReceiptHint.textContent =
      receiptState.analysisMessage ||
      (receiptState.upload.ocrOptimized
        ? "Struk baru akan diunggah saat transaksi disimpan. Gambar juga sudah dioptimalkan otomatis untuk OCR."
        : "Struk baru akan diunggah saat transaksi disimpan.");
    elements.transactionReceiptAnalyzeButton.textContent = "Baca struk";
    elements.transactionReceiptAnalyzeButton.disabled = false;
    elements.transactionReceiptAnalyzeButton.classList.remove("is-hidden");
    elements.transactionReceiptLink.href = receiptState.upload.dataUrl;
    elements.transactionReceiptLink.textContent = "Preview struk";
    elements.transactionReceiptLink.classList.remove("is-hidden");
    elements.transactionReceiptLink.classList.add("receipt-link");
    elements.transactionReceiptRemoveButton.textContent = "Batalkan struk";
    elements.transactionReceiptRemoveButton.classList.remove("is-hidden");
    renderTransactionEntryFlow();
    return;
  }

  if (receiptState.removeRequested) {
    elements.transactionReceiptStatus.textContent = "Struk akan dihapus";
    elements.transactionReceiptHint.textContent = "Simpan perubahan transaksi untuk menghapus struk yang tersimpan.";
    elements.transactionReceiptRemoveButton.textContent = "Batalkan hapus";
    elements.transactionReceiptRemoveButton.classList.remove("is-hidden");
    renderTransactionEntryFlow();
    return;
  }

  elements.transactionReceiptStatus.textContent = "Struk tersimpan";
  elements.transactionReceiptHint.textContent = "Transaksi ini sudah memiliki bukti struk yang bisa dibuka kapan saja.";
  elements.transactionReceiptLink.href = receiptState.existingUrl;
  elements.transactionReceiptLink.textContent = "Buka struk";
  elements.transactionReceiptLink.classList.remove("is-hidden");
  elements.transactionReceiptLink.classList.add("receipt-link");
  elements.transactionReceiptRemoveButton.textContent = "Hapus struk";
  elements.transactionReceiptRemoveButton.classList.remove("is-hidden");
  renderTransactionEntryFlow();
}

async function readReceiptFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Gagal membaca file struk."));
    reader.readAsDataURL(file);
  });
}

function estimateDataUrlBytes(dataUrl) {
  const base64 = String(dataUrl || "").split(",")[1] || "";
  const paddingMatch = base64.match(/=*$/);
  const padding = paddingMatch ? paddingMatch[0].length : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

async function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Gagal menyiapkan gambar struk untuk OCR."));
    image.src = dataUrl;
  });
}

async function optimizeReceiptDataUrlForOCR(dataUrl, options = {}) {
  const maxBytes = Number(options.maxBytes) || 950 * 1024;
  const maxDimension = Number(options.maxDimension) || 1600;
  const originalBytes = estimateDataUrlBytes(dataUrl);
  if (!dataUrl || originalBytes <= maxBytes) {
    return {
      dataUrl,
      optimized: false
    };
  }

  const image = await loadImageFromDataUrl(dataUrl);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return {
      dataUrl,
      optimized: false
    };
  }

  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;
  const dimensionRatio = Math.max(width / maxDimension, height / maxDimension, 1);
  width = Math.max(1, Math.round(width / dimensionRatio));
  height = Math.max(1, Math.round(height / dimensionRatio));

  let bestCandidate = {
    bytes: originalBytes,
    dataUrl
  };

  for (let iteration = 0; iteration < 6; iteration += 1) {
    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    for (const quality of [0.82, 0.74, 0.66, 0.58, 0.5, 0.42]) {
      const candidate = canvas.toDataURL("image/jpeg", quality);
      const bytes = estimateDataUrlBytes(candidate);
      if (bytes < bestCandidate.bytes) {
        bestCandidate = {
          bytes,
          dataUrl: candidate
        };
      }

      if (bytes <= maxBytes) {
        return {
          dataUrl: candidate,
          optimized: true
        };
      }
    }

    width = Math.max(1, Math.round(width * 0.86));
    height = Math.max(1, Math.round(height * 0.86));
  }

  return {
    dataUrl: bestCandidate.dataUrl,
    optimized: bestCandidate.dataUrl !== dataUrl
  };
}

async function handleTransactionReceiptChange(event) {
  const file = event.target.files?.[0];
  if (!file) {
    if (!state.transactionReceipt?.hasExisting) {
      resetTransactionReceiptState();
    } else {
      renderTransactionReceiptPanel();
    }
    return;
  }

  if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
    window.alert("Format struk harus PNG, JPG, atau WEBP.");
    event.target.value = "";
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    window.alert("Ukuran struk maksimal 2 MB.");
    event.target.value = "";
    return;
  }

  const dataUrl = await readReceiptFileAsDataUrl(file);
  const optimizedReceipt = await optimizeReceiptDataUrlForOCR(dataUrl);
  if (!state.transactionReceipt) {
    state.transactionReceipt = createTransactionReceiptState();
  }

  state.transactionReceiptAnalyzing = false;
  setTransactionReceiptError("");
  state.transactionReceipt.upload = {
    dataUrl,
    fileName: file.name,
    ocrDataUrl: optimizedReceipt.dataUrl,
    ocrOptimized: optimizedReceipt.optimized
  };
  state.transactionReceipt.analysisMessage = "";
  state.transactionReceipt.ocrReviewAlert = "";
  state.transactionReceipt.ocrReviewFlags = [];
  state.transactionReceipt.ocrReviewLevel = "high";
  state.transactionReceipt.removeRequested = false;
  renderTransactionReceiptPanel();
}

function handleTransactionReceiptRemove() {
  if (!state.transactionReceipt) {
    state.transactionReceipt = createTransactionReceiptState();
  }

  state.transactionReceiptAnalyzing = false;
  setTransactionReceiptError("");
  if (state.transactionReceipt.upload) {
    state.transactionReceipt.upload = null;
    state.transactionReceipt.analysisMessage = "";
    if (!state.transactionReceipt.hasExisting) {
      resetTransactionReceiptState();
      return;
    }
  } else if (state.transactionReceipt.hasExisting) {
    state.transactionReceipt.removeRequested = !state.transactionReceipt.removeRequested;
    if (state.transactionReceipt.removeRequested) {
      state.transactionReceipt.analysisMessage = "";
    }
  }

  if (elements.transactionReceiptFile) {
    elements.transactionReceiptFile.value = "";
  }

  if (elements.transactionReceiptCameraInput) {
    elements.transactionReceiptCameraInput.value = "";
  }

  renderTransactionReceiptPanel();
}

function buildTransactionPayload() {
  const formData = new FormData(elements.transactionForm);
  const payload = Object.fromEntries(formData.entries());
  const receiptState = state.transactionReceipt || createTransactionReceiptState();

  payload.receiptAction = receiptState.removeRequested ? "remove" : receiptState.upload ? "replace" : "keep";
  if (receiptState.upload) {
    payload.receiptUpload = {
      dataUrl: receiptState.upload.dataUrl,
      fileName: receiptState.upload.fileName
    };
  }

  return payload;
}

function applyReceiptSuggestion(suggestion) {
  if (!suggestion || typeof suggestion !== "object") {
    return;
  }

  if (suggestion.type === "income" || suggestion.type === "expense") {
    elements.transactionType.value = suggestion.type;
  }

  syncTransactionCategoryOptions(suggestion.category);

  if (suggestion.category) {
    const canonicalCategory = findCanonicalTransactionCategory(elements.transactionType.value, suggestion.category);
    if (canonicalCategory) {
      elements.transactionCategory.value = canonicalCategory;
    }
  }

  if (suggestion.description) {
    elements.transactionForm.elements.description.value = suggestion.description;
  }

  if (suggestion.amount) {
    elements.transactionAmount.value = formatFlexibleCurrency(suggestion.amount);
  }

  if (suggestion.date) {
    elements.transactionForm.elements.date.value = suggestion.date;
  }

  if (suggestion.notes && !elements.transactionForm.elements.notes.value.trim()) {
    elements.transactionForm.elements.notes.value = suggestion.notes;
  }

  renderTransactionAmountHint();
}

async function handleTransactionReceiptAnalyze() {
  if (!state.user) {
    showAuthGate("Silakan masuk sebelum memakai pembacaan struk AI.");
    return;
  }

  const upload = state.transactionReceipt?.upload;
  if (!upload) {
    setTransactionReceiptError(getFriendlyTransactionReceiptError("Unggah struk baru terlebih dahulu sebelum menjalankan pembacaan AI."));
    renderTransactionEntryFlow();
    return;
  }

  try {
    setTransactionReceiptError("");
    state.transactionReceiptAnalyzing = true;
    renderTransactionEntryFlow();

    const payload = await request("/api/transactions/receipt-analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        preferredType: elements.transactionType.value,
        receiptUpload: {
          dataUrl: upload.ocrDataUrl || upload.dataUrl,
          fileName: upload.fileName
        }
      })
    });

    applyReceiptSuggestion(payload.suggestion);
    state.transactionReceipt.ocrReviewLevel =
      payload.suggestion?.reviewLevel === "low"
        ? "low"
        : payload.suggestion?.reviewLevel === "medium"
          ? "medium"
          : "high";
    state.transactionReceipt.ocrReviewAlert = String(payload.suggestion?.reviewAlert || "").trim();
    state.transactionReceipt.ocrReviewFlags = Array.isArray(payload.suggestion?.reviewFlags)
      ? payload.suggestion.reviewFlags.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
      : [];
    state.transactionReceipt.analysisMessage =
      payload.message || "Form sudah diisi dari struk. Mohon cek kembali sebelum menyimpan transaksi.";
    setTransactionReceiptError("");
    elements.transactionReceiptHint.textContent = state.transactionReceipt.analysisMessage;
    state.transactionReceiptAnalyzing = false;
    showTransactionReview({
      focusField: elements.transactionForm.elements.description,
      method: "scan"
    });
  } catch (error) {
    state.transactionReceiptAnalyzing = false;
    const wasUnauthorized = handleUnauthorized(error);
    setTransactionReceiptError(
      wasUnauthorized
        ? ""
        : getFriendlyTransactionReceiptError(error.message)
    );
    renderTransactionEntryFlow();
    if (!wasUnauthorized) {
      scrollTransactionFlowIntoView(elements.transactionOCRError);
    }
  } finally {
    state.transactionReceiptAnalyzing = false;
    renderTransactionEntryFlow();
  }
}

function resetTransactionForm() {
  state.editingTransactionId = null;
  state.transactionEntryMethod = null;
  state.transactionEntryStep = "chooser";
  state.transactionReviewVisited = false;
  elements.transactionForm.reset();
  elements.transactionForm.date.value = todayInputValue();
  syncTransactionCategoryOptions();
  renderTransactionAmountHint();
  resetTransactionReceiptState();
  setTransactionFormMode(false);
}

