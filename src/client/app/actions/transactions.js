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

