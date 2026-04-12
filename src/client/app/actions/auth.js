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
    setAuthPasswordVisibility(false);
    resetTransactionForm();
    resetChat();
    await reloadDashboard();
    applyPendingLaunchShortcut();
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
