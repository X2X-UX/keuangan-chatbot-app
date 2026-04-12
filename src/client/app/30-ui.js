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
    const receiptThumb = item.receiptPath
      ? `
        <a class="receipt-thumb-link" href="${escapeHTML(getTransactionReceiptUrl(item.id))}" target="_blank" rel="noreferrer" aria-label="Buka struk untuk ${escapeHTML(item.description)}">
          <img
            class="receipt-thumb-image"
            src="${escapeHTML(getTransactionReceiptUrl(item.id))}"
            alt="Thumbnail struk ${escapeHTML(item.description)}"
            loading="lazy"
          />
        </a>
      `
      : "";
    const receiptAction = item.receiptPath
      ? `<a class="receipt-link" href="${escapeHTML(getTransactionReceiptUrl(item.id))}" target="_blank" rel="noreferrer">Struk</a>`
      : "";
    row.innerHTML = `
      <td data-label="Tanggal">${formatDate(item.date)}</td>
      <td data-label="Deskripsi">
        <div class="transaction-description">
          ${receiptThumb}
          <div class="transaction-description-copy">
            <strong class="transaction-description-title">${escapeHTML(item.description)}</strong>
            ${
              item.notes
                ? `<span class="transaction-description-notes">${escapeHTML(item.notes)}</span>`
                : `<span class="transaction-description-notes is-muted">Tanpa catatan tambahan</span>`
            }
          </div>
        </div>
      </td>
      <td data-label="Kategori">${escapeHTML(item.category)}</td>
      <td data-label="Tipe"><span class="type-pill ${item.type}">${item.type === "income" ? "Pemasukan" : "Pengeluaran"}</span></td>
      <td data-label="Nominal" class="amount ${item.type}">${item.type === "income" ? "+" : "-"}${formatCurrency(item.amount)}</td>
      <td data-label="Aksi">
        <div class="table-actions">
          ${receiptAction}
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

