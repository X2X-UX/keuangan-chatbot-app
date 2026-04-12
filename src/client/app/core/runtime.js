const state = {
  authMode: "login",
  chatHistory: [],
  compactMode: false,
  csvImport: null,
  editingTransactionId: null,
  health: null,
  launchShortcut: null,
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

function getLaunchShortcutFromUrl() {
  if (typeof window === "undefined") {
    return null;
  }

  const url = new URL(window.location.href);
  const shortcut = url.searchParams.get("shortcut");

  if (shortcut === "scan-receipt") {
    return "scan";
  }

  if (shortcut === "manual-entry") {
    return "manual";
  }

  return null;
}

function clearLaunchShortcutFromUrl() {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  let hasChanges = false;

  if (url.searchParams.has("shortcut")) {
    url.searchParams.delete("shortcut");
    hasChanges = true;
  }

  if (!hasChanges) {
    return;
  }

  const nextSearch = url.searchParams.toString();
  const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash}`;
  window.history.replaceState({}, document.title, nextUrl);
}

const elements = {
  appShell: document.getElementById("appShell"),
  authEmail: document.getElementById("authEmail"),
  authForm: document.getElementById("authForm"),
  authGate: document.getElementById("authGate"),
  authMessage: document.getElementById("authMessage"),
  authName: document.getElementById("authName"),
  authPassword: document.getElementById("authPassword"),
  authPasswordToggle: document.getElementById("authPasswordToggle"),
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

