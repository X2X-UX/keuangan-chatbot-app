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
