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
  state.launchShortcut = getLaunchShortcutFromUrl();
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
