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
