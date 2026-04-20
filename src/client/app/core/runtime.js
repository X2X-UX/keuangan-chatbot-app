const state = {
  authMode: "login",
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

