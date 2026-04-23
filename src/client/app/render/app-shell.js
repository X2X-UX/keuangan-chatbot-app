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

