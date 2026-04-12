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
  setAuthPasswordVisibility(false);
}

function setAuthPasswordVisibility(visible) {
  const isVisible = visible === true;
  elements.authPassword.type = isVisible ? "text" : "password";

  if (!elements.authPasswordToggle) {
    return;
  }

  elements.authPasswordToggle.textContent = isVisible ? "Sembunyikan" : "Lihat";
  elements.authPasswordToggle.setAttribute("aria-pressed", isVisible ? "true" : "false");
  elements.authPasswordToggle.setAttribute("aria-label", isVisible ? "Sembunyikan password" : "Tampilkan password");
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

