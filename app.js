const state = {
  authMode: "login",
  chatHistory: [],
  compactMode: false,
  editingTransactionId: null,
  health: null,
  summary: null,
  telegramCommand: null,
  telegramStatus: null,
  transactions: [],
  user: null
};
const COMPACT_MODE_STORAGE_KEY = "arunika_compact_mode";
const TRANSACTION_CATEGORY_OPTIONS = globalThis.TRANSACTION_CATEGORY_OPTIONS || {
  expense: ["Makanan", "Transportasi", "Tagihan", "Belanja", "Kesehatan", "Pendidikan", "Hiburan", "Rumah Tangga"],
  income: ["Gaji", "Freelance", "Bonus", "Penjualan", "Investasi", "Hadiah"]
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
  transactionTableBody: document.getElementById("transactionTableBody"),
  transactionFormTitle: document.getElementById("transactionFormTitle"),
  transactionSubmitButton: document.getElementById("transactionSubmitButton"),
  transactionType: document.getElementById("transactionType"),
  typeFilter: document.getElementById("typeFilter")
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

function resetTransactionForm() {
  state.editingTransactionId = null;
  elements.transactionForm.reset();
  elements.transactionForm.date.value = todayInputValue();
  syncTransactionCategoryOptions();
  renderTransactionAmountHint();
  setTransactionFormMode(false);
}

function populateTransactionForm(transaction) {
  if (!transaction) {
    return;
  }

  state.editingTransactionId = transaction.id;
  elements.transactionType.value = transaction.type;
  syncTransactionCategoryOptions(transaction.category);
  elements.transactionForm.elements.description.value = transaction.description || "";
  elements.transactionAmount.value = formatFlexibleCurrency(transaction.amount);
  elements.transactionForm.elements.date.value = transaction.date || todayInputValue();
  elements.transactionForm.elements.notes.value = transaction.notes || "";
  renderTransactionAmountHint();
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
    row.innerHTML = `
      <td data-label="Tanggal">${formatDate(item.date)}</td>
      <td data-label="Deskripsi">${escapeHTML(item.description)}</td>
      <td data-label="Kategori">${escapeHTML(item.category)}</td>
      <td data-label="Tipe"><span class="type-pill ${item.type}">${item.type === "income" ? "Pemasukan" : "Pengeluaran"}</span></td>
      <td data-label="Nominal" class="amount ${item.type}">${item.type === "income" ? "+" : "-"}${formatCurrency(item.amount)}</td>
      <td data-label="Aksi">
        <div class="table-actions">
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

  const formData = new FormData(elements.transactionForm);
  const payload = Object.fromEntries(formData.entries());
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
  elements.logoutButton.addEventListener("click", handleLogout);
  elements.telegramLinkButton.addEventListener("click", handleGenerateTelegramLinkCode);
  elements.telegramUnlinkButton.addEventListener("click", handleTelegramUnlink);
  elements.transactionForm.addEventListener("submit", handleTransactionSubmit);
  elements.transactionCancelButton.addEventListener("click", resetTransactionForm);
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
