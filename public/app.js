// core/escape-html.js
function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

// core/runtime.js
const state = {
  authMode: "login",
  budgetMonth: "",
  chatHistory: [],
  compactMode: false,
  csvImport: null,
  editingTransactionId: null,
  health: null,
  launchShortcut: null,
  locale: "id",
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
const LOCALE_STORAGE_KEY = "arunika_locale";
const SUPPORTED_LOCALES = ["id", "en"];
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
    new Intl.NumberFormat(state.locale === "en" ? "en-US" : "id-ID", {
      currency: "IDR",
      maximumFractionDigits: 0,
      style: "currency"
    }).format(Number(value) || 0));
const animatedValues = new Map();
const prefersReducedMotion =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function getActiveLocale() {
  return SUPPORTED_LOCALES.includes(state.locale) ? state.locale : "id";
}

function getIntlLocale() {
  return getActiveLocale() === "en" ? "en-US" : "id-ID";
}

function createCurrencyFormatter() {
  return new Intl.NumberFormat(getIntlLocale(), {
    currency: "IDR",
    maximumFractionDigits: 0,
    style: "currency"
  });
}

function createPercentFormatter() {
  return new Intl.NumberFormat(getIntlLocale(), {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1
  });
}

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
  budgetAmount: document.getElementById("budgetAmount"),
  budgetAttentionPromptButton: document.getElementById("budgetAttentionPromptButton"),
  budgetCategory: document.getElementById("budgetCategory"),
  budgetCurrentMeta: document.getElementById("budgetCurrentMeta"),
  budgetForm: document.getElementById("budgetForm"),
  budgetList: document.getElementById("budgetList"),
  budgetMessage: document.getElementById("budgetMessage"),
  budgetMonthInput: document.getElementById("budgetMonthInput"),
  budgetMonthLabel: document.getElementById("budgetMonthLabel"),
  budgetOverviewText: document.getElementById("budgetOverviewText"),
  budgetOverviewValue: document.getElementById("budgetOverviewValue"),
  budgetSubmitButton: document.getElementById("budgetSubmitButton"),
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
  exportCsvButton: document.getElementById("exportCsvButton"),
  exportExcelButton: document.getElementById("exportExcelButton"),
  exportPdfButton: document.getElementById("exportPdfButton"),
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
  heroMetaText: document.getElementById("heroMetaText"),
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
  localeButtons: Array.from(document.querySelectorAll("[data-locale-button]")),
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

const I18N_MESSAGES = {
  id: {
    "auth.safeAccess": "Akses Aman",
    "auth.loginTab": "Login",
    "auth.registerTab": "Daftar",
    "auth.nameLabel": "Nama",
    "auth.namePlaceholder": "Nama lengkap",
    "auth.emailLabel": "Email",
    "auth.emailPlaceholder": "nama@email.com",
    "auth.passwordLabel": "Password",
    "auth.passwordPlaceholder": "Minimal 8 karakter",
    "auth.demoHint": "Akun demo: <strong>demo@arunika.local</strong> / <strong>demo12345</strong>",
    "auth.toggleShowPassword": "Tampilkan password",
    "auth.toggleHidePassword": "Sembunyikan password",
    "auth.title.login": "Masuk ke Arunika Finance",
    "auth.title.register": "Buat akun Arunika Finance",
    "auth.subtitle.login": "Masuk untuk mengakses dashboard keuangan pribadi. Data transaksi setiap akun dipisahkan otomatis di sistem.",
    "auth.subtitle.register": "Daftarkan akun baru untuk menyimpan transaksi Anda secara terpisah.",
    "auth.submit.login": "Masuk",
    "auth.submit.register": "Daftar Akun",
    "auth.status.loadingLogin": "Memverifikasi sesi aman...",
    "auth.status.loadingRegister": "Menyiapkan akun aman Anda...",
    "auth.status.successLogin": "Berhasil masuk.",
    "auth.status.successRegister": "Akun berhasil dibuat.",
    "auth.status.loggedOut": "Anda sudah logout.",
    "auth.status.sessionEnded": "Sesi Anda berakhir. Silakan masuk kembali.",
    "auth.error.invalidEmail": "Masukkan alamat email yang valid.",
    "auth.error.shortPassword": "Password minimal 8 karakter agar akun lebih aman.",
    "auth.error.shortName": "Nama minimal 2 karakter.",
    "hero.brandCaption": "Personal finance tracker",
    "hero.eyebrow": "Cashflow, Receipts, and Insights",
    "hero.lead": "Platform keuangan online untuk mencatat arus kas, menganalisis pola pengeluaran, dan berdiskusi dengan asisten keuangan berbasis data transaksi Anda.",
    "hero.highlightDashboard": "Dashboard real-time",
    "hero.highlightReceipt": "Scan struk berbasis AI",
    "hero.highlightInsight": "Insight cashflow personal",
    "session.logout": "Keluar",
    "session.guestName": "Belum masuk",
    "session.guestEmail": "Gunakan akun demo atau daftar akun baru.",
    "health.chatMode.local": "Chatbot lokal aktif",
    "health.chatMode.localFallback": "Mode fallback lokal",
    "health.chatMode.openai": "AI aktif - {model}",
    "health.chatMode.default": "Mode chatbot aktif",
    "health.appBase.ready": "deploy siap webhook",
    "health.appBase.missing": "APP_BASE_URL belum diisi",
    "health.telegram.ready": "Telegram siap",
    "health.telegram.missing": "Telegram belum aktif",
    "health.cookie.secure": "Cookie aman",
    "dashboard.summary.loadingSignedIn": "Memuat ringkasan keuangan terbaru.",
    "dashboard.summary.loadingSignedOut": "Masuk ke akun untuk memuat ringkasan keuangan terbaru.",
    "dashboard.meta.readyAfterSession": "Layanan siap dimuat setelah sesi akun tersedia.",
    "dashboard.meta.checking": "Memeriksa keamanan aplikasi dan kesiapan layanan...",
    "dashboard.waitTransactions": "Menunggu data transaksi",
    "dashboard.waitIncome": "Menunggu data pemasukan",
    "dashboard.waitExpense": "Menunggu data pengeluaran",
    "dashboard.waitNet": "Menunggu data neraca",
    "dashboard.insufficientData": "Belum cukup data",
    "dashboard.monthlyFlowEmpty": "Flow bulanan akan tampil setelah data transaksi tersedia.",
    "dashboard.cashflowSignin": "Masuk untuk melihat arus kas bulanan.",
    "dashboard.categorySignin": "Masuk untuk melihat komposisi pengeluaran.",
    "dashboard.insightSignin": "Insight akan tampil setelah data akun berhasil dimuat.",
    "dashboard.transactionsEmpty": "Belum ada transaksi untuk ditampilkan.",
    "export.csv": "Ekspor CSV",
    "export.excel": "Ekspor Excel",
    "export.pdf": "Ekspor PDF",
    "compactMode.enabled": "Mode Ringkas: Aktif",
    "compactMode.disabled": "Mode Ringkas: Nonaktif",
    "format.noMonth": "Tanpa bulan"
  },
  en: {
    "auth.safeAccess": "Secure Access",
    "auth.loginTab": "Sign In",
    "auth.registerTab": "Register",
    "auth.nameLabel": "Name",
    "auth.namePlaceholder": "Full name",
    "auth.emailLabel": "Email",
    "auth.emailPlaceholder": "name@email.com",
    "auth.passwordLabel": "Password",
    "auth.passwordPlaceholder": "Minimum 8 characters",
    "auth.demoHint": "Demo account: <strong>demo@arunika.local</strong> / <strong>demo12345</strong>",
    "auth.toggleShowPassword": "Show password",
    "auth.toggleHidePassword": "Hide password",
    "auth.title.login": "Sign in to Arunika Finance",
    "auth.title.register": "Create your Arunika Finance account",
    "auth.subtitle.login": "Sign in to access your personal finance dashboard. Transaction data is automatically isolated for each account.",
    "auth.subtitle.register": "Create a new account to keep your transactions securely separated.",
    "auth.submit.login": "Sign In",
    "auth.submit.register": "Create Account",
    "auth.status.loadingLogin": "Verifying your secure session...",
    "auth.status.loadingRegister": "Preparing your secure account...",
    "auth.status.successLogin": "Signed in successfully.",
    "auth.status.successRegister": "Account created successfully.",
    "auth.status.loggedOut": "You have signed out.",
    "auth.status.sessionEnded": "Your session has expired. Please sign in again.",
    "auth.error.invalidEmail": "Enter a valid email address.",
    "auth.error.shortPassword": "Use at least 8 characters for a stronger password.",
    "auth.error.shortName": "Name must be at least 2 characters.",
    "hero.brandCaption": "Personal finance tracker",
    "hero.eyebrow": "Cashflow, Receipts, and Insights",
    "hero.lead": "A personal finance platform for tracking cashflow, understanding spending patterns, and chatting with an assistant grounded in your transaction data.",
    "hero.highlightDashboard": "Real-time dashboard",
    "hero.highlightReceipt": "AI-powered receipt scan",
    "hero.highlightInsight": "Personal cashflow insights",
    "session.logout": "Sign Out",
    "session.guestName": "Not signed in",
    "session.guestEmail": "Use the demo account or create a new account.",
    "health.chatMode.local": "Local assistant active",
    "health.chatMode.localFallback": "Local fallback mode",
    "health.chatMode.openai": "AI active - {model}",
    "health.chatMode.default": "Assistant mode active",
    "health.appBase.ready": "webhook deployment ready",
    "health.appBase.missing": "APP_BASE_URL is not configured",
    "health.telegram.ready": "Telegram ready",
    "health.telegram.missing": "Telegram not configured",
    "health.cookie.secure": "Secure cookie policy",
    "dashboard.summary.loadingSignedIn": "Loading your latest finance summary.",
    "dashboard.summary.loadingSignedOut": "Sign in to load your latest finance summary.",
    "dashboard.meta.readyAfterSession": "Services are ready once an account session is available.",
    "dashboard.meta.checking": "Checking application security and service readiness...",
    "dashboard.waitTransactions": "Waiting for transaction data",
    "dashboard.waitIncome": "Waiting for income data",
    "dashboard.waitExpense": "Waiting for expense data",
    "dashboard.waitNet": "Waiting for balance data",
    "dashboard.insufficientData": "Not enough data yet",
    "dashboard.monthlyFlowEmpty": "Monthly flow will appear after transaction data is available.",
    "dashboard.cashflowSignin": "Sign in to view monthly cashflow.",
    "dashboard.categorySignin": "Sign in to view expense composition.",
    "dashboard.insightSignin": "Insights will appear after account data has loaded.",
    "dashboard.transactionsEmpty": "No transactions to display yet.",
    "export.csv": "Export CSV",
    "export.excel": "Export Excel",
    "export.pdf": "Export PDF",
    "compactMode.enabled": "Compact Mode: On",
    "compactMode.disabled": "Compact Mode: Off",
    "format.noMonth": "No month"
  }
};

function t(key, variables = {}) {
  const locale = getActiveLocale();
  const template = I18N_MESSAGES[locale]?.[key] || I18N_MESSAGES.id?.[key] || key;
  return template.replace(/\{(\w+)\}/g, (_, token) => String(variables[token] ?? ""));
}

function applyStaticTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
  });

  document.querySelectorAll("[data-i18n-title]").forEach((element) => {
    element.setAttribute("title", t(element.dataset.i18nTitle));
  });

  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  });

  document.querySelectorAll("[data-i18n-html]").forEach((element) => {
    element.innerHTML = t(element.dataset.i18nHtml);
  });
}

function renderLocaleButtons() {
  elements.localeButtons.forEach((button) => {
    const isActive = button.dataset.localeValue === getActiveLocale();
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function shouldDefaultLocale() {
  if (typeof navigator === "undefined") {
    return "id";
  }

  return String(navigator.language || "").toLowerCase().startsWith("en") ? "en" : "id";
}

function loadLocalePreference() {
  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (SUPPORTED_LOCALES.includes(saved)) {
      return saved;
    }
  } catch {
    // ignore storage errors
  }

  return shouldDefaultLocale();
}

function rerenderLocaleAwareUI() {
  if (typeof renderAuthModeCopy === "function") {
    renderAuthModeCopy();
  }

  if (typeof setAuthPasswordVisibility === "function" && elements.authPassword) {
    setAuthPasswordVisibility(elements.authPassword.type === "text");
  }

  if (typeof renderSession === "function") {
    renderSession();
  }

  if (state.summary) {
    if (typeof renderSummary === "function") renderSummary();
    if (typeof renderCashflowChart === "function") renderCashflowChart();
    if (typeof renderCategoryChart === "function") renderCategoryChart();
    if (typeof renderBudgetSummary === "function") renderBudgetSummary();
    if (typeof renderBudgetFormOptions === "function") renderBudgetFormOptions();
    if (typeof renderTransactions === "function") renderTransactions();
    if (typeof renderInsights === "function") renderInsights();
  } else if (typeof clearDashboard === "function") {
    clearDashboard();
  }

  if (state.health && typeof renderHealth === "function") {
    renderHealth();
  }

  if (typeof renderTelegramStatus === "function") {
    renderTelegramStatus();
  }

  if (typeof renderTransactionAmountHint === "function" && elements.transactionAmount) {
    renderTransactionAmountHint();
  }
}

function setLocale(locale, options = {}) {
  const persist = options.persist !== false;
  state.locale = SUPPORTED_LOCALES.includes(locale) ? locale : "id";
  document.documentElement.lang = state.locale;
  document.documentElement.setAttribute("data-locale", state.locale);
  applyStaticTranslations();
  renderLocaleButtons();

  if (persist) {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, state.locale);
    } catch {
      // ignore storage errors
    }
  }

  if (options.rerender !== false) {
    rerenderLocaleAwareUI();
  }
}

function formatCurrency(value) {
  return createCurrencyFormatter().format(Number(value) || 0);
}

function formatPercent(value) {
  return `${createPercentFormatter().format(Number(value) || 0)}%`;
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
    elements.compactModeButton.textContent = state.compactMode ? t("compactMode.enabled") : t("compactMode.disabled");
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
  return new Intl.DateTimeFormat(getIntlLocale(), {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function formatMonth(monthKey) {
  if (!monthKey) {
    return t("format.noMonth");
  }

  const [year, month] = monthKey.split("-");
  return new Intl.DateTimeFormat(getIntlLocale(), {
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

// render/app-shell.js
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options.headers || {})
      }
    });
  } catch {
    const error = new Error(
      getActiveLocale() === "en"
        ? "The network is currently unavailable. Check your connection and try again."
        : "Jaringan sedang bermasalah. Periksa koneksi Anda lalu coba lagi."
    );
    error.status = 0;
    throw error;
  }

  const raw = await response.text();
  let payload = {};
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { message: raw };
    }
  }

  if (!response.ok) {
    const error = new Error(
      payload.error ||
        payload.message ||
        (getActiveLocale() === "en"
          ? "An error occurred while processing the request."
          : "Terjadi kesalahan saat memproses permintaan.")
    );
    error.status = response.status;
    throw error;
  }

  return payload;
}

function renderAuthModeCopy() {
  const isRegister = state.authMode === "register";
  elements.authTitle.textContent = isRegister ? t("auth.title.register") : t("auth.title.login");
  elements.authSubtitle.textContent = isRegister ? t("auth.subtitle.register") : t("auth.subtitle.login");
  elements.authSubmitButton.textContent = isRegister ? t("auth.submit.register") : t("auth.submit.login");
}

function showAuthGate(message = "") {
  elements.authGate.classList.remove("is-hidden");
  elements.appShell.classList.add("is-locked");
  setAuthMessage(message, message ? "info" : "default");
  const focusTarget = state.authMode === "register" ? elements.authName : elements.authEmail;
  if (focusTarget && typeof focusTarget.focus === "function") {
    window.requestAnimationFrame(() => {
      focusTarget.focus();
      focusTarget.select?.();
    });
  }
}

function hideAuthGate() {
  elements.authGate.classList.add("is-hidden");
  elements.appShell.classList.remove("is-locked");
  setAuthMessage("");
}

function setAuthMessage(message = "", tone = "default") {
  elements.authMessage.textContent = message;
  elements.authMessage.classList.toggle("is-info", tone === "info");
  elements.authMessage.classList.toggle("is-success", tone === "success");
}

function setAuthMode(mode) {
  state.authMode = mode;
  const isRegister = mode === "register";

  elements.loginTabButton.classList.toggle("is-active", !isRegister);
  elements.registerTabButton.classList.toggle("is-active", isRegister);
  elements.nameField.classList.toggle("is-hidden", !isRegister);
  elements.authName.required = isRegister;
  renderAuthModeCopy();
  elements.authPassword.autocomplete = isRegister ? "new-password" : "current-password";
  setAuthMessage("");
  setAuthPasswordVisibility(false);
}

function setAuthPasswordVisibility(visible) {
  const isVisible = visible === true;
  elements.authPassword.type = isVisible ? "text" : "password";

  if (!elements.authPasswordToggle) {
    return;
  }

  elements.authPasswordToggle.classList.toggle("is-visible", isVisible);
  elements.authPasswordToggle.setAttribute("aria-pressed", isVisible ? "true" : "false");
  const toggleLabel = isVisible ? t("auth.toggleHidePassword") : t("auth.toggleShowPassword");
  elements.authPasswordToggle.setAttribute("aria-label", toggleLabel);
  elements.authPasswordToggle.setAttribute("title", toggleLabel);
}

function handleAuthPasswordToggle() {
  setAuthPasswordVisibility(elements.authPassword.type === "password");
}

function renderSession() {
  if (state.user) {
    elements.sessionName.textContent = state.user.name;
    elements.sessionEmail.textContent = state.user.email;
    elements.logoutButton.classList.remove("is-hidden");
    return;
  }

  elements.sessionName.textContent = t("session.guestName");
  elements.sessionEmail.textContent = t("session.guestEmail");
  elements.logoutButton.classList.add("is-hidden");
}

function renderHealth() {
  if (!state.health) {
    return;
  }

  const labels = {
    local: t("health.chatMode.local"),
    "local-fallback": t("health.chatMode.localFallback"),
    openai: t("health.chatMode.openai", { model: state.health.model })
  };

  elements.chatModeChip.textContent = labels[state.health.chatMode] || t("health.chatMode.default");
  const config = state.health.config || {};
  const appBaseLabel = config.appBaseUrlConfigured ? t("health.appBase.ready") : t("health.appBase.missing");
  const telegramLabel = state.health.telegramConfigured ? t("health.telegram.ready") : t("health.telegram.missing");
  const cookieLabel = config.sameSite ? `Cookie ${config.sameSite}` : t("health.cookie.secure");
  elements.heroMetaText.textContent = `${telegramLabel} • ${appBaseLabel} • ${cookieLabel}`;
}

function renderTelegramStatus() {
  if (!state.user) {
    elements.telegramStatusText.textContent =
      getActiveLocale() === "en"
        ? "Sign in to view your Telegram connection status."
        : "Masuk untuk melihat status koneksi Telegram.";
    elements.telegramLinkButton.disabled = true;
    elements.telegramUnlinkButton.classList.add("is-hidden");
    elements.telegramCodeBox.classList.add("is-hidden");
    return;
  }

  if (!state.telegramStatus) {
    elements.telegramStatusText.textContent =
      getActiveLocale() === "en" ? "Loading Telegram status..." : "Memuat status Telegram...";
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
      getActiveLocale() === "en"
        ? "Telegram is not configured on the server yet. Set TELEGRAM_BOT_TOKEN after deployment."
        : "Telegram belum dikonfigurasi di server. Isi TELEGRAM_BOT_TOKEN setelah aplikasi dihosting.";
    elements.telegramCodeBox.classList.add("is-hidden");
    return;
  }

  if (!status.webhookReady) {
    elements.telegramStatusText.textContent =
      getActiveLocale() === "en"
        ? "The bot is ready, but APP_BASE_URL is missing. The Telegram webhook cannot be registered yet."
        : "Bot siap, tapi APP_BASE_URL belum diisi. Webhook Telegram belum bisa didaftarkan.";
  } else if (status.linked && status.link) {
    const handle = status.link.username ? `@${status.link.username}` : `chat ${status.link.chatId}`;
    elements.telegramStatusText.textContent =
      getActiveLocale() === "en" ? `Telegram is connected to ${handle}.` : `Telegram sudah terhubung ke ${handle}.`;
  } else {
    const botHint = status.botUrl
      ? getActiveLocale() === "en"
        ? ` Open bot: ${status.botUrl}`
        : ` Buka bot: ${status.botUrl}`
      : "";
    elements.telegramStatusText.textContent =
      getActiveLocale() === "en"
        ? `The bot is ready to be linked. Paste the dashboard link code into the bot chat.${botHint}`
        : `Bot siap dihubungkan. Tempel kode tautan dari dashboard ke chat bot.${botHint}`;
  }

  if (state.telegramCommand) {
    elements.telegramCodeText.textContent = state.telegramCommand;
    elements.telegramCodeMeta.textContent =
      getActiveLocale() === "en"
        ? "Send this code exactly as shown to the Telegram bot. The bot will process it through text parsing. The code is valid for 10 minutes."
        : "Kirim kode ini apa adanya ke bot Telegram. Bot akan memprosesnya lewat parsing teks. Kode berlaku 10 menit.";
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
  elements.balanceFoot.textContent = t("dashboard.waitTransactions");
  elements.incomeFoot.textContent = getActiveLocale() === "en" ? "0 income categories" : "0 kategori income";
  elements.expenseFoot.textContent = getActiveLocale() === "en" ? "0 expense categories" : "0 kategori expense";
  elements.savingsFoot.textContent = t("dashboard.insufficientData");
  elements.heroSummaryText.textContent = state.user
    ? t("dashboard.summary.loadingSignedIn")
    : t("dashboard.summary.loadingSignedOut");
  elements.heroMetaText.textContent = state.health
    ? t("dashboard.meta.readyAfterSession")
    : t("dashboard.meta.checking");
  elements.flowIncomeValue.textContent = "Rp0";
  elements.flowExpenseValue.textContent = "Rp0";
  elements.flowNetValue.textContent = "Rp0";
  elements.flowIncomeMeta.textContent = t("dashboard.waitIncome");
  elements.flowExpenseMeta.textContent = t("dashboard.waitExpense");
  elements.flowNetMeta.textContent = t("dashboard.waitNet");
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
  elements.flowTimeline.innerHTML = `<div class="empty-state">${t("dashboard.monthlyFlowEmpty")}</div>`;
  elements.cashflowChart.innerHTML = `<div class="empty-state">${t("dashboard.cashflowSignin")}</div>`;
  elements.categoryChart.innerHTML = `<div class="empty-state">${t("dashboard.categorySignin")}</div>`;
  if (elements.budgetOverviewValue) {
    elements.budgetOverviewValue.textContent = "Rp0";
  }
  if (elements.budgetMonthLabel) {
    elements.budgetMonthLabel.textContent = state.user
      ? formatMonth(todayInputValue().slice(0, 7))
      : getActiveLocale() === "en"
        ? "Active month"
        : "Bulan aktif";
  }
  if (elements.budgetOverviewText) {
    elements.budgetOverviewText.textContent = state.user
      ? getActiveLocale() === "en"
        ? "Set a monthly expense budget for each category you want to track."
        : "Atur budget pengeluaran bulanan per kategori yang ingin dipantau."
      : getActiveLocale() === "en"
        ? "Sign in to start managing monthly expense budgets."
        : "Login untuk mulai mengatur budget pengeluaran bulanan.";
  }
  if (elements.budgetAmount) {
    elements.budgetAmount.value = "";
  }
  if (elements.budgetMonthInput) {
    elements.budgetMonthInput.value = state.budgetMonth || todayInputValue().slice(0, 7);
    elements.budgetMonthInput.disabled = !state.user;
  }
  if (elements.budgetCurrentMeta) {
    elements.budgetCurrentMeta.textContent = state.user
      ? getActiveLocale() === "en"
        ? "No budget has been set for this category in the active month yet."
        : "Belum ada budget untuk kategori ini pada bulan aktif."
      : getActiveLocale() === "en"
        ? "Sign in to see the active category budget."
        : "Login untuk melihat budget kategori aktif.";
  }
  if (elements.budgetList) {
    elements.budgetList.innerHTML = `<div class="empty-state">${
      state.user
        ? getActiveLocale() === "en"
          ? "No category budget has been configured yet."
          : "Belum ada budget kategori yang dikonfigurasi."
        : getActiveLocale() === "en"
          ? "Sign in to monitor monthly category budgets."
          : "Login untuk memantau budget kategori bulanan."
    }</div>`;
  }
  if (elements.budgetSubmitButton) {
    elements.budgetSubmitButton.disabled = !state.user;
  }
  if (typeof renderBudgetFormOptions === "function") {
    renderBudgetFormOptions();
  }
  if (typeof setBudgetMessage === "function") {
    setBudgetMessage("");
  }
  elements.insightList.innerHTML = `<div class="empty-state">${t("dashboard.insightSignin")}</div>`;
  elements.transactionTableBody.innerHTML = `
    <tr>
      <td colspan="6">
        <div class="empty-state">${t("dashboard.transactionsEmpty")}</div>
      </td>
    </tr>
  `;
  renderTelegramStatus();
}

// render/chat.js
function appendChatMessage(role, content) {
  const fragment = elements.chatTemplate.content.cloneNode(true);
  const bubble = fragment.querySelector(".chat-bubble");
  const roleLabel = fragment.querySelector(".chat-role");
  const text = fragment.querySelector(".chat-text");

  bubble.classList.add(role);
  bubble.classList.add(role === "assistant" ? "tw-chat-bubble-assistant" : "tw-chat-bubble-user");
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

// render/dashboard.js
function computeInsights(summary) {
  if (!summary) {
    return [];
  }

  const insights = [];
  const budgetOverview = summary.budgetOverview || null;

  if (budgetOverview?.budgetCount) {
    insights.push(
      budgetOverview.warningCount
        ? {
            title: "Budget perlu perhatian",
            text: `${budgetOverview.warningCount} kategori mendekati atau melewati limit dari total ${budgetOverview.budgetCount} budget aktif.`
          }
        : {
            title: "Budget masih aman",
            text: `${budgetOverview.onTrackCount} kategori budget aktif masih berada dalam batas aman bulan ini.`
          }
    );
  }

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

  elements.balanceFoot.textContent =
    getActiveLocale() === "en"
      ? `${summary.transactionCount} transactions recorded`
      : `${summary.transactionCount} transaksi tercatat`;
  elements.incomeFoot.textContent =
    getActiveLocale() === "en"
      ? `${summary.incomeCategories.length} income categories`
      : `${summary.incomeCategories.length} kategori income`;
  elements.expenseFoot.textContent =
    getActiveLocale() === "en"
      ? `${summary.expenseCategories.length} expense categories`
      : `${summary.expenseCategories.length} kategori expense`;
  elements.savingsFoot.textContent =
    getActiveLocale() === "en"
      ? summary.savingsRate >= 20
        ? "Savings health looks solid"
        : "Still has room for improvement"
      : summary.savingsRate >= 20
        ? "Tabungan relatif sehat"
        : "Masih bisa dioptimalkan";

  elements.heroSummaryText.textContent = summary.topExpenseCategory
    ? getActiveLocale() === "en"
      ? `Current balance is ${formatCurrency(summary.balance)}. Your top expense is ${summary.topExpenseCategory.category}.`
      : `Saldo saat ini ${formatCurrency(summary.balance)}. Pengeluaran terbesar ada di ${summary.topExpenseCategory.category}.`
    : getActiveLocale() === "en"
      ? `Current balance is ${formatCurrency(summary.balance)}. Add more transactions to improve the analysis.`
      : `Saldo saat ini ${formatCurrency(summary.balance)}. Tambahkan transaksi untuk memperkaya analisis.`;
  elements.heroMetaText.textContent =
    getActiveLocale() === "en"
      ? `${summary.transactionCount} transactions • Savings rate ${formatPercent(summary.savingsRate)} • ${summary.monthlyCashflow.length} mapped months`
      : `${summary.transactionCount} transaksi • Rasio tabungan ${formatPercent(summary.savingsRate)} • ${summary.monthlyCashflow.length} bulan terpetakan`;

  renderFlowStats(summary);
  renderBudgetSummary();
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
  elements.flowIncomeMeta.textContent =
    getActiveLocale() === "en" ? `${formatPercent(incomeShare)} of total cashflow` : `${formatPercent(incomeShare)} dari total arus kas`;
  elements.flowExpenseMeta.textContent =
    getActiveLocale() === "en" ? `${formatPercent(expenseShare)} of total cashflow` : `${formatPercent(expenseShare)} dari total arus kas`;
  elements.flowNetMeta.textContent =
    getActiveLocale() === "en"
      ? balance >= 0
        ? `Surplus of ${formatCurrency(balance)} in the current period`
        : `Deficit of ${formatCurrency(Math.abs(balance))} in the current period`
      : balance >= 0
        ? `Surplus ${formatCurrency(balance)} pada periode berjalan`
        : `Defisit ${formatCurrency(Math.abs(balance))} pada periode berjalan`;

  elements.flowIncomeBar.style.width = `${Math.max(incomeShare, income > 0 ? 8 : 0)}%`;
  elements.flowExpenseBar.style.width = `${Math.max(expenseShare, expense > 0 ? 8 : 0)}%`;
  elements.flowNetBar.style.width = `${Math.max(balanceShare, balance !== 0 ? 8 : 0)}%`;
  elements.flowNetBar.classList.toggle("is-negative", balance < 0);

  elements.flowTimeline.innerHTML = "";
  const monthly = (summary.monthlyCashflow || []).slice(-6);
  if (monthly.length === 0) {
    elements.flowTimeline.innerHTML = `<div class="empty-state">${t("dashboard.monthlyFlowEmpty")}</div>`;
    return;
  }

  monthly.forEach((entry) => {
    const node = document.createElement("article");
    const net = Number(entry.net) || 0;
    const trendClass = net >= 0 ? "up" : "down";
    const trendLabel = getActiveLocale() === "en" ? (net >= 0 ? "Surplus" : "Deficit") : net >= 0 ? "Surplus" : "Defisit";
    node.className = `flow-node ${trendClass}`;
    node.innerHTML = `
      <span class="flow-node-month">${formatMonth(entry.month)}</span>
      <strong class="flow-node-net">${formatSignedCurrency(net)}</strong>
      <small class="flow-node-detail">${
        getActiveLocale() === "en"
          ? `${trendLabel} from ${formatCurrency(entry.income)} vs ${formatCurrency(entry.expense)}`
          : `${trendLabel} dari ${formatCurrency(entry.income)} vs ${formatCurrency(entry.expense)}`
      }</small>
    `;
    elements.flowTimeline.appendChild(node);
  });
}

function renderCashflowChart() {
  const data = state.summary?.monthlyCashflow || [];
  elements.cashflowChart.innerHTML = "";

  if (data.length === 0) {
    elements.cashflowChart.innerHTML =
      getActiveLocale() === "en"
        ? '<div class="empty-state">No monthly cashflow is available yet.</div>'
        : '<div class="empty-state">Belum ada arus kas bulanan untuk ditampilkan.</div>';
    return;
  }

  const maxValue = Math.max(...data.map((entry) => Math.max(Math.abs(entry.net), entry.income, entry.expense)), 1);

  data.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "chart-row";
    row.innerHTML = `
      <div class="chart-head">
        <strong>${formatMonth(entry.month)}</strong>
        <span>${getActiveLocale() === "en" ? "Net" : "Net"} ${formatCurrency(entry.net)}</span>
      </div>
      <div class="chart-track">
        <div class="chart-fill cashflow-fill" style="width:${Math.max((Math.abs(entry.net) / maxValue) * 100, 6)}%"></div>
      </div>
      <small>${
        getActiveLocale() === "en"
          ? `Income ${formatCurrency(entry.income)} - Expense ${formatCurrency(entry.expense)}`
          : `Pemasukan ${formatCurrency(entry.income)} - Pengeluaran ${formatCurrency(entry.expense)}`
      }</small>
    `;
    elements.cashflowChart.appendChild(row);
  });
}

function renderCategoryChart() {
  const data = state.summary?.expenseCategories || [];
  elements.categoryChart.innerHTML = "";

  if (data.length === 0) {
    elements.categoryChart.innerHTML =
      getActiveLocale() === "en"
        ? '<div class="empty-state">No expense categories are available yet.</div>'
        : '<div class="empty-state">Belum ada kategori pengeluaran untuk ditampilkan.</div>';
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

function renderBudgetSummary() {
  if (!elements.budgetOverviewValue || !elements.budgetOverviewText || !elements.budgetList) {
    return;
  }

  const summary = state.summary;
  const budgetOverview = summary?.budgetOverview || null;
  const budgetStatus = Array.isArray(summary?.expenseBudgetStatus) ? summary.expenseBudgetStatus : [];

  elements.budgetOverviewValue.textContent = formatCurrency(budgetOverview?.totalBudget || 0);
  if (elements.budgetMonthLabel) {
    elements.budgetMonthLabel.textContent = budgetOverview?.activeMonth
      ? formatMonth(budgetOverview.activeMonth)
      : getActiveLocale() === "en"
        ? "Active month"
        : "Bulan aktif";
  }
  if (elements.budgetMonthInput) {
    elements.budgetMonthInput.value = budgetOverview?.activeMonth || state.budgetMonth || todayInputValue().slice(0, 7);
    elements.budgetMonthInput.disabled = !state.user;
  }
  if (elements.budgetSubmitButton) {
    elements.budgetSubmitButton.disabled = !state.user;
  }
  elements.budgetList.innerHTML = "";

  if (!budgetStatus.length) {
    elements.budgetOverviewText.textContent = state.user
      ? getActiveLocale() === "en"
        ? "Set a monthly expense budget for each category you want to track."
        : "Atur budget pengeluaran bulanan per kategori yang ingin dipantau."
      : getActiveLocale() === "en"
        ? "Sign in to start managing monthly expense budgets."
        : "Login untuk mulai mengatur budget pengeluaran bulanan.";
    elements.budgetList.innerHTML = `<div class="empty-state">${
      state.user
        ? getActiveLocale() === "en"
          ? "No category budget has been configured yet."
          : "Belum ada budget kategori yang dikonfigurasi."
        : getActiveLocale() === "en"
          ? "Sign in to monitor monthly category budgets."
          : "Login untuk memantau budget kategori bulanan."
    }</div>`;
    return;
  }

  elements.budgetOverviewText.textContent =
    getActiveLocale() === "en"
      ? `${budgetOverview.budgetCount} categories tracked. ${budgetOverview.warningCount ? `${budgetOverview.warningCount} need attention.` : `${budgetOverview.onTrackCount} are on track.`}`
      : `${budgetOverview.budgetCount} kategori dipantau. ${budgetOverview.warningCount ? `${budgetOverview.warningCount} butuh perhatian.` : `${budgetOverview.onTrackCount} masih aman.`}`;

  budgetStatus.forEach((entry, index) => {
    const row = document.createElement("article");
    const fillClass =
      entry.status === "over" ? "chart-fill budget-fill is-over" : entry.status === "warning" ? "chart-fill budget-fill is-warning" : "chart-fill budget-fill";
    const statusCopy =
      entry.status === "over"
        ? getActiveLocale() === "en"
          ? `Over by ${formatCurrency(entry.overspentAmount)}`
          : `Lewat ${formatCurrency(entry.overspentAmount)}`
        : getActiveLocale() === "en"
          ? `${formatCurrency(entry.remainingAmount)} left`
          : `Sisa ${formatCurrency(entry.remainingAmount)}`;

    row.className = "chart-row budget-status-row";
    row.style.setProperty("--item-index", String(index));
    row.innerHTML = `
      <div class="chart-head">
        <strong>${escapeHTML(entry.category)}</strong>
        <span>${formatCurrency(entry.spentAmount)} / ${formatCurrency(entry.budgetAmount)}</span>
      </div>
      <div class="chart-track">
        <div class="${fillClass}" style="width:${Math.max(Math.min(entry.shareUsed, 100), 6)}%"></div>
      </div>
      <small>${
        getActiveLocale() === "en"
          ? `${formatPercent(entry.shareUsed)} used - ${statusCopy}`
          : `${formatPercent(entry.shareUsed)} terpakai - ${statusCopy}`
      }</small>
    `;
    elements.budgetList.appendChild(row);
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

function getTransactionTypeLabel(type) {
  if (type === "income") {
    return getActiveLocale() === "en" ? "Income" : "Pemasukan";
  }

  return getActiveLocale() === "en" ? "Expense" : "Pengeluaran";
}

function getTransactionExportCopy() {
  return getActiveLocale() === "en"
    ? {
        amount: "Amount",
        category: "Category",
        date: "Date",
        description: "Description",
        empty: "No transactions match the current filters.",
        expense: "Expense",
        exportedAt: "Exported at",
        filters: "Filters",
        notes: "Notes",
        noNotes: "No additional notes",
        query: "Search",
        recapTitle: "Transaction History Recap",
        sheetTitle: "Transaction Recap",
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
        empty: "Belum ada transaksi yang cocok dengan filter saat ini.",
        expense: "Pengeluaran",
        exportedAt: "Diekspor pada",
        filters: "Filter",
        notes: "Catatan",
        noNotes: "Tanpa catatan tambahan",
        query: "Pencarian",
        recapTitle: "Rekap Riwayat Transaksi",
        sheetTitle: "Rekap Transaksi",
        totalExpense: "Total pengeluaran",
        totalIncome: "Total pemasukan",
        totalNet: "Saldo net",
        totalRows: "Jumlah transaksi",
        type: "Tipe",
        typeAll: "Semua tipe"
      };
}

function buildTransactionExportSnapshot() {
  const rows = getFilteredTransactions();
  const typeFilter = elements.typeFilter.value;
  const searchQuery = elements.searchInput.value.trim();
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
    exportedAt: new Date(),
    rows,
    searchQuery,
    totals,
    typeFilter
  };
}

function buildTransactionExportFileBaseName(snapshot) {
  const dateStamp = snapshot.exportedAt.toISOString().slice(0, 10);
  const typeStamp = snapshot.typeFilter === "all" ? "all" : snapshot.typeFilter;
  return `transaction-recap-${typeStamp}-${dateStamp}`;
}

function formatTransactionExportDateTime(value) {
  return new Intl.DateTimeFormat(getIntlLocale(), {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(value);
}

function buildTransactionExportHtml(snapshot, options = {}) {
  const copy = getTransactionExportCopy();
  const title = options.title || copy.recapTitle;
  const typeFilterLabel = snapshot.typeFilter === "all" ? copy.typeAll : getTransactionTypeLabel(snapshot.typeFilter);
  const rowsHtml = snapshot.rows.length
    ? snapshot.rows
        .map((item) => {
          const signedAmount = `${item.type === "income" ? "+" : "-"}${formatCurrency(item.amount)}`;
          const notes = item.notes ? escapeHTML(item.notes) : copy.noNotes;
          return `
            <tr>
              <td>${escapeHTML(formatDate(item.date))}</td>
              <td>${escapeHTML(item.description)}</td>
              <td>${escapeHTML(item.category)}</td>
              <td>${escapeHTML(getTransactionTypeLabel(item.type))}</td>
              <td style="text-align:right;">${escapeHTML(signedAmount)}</td>
              <td>${escapeHTML(notes)}</td>
            </tr>
          `;
        })
        .join("")
    : `
        <tr>
          <td colspan="6">${escapeHTML(copy.empty)}</td>
        </tr>
      `;

  return `<!DOCTYPE html>
<html lang="${escapeHTML(getActiveLocale())}">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHTML(title)}</title>
    <style>
      body {
        font-family: Arial, Helvetica, sans-serif;
        margin: 24px;
        color: #10233f;
      }

      h1 {
        margin: 0 0 6px;
        font-size: 26px;
      }

      .meta,
      .filters,
      .summary {
        margin-top: 16px;
      }

      .meta p,
      .filters p {
        margin: 4px 0;
        color: #42556f;
      }

      .summary-grid {
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
      }

      .summary-grid td {
        border: 1px solid #d5e2f0;
        padding: 10px 12px;
      }

      .summary-grid td:first-child {
        width: 38%;
        font-weight: 700;
        background: #f6f9fc;
      }

      table.report {
        width: 100%;
        border-collapse: collapse;
        margin-top: 18px;
      }

      table.report th,
      table.report td {
        border: 1px solid #d5e2f0;
        padding: 10px 12px;
        text-align: left;
        vertical-align: top;
      }

      table.report th {
        background: #eef4fb;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      @media print {
        body {
          margin: 0;
        }
      }
    </style>
  </head>
  <body>
    <h1>${escapeHTML(title)}</h1>

    <div class="meta">
      <p><strong>${escapeHTML(copy.exportedAt)}:</strong> ${escapeHTML(formatTransactionExportDateTime(snapshot.exportedAt))}</p>
    </div>

    <div class="filters">
      <p><strong>${escapeHTML(copy.filters)}:</strong> ${escapeHTML(copy.type)} = ${escapeHTML(typeFilterLabel)}</p>
      <p><strong>${escapeHTML(copy.query)}:</strong> ${escapeHTML(snapshot.searchQuery || "-")}</p>
    </div>

    <div class="summary">
      <table class="summary-grid">
        <tr>
          <td>${escapeHTML(copy.totalRows)}</td>
          <td>${escapeHTML(String(snapshot.rows.length))}</td>
        </tr>
        <tr>
          <td>${escapeHTML(copy.totalIncome)}</td>
          <td>${escapeHTML(formatCurrency(snapshot.totals.income))}</td>
        </tr>
        <tr>
          <td>${escapeHTML(copy.totalExpense)}</td>
          <td>${escapeHTML(formatCurrency(snapshot.totals.expense))}</td>
        </tr>
        <tr>
          <td>${escapeHTML(copy.totalNet)}</td>
          <td>${escapeHTML(formatSignedCurrency(snapshot.totals.net))}</td>
        </tr>
      </table>
    </div>

    <table class="report">
      <thead>
        <tr>
          <th>${escapeHTML(copy.date)}</th>
          <th>${escapeHTML(copy.description)}</th>
          <th>${escapeHTML(copy.category)}</th>
          <th>${escapeHTML(copy.type)}</th>
          <th>${escapeHTML(copy.amount)}</th>
          <th>${escapeHTML(copy.notes)}</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </body>
</html>`;
}

function downloadTransactionExportFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function buildTransactionExportUrl(format) {
  const params = new URLSearchParams();
  params.set("format", format);
  params.set("locale", getActiveLocale());

  const searchQuery = elements.searchInput.value.trim();
  if (searchQuery) {
    params.set("search", searchQuery);
  }

  if (elements.typeFilter.value && elements.typeFilter.value !== "all") {
    params.set("type", elements.typeFilter.value);
  }

  return `/api/transactions/export?${params.toString()}`;
}

function triggerTransactionExportDownload(url) {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function handleExportTransactionsCsv() {
  triggerTransactionExportDownload(buildTransactionExportUrl("csv"));
}

function handleExportTransactionsExcel() {
  const snapshot = buildTransactionExportSnapshot();
  const html = buildTransactionExportHtml(snapshot, {
    title: `${getTransactionExportCopy().sheetTitle} - Arunika Finance`
  });
  downloadTransactionExportFile(html, `${buildTransactionExportFileBaseName(snapshot)}.xls`, "application/vnd.ms-excel;charset=utf-8");
}

function handleExportTransactionsPdf() {
  triggerTransactionExportDownload(buildTransactionExportUrl("pdf"));
}

function renderTransactions() {
  const rows = getFilteredTransactions();
  elements.transactionTableBody.innerHTML = "";

  if (rows.length === 0) {
    elements.transactionTableBody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">${
            getActiveLocale() === "en"
              ? "No transactions match the current filters."
              : "Belum ada transaksi yang cocok dengan filter saat ini."
          }</div>
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
                : `<span class="transaction-description-notes is-muted">${
                    getActiveLocale() === "en" ? "No additional notes" : "Tanpa catatan tambahan"
                  }</span>`
            }
          </div>
        </div>
      </td>
      <td data-label="Kategori">${escapeHTML(item.category)}</td>
      <td data-label="Tipe"><span class="type-pill ${item.type}">${
        item.type === "income"
          ? getActiveLocale() === "en"
            ? "Income"
            : "Pemasukan"
          : getActiveLocale() === "en"
            ? "Expense"
            : "Pengeluaran"
      }</span></td>
      <td data-label="Nominal" class="amount ${item.type}">${item.type === "income" ? "+" : "-"}${formatCurrency(item.amount)}</td>
      <td data-label="Aksi">
        <div class="table-actions">
          ${receiptAction}
          <button class="edit-button" data-id="${item.id}" type="button">${getActiveLocale() === "en" ? "Edit" : "Edit"}</button>
          <button class="delete-button" data-id="${item.id}" type="button">${getActiveLocale() === "en" ? "Delete" : "Hapus"}</button>
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
    elements.insightList.innerHTML =
      getActiveLocale() === "en"
        ? '<div class="empty-state">Insights will appear after transactions are available.</div>'
        : '<div class="empty-state">Insight akan muncul setelah ada transaksi.</div>';
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "insight-item";
    card.innerHTML = `<strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.text)}</span>`;
    elements.insightList.appendChild(card);
  });
}

// transactions/form.js
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

// transactions/import-state.js
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

// transactions/import.js
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

// transactions/receipt-flow.js
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

// actions/auth.js
function handleUnauthorized(error) {
  if (error?.status !== 401) {
    return false;
  }

  state.user = null;
  resetTransactionForm();
  renderSession();
  clearDashboard();
  resetChat();
  showAuthGate(t("auth.status.sessionEnded"));
  return true;
}

async function loadHealth() {
  state.health = await request("/api/health");
  renderHealth();
}

async function reloadDashboard(month = state.budgetMonth || todayInputValue().slice(0, 7)) {
  const activeMonth = String(month || todayInputValue().slice(0, 7)).trim();
  const summaryParams = new URLSearchParams();
  if (activeMonth) {
    summaryParams.set("month", activeMonth);
  }
  const [transactionsData, summaryData, telegramData] = await Promise.all([
    request("/api/transactions"),
    request(`/api/summary?${summaryParams.toString()}`),
    request("/api/telegram/status")
  ]);
  state.transactions = transactionsData.transactions;
  state.summary = summaryData.summary;
  state.budgetMonth = state.summary?.activeMonth || activeMonth;
  state.telegramStatus = telegramData;
  state.telegramCommand = null;
  renderSummary();
  renderCashflowChart();
  renderCategoryChart();
  renderBudgetSummary();
  renderBudgetFormOptions();
  renderTransactions();
  renderInsights();
  renderTelegramStatus();
}

async function loadSession() {
  try {
    const payload = await request("/api/auth/me");
    state.user = payload.user;
    state.budgetMonth = state.budgetMonth || todayInputValue().slice(0, 7);
    renderSession();
    hideAuthGate();
    resetChat();
    await reloadDashboard();
    applyPendingLaunchShortcut();
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

  if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    setAuthMessage(t("auth.error.invalidEmail"));
    elements.authEmail.focus();
    return;
  }

  if (payload.password.length < 8) {
    setAuthMessage(t("auth.error.shortPassword"));
    elements.authPassword.focus();
    return;
  }

  if (state.authMode === "register" && payload.name.length < 2) {
    setAuthMessage(t("auth.error.shortName"));
    elements.authName.focus();
    return;
  }

  try {
    setAuthMessage(state.authMode === "register" ? t("auth.status.loadingRegister") : t("auth.status.loadingLogin"), "info");
    button.disabled = true;
    button.textContent =
      state.authMode === "register"
        ? getActiveLocale() === "en"
          ? "Creating account..."
          : "Mendaftarkan..."
        : getActiveLocale() === "en"
          ? "Processing..."
          : "Memproses...";

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
    setAuthPasswordVisibility(false);
    setAuthMessage(state.authMode === "register" ? t("auth.status.successRegister") : t("auth.status.successLogin"), "success");
    resetTransactionForm();
    resetChat();
    await reloadDashboard();
    applyPendingLaunchShortcut();
  } catch (error) {
    setAuthMessage(error.message);
  } finally {
    button.disabled = false;
    button.textContent = state.authMode === "register" ? t("auth.submit.register") : t("auth.submit.login");
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
    state.budgetMonth = todayInputValue().slice(0, 7);
    resetTransactionForm();
    resetImportState();
    if (elements.importFileInput) {
      elements.importFileInput.value = "";
    }
    renderSession();
    clearDashboard();
    resetChat();
    setAuthMode("login");
    showAuthGate(t("auth.status.loggedOut"));
  }
}

// actions/budgets.js
function setBudgetMessage(message = "", tone = "default") {
  if (!elements.budgetMessage) {
    return;
  }

  elements.budgetMessage.textContent = message;
  elements.budgetMessage.classList.toggle("is-success", tone === "success");
  elements.budgetMessage.classList.toggle("is-error", tone === "error");
}

function updateBudgetAttentionPromptButton() {
  if (!elements.budgetAttentionPromptButton) {
    return;
  }

  const budgetStatus = Array.isArray(state.summary?.expenseBudgetStatus) ? state.summary.expenseBudgetStatus : [];
  const needsAttention = budgetStatus.some((entry) => entry.status === "warning" || entry.status === "over");
  elements.budgetAttentionPromptButton.disabled = !state.user;
  elements.budgetAttentionPromptButton.textContent = !state.user
    ? getActiveLocale() === "en"
      ? "Sign in to review budget alerts"
      : "Login untuk melihat alert budget"
    : needsAttention
      ? getActiveLocale() === "en"
        ? "Review budgets that need attention"
        : "Lihat budget yang perlu perhatian"
      : getActiveLocale() === "en"
        ? "Ask for a proactive budget review"
        : "Minta review budget proaktif";
}

function buildBudgetAttentionPrompt() {
  const budgetStatus = Array.isArray(state.summary?.expenseBudgetStatus) ? state.summary.expenseBudgetStatus : [];
  const overBudget = budgetStatus.filter((entry) => entry.status === "over").map((entry) => entry.category);
  const warningBudget = budgetStatus.filter((entry) => entry.status === "warning").map((entry) => entry.category);

  if (overBudget.length || warningBudget.length) {
    return [
      "Tolong fokus ke budget kategori yang perlu perhatian.",
      overBudget.length ? `Kategori yang sudah lewat budget: ${overBudget.join(", ")}.` : "",
      warningBudget.length ? `Kategori yang mendekati limit: ${warningBudget.join(", ")}.` : "",
      "Berikan ringkasan singkat dan saran tindakan berikutnya."
    ]
      .filter(Boolean)
      .join(" ");
  }

  return "Tolong cek budget kategori saya bulan ini dan beri tahu area yang paling perlu saya pantau lebih dekat.";
}

function getActiveBudgetMonth() {
  return String(state.summary?.activeMonth || state.budgetMonth || todayInputValue().slice(0, 7)).trim();
}

function syncBudgetFormWithSummary() {
  if (!elements.budgetCategory || !elements.budgetAmount) {
    return;
  }

  const selectedCategory = elements.budgetCategory.value || TRANSACTION_CATEGORY_OPTIONS.expense[0] || "";
  const configuredBudgets = Array.isArray(state.summary?.expenseBudgets) ? state.summary.expenseBudgets : [];
  const budgetStatus = Array.isArray(state.summary?.expenseBudgetStatus) ? state.summary.expenseBudgetStatus : [];
  const activeBudget = configuredBudgets.find((entry) => entry.category === selectedCategory) || null;
  const activeStatus = budgetStatus.find((entry) => entry.category === selectedCategory) || null;

  elements.budgetAmount.value = activeBudget ? String(activeBudget.amount) : "";
  if (elements.budgetCurrentMeta) {
    elements.budgetCurrentMeta.textContent = activeStatus
      ? getActiveLocale() === "en"
        ? `Spent ${formatCurrency(activeStatus.spentAmount)} of ${formatCurrency(activeStatus.budgetAmount)} this month.`
        : `Terpakai ${formatCurrency(activeStatus.spentAmount)} dari ${formatCurrency(activeStatus.budgetAmount)} bulan ini.`
      : getActiveLocale() === "en"
        ? "No budget has been set for this category in the active month yet."
        : "Belum ada budget untuk kategori ini pada bulan aktif.";
  }
}

function renderBudgetFormOptions() {
  if (!elements.budgetCategory) {
    return;
  }

  if (elements.budgetMonthInput) {
    elements.budgetMonthInput.value = getActiveBudgetMonth();
    elements.budgetMonthInput.disabled = !state.user;
  }

  const previousValue = elements.budgetCategory.value;
  const categories = TRANSACTION_CATEGORY_OPTIONS.expense || [];
  elements.budgetCategory.innerHTML = categories
    .map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`)
    .join("");
  elements.budgetCategory.value = categories.includes(previousValue) ? previousValue : categories[0] || "";
  syncBudgetFormWithSummary();
  updateBudgetAttentionPromptButton();
}

async function handleBudgetSubmit(event) {
  event.preventDefault();
  if (!state.user) {
    showAuthGate(getActiveLocale() === "en" ? "Please sign in before setting a budget." : "Silakan masuk sebelum mengatur budget.");
    return;
  }

  const submitButton = elements.budgetSubmitButton;

  try {
    submitButton.disabled = true;
    submitButton.textContent = getActiveLocale() === "en" ? "Saving..." : "Menyimpan...";
    setBudgetMessage("");

    const payload = await request("/api/budgets", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: elements.budgetAmount.value,
        category: elements.budgetCategory.value,
        month: getActiveBudgetMonth()
      })
    });

    await reloadDashboard(getActiveBudgetMonth());
    renderBudgetFormOptions();
    setBudgetMessage(payload.message, "success");
  } catch (error) {
    if (!handleUnauthorized(error)) {
      setBudgetMessage(error.message, "error");
    }
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = getActiveLocale() === "en" ? "Save budget" : "Simpan budget";
  }
}

function handleBudgetCategoryChange() {
  syncBudgetFormWithSummary();
}

async function handleBudgetMonthChange(event) {
  const nextMonth = String(event?.target?.value || "").trim();
  if (!nextMonth || !state.user) {
    return;
  }

  try {
    state.budgetMonth = nextMonth;
    setBudgetMessage("");
    await reloadDashboard(nextMonth);
    renderBudgetFormOptions();
  } catch (error) {
    if (!handleUnauthorized(error)) {
      setBudgetMessage(error.message, "error");
    }
  }
}

async function handleBudgetAttentionPrompt() {
  if (!state.user) {
    showAuthGate(getActiveLocale() === "en" ? "Please sign in before reviewing budget alerts." : "Silakan masuk sebelum meninjau alert budget.");
    return;
  }

  const prompt = buildBudgetAttentionPrompt();
  if (elements.chatInput) {
    elements.chatInput.value = prompt;
    elements.chatInput.focus();
  }

  await sendChatMessage(prompt);
  if (elements.chatInput) {
    elements.chatInput.value = "";
  }
}

// actions/chat.js
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

// actions/telegram.js
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

// actions/transactions.js
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

// bootstrap.js
function bindEvents() {
  elements.loginTabButton.addEventListener("click", () => setAuthMode("login"));
  elements.registerTabButton.addEventListener("click", () => setAuthMode("register"));
  elements.localeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setLocale(button.dataset.localeValue || "id");
    });
  });
  if (elements.authPasswordToggle) {
    elements.authPasswordToggle.addEventListener("click", handleAuthPasswordToggle);
  }
  elements.authForm.addEventListener("submit", handleAuthSubmit);
  elements.importFileInput.addEventListener("change", handleImportFileChange);
  elements.importPresetSelect.addEventListener("change", handleImportPresetChange);
  elements.importPreviewButton.addEventListener("click", handleImportPreview);
  elements.importForm.addEventListener("submit", handleImportSubmit);
  if (elements.budgetForm) {
    elements.budgetForm.addEventListener("submit", handleBudgetSubmit);
  }
  if (elements.budgetCategory) {
    elements.budgetCategory.addEventListener("change", handleBudgetCategoryChange);
  }
  if (elements.budgetMonthInput) {
    elements.budgetMonthInput.addEventListener("change", handleBudgetMonthChange);
  }
  if (elements.budgetAttentionPromptButton) {
    elements.budgetAttentionPromptButton.addEventListener("click", () => {
      handleBudgetAttentionPrompt().catch((error) => {
        window.alert(error.message);
      });
    });
  }
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
  if (elements.exportCsvButton) {
    elements.exportCsvButton.addEventListener("click", handleExportTransactionsCsv);
  }
  if (elements.exportExcelButton) {
    elements.exportExcelButton.addEventListener("click", handleExportTransactionsExcel);
  }
  if (elements.exportPdfButton) {
    elements.exportPdfButton.addEventListener("click", handleExportTransactionsPdf);
  }
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
  state.launchShortcut = getLaunchShortcutFromUrl();
  state.budgetMonth = todayInputValue().slice(0, 7);
  setLocale(loadLocalePreference(), { persist: false, rerender: false });
  resetTransactionForm();
  resetImportState();
  setAuthMode("login");
  setCompactMode(loadCompactModePreference(), { persist: false });
  renderSession();
  clearDashboard();
  renderBudgetFormOptions();
  resetChat();
  bindEvents();
  await registerServiceWorker();

  try {
    await loadHealth();
    await loadSession();
  } catch (error) {
    elements.heroSummaryText.textContent = error.message;
    showAuthGate(
      getActiveLocale() === "en"
        ? "Failed to load application status. Please refresh the page."
        : "Gagal memuat status aplikasi. Coba refresh halaman."
    );
  }
}

initializeApp();
