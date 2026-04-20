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

  elements.balanceFoot.textContent =
    getActiveLocale() === "en"
      ? `${summary.transactionCount} transactions recorded`
      : `${summary.transactionCount} transaksi tercatat`;
  elements.incomeFoot.textContent =
    getActiveLocale() === "en"
      ? `${summary.incomeCategories.length} income categories`
      : `${summary.incomeCategories.length} kategori income`;
  elements.expenseFoot.textContent =
    getActiveLocale() === "en"
      ? `${summary.expenseCategories.length} expense categories`
      : `${summary.expenseCategories.length} kategori expense`;
  elements.savingsFoot.textContent =
    getActiveLocale() === "en"
      ? summary.savingsRate >= 20
        ? "Savings health looks solid"
        : "Still has room for improvement"
      : summary.savingsRate >= 20
        ? "Tabungan relatif sehat"
        : "Masih bisa dioptimalkan";

  elements.heroSummaryText.textContent = summary.topExpenseCategory
    ? getActiveLocale() === "en"
      ? `Current balance is ${formatCurrency(summary.balance)}. Your top expense is ${summary.topExpenseCategory.category}.`
      : `Saldo saat ini ${formatCurrency(summary.balance)}. Pengeluaran terbesar ada di ${summary.topExpenseCategory.category}.`
    : getActiveLocale() === "en"
      ? `Current balance is ${formatCurrency(summary.balance)}. Add more transactions to improve the analysis.`
      : `Saldo saat ini ${formatCurrency(summary.balance)}. Tambahkan transaksi untuk memperkaya analisis.`;
  elements.heroMetaText.textContent =
    getActiveLocale() === "en"
      ? `${summary.transactionCount} transactions • Savings rate ${formatPercent(summary.savingsRate)} • ${summary.monthlyCashflow.length} mapped months`
      : `${summary.transactionCount} transaksi • Rasio tabungan ${formatPercent(summary.savingsRate)} • ${summary.monthlyCashflow.length} bulan terpetakan`;

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
  elements.flowIncomeMeta.textContent =
    getActiveLocale() === "en" ? `${formatPercent(incomeShare)} of total cashflow` : `${formatPercent(incomeShare)} dari total arus kas`;
  elements.flowExpenseMeta.textContent =
    getActiveLocale() === "en" ? `${formatPercent(expenseShare)} of total cashflow` : `${formatPercent(expenseShare)} dari total arus kas`;
  elements.flowNetMeta.textContent =
    getActiveLocale() === "en"
      ? balance >= 0
        ? `Surplus of ${formatCurrency(balance)} in the current period`
        : `Deficit of ${formatCurrency(Math.abs(balance))} in the current period`
      : balance >= 0
        ? `Surplus ${formatCurrency(balance)} pada periode berjalan`
        : `Defisit ${formatCurrency(Math.abs(balance))} pada periode berjalan`;

  elements.flowIncomeBar.style.width = `${Math.max(incomeShare, income > 0 ? 8 : 0)}%`;
  elements.flowExpenseBar.style.width = `${Math.max(expenseShare, expense > 0 ? 8 : 0)}%`;
  elements.flowNetBar.style.width = `${Math.max(balanceShare, balance !== 0 ? 8 : 0)}%`;
  elements.flowNetBar.classList.toggle("is-negative", balance < 0);

  elements.flowTimeline.innerHTML = "";
  const monthly = (summary.monthlyCashflow || []).slice(-6);
  if (monthly.length === 0) {
    elements.flowTimeline.innerHTML = `<div class="empty-state">${t("dashboard.monthlyFlowEmpty")}</div>`;
    return;
  }

  monthly.forEach((entry) => {
    const node = document.createElement("article");
    const net = Number(entry.net) || 0;
    const trendClass = net >= 0 ? "up" : "down";
    const trendLabel = getActiveLocale() === "en" ? (net >= 0 ? "Surplus" : "Deficit") : net >= 0 ? "Surplus" : "Defisit";
    node.className = `flow-node ${trendClass}`;
    node.innerHTML = `
      <span class="flow-node-month">${formatMonth(entry.month)}</span>
      <strong class="flow-node-net">${formatSignedCurrency(net)}</strong>
      <small class="flow-node-detail">${
        getActiveLocale() === "en"
          ? `${trendLabel} from ${formatCurrency(entry.income)} vs ${formatCurrency(entry.expense)}`
          : `${trendLabel} dari ${formatCurrency(entry.income)} vs ${formatCurrency(entry.expense)}`
      }</small>
    `;
    elements.flowTimeline.appendChild(node);
  });
}

function renderCashflowChart() {
  const data = state.summary?.monthlyCashflow || [];
  elements.cashflowChart.innerHTML = "";

  if (data.length === 0) {
    elements.cashflowChart.innerHTML =
      getActiveLocale() === "en"
        ? '<div class="empty-state">No monthly cashflow is available yet.</div>'
        : '<div class="empty-state">Belum ada arus kas bulanan untuk ditampilkan.</div>';
    return;
  }

  const maxValue = Math.max(...data.map((entry) => Math.max(Math.abs(entry.net), entry.income, entry.expense)), 1);

  data.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "chart-row";
    row.innerHTML = `
      <div class="chart-head">
        <strong>${formatMonth(entry.month)}</strong>
        <span>${getActiveLocale() === "en" ? "Net" : "Net"} ${formatCurrency(entry.net)}</span>
      </div>
      <div class="chart-track">
        <div class="chart-fill cashflow-fill" style="width:${Math.max((Math.abs(entry.net) / maxValue) * 100, 6)}%"></div>
      </div>
      <small>${
        getActiveLocale() === "en"
          ? `Income ${formatCurrency(entry.income)} - Expense ${formatCurrency(entry.expense)}`
          : `Pemasukan ${formatCurrency(entry.income)} - Pengeluaran ${formatCurrency(entry.expense)}`
      }</small>
    `;
    elements.cashflowChart.appendChild(row);
  });
}

function renderCategoryChart() {
  const data = state.summary?.expenseCategories || [];
  elements.categoryChart.innerHTML = "";

  if (data.length === 0) {
    elements.categoryChart.innerHTML =
      getActiveLocale() === "en"
        ? '<div class="empty-state">No expense categories are available yet.</div>'
        : '<div class="empty-state">Belum ada kategori pengeluaran untuk ditampilkan.</div>';
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

function getTransactionTypeLabel(type) {
  if (type === "income") {
    return getActiveLocale() === "en" ? "Income" : "Pemasukan";
  }

  return getActiveLocale() === "en" ? "Expense" : "Pengeluaran";
}

function getTransactionExportCopy() {
  return getActiveLocale() === "en"
    ? {
        amount: "Amount",
        category: "Category",
        date: "Date",
        description: "Description",
        empty: "No transactions match the current filters.",
        expense: "Expense",
        exportedAt: "Exported at",
        filters: "Filters",
        notes: "Notes",
        noNotes: "No additional notes",
        query: "Search",
        recapTitle: "Transaction History Recap",
        sheetTitle: "Transaction Recap",
        totalExpense: "Total expense",
        totalIncome: "Total income",
        totalNet: "Net balance",
        totalRows: "Transactions",
        type: "Type",
        typeAll: "All types"
      }
    : {
        amount: "Nominal",
        category: "Kategori",
        date: "Tanggal",
        description: "Deskripsi",
        empty: "Belum ada transaksi yang cocok dengan filter saat ini.",
        expense: "Pengeluaran",
        exportedAt: "Diekspor pada",
        filters: "Filter",
        notes: "Catatan",
        noNotes: "Tanpa catatan tambahan",
        query: "Pencarian",
        recapTitle: "Rekap Riwayat Transaksi",
        sheetTitle: "Rekap Transaksi",
        totalExpense: "Total pengeluaran",
        totalIncome: "Total pemasukan",
        totalNet: "Saldo net",
        totalRows: "Jumlah transaksi",
        type: "Tipe",
        typeAll: "Semua tipe"
      };
}

function buildTransactionExportSnapshot() {
  const rows = getFilteredTransactions();
  const typeFilter = elements.typeFilter.value;
  const searchQuery = elements.searchInput.value.trim();
  const totals = rows.reduce(
    (result, item) => {
      const amount = Number(item.amount) || 0;
      if (item.type === "income") {
        result.income += amount;
      } else {
        result.expense += amount;
      }
      return result;
    },
    { expense: 0, income: 0 }
  );
  totals.net = totals.income - totals.expense;

  return {
    exportedAt: new Date(),
    rows,
    searchQuery,
    totals,
    typeFilter
  };
}

function buildTransactionExportFileBaseName(snapshot) {
  const dateStamp = snapshot.exportedAt.toISOString().slice(0, 10);
  const typeStamp = snapshot.typeFilter === "all" ? "all" : snapshot.typeFilter;
  return `transaction-recap-${typeStamp}-${dateStamp}`;
}

function formatTransactionExportDateTime(value) {
  return new Intl.DateTimeFormat(getIntlLocale(), {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(value);
}

function buildTransactionExportHtml(snapshot, options = {}) {
  const copy = getTransactionExportCopy();
  const title = options.title || copy.recapTitle;
  const typeFilterLabel = snapshot.typeFilter === "all" ? copy.typeAll : getTransactionTypeLabel(snapshot.typeFilter);
  const rowsHtml = snapshot.rows.length
    ? snapshot.rows
        .map((item) => {
          const signedAmount = `${item.type === "income" ? "+" : "-"}${formatCurrency(item.amount)}`;
          const notes = item.notes ? escapeHTML(item.notes) : copy.noNotes;
          return `
            <tr>
              <td>${escapeHTML(formatDate(item.date))}</td>
              <td>${escapeHTML(item.description)}</td>
              <td>${escapeHTML(item.category)}</td>
              <td>${escapeHTML(getTransactionTypeLabel(item.type))}</td>
              <td style="text-align:right;">${escapeHTML(signedAmount)}</td>
              <td>${escapeHTML(notes)}</td>
            </tr>
          `;
        })
        .join("")
    : `
        <tr>
          <td colspan="6">${escapeHTML(copy.empty)}</td>
        </tr>
      `;

  return `<!DOCTYPE html>
<html lang="${escapeHTML(getActiveLocale())}">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHTML(title)}</title>
    <style>
      body {
        font-family: Arial, Helvetica, sans-serif;
        margin: 24px;
        color: #10233f;
      }

      h1 {
        margin: 0 0 6px;
        font-size: 26px;
      }

      .meta,
      .filters,
      .summary {
        margin-top: 16px;
      }

      .meta p,
      .filters p {
        margin: 4px 0;
        color: #42556f;
      }

      .summary-grid {
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
      }

      .summary-grid td {
        border: 1px solid #d5e2f0;
        padding: 10px 12px;
      }

      .summary-grid td:first-child {
        width: 38%;
        font-weight: 700;
        background: #f6f9fc;
      }

      table.report {
        width: 100%;
        border-collapse: collapse;
        margin-top: 18px;
      }

      table.report th,
      table.report td {
        border: 1px solid #d5e2f0;
        padding: 10px 12px;
        text-align: left;
        vertical-align: top;
      }

      table.report th {
        background: #eef4fb;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      @media print {
        body {
          margin: 0;
        }
      }
    </style>
  </head>
  <body>
    <h1>${escapeHTML(title)}</h1>

    <div class="meta">
      <p><strong>${escapeHTML(copy.exportedAt)}:</strong> ${escapeHTML(formatTransactionExportDateTime(snapshot.exportedAt))}</p>
    </div>

    <div class="filters">
      <p><strong>${escapeHTML(copy.filters)}:</strong> ${escapeHTML(copy.type)} = ${escapeHTML(typeFilterLabel)}</p>
      <p><strong>${escapeHTML(copy.query)}:</strong> ${escapeHTML(snapshot.searchQuery || "-")}</p>
    </div>

    <div class="summary">
      <table class="summary-grid">
        <tr>
          <td>${escapeHTML(copy.totalRows)}</td>
          <td>${escapeHTML(String(snapshot.rows.length))}</td>
        </tr>
        <tr>
          <td>${escapeHTML(copy.totalIncome)}</td>
          <td>${escapeHTML(formatCurrency(snapshot.totals.income))}</td>
        </tr>
        <tr>
          <td>${escapeHTML(copy.totalExpense)}</td>
          <td>${escapeHTML(formatCurrency(snapshot.totals.expense))}</td>
        </tr>
        <tr>
          <td>${escapeHTML(copy.totalNet)}</td>
          <td>${escapeHTML(formatSignedCurrency(snapshot.totals.net))}</td>
        </tr>
      </table>
    </div>

    <table class="report">
      <thead>
        <tr>
          <th>${escapeHTML(copy.date)}</th>
          <th>${escapeHTML(copy.description)}</th>
          <th>${escapeHTML(copy.category)}</th>
          <th>${escapeHTML(copy.type)}</th>
          <th>${escapeHTML(copy.amount)}</th>
          <th>${escapeHTML(copy.notes)}</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </body>
</html>`;
}

function downloadTransactionExportFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function buildTransactionExportUrl(format) {
  const params = new URLSearchParams();
  params.set("format", format);
  params.set("locale", getActiveLocale());

  const searchQuery = elements.searchInput.value.trim();
  if (searchQuery) {
    params.set("search", searchQuery);
  }

  if (elements.typeFilter.value && elements.typeFilter.value !== "all") {
    params.set("type", elements.typeFilter.value);
  }

  return `/api/transactions/export?${params.toString()}`;
}

function triggerTransactionExportDownload(url) {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function handleExportTransactionsCsv() {
  triggerTransactionExportDownload(buildTransactionExportUrl("csv"));
}

function handleExportTransactionsExcel() {
  const snapshot = buildTransactionExportSnapshot();
  const html = buildTransactionExportHtml(snapshot, {
    title: `${getTransactionExportCopy().sheetTitle} - Arunika Finance`
  });
  downloadTransactionExportFile(html, `${buildTransactionExportFileBaseName(snapshot)}.xls`, "application/vnd.ms-excel;charset=utf-8");
}

function handleExportTransactionsPdf() {
  triggerTransactionExportDownload(buildTransactionExportUrl("pdf"));
}

function renderTransactions() {
  const rows = getFilteredTransactions();
  elements.transactionTableBody.innerHTML = "";

  if (rows.length === 0) {
    elements.transactionTableBody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">${
            getActiveLocale() === "en"
              ? "No transactions match the current filters."
              : "Belum ada transaksi yang cocok dengan filter saat ini."
          }</div>
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
                : `<span class="transaction-description-notes is-muted">${
                    getActiveLocale() === "en" ? "No additional notes" : "Tanpa catatan tambahan"
                  }</span>`
            }
          </div>
        </div>
      </td>
      <td data-label="Kategori">${escapeHTML(item.category)}</td>
      <td data-label="Tipe"><span class="type-pill ${item.type}">${
        item.type === "income"
          ? getActiveLocale() === "en"
            ? "Income"
            : "Pemasukan"
          : getActiveLocale() === "en"
            ? "Expense"
            : "Pengeluaran"
      }</span></td>
      <td data-label="Nominal" class="amount ${item.type}">${item.type === "income" ? "+" : "-"}${formatCurrency(item.amount)}</td>
      <td data-label="Aksi">
        <div class="table-actions">
          ${receiptAction}
          <button class="edit-button" data-id="${item.id}" type="button">${getActiveLocale() === "en" ? "Edit" : "Edit"}</button>
          <button class="delete-button" data-id="${item.id}" type="button">${getActiveLocale() === "en" ? "Delete" : "Hapus"}</button>
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
    elements.insightList.innerHTML =
      getActiveLocale() === "en"
        ? '<div class="empty-state">Insights will appear after transactions are available.</div>'
        : '<div class="empty-state">Insight akan muncul setelah ada transaksi.</div>';
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "insight-item";
    card.innerHTML = `<strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.text)}</span>`;
    elements.insightList.appendChild(card);
  });
}

