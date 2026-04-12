const state = {
  authMode: "login",
  chatHistory: [],
  compactMode: false,
  csvImport: null,
  editingTransactionId: null,
  health: null,
  summary: null,
  transactionEntryMethod: null,
  transactionEntryStep: "chooser",
  transactionReceiptAnalyzing: false,
  transactionReceiptError: "",
  transactionReceipt: null,
  transactionReviewVisited: false,
  telegramCommand: null,
  telegramStatus: null,
  transactions: [],
  user: null
};
const COMPACT_MODE_STORAGE_KEY = "arunika_compact_mode";
const TRANSACTION_CATEGORY_OPTIONS = globalThis.TRANSACTION_CATEGORY_OPTIONS || {
  expense: ["Makanan", "Transportasi", "Tagihan", "Transfer", "Belanja", "Kesehatan", "Pendidikan", "Hiburan", "Rumah Tangga"],
  income: ["Gaji", "Freelance", "Bonus", "Penjualan", "Investasi", "Transfer", "Hadiah"]
};
const findCanonicalTransactionCategory =
  globalThis.findCanonicalTransactionCategory ||
  ((type, value) => {
    const categories = TRANSACTION_CATEGORY_OPTIONS[type] || [];
    return categories.find((category) => category.toLowerCase() === String(value || "").trim().toLowerCase()) || null;
  });
const parseFlexibleAmount =
  globalThis.parseFlexibleAmount ||
  ((value) => {
    const digits = String(value || "").replace(/[^\d]/g, "");
    return digits ? Number.parseInt(digits, 10) : null;
  });
const formatFlexibleCurrency =
  globalThis.formatFlexibleCurrency ||
  ((value) =>
    new Intl.NumberFormat("id-ID", {
      currency: "IDR",
      maximumFractionDigits: 0,
      style: "currency"
    }).format(Number(value) || 0));

const currencyFormatter = new Intl.NumberFormat("id-ID", {
  currency: "IDR",
  maximumFractionDigits: 0,
  style: "currency"
});

const percentFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1
});
const animatedValues = new Map();
const prefersReducedMotion =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const elements = {
  appShell: document.getElementById("appShell"),
  authEmail: document.getElementById("authEmail"),
  authForm: document.getElementById("authForm"),
  authGate: document.getElementById("authGate"),
  authMessage: document.getElementById("authMessage"),
  authName: document.getElementById("authName"),
  authPassword: document.getElementById("authPassword"),
  authSubmitButton: document.getElementById("authSubmitButton"),
  authSubtitle: document.getElementById("authSubtitle"),
  authTitle: document.getElementById("authTitle"),
  balanceFoot: document.getElementById("balanceFoot"),
  balanceValue: document.getElementById("balanceValue"),
  cashflowChart: document.getElementById("cashflowChart"),
  categoryChart: document.getElementById("categoryChart"),
  chatForm: document.getElementById("chatForm"),
  chatInput: document.getElementById("chatInput"),
  chatMessages: document.getElementById("chatMessages"),
  chatModeChip: document.getElementById("chatModeChip"),
  chatTemplate: document.getElementById("chatBubbleTemplate"),
  compactModeButton: document.getElementById("compactModeButton"),
  expenseFoot: document.getElementById("expenseFoot"),
  expenseValue: document.getElementById("expenseValue"),
  flowExpenseBar: document.getElementById("flowExpenseBar"),
  flowExpenseMeta: document.getElementById("flowExpenseMeta"),
  flowExpenseValue: document.getElementById("flowExpenseValue"),
  flowIncomeBar: document.getElementById("flowIncomeBar"),
  flowIncomeMeta: document.getElementById("flowIncomeMeta"),
  flowIncomeValue: document.getElementById("flowIncomeValue"),
  flowNetBar: document.getElementById("flowNetBar"),
  flowNetMeta: document.getElementById("flowNetMeta"),
  flowNetValue: document.getElementById("flowNetValue"),
  flowTimeline: document.getElementById("flowTimeline"),
  heroSummaryText: document.getElementById("heroSummaryText"),
  incomeFoot: document.getElementById("incomeFoot"),
  incomeValue: document.getElementById("incomeValue"),
  importAmountColumn: document.getElementById("importAmountColumn"),
  importCategoryColumn: document.getElementById("importCategoryColumn"),
  importCreditColumn: document.getElementById("importCreditColumn"),
  importDateColumn: document.getElementById("importDateColumn"),
  importDebitColumn: document.getElementById("importDebitColumn"),
  importDescriptionColumn: document.getElementById("importDescriptionColumn"),
  importFileInput: document.getElementById("importFileInput"),
  importFileName: document.getElementById("importFileName"),
  importForm: document.getElementById("importForm"),
  importMappingSection: document.getElementById("importMappingSection"),
  importMessage: document.getElementById("importMessage"),
  importMetaText: document.getElementById("importMetaText"),
  importNotesColumn: document.getElementById("importNotesColumn"),
  importPresetSelect: document.getElementById("importPresetSelect"),
  importPreviewButton: document.getElementById("importPreviewButton"),
  importPreviewList: document.getElementById("importPreviewList"),
  importPreviewSection: document.getElementById("importPreviewSection"),
  importPreviewSummary: document.getElementById("importPreviewSummary"),
  importSubmitButton: document.getElementById("importSubmitButton"),
  importTypeColumn: document.getElementById("importTypeColumn"),
  insightList: document.getElementById("insightList"),
  loginTabButton: document.getElementById("loginTabButton"),
  logoutButton: document.getElementById("logoutButton"),
  nameField: document.getElementById("nameField"),
  quickPrompts: document.getElementById("quickPrompts"),
  registerTabButton: document.getElementById("registerTabButton"),
  savingsFoot: document.getElementById("savingsFoot"),
  savingsValue: document.getElementById("savingsValue"),
  searchInput: document.getElementById("searchInput"),
  sessionEmail: document.getElementById("sessionEmail"),
  sessionName: document.getElementById("sessionName"),
  telegramCodeBox: document.getElementById("telegramCodeBox"),
  telegramCodeMeta: document.getElementById("telegramCodeMeta"),
  telegramCodeText: document.getElementById("telegramCodeText"),
  telegramLinkButton: document.getElementById("telegramLinkButton"),
  telegramStatusText: document.getElementById("telegramStatusText"),
  telegramUnlinkButton: document.getElementById("telegramUnlinkButton"),
  transactionForm: document.getElementById("transactionForm"),
  transactionCategory: document.getElementById("transactionCategory"),
  transactionAmount: document.getElementById("transactionAmount"),
  transactionAmountHint: document.getElementById("transactionAmountHint"),
  transactionCancelButton: document.getElementById("transactionCancelButton"),
  transactionDetailsSection: document.getElementById("transactionDetailsSection"),
  transactionEntryChooser: document.getElementById("transactionEntryChooser"),
  transactionFlowBackButton: document.getElementById("transactionFlowBackButton"),
  transactionModeManualButton: document.getElementById("transactionModeManualButton"),
  transactionModeScanButton: document.getElementById("transactionModeScanButton"),
  transactionReceiptCameraButton: document.getElementById("transactionReceiptCameraButton"),
  transactionReceiptCameraInput: document.getElementById("transactionReceiptCameraInput"),
  transactionReceiptFile: document.getElementById("transactionReceiptFile"),
  transactionReceiptGalleryButton: document.getElementById("transactionReceiptGalleryButton"),
  transactionReceiptHint: document.getElementById("transactionReceiptHint"),
  transactionReceiptLink: document.getElementById("transactionReceiptLink"),
  transactionReceiptAnalyzeButton: document.getElementById("transactionReceiptAnalyzeButton"),
  transactionOCRError: document.getElementById("transactionOCRError"),
  transactionOCRErrorManualButton: document.getElementById("transactionOCRErrorManualButton"),
  transactionOCRErrorText: document.getElementById("transactionOCRErrorText"),
  transactionOCRErrorTitle: document.getElementById("transactionOCRErrorTitle"),
  transactionOCRRetryButton: document.getElementById("transactionOCRRetryButton"),
  transactionReceiptPanel: document.getElementById("transactionReceiptPanel"),
  transactionReceiptRemoveButton: document.getElementById("transactionReceiptRemoveButton"),
  transactionReceiptStatus: document.getElementById("transactionReceiptStatus"),
  transactionOCRProcessing: document.getElementById("transactionOCRProcessing"),
  transactionOCRText: document.getElementById("transactionOCRText"),
  transactionOCRTitle: document.getElementById("transactionOCRTitle"),
  transactionReviewHint: document.getElementById("transactionReviewHint"),
  transactionReviewManageButton: document.getElementById("transactionReviewManageButton"),
  transactionReviewReceiptImage: document.getElementById("transactionReviewReceiptImage"),
  transactionReviewReceiptLink: document.getElementById("transactionReviewReceiptLink"),
  transactionReviewSummary: document.getElementById("transactionReviewSummary"),
  transactionReviewSummaryText: document.getElementById("transactionReviewSummaryText"),
  transactionReviewSummaryTitle: document.getElementById("transactionReviewSummaryTitle"),
  transactionReviewStatus: document.getElementById("transactionReviewStatus"),
  transactionReviewChipAmount: document.getElementById("transactionReviewChipAmount"),
  transactionReviewChipCategory: document.getElementById("transactionReviewChipCategory"),
  transactionReviewChipDate: document.getElementById("transactionReviewChipDate"),
  transactionReviewChipDescription: document.getElementById("transactionReviewChipDescription"),
  transactionFieldAmount: document.getElementById("transactionFieldAmount"),
  transactionFieldCategory: document.getElementById("transactionFieldCategory"),
  transactionFieldDate: document.getElementById("transactionFieldDate"),
  transactionFieldDescription: document.getElementById("transactionFieldDescription"),
  transactionScanManualButton: document.getElementById("transactionScanManualButton"),
  transactionScanEmptyState: document.getElementById("transactionScanEmptyState"),
  transactionScanReviewButton: document.getElementById("transactionScanReviewButton"),
  transactionScanStage: document.getElementById("transactionScanStage"),
  transactionTableBody: document.getElementById("transactionTableBody"),
  transactionFormTitle: document.getElementById("transactionFormTitle"),
  transactionSubmitButton: document.getElementById("transactionSubmitButton"),
  transactionType: document.getElementById("transactionType"),
  typeFilter: document.getElementById("typeFilter")
};

const IMPORT_COLUMN_FIELDS = ["date", "description", "amount", "debit", "credit", "type", "category", "notes"];
const IMPORT_MAPPING_ELEMENTS = {
  amount: elements.importAmountColumn,
  category: elements.importCategoryColumn,
  credit: elements.importCreditColumn,
  date: elements.importDateColumn,
  debit: elements.importDebitColumn,
  description: elements.importDescriptionColumn,
  notes: elements.importNotesColumn,
  type: elements.importTypeColumn
};
const IMPORT_FIELD_KEYWORDS = {
  amount: ["amount", "nominal", "jumlah", "nilai", "mutasi", "trx amount"],
  category: ["category", "kategori", "jenis"],
  credit: ["credit", "kredit", "cr", "masuk"],
  date: ["date", "tanggal", "tgl", "posting date", "transaction date"],
  debit: ["debit", "db", "keluar"],
  description: ["description", "deskripsi", "keterangan", "uraian", "remark", "narasi", "transaksi"],
  notes: ["notes", "catatan", "memo", "info", "detail"],
  type: ["type", "tipe", "jenis transaksi", "dc", "status"]
};
const IMPORT_PRESETS = {
  generic: {
    fieldAliases: {
      amount: ["amount", "nominal", "jumlah", "nilai", "mutasi", "trx amount"],
      category: ["category", "kategori", "jenis"],
      credit: ["credit", "kredit", "cr", "masuk"],
      date: ["date", "tanggal", "tgl", "posting date", "transaction date"],
      debit: ["debit", "db", "keluar"],
      description: ["description", "deskripsi", "keterangan", "uraian", "remark", "narasi", "transaksi"],
      notes: ["notes", "catatan", "memo", "info", "detail"],
      type: ["type", "tipe", "jenis transaksi", "dc", "status"]
    },
    label: "Generic CSV"
  },
  bca: {
    fieldAliases: {
      amount: ["mutasi", "nominal", "amount"],
      date: ["tanggal", "tgl", "date"],
      description: ["keterangan", "uraian", "description"],
      notes: ["cabang", "branch", "remark"],
      type: ["db/cr", "db cr", "dc", "type"]
    },
    fileHints: ["bca", "klikbca", "rekening bca"],
    label: "Bank BCA"
  },
  bni: {
    fieldAliases: {
      credit: ["kredit", "credit"],
      date: ["tanggal transaksi", "tanggal", "tgl", "date"],
      debit: ["debit"],
      description: ["uraian transaksi", "uraian", "keterangan", "description"],
      notes: ["terminal", "detail", "remark"]
    },
    fileHints: ["bni"],
    label: "Bank BNI"
  },
  mandiri: {
    fieldAliases: {
      credit: ["credit", "kredit"],
      date: ["posting date", "transaction date", "tanggal", "tgl"],
      debit: ["debit"],
      description: ["description", "remarks", "uraian", "keterangan"],
      notes: ["reference", "no ref", "branch", "catatan"]
    },
    fileHints: ["mandiri", "livin"],
    label: "Bank Mandiri"
  },
  seabank: {
    fieldAliases: {
      amount: ["amount", "nominal"],
      date: ["date", "tanggal", "time"],
      description: ["transaction details", "description", "detail transaksi", "keterangan"],
      notes: ["status", "channel", "remark"],
      type: ["transaction type", "type", "jenis"]
    },
    fileHints: ["seabank", "sea bank"],
    label: "SeaBank / Digital Bank"
  }
};

function formatCurrency(value) {
  return currencyFormatter.format(Number(value) || 0);
}

function formatPercent(value) {
  return `${percentFormatter.format(Number(value) || 0)}%`;
}

function formatSignedCurrency(value) {
  const amount = Number(value) || 0;
  const sign = amount < 0 ? "-" : "+";
  return `${sign}${formatCurrency(Math.abs(amount))}`;
}

function easeOutCubic(value) {
  return 1 - (1 - value) ** 3;
}

function setAnimatedValue(key, value) {
  animatedValues.set(key, Number(value) || 0);
}

function getAnimatedValue(key) {
  return animatedValues.has(key) ? animatedValues.get(key) : null;
}

function animateValue(key, target, onFrame, duration = 700) {
  const to = Number(target) || 0;
  const from = animatedValues.has(key) ? animatedValues.get(key) : 0;
  if (prefersReducedMotion || Math.abs(to - from) < 1) {
    onFrame(to);
    setAnimatedValue(key, to);
    return;
  }

  const startedAt = performance.now();
  const run = (now) => {
    const progress = Math.min((now - startedAt) / duration, 1);
    const eased = easeOutCubic(progress);
    const current = from + (to - from) * eased;
    onFrame(current);

    if (progress < 1) {
      requestAnimationFrame(run);
      return;
    }

    setAnimatedValue(key, to);
  };

  requestAnimationFrame(run);
}

function pulseElement(element, direction) {
  if (!element) {
    return;
  }

  const className = direction === "down" ? "is-pulse-down" : "is-pulse-up";
  element.classList.remove("is-pulse-up", "is-pulse-down");
  void element.offsetWidth;
  element.classList.add(className);

  setTimeout(() => {
    element.classList.remove(className);
  }, 650);
}

function shouldDefaultCompactMode() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(max-width: 760px)").matches;
}

function setCompactMode(enabled, options = {}) {
  const persist = options.persist !== false;
  state.compactMode = Boolean(enabled);

  elements.appShell.classList.toggle("is-compact", state.compactMode);

  if (elements.compactModeButton) {
    elements.compactModeButton.textContent = `Mode Ringkas: ${state.compactMode ? "Aktif" : "Nonaktif"}`;
    elements.compactModeButton.setAttribute("aria-pressed", String(state.compactMode));
  }

  if (!persist) {
    return;
  }

  try {
    window.localStorage.setItem(COMPACT_MODE_STORAGE_KEY, state.compactMode ? "1" : "0");
  } catch {
    // ignore storage errors
  }
}

function loadCompactModePreference() {
  try {
    const saved = window.localStorage.getItem(COMPACT_MODE_STORAGE_KEY);
    if (saved === "1") {
      return true;
    }

    if (saved === "0") {
      return false;
    }
  } catch {
    // ignore storage errors
  }

  return shouldDefaultCompactMode();
}

function formatDate(value) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function formatMonth(monthKey) {
  if (!monthKey) {
    return "Tanpa bulan";
  }

  const [year, month] = monthKey.split("-");
  return new Intl.DateTimeFormat("id-ID", {
    month: "short",
    year: "numeric"
  }).format(new Date(Number(year), Number(month) - 1, 1));
}

function todayInputValue() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function getTransactionCategories(type) {
  return TRANSACTION_CATEGORY_OPTIONS[type] || TRANSACTION_CATEGORY_OPTIONS.expense;
}

function syncTransactionCategoryOptions(preferredValue) {
  const categories = getTransactionCategories(elements.transactionType.value);
  const canonicalPreferredValue = findCanonicalTransactionCategory(elements.transactionType.value, preferredValue);
  const nextValue = categories.includes(canonicalPreferredValue) ? canonicalPreferredValue : categories[0];

  elements.transactionCategory.innerHTML = categories
    .map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`)
    .join("");

  elements.transactionCategory.value = nextValue;
}

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

function setTransactionReviewChip(element, text = "") {
  if (!element) {
    return;
  }

  const hasText = Boolean(String(text || "").trim());
  element.textContent = text;
  element.classList.toggle("is-hidden", !hasText);
}

function renderTransactionReviewAssist() {
  const description = elements.transactionForm.elements.description.value.trim();
  const amount = parseFlexibleAmount(elements.transactionAmount.value);
  const category = elements.transactionCategory.value.trim();
  const date = elements.transactionForm.elements.date.value.trim();
  const states = {
    amount: amount ? "" : "Cek nominal",
    category: category ? "" : "Pilih kategori",
    date: date ? "" : "Pilih tanggal",
    description: description ? "" : "Perlu diisi"
  };
  const issues = Object.entries(states).filter(([, message]) => Boolean(message));
  const isScanFlow = state.transactionEntryMethod === "scan";

  setTransactionReviewChip(elements.transactionReviewChipAmount, states.amount);
  setTransactionReviewChip(elements.transactionReviewChipCategory, states.category);
  setTransactionReviewChip(elements.transactionReviewChipDate, states.date);
  setTransactionReviewChip(elements.transactionReviewChipDescription, states.description);

  elements.transactionFieldAmount.classList.toggle("is-needs-review", Boolean(states.amount));
  elements.transactionFieldCategory.classList.toggle("is-needs-review", Boolean(states.category));
  elements.transactionFieldDate.classList.toggle("is-needs-review", Boolean(states.date));
  elements.transactionFieldDescription.classList.toggle("is-needs-review", Boolean(states.description));

  if (issues.length > 0) {
    elements.transactionReviewSummaryTitle.textContent =
      issues.length === 1 ? "1 field utama perlu dicek" : `${issues.length} field utama perlu dicek`;
    elements.transactionReviewSummaryText.textContent = `Periksa ${issues
      .map(([field]) => {
        if (field === "amount") return "nominal";
        if (field === "category") return "kategori";
        if (field === "date") return "tanggal";
        return "deskripsi";
      })
      .join(", ")} sebelum transaksi disimpan.`;
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

function createTransactionReceiptState() {
  return {
    analysisMessage: "",
    existingUrl: "",
    hasExisting: false,
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

function resetImportState(options = {}) {
  const preserveMessage = options.preserveMessage === true;
  state.csvImport = null;
  elements.importMappingSection.classList.add("is-hidden");
  elements.importPreviewSection.classList.add("is-hidden");
  elements.importPreviewList.innerHTML = "";
  elements.importPreviewSummary.textContent = "Belum ada data yang dipreview.";
  elements.importFileName.textContent = "Belum ada file";
  elements.importMetaText.textContent = "Unggah file untuk melihat mapping kolom.";
  elements.importPreviewButton.disabled = true;
  elements.importSubmitButton.disabled = true;
  if (elements.importPresetSelect) {
    elements.importPresetSelect.innerHTML = "";
    elements.importPresetSelect.disabled = true;
  }

  for (const element of Object.values(IMPORT_MAPPING_ELEMENTS)) {
    if (element) {
      element.innerHTML = "";
    }
  }

  if (!preserveMessage) {
    setImportMessage("");
  }
}

function setImportMessage(message, tone = "") {
  elements.importMessage.textContent = message;
  elements.importMessage.classList.toggle("is-error", tone === "error");
  elements.importMessage.classList.toggle("is-success", tone === "success");
}

function normalizeImportHeader(value, index) {
  const trimmed = String(value || "").trim();
  return trimmed || `Kolom ${index + 1}`;
}

function normalizeImportHeaderToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectCsvDelimiter(text) {
  const sample = String(text || "").split(/\r?\n/, 1)[0] || "";
  const commaCount = (sample.match(/,/g) || []).length;
  const semicolonCount = (sample.match(/;/g) || []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

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

function populateTransactionForm(transaction) {
  if (!transaction) {
    return;
  }

  state.editingTransactionId = transaction.id;
  state.transactionEntryMethod = transaction.receiptPath ? "scan" : "manual";
  state.transactionEntryStep = "review";
  state.transactionReviewVisited = true;
  elements.transactionType.value = transaction.type;
  syncTransactionCategoryOptions(transaction.category);
  elements.transactionForm.elements.description.value = transaction.description || "";
  elements.transactionAmount.value = formatFlexibleCurrency(transaction.amount);
  elements.transactionForm.elements.date.value = transaction.date || todayInputValue();
  elements.transactionForm.elements.notes.value = transaction.notes || "";
  renderTransactionAmountHint();
  resetTransactionReceiptState(transaction);
  setTransactionFormMode(true);
  elements.transactionForm.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.headers || {})
    }
  });

  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : {};

  if (!response.ok) {
    const error = new Error(payload.error || payload.message || "Terjadi kesalahan saat memproses permintaan.");
    error.status = response.status;
    throw error;
  }

  return payload;
}

function showAuthGate(message = "") {
  elements.authGate.classList.remove("is-hidden");
  elements.appShell.classList.add("is-locked");
  elements.authMessage.textContent = message;
}

function hideAuthGate() {
  elements.authGate.classList.add("is-hidden");
  elements.appShell.classList.remove("is-locked");
  elements.authMessage.textContent = "";
}

function setAuthMode(mode) {
  state.authMode = mode;
  const isRegister = mode === "register";

  elements.loginTabButton.classList.toggle("is-active", !isRegister);
  elements.registerTabButton.classList.toggle("is-active", isRegister);
  elements.nameField.classList.toggle("is-hidden", !isRegister);
  elements.authName.required = isRegister;
  elements.authTitle.textContent = isRegister ? "Buat akun Arunika Finance" : "Masuk ke Arunika Finance";
  elements.authSubtitle.textContent = isRegister
    ? "Daftarkan akun baru untuk menyimpan transaksi Anda secara terpisah."
    : "Masuk untuk mengakses dashboard keuangan pribadi. Data transaksi setiap akun dipisahkan otomatis di sistem.";
  elements.authSubmitButton.textContent = isRegister ? "Daftar Akun" : "Masuk";
  elements.authMessage.textContent = "";
}

function renderSession() {
  if (state.user) {
    elements.sessionName.textContent = state.user.name;
    elements.sessionEmail.textContent = state.user.email;
    elements.logoutButton.classList.remove("is-hidden");
    return;
  }

  elements.sessionName.textContent = "Belum masuk";
  elements.sessionEmail.textContent = "Gunakan akun demo atau daftar akun baru.";
  elements.logoutButton.classList.add("is-hidden");
}

function renderHealth() {
  if (!state.health) {
    return;
  }

  const labels = {
    local: "Chatbot lokal aktif",
    "local-fallback": "Mode fallback lokal",
    openai: `AI aktif - ${state.health.model}`
  };

  elements.chatModeChip.textContent = labels[state.health.chatMode] || "Mode chatbot aktif";
}

function renderTelegramStatus() {
  if (!state.user) {
    elements.telegramStatusText.textContent = "Masuk untuk melihat status koneksi Telegram.";
    elements.telegramLinkButton.disabled = true;
    elements.telegramUnlinkButton.classList.add("is-hidden");
    elements.telegramCodeBox.classList.add("is-hidden");
    return;
  }

  if (!state.telegramStatus) {
    elements.telegramStatusText.textContent = "Memuat status Telegram...";
    elements.telegramLinkButton.disabled = true;
    elements.telegramUnlinkButton.classList.add("is-hidden");
    elements.telegramCodeBox.classList.add("is-hidden");
    return;
  }

  const status = state.telegramStatus;
  elements.telegramLinkButton.disabled = !status.configured;
  elements.telegramUnlinkButton.classList.toggle("is-hidden", !status.linked);

  if (!status.configured) {
    elements.telegramStatusText.textContent =
      "Telegram belum dikonfigurasi di server. Isi TELEGRAM_BOT_TOKEN setelah aplikasi dihosting.";
    elements.telegramCodeBox.classList.add("is-hidden");
    return;
  }

  if (!status.webhookReady) {
    elements.telegramStatusText.textContent =
      "Bot siap, tapi APP_BASE_URL belum diisi. Webhook Telegram belum bisa didaftarkan.";
  } else if (status.linked && status.link) {
    const handle = status.link.username ? `@${status.link.username}` : `chat ${status.link.chatId}`;
    elements.telegramStatusText.textContent = `Telegram sudah terhubung ke ${handle}.`;
  } else {
    const botHint = status.botUrl ? ` Buka bot: ${status.botUrl}` : "";
    elements.telegramStatusText.textContent = `Bot siap dihubungkan. Tempel kode tautan dari dashboard ke chat bot.${botHint}`;
  }

  if (state.telegramCommand) {
    elements.telegramCodeText.textContent = state.telegramCommand;
    elements.telegramCodeMeta.textContent = "Kirim kode ini apa adanya ke bot Telegram. Bot akan memprosesnya lewat parsing teks. Kode berlaku 10 menit.";
    elements.telegramCodeBox.classList.remove("is-hidden");
  } else {
    elements.telegramCodeBox.classList.add("is-hidden");
  }
}

function clearDashboard() {
  state.editingTransactionId = null;
  state.summary = null;
  state.telegramCommand = null;
  state.telegramStatus = null;
  state.transactions = [];
  elements.balanceValue.textContent = "Rp0";
  elements.incomeValue.textContent = "Rp0";
  elements.expenseValue.textContent = "Rp0";
  elements.savingsValue.textContent = "0%";
  elements.balanceFoot.textContent = "Menunggu data transaksi";
  elements.incomeFoot.textContent = "0 kategori income";
  elements.expenseFoot.textContent = "0 kategori expense";
  elements.savingsFoot.textContent = "Belum cukup data";
  elements.heroSummaryText.textContent = state.user
    ? "Memuat ringkasan keuangan terbaru."
    : "Masuk ke akun untuk memuat ringkasan keuangan terbaru.";
  elements.flowIncomeValue.textContent = "Rp0";
  elements.flowExpenseValue.textContent = "Rp0";
  elements.flowNetValue.textContent = "Rp0";
  elements.flowIncomeMeta.textContent = "Menunggu data pemasukan";
  elements.flowExpenseMeta.textContent = "Menunggu data pengeluaran";
  elements.flowNetMeta.textContent = "Menunggu data neraca";
  elements.flowIncomeBar.style.width = "0%";
  elements.flowExpenseBar.style.width = "0%";
  elements.flowNetBar.style.width = "0%";
  elements.flowNetBar.classList.remove("is-negative");
  setAnimatedValue("balance", 0);
  setAnimatedValue("income", 0);
  setAnimatedValue("expense", 0);
  setAnimatedValue("savingsRate", 0);
  setAnimatedValue("flowIncome", 0);
  setAnimatedValue("flowExpense", 0);
  setAnimatedValue("flowNet", 0);
  elements.flowTimeline.innerHTML = '<div class="empty-state">Flow bulanan akan tampil setelah data transaksi tersedia.</div>';
  elements.cashflowChart.innerHTML = '<div class="empty-state">Masuk untuk melihat arus kas bulanan.</div>';
  elements.categoryChart.innerHTML = '<div class="empty-state">Masuk untuk melihat komposisi pengeluaran.</div>';
  elements.insightList.innerHTML = '<div class="empty-state">Insight akan tampil setelah data akun berhasil dimuat.</div>';
  elements.transactionTableBody.innerHTML = `
    <tr>
      <td colspan="6">
        <div class="empty-state">Belum ada transaksi untuk ditampilkan.</div>
      </td>
    </tr>
  `;
  renderTelegramStatus();
}

function computeInsights(summary) {
  if (!summary) {
    return [];
  }

  const insights = [];

  if (summary.topExpenseCategory) {
    insights.push({
      title: "Kategori terberat",
      text: `${summary.topExpenseCategory.category} menyerap ${formatPercent(summary.topExpenseCategory.share)} dari total pengeluaran.`
    });
  }

  if (summary.savingsRate < 20) {
    insights.push({
      title: "Rasio tabungan rendah",
      text: `Rasio tabungan baru ${formatPercent(summary.savingsRate)}. Perlu batas mingguan untuk belanja fleksibel.`
    });
  } else {
    insights.push({
      title: "Arus kas sehat",
      text: `Rasio tabungan ${formatPercent(summary.savingsRate)} menandakan ruang tabung masih cukup aman.`
    });
  }

  if (summary.biggestExpense) {
    insights.push({
      title: "Transaksi terbesar",
      text: `${summary.biggestExpense.description} bernilai ${formatCurrency(summary.biggestExpense.amount)} pada ${formatDate(summary.biggestExpense.date)}.`
    });
  }

  const latestMonth = summary.monthlyCashflow[summary.monthlyCashflow.length - 1];
  if (latestMonth) {
    insights.push({
      title: "Bulan terakhir",
      text: `${formatMonth(latestMonth.month)} mencatat net ${formatCurrency(latestMonth.net)} dari pemasukan ${formatCurrency(latestMonth.income)}.`
    });
  }

  return insights.slice(0, 4);
}

function renderSummary() {
  const summary = state.summary;
  if (!summary) {
    clearDashboard();
    return;
  }

  const previousBalance = getAnimatedValue("balance");
  const previousIncome = getAnimatedValue("income");
  const previousExpense = getAnimatedValue("expense");
  const previousSavings = getAnimatedValue("savingsRate");

  animateValue("balance", summary.balance, (value) => {
    elements.balanceValue.textContent = formatCurrency(value);
  });
  animateValue("income", summary.totalIncome, (value) => {
    elements.incomeValue.textContent = formatCurrency(value);
  });
  animateValue("expense", summary.totalExpense, (value) => {
    elements.expenseValue.textContent = formatCurrency(value);
  });
  animateValue("savingsRate", summary.savingsRate, (value) => {
    elements.savingsValue.textContent = formatPercent(value);
  });

  if (previousBalance !== null && Number(summary.balance) !== previousBalance) {
    pulseElement(elements.balanceValue.closest(".metric"), Number(summary.balance) > previousBalance ? "up" : "down");
  }

  if (previousIncome !== null && Number(summary.totalIncome) !== previousIncome) {
    pulseElement(
      elements.incomeValue.closest(".metric"),
      Number(summary.totalIncome) > previousIncome ? "up" : "down"
    );
  }

  if (previousExpense !== null && Number(summary.totalExpense) !== previousExpense) {
    pulseElement(
      elements.expenseValue.closest(".metric"),
      Number(summary.totalExpense) > previousExpense ? "up" : "down"
    );
  }

  if (previousSavings !== null && Number(summary.savingsRate) !== previousSavings) {
    pulseElement(
      elements.savingsValue.closest(".metric"),
      Number(summary.savingsRate) > previousSavings ? "up" : "down"
    );
  }

  elements.balanceFoot.textContent = `${summary.transactionCount} transaksi tercatat`;
  elements.incomeFoot.textContent = `${summary.incomeCategories.length} kategori income`;
  elements.expenseFoot.textContent = `${summary.expenseCategories.length} kategori expense`;
  elements.savingsFoot.textContent = summary.savingsRate >= 20 ? "Tabungan relatif sehat" : "Masih bisa dioptimalkan";

  elements.heroSummaryText.textContent = summary.topExpenseCategory
    ? `Saldo saat ini ${formatCurrency(summary.balance)}. Pengeluaran terbesar ada di ${summary.topExpenseCategory.category}.`
    : `Saldo saat ini ${formatCurrency(summary.balance)}. Tambahkan transaksi untuk memperkaya analisis.`;

  renderFlowStats(summary);
}

function renderFlowStats(summary) {
  if (!summary) {
    return;
  }

  const income = Number(summary.totalIncome) || 0;
  const expense = Number(summary.totalExpense) || 0;
  const balance = Number(summary.balance) || 0;
  const previousFlowIncome = getAnimatedValue("flowIncome");
  const previousFlowExpense = getAnimatedValue("flowExpense");
  const previousFlowNet = getAnimatedValue("flowNet");
  const throughput = Math.max(income + expense, 1);
  const balanceMagnitude = Math.max(Math.abs(balance), 1);

  const incomeShare = (income / throughput) * 100;
  const expenseShare = (expense / throughput) * 100;
  const balanceShare = Math.min((balanceMagnitude / throughput) * 100, 100);

  animateValue("flowIncome", income, (value) => {
    elements.flowIncomeValue.textContent = formatCurrency(value);
  });
  animateValue("flowExpense", expense, (value) => {
    elements.flowExpenseValue.textContent = formatCurrency(value);
  });
  animateValue("flowNet", balance, (value) => {
    elements.flowNetValue.textContent = formatSignedCurrency(value);
  });

  if (previousFlowIncome !== null && income !== previousFlowIncome) {
    pulseElement(
      elements.flowIncomeValue.closest(".flow-step"),
      income > previousFlowIncome ? "up" : "down"
    );
  }

  if (previousFlowExpense !== null && expense !== previousFlowExpense) {
    pulseElement(
      elements.flowExpenseValue.closest(".flow-step"),
      expense > previousFlowExpense ? "up" : "down"
    );
  }

  if (previousFlowNet !== null && balance !== previousFlowNet) {
    pulseElement(
      elements.flowNetValue.closest(".flow-step"),
      balance > previousFlowNet ? "up" : "down"
    );
  }
  elements.flowIncomeMeta.textContent = `${formatPercent(incomeShare)} dari total arus kas`;
  elements.flowExpenseMeta.textContent = `${formatPercent(expenseShare)} dari total arus kas`;
  elements.flowNetMeta.textContent =
    balance >= 0
      ? `Surplus ${formatCurrency(balance)} pada periode berjalan`
      : `Defisit ${formatCurrency(Math.abs(balance))} pada periode berjalan`;

  elements.flowIncomeBar.style.width = `${Math.max(incomeShare, income > 0 ? 8 : 0)}%`;
  elements.flowExpenseBar.style.width = `${Math.max(expenseShare, expense > 0 ? 8 : 0)}%`;
  elements.flowNetBar.style.width = `${Math.max(balanceShare, balance !== 0 ? 8 : 0)}%`;
  elements.flowNetBar.classList.toggle("is-negative", balance < 0);

  elements.flowTimeline.innerHTML = "";
  const monthly = (summary.monthlyCashflow || []).slice(-6);
  if (monthly.length === 0) {
    elements.flowTimeline.innerHTML = '<div class="empty-state">Flow bulanan akan tampil setelah data transaksi tersedia.</div>';
    return;
  }

  monthly.forEach((entry) => {
    const node = document.createElement("article");
    const net = Number(entry.net) || 0;
    const trendClass = net >= 0 ? "up" : "down";
    const trendLabel = net >= 0 ? "Surplus" : "Defisit";
    node.className = `flow-node ${trendClass}`;
    node.innerHTML = `
      <span class="flow-node-month">${formatMonth(entry.month)}</span>
      <strong class="flow-node-net">${formatSignedCurrency(net)}</strong>
      <small class="flow-node-detail">${trendLabel} dari ${formatCurrency(entry.income)} vs ${formatCurrency(entry.expense)}</small>
    `;
    elements.flowTimeline.appendChild(node);
  });
}

function renderCashflowChart() {
  const data = state.summary?.monthlyCashflow || [];
  elements.cashflowChart.innerHTML = "";

  if (data.length === 0) {
    elements.cashflowChart.innerHTML = '<div class="empty-state">Belum ada arus kas bulanan untuk ditampilkan.</div>';
    return;
  }

  const maxValue = Math.max(...data.map((entry) => Math.max(Math.abs(entry.net), entry.income, entry.expense)), 1);

  data.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "chart-row";
    row.innerHTML = `
      <div class="chart-head">
        <strong>${formatMonth(entry.month)}</strong>
        <span>Net ${formatCurrency(entry.net)}</span>
      </div>
      <div class="chart-track">
        <div class="chart-fill cashflow-fill" style="width:${Math.max((Math.abs(entry.net) / maxValue) * 100, 6)}%"></div>
      </div>
      <small>Pemasukan ${formatCurrency(entry.income)} - Pengeluaran ${formatCurrency(entry.expense)}</small>
    `;
    elements.cashflowChart.appendChild(row);
  });
}

function renderCategoryChart() {
  const data = state.summary?.expenseCategories || [];
  elements.categoryChart.innerHTML = "";

  if (data.length === 0) {
    elements.categoryChart.innerHTML = '<div class="empty-state">Belum ada kategori pengeluaran untuk ditampilkan.</div>';
    return;
  }

  const maxValue = Math.max(...data.map((entry) => entry.amount), 1);

  data.slice(0, 6).forEach((entry) => {
    const row = document.createElement("div");
    row.className = "chart-row";
    row.innerHTML = `
      <div class="chart-head">
        <strong>${escapeHTML(entry.category)}</strong>
        <span>${formatCurrency(entry.amount)} - ${formatPercent(entry.share)}</span>
      </div>
      <div class="chart-track">
        <div class="chart-fill" style="width:${Math.max((entry.amount / maxValue) * 100, 10)}%"></div>
      </div>
    `;
    elements.categoryChart.appendChild(row);
  });
}

function getFilteredTransactions() {
  const query = elements.searchInput.value.trim().toLowerCase();
  const type = elements.typeFilter.value;

  return state.transactions.filter((item) => {
    const haystack = `${item.description} ${item.category} ${item.notes || ""}`.toLowerCase();
    return (type === "all" || item.type === type) && (!query || haystack.includes(query));
  });
}

function renderTransactions() {
  const rows = getFilteredTransactions();
  elements.transactionTableBody.innerHTML = "";

  if (rows.length === 0) {
    elements.transactionTableBody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">Belum ada transaksi yang cocok dengan filter saat ini.</div>
        </td>
      </tr>
    `;
    return;
  }

  rows.forEach((item) => {
    const row = document.createElement("tr");
    row.className = "transaction-row";
    const receiptThumb = item.receiptPath
      ? `
        <a class="receipt-thumb-link" href="${escapeHTML(getTransactionReceiptUrl(item.id))}" target="_blank" rel="noreferrer" aria-label="Buka struk untuk ${escapeHTML(item.description)}">
          <img
            class="receipt-thumb-image"
            src="${escapeHTML(getTransactionReceiptUrl(item.id))}"
            alt="Thumbnail struk ${escapeHTML(item.description)}"
            loading="lazy"
          />
        </a>
      `
      : "";
    const receiptAction = item.receiptPath
      ? `<a class="receipt-link" href="${escapeHTML(getTransactionReceiptUrl(item.id))}" target="_blank" rel="noreferrer">Struk</a>`
      : "";
    row.innerHTML = `
      <td data-label="Tanggal">${formatDate(item.date)}</td>
      <td data-label="Deskripsi">
        <div class="transaction-description">
          ${receiptThumb}
          <div class="transaction-description-copy">
            <strong class="transaction-description-title">${escapeHTML(item.description)}</strong>
            ${
              item.notes
                ? `<span class="transaction-description-notes">${escapeHTML(item.notes)}</span>`
                : `<span class="transaction-description-notes is-muted">Tanpa catatan tambahan</span>`
            }
          </div>
        </div>
      </td>
      <td data-label="Kategori">${escapeHTML(item.category)}</td>
      <td data-label="Tipe"><span class="type-pill ${item.type}">${item.type === "income" ? "Pemasukan" : "Pengeluaran"}</span></td>
      <td data-label="Nominal" class="amount ${item.type}">${item.type === "income" ? "+" : "-"}${formatCurrency(item.amount)}</td>
      <td data-label="Aksi">
        <div class="table-actions">
          ${receiptAction}
          <button class="edit-button" data-id="${item.id}" type="button">Edit</button>
          <button class="delete-button" data-id="${item.id}" type="button">Hapus</button>
        </div>
      </td>
    `;
    elements.transactionTableBody.appendChild(row);
  });
}

function renderInsights() {
  const items = computeInsights(state.summary);
  elements.insightList.innerHTML = "";

  if (items.length === 0) {
    elements.insightList.innerHTML = '<div class="empty-state">Insight akan muncul setelah ada transaksi.</div>';
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "insight-item";
    card.innerHTML = `<strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.text)}</span>`;
    elements.insightList.appendChild(card);
  });
}

function appendChatMessage(role, content) {
  const fragment = elements.chatTemplate.content.cloneNode(true);
  const bubble = fragment.querySelector(".chat-bubble");
  const roleLabel = fragment.querySelector(".chat-role");
  const text = fragment.querySelector(".chat-text");

  bubble.classList.add(role);
  roleLabel.textContent = role === "assistant" ? "Asisten" : "Anda";
  text.textContent = content;
  elements.chatMessages.appendChild(fragment);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function resetChat() {
  elements.chatMessages.innerHTML = "";
  state.chatHistory = [];

  const intro = state.user
    ? `Halo ${state.user.name}, saya siap membantu menganalisis kondisi keuangan akun Anda.`
    : "Silakan masuk terlebih dahulu agar saya dapat membaca data keuangan akun Anda.";

  appendChatMessage("assistant", intro);
  state.chatHistory.push({ role: "assistant", content: intro });
}

function handleUnauthorized(error) {
  if (error?.status !== 401) {
    return false;
  }

  state.user = null;
  resetTransactionForm();
  renderSession();
  clearDashboard();
  resetChat();
  showAuthGate("Sesi Anda berakhir. Silakan masuk kembali.");
  return true;
}

async function loadHealth() {
  state.health = await request("/api/health");
  renderHealth();
}

async function reloadDashboard() {
  const [transactionsData, summaryData, telegramData] = await Promise.all([
    request("/api/transactions"),
    request("/api/summary"),
    request("/api/telegram/status")
  ]);
  state.transactions = transactionsData.transactions;
  state.summary = summaryData.summary;
  state.telegramStatus = telegramData;
  state.telegramCommand = null;
  renderSummary();
  renderCashflowChart();
  renderCategoryChart();
  renderTransactions();
  renderInsights();
  renderTelegramStatus();
}

async function loadSession() {
  try {
    const payload = await request("/api/auth/me");
    state.user = payload.user;
    renderSession();
    hideAuthGate();
    resetChat();
    await reloadDashboard();
  } catch (error) {
    if (handleUnauthorized(error)) {
      return;
    }

    throw error;
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  const button = elements.authSubmitButton;
  const payload = {
    email: elements.authEmail.value.trim(),
    name: elements.authName.value.trim(),
    password: elements.authPassword.value
  };

  try {
    button.disabled = true;
    button.textContent = state.authMode === "register" ? "Mendaftarkan..." : "Memproses...";

    const result = await request(`/api/auth/${state.authMode}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    state.user = result.user;
    renderSession();
    hideAuthGate();
    elements.authForm.reset();
    resetTransactionForm();
    resetChat();
    await reloadDashboard();
  } catch (error) {
    elements.authMessage.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = state.authMode === "register" ? "Daftar Akun" : "Masuk";
  }
}

async function handleLogout() {
  try {
    await request("/api/auth/logout", { method: "POST" });
  } catch (error) {
    if (!handleUnauthorized(error)) {
      window.alert(error.message);
    }
  } finally {
    state.user = null;
    resetTransactionForm();
    resetImportState();
    if (elements.importFileInput) {
      elements.importFileInput.value = "";
    }
    renderSession();
    clearDashboard();
    resetChat();
    setAuthMode("login");
    showAuthGate("Anda sudah logout.");
  }
}

async function handleGenerateTelegramLinkCode() {
  if (!state.user) {
    showAuthGate("Silakan masuk sebelum menghubungkan Telegram.");
    return;
  }

  try {
    const payload = await request("/api/telegram/link-code", { method: "POST" });
    state.telegramStatus = payload;
    state.telegramCommand = payload.linkCode || payload.command || null;
    renderTelegramStatus();
  } catch (error) {
    if (!handleUnauthorized(error)) {
      window.alert(error.message);
    }
  }
}

async function handleTelegramUnlink() {
  if (!state.user) {
    showAuthGate("Silakan masuk sebelum mengubah koneksi Telegram.");
    return;
  }

  if (!window.confirm("Putuskan koneksi Telegram dari akun ini?")) {
    return;
  }

  try {
    const payload = await request("/api/telegram/unlink", { method: "POST" });
    state.telegramStatus = payload;
    state.telegramCommand = null;
    renderTelegramStatus();
  } catch (error) {
    if (!handleUnauthorized(error)) {
      window.alert(error.message);
    }
  }
}

async function handleTransactionSubmit(event) {
  event.preventDefault();
  if (!state.user) {
    showAuthGate("Silakan masuk sebelum menambah transaksi.");
    return;
  }

  const payload = buildTransactionPayload();
  const button = elements.transactionSubmitButton;
  const isEditing = Boolean(state.editingTransactionId);
  const requestPath = isEditing ? `/api/transactions/${state.editingTransactionId}` : "/api/transactions";
  const requestMethod = isEditing ? "PUT" : "POST";

  try {
    button.disabled = true;
    button.textContent = isEditing ? "Menyimpan perubahan..." : "Menyimpan...";
    elements.transactionCancelButton.disabled = true;

    await request(requestPath, {
      method: requestMethod,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    resetTransactionForm();
    await reloadDashboard();

    const note = isEditing
      ? "Transaksi berhasil diperbarui. Ringkasan keuangan sudah disesuaikan dengan data terbaru."
      : "Transaksi baru berhasil disimpan. Saya siap membantu menganalisis dampaknya terhadap arus kas Anda.";
    appendChatMessage("assistant", note);
    state.chatHistory.push({ role: "assistant", content: note });
  } catch (error) {
    if (!handleUnauthorized(error)) {
      window.alert(error.message);
    }
  } finally {
    button.disabled = false;
    elements.transactionCancelButton.disabled = false;
    setTransactionFormMode(Boolean(state.editingTransactionId));
  }
}

async function handleImportSubmit(event) {
  event.preventDefault();
  if (!state.user) {
    showAuthGate("Silakan masuk sebelum import transaksi.");
    return;
  }

  const preview = state.csvImport?.preview || buildImportPreviewData();
  if (!preview || preview.validRows.length === 0) {
    setImportMessage("Belum ada baris valid untuk diimport. Cek mapping kolom lalu lihat preview.", "error");
    return;
  }

  try {
    elements.importSubmitButton.disabled = true;
    elements.importPreviewButton.disabled = true;
    elements.importSubmitButton.textContent = "Mengimpor...";

    const payload = await request("/api/transactions/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        rows: preview.validRows,
        source: state.csvImport?.fileName || "import.csv"
      })
    });

    await reloadDashboard();
    resetImportState({ preserveMessage: true });
    elements.importFileInput.value = "";
    setImportMessage(payload.message, "success");

    appendChatMessage("assistant", payload.message);
    state.chatHistory.push({ role: "assistant", content: payload.message });
  } catch (error) {
    if (!handleUnauthorized(error)) {
      setImportMessage(error.message, "error");
    }
  } finally {
    elements.importSubmitButton.textContent = "Import ke transaksi";
    elements.importPreviewButton.disabled = !state.csvImport;
    elements.importSubmitButton.disabled = !(state.csvImport?.preview?.validRows?.length > 0);
  }
}

function handleEdit(event) {
  const button = event.target.closest(".edit-button");
  if (!button) {
    return;
  }

  const transaction = state.transactions.find((item) => item.id === button.dataset.id);
  populateTransactionForm(transaction);
}

async function handleDelete(event) {
  const button = event.target.closest(".delete-button");
  if (!button) {
    return;
  }

  if (!window.confirm("Hapus transaksi ini?")) {
    return;
  }

  try {
    await request(`/api/transactions/${button.dataset.id}`, { method: "DELETE" });
    if (state.editingTransactionId === button.dataset.id) {
      resetTransactionForm();
    }
    await reloadDashboard();
  } catch (error) {
    if (!handleUnauthorized(error)) {
      window.alert(error.message);
    }
  }
}

async function sendChatMessage(message) {
  if (!state.user) {
    showAuthGate("Silakan masuk sebelum menggunakan chatbot.");
    return;
  }

  appendChatMessage("user", message);
  state.chatHistory.push({ role: "user", content: message });

  const button = elements.chatForm.querySelector("button[type='submit']");

  try {
    button.disabled = true;
    button.textContent = "Mengirim...";

    const payload = await request("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        history: state.chatHistory.slice(-8),
        message
      })
    });

    if (state.health) {
      state.health.chatMode =
        payload.mode === "openai" ? "openai" : payload.mode === "local" ? "local" : "local-fallback";
      renderHealth();
    }

    appendChatMessage("assistant", payload.reply);
    state.chatHistory.push({ role: "assistant", content: payload.reply });

    if (payload.action === "transaction-created") {
      await reloadDashboard();
    }
  } catch (error) {
    if (handleUnauthorized(error)) {
      return;
    }

    const fallback = `Maaf, saya belum dapat memproses pesan Anda. ${error.message}`;
    appendChatMessage("assistant", fallback);
    state.chatHistory.push({ role: "assistant", content: fallback });
  } finally {
    button.disabled = false;
    button.textContent = "Kirim";
  }
}

async function handleChatSubmit(event) {
  event.preventDefault();
  const message = elements.chatInput.value.trim();
  if (!message) {
    return;
  }

  elements.chatInput.value = "";
  await sendChatMessage(message);
}

function bindEvents() {
  elements.loginTabButton.addEventListener("click", () => setAuthMode("login"));
  elements.registerTabButton.addEventListener("click", () => setAuthMode("register"));
  elements.authForm.addEventListener("submit", handleAuthSubmit);
  elements.importFileInput.addEventListener("change", handleImportFileChange);
  elements.importPresetSelect.addEventListener("change", handleImportPresetChange);
  elements.importPreviewButton.addEventListener("click", handleImportPreview);
  elements.importForm.addEventListener("submit", handleImportSubmit);
  Object.values(IMPORT_MAPPING_ELEMENTS).forEach((element) => {
    element.addEventListener("change", handleImportMappingChange);
  });
  elements.logoutButton.addEventListener("click", handleLogout);
  elements.telegramLinkButton.addEventListener("click", handleGenerateTelegramLinkCode);
  elements.telegramUnlinkButton.addEventListener("click", handleTelegramUnlink);
  elements.transactionForm.addEventListener("submit", handleTransactionSubmit);
  elements.transactionCancelButton.addEventListener("click", resetTransactionForm);
  elements.transactionForm.addEventListener("input", () => {
    renderTransactionReviewAssist();
  });
  elements.transactionForm.addEventListener("change", () => {
    renderTransactionReviewAssist();
  });
  elements.transactionModeScanButton.addEventListener("click", () => {
    setTransactionReceiptError("");
    state.transactionEntryMethod = "scan";
    showTransactionScanStage();
  });
  elements.transactionModeManualButton.addEventListener("click", () => {
    setTransactionReceiptError("");
    showTransactionReview({
      focusField: elements.transactionForm.elements.description,
      method: "manual"
    });
  });
  elements.transactionFlowBackButton.addEventListener("click", () => {
    if (state.transactionReviewVisited || state.editingTransactionId) {
      showTransactionReview({ method: state.transactionEntryMethod || "manual" });
      return;
    }

    showTransactionChooser();
  });
  elements.transactionScanReviewButton.addEventListener("click", () => {
    setTransactionReceiptError("");
    showTransactionReview({
      focusField: elements.transactionForm.elements.description,
      method: state.transactionEntryMethod || "scan"
    });
  });
  elements.transactionScanManualButton.addEventListener("click", () => {
    setTransactionReceiptError("");
    showTransactionReview({
      focusField: elements.transactionForm.elements.description,
      method: getActiveTransactionReceiptPreview() ? "scan" : "manual"
    });
  });
  elements.transactionReviewManageButton.addEventListener("click", () => {
    setTransactionReceiptError("");
    state.transactionEntryMethod = "scan";
    showTransactionScanStage();
  });
  elements.transactionReceiptCameraButton.addEventListener("click", () => {
    setTransactionReceiptError("");
    openTransactionReceiptPicker("camera");
  });
  elements.transactionReceiptGalleryButton.addEventListener("click", () => {
    setTransactionReceiptError("");
    openTransactionReceiptPicker("gallery");
  });
  elements.transactionOCRRetryButton.addEventListener("click", () => {
    handleTransactionReceiptAnalyze().catch((error) => {
      window.alert(error.message);
    });
  });
  elements.transactionOCRErrorManualButton.addEventListener("click", () => {
    setTransactionReceiptError("");
    showTransactionReview({
      focusField: elements.transactionForm.elements.description,
      method: getActiveTransactionReceiptPreview() ? "scan" : "manual"
    });
  });
  elements.transactionReceiptFile.addEventListener("change", (event) => {
    handleTransactionReceiptChange(event).catch((error) => {
      window.alert(error.message);
    });
  });
  elements.transactionReceiptCameraInput.addEventListener("change", (event) => {
    handleTransactionReceiptChange(event).catch((error) => {
      window.alert(error.message);
    });
  });
  elements.transactionReceiptAnalyzeButton.addEventListener("click", () => {
    handleTransactionReceiptAnalyze().catch((error) => {
      window.alert(error.message);
    });
  });
  elements.transactionReceiptRemoveButton.addEventListener("click", handleTransactionReceiptRemove);
  elements.transactionAmount.addEventListener("input", renderTransactionAmountHint);
  elements.transactionAmount.addEventListener("focus", handleTransactionAmountFocus);
  elements.transactionAmount.addEventListener("blur", handleTransactionAmountBlur);
  elements.transactionType.addEventListener("change", () => {
    syncTransactionCategoryOptions(elements.transactionCategory.value);
  });
  elements.transactionTableBody.addEventListener("click", (event) => {
    handleEdit(event);
    handleDelete(event);
  });
  elements.chatForm.addEventListener("submit", handleChatSubmit);
  elements.searchInput.addEventListener("input", renderTransactions);
  elements.typeFilter.addEventListener("change", renderTransactions);
  elements.quickPrompts.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-prompt]");
    if (!button) {
      return;
    }

    await sendChatMessage(button.dataset.prompt);
  });

  if (elements.compactModeButton) {
    elements.compactModeButton.addEventListener("click", () => {
      setCompactMode(!state.compactMode);
    });
  }
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch (error) {
    console.warn("Service worker registration failed:", error);
  }
}

async function initializeApp() {
  resetTransactionForm();
  resetImportState();
  setAuthMode("login");
  setCompactMode(loadCompactModePreference(), { persist: false });
  renderSession();
  clearDashboard();
  resetChat();
  bindEvents();
  await registerServiceWorker();

  try {
    await loadHealth();
    await loadSession();
  } catch (error) {
    elements.heroSummaryText.textContent = error.message;
    showAuthGate("Gagal memuat status aplikasi. Coba refresh halaman.");
  }
}

initializeApp();
