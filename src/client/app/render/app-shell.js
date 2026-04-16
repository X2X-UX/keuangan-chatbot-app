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
    const error = new Error("Jaringan sedang bermasalah. Periksa koneksi Anda lalu coba lagi.");
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
    const error = new Error(payload.error || payload.message || "Terjadi kesalahan saat memproses permintaan.");
    error.status = response.status;
    throw error;
  }

  return payload;
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
  elements.authTitle.textContent = isRegister ? "Buat akun Arunika Finance" : "Masuk ke Arunika Finance";
  elements.authSubtitle.textContent = isRegister
    ? "Daftarkan akun baru untuk menyimpan transaksi Anda secara terpisah."
    : "Masuk untuk mengakses dashboard keuangan pribadi. Data transaksi setiap akun dipisahkan otomatis di sistem.";
  elements.authSubmitButton.textContent = isRegister ? "Daftar Akun" : "Masuk";
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
  elements.authPasswordToggle.setAttribute("aria-label", isVisible ? "Sembunyikan password" : "Tampilkan password");
  elements.authPasswordToggle.setAttribute("title", isVisible ? "Sembunyikan password" : "Tampilkan password");
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
  const config = state.health.config || {};
  const appBaseLabel = config.appBaseUrlConfigured ? "deploy siap webhook" : "APP_BASE_URL belum diisi";
  const telegramLabel = state.health.telegramConfigured ? "Telegram siap" : "Telegram belum aktif";
  const cookieLabel = config.sameSite ? `Cookie ${config.sameSite}` : "Cookie aman";
  elements.heroMetaText.textContent = `${telegramLabel} • ${appBaseLabel} • ${cookieLabel}`;
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
  elements.heroMetaText.textContent = state.health
    ? "Layanan siap dimuat setelah sesi akun tersedia."
    : "Memeriksa keamanan aplikasi dan kesiapan layanan...";
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

