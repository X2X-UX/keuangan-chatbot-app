function createFinanceAssistantService({
  createTransactionForUser,
  findCanonicalCategory,
  formatTransactionCategoryList,
  inferTransactionCategory,
  listTransactionsByUser,
  parseFlexibleAmount
}) {
  function sortTransactions(items) {
    return [...items].sort((left, right) => {
      const timeDiff = new Date(right.date).getTime() - new Date(left.date).getTime();
      if (timeDiff !== 0) {
        return timeDiff;
      }

      return String(right.id).localeCompare(String(left.id));
    });
  }

  function computeSummary(items) {
    const sorted = sortTransactions(items);
    const expenseCounts = sorted.filter((item) => item.type === "expense").length;
    const incomeCounts = sorted.filter((item) => item.type === "income").length;
    const totals = { income: 0, expense: 0 };
    const expenseCategories = new Map();
    const incomeCategories = new Map();
    const monthlyMap = new Map();
    let biggestExpense = null;

    for (const item of sorted) {
      const amount = Number(item.amount) || 0;
      const month = String(item.date || "").slice(0, 7);

      if (!monthlyMap.has(month)) {
        monthlyMap.set(month, { month, income: 0, expense: 0, net: 0 });
      }

      if (item.type === "income") {
        totals.income += amount;
        monthlyMap.get(month).income += amount;
        incomeCategories.set(item.category, (incomeCategories.get(item.category) || 0) + amount);
      } else {
        totals.expense += amount;
        monthlyMap.get(month).expense += amount;
        expenseCategories.set(item.category, (expenseCategories.get(item.category) || 0) + amount);
        if (!biggestExpense || amount > biggestExpense.amount) {
          biggestExpense = item;
        }
      }
    }

    const monthlyCashflow = Array.from(monthlyMap.values())
      .filter((entry) => entry.month)
      .map((entry) => ({ ...entry, net: entry.income - entry.expense }))
      .sort((left, right) => left.month.localeCompare(right.month))
      .slice(-6);

    const expenseList = Array.from(expenseCategories.entries())
      .map(([category, amount]) => ({
        category,
        amount,
        share: totals.expense ? Number(((amount / totals.expense) * 100).toFixed(1)) : 0
      }))
      .sort((left, right) => right.amount - left.amount);

    const incomeList = Array.from(incomeCategories.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((left, right) => right.amount - left.amount);

    const balance = totals.income - totals.expense;
    const savingsRate = totals.income ? Number(((balance / totals.income) * 100).toFixed(1)) : 0;

    return {
      averageExpense: expenseCounts ? Math.round(totals.expense / expenseCounts) : 0,
      averageIncome: incomeCounts ? Math.round(totals.income / incomeCounts) : 0,
      balance,
      biggestExpense,
      expenseCategories: expenseList,
      incomeCategories: incomeList,
      monthlyCashflow,
      recentTransactions: sorted.slice(0, 6),
      savingsRate,
      topExpenseCategory: expenseList[0] || null,
      totalExpense: totals.expense,
      totalIncome: totals.income,
      transactionCount: sorted.length
    };
  }

  function todayDateValue() {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
  }

  function sanitizeText(value, maxLength) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
  }

  function sanitizeTransaction(payload) {
    const type = payload.type === "income" ? "income" : payload.type === "expense" ? "expense" : null;
    const amount = parseFlexibleAmount(payload.amount);
    const description = sanitizeText(payload.description, 120);
    const rawCategory = sanitizeText(payload.category, 60);
    const category = type ? findCanonicalCategory(type, rawCategory) : null;
    const notes = sanitizeText(payload.notes, 240);
    const date = sanitizeText(payload.date, 10) || todayDateValue();

    if (!type) {
      throw new Error("Tipe transaksi harus income atau expense.");
    }

    if (!description) {
      throw new Error("Deskripsi transaksi wajib diisi.");
    }

    if (!rawCategory) {
      throw new Error("Kategori transaksi wajib diisi.");
    }

    if (!category) {
      throw new Error(
        `Kategori transaksi tidak sesuai daftar ${type === "income" ? "pemasukan" : "pengeluaran"}: ${formatTransactionCategoryList(type)}.`
      );
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Nominal transaksi harus lebih besar dari nol.");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error("Format tanggal harus YYYY-MM-DD.");
    }

    return {
      amount: Math.round(amount),
      category,
      date,
      description,
      notes,
      receiptPath: sanitizeText(payload.receiptPath, 260),
      type
    };
  }

  function parseTransactionTypeToken(value) {
    if (/\b(?:pemasukan|income)\b/i.test(value)) {
      return "income";
    }

    if (/\b(?:pengeluaran|expense)\b/i.test(value)) {
      return "expense";
    }

    return null;
  }

  function parseChatTransactionCommand(message) {
    const raw = String(message || "").trim();
    if (!raw) {
      return null;
    }

    const commandMatch = raw.match(/^\/?catat(?:@\w+)?\b|^(?:tambah|input)\b/i);
    const directTypeMatch = raw.match(/^(pemasukan|income|pengeluaran|expense)\b/i);
    if (!commandMatch && !directTypeMatch) {
      return null;
    }

    const parseMode = commandMatch ? "command" : "direct";
    let type = null;
    let remainder = raw;

    if (commandMatch) {
      remainder = raw.slice(commandMatch[0].length).trim();
      const commandTypeMatch = remainder.match(/^(pemasukan|income|pengeluaran|expense)\b/i);
      type = parseTransactionTypeToken(commandTypeMatch?.[0] || "");
      if (!type || !commandTypeMatch) {
        return {
          error: "Perintah input dikenali, tetapi tipe transaksi belum jelas. Gunakan `pemasukan` atau `pengeluaran`."
        };
      }

      remainder = remainder.slice(commandTypeMatch[0].length).trim();
    } else {
      type = parseTransactionTypeToken(directTypeMatch?.[0] || "");
      remainder = raw.slice(directTypeMatch[0].length).trim();
    }

    if (!type) {
      return {
        error: "Perintah input dikenali, tetapi tipe transaksi belum jelas. Gunakan `pemasukan` atau `pengeluaran`."
      };
    }

    const amountMatch = remainder.match(
      /^(?:[:=-]\s*)?(?:rp\.?\s*)?(\d+(?:[\d.,\s]*\d)?(?:\s*(?:rb|ribu|k|jt|juta|m|j))?)(?=\s|$)/i
    );
    if (!amountMatch && parseMode === "direct") {
      return null;
    }

    const amount = amountMatch ? parseFlexibleAmount(amountMatch[1]) : null;
    if (!amount || amount <= 0) {
      return {
        error: "Nominal transaksi belum valid. Gunakan contoh seperti `15000`, `15.000`, `15rb`, atau `1,5jt`."
      };
    }

    const content = remainder.slice(amountMatch[0].length).trim();
    const dateMatch = content.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    const categoryMatch = content.match(
      /(?:kategori|category)\s*[:=]?\s*(.+?)(?=(?:\s+(?:tanggal|date|catatan|note|notes|deskripsi|keterangan)\b)|$)/i
    );
    const descriptionMatch = content.match(
      /(?:deskripsi|keterangan|desc)\s*[:=]?\s*(.+?)(?=(?:\s+(?:kategori|category|tanggal|date|catatan|note|notes)\b)|$)/i
    );
    const notesMatch = content.match(/(?:catatan|note|notes)\s*[:=]?\s*(.+)$/i);

    let description = descriptionMatch ? sanitizeText(descriptionMatch[1], 120) : "";
    if (!description) {
      description = content
        .replace(/(?:kategori|category)\s*[:=]?\s*.+$/i, "")
        .replace(/(?:tanggal|date)\s*[:=]?\s*\d{4}-\d{2}-\d{2}/i, "")
        .replace(/(?:catatan|note|notes)\s*[:=]?\s*.+$/i, "")
        .trim();
      description = sanitizeText(description, 120);
    }

    const rawCategory = categoryMatch ? sanitizeText(categoryMatch[1], 60) : "";
    const inferredCategory = inferTransactionCategory(type, `${description} ${rawCategory}`) || null;
    const category = rawCategory ? findCanonicalCategory(type, rawCategory) : inferredCategory;

    if (rawCategory && !category) {
      return {
        error: `Kategori \`${rawCategory}\` belum cocok dengan daftar ${type === "income" ? "pemasukan" : "pengeluaran"}. Pilih salah satu: ${formatTransactionCategoryList(type)}.`
      };
    }

    if (!category) {
      return {
        error: `Kategori transaksi belum dikenali. Gunakan salah satu kategori ${type === "income" ? "pemasukan" : "pengeluaran"}: ${formatTransactionCategoryList(type)}.`
      };
    }

    return {
      payload: {
        amount,
        category,
        date: dateMatch ? dateMatch[1] : todayDateValue(),
        description: description || (type === "income" ? "Pemasukan" : "Pengeluaran"),
        notes: notesMatch ? sanitizeText(notesMatch[1], 240) : "",
        type
      }
    };
  }

  function buildTransactionInputGuide() {
    return [
      "Format input yang didukung:",
      "- `pengeluaran 25000 makan siang kategori Makanan tanggal 2026-04-03`",
      "- `pemasukan 1,5jt gaji kategori Gaji`",
      "- `catat pengeluaran 80rb bensin kategori Transportasi`",
      "",
      "Format nominal fleksibel: 15000, 15.000, Rp15.000, 15rb, 1,5jt",
      "",
      `Kategori pengeluaran: ${formatTransactionCategoryList("expense")}`,
      `Kategori pemasukan: ${formatTransactionCategoryList("income")}`
    ].join("\n");
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("id-ID", {
      currency: "IDR",
      maximumFractionDigits: 0,
      style: "currency"
    }).format(Number(value) || 0);
  }

  function formatPercent(value) {
    return `${Number(value || 0).toFixed(1)}%`;
  }

  function generateLocalReply(message, summary) {
    const lower = String(message || "").toLowerCase();
    const topCategory = summary.topExpenseCategory;
    const biggestExpense = summary.biggestExpense;
    const advice = [];

    if (topCategory && topCategory.share >= 25) {
      advice.push(`Kategori ${topCategory.category} menyerap ${formatPercent(topCategory.share)} dari total pengeluaran.`);
    }

    if (summary.savingsRate < 20) {
      advice.push("Rasio tabungan masih di bawah 20%, jadi pengeluaran fleksibel seperti hiburan, makan di luar, dan transportasi layak dipantau lebih ketat.");
    } else {
      advice.push(`Rasio tabungan ${formatPercent(summary.savingsRate)} menunjukkan arus kas Anda masih cukup sehat.`);
    }

    if (biggestExpense) {
      advice.push(`Pengeluaran terbesar saat ini adalah ${biggestExpense.description} senilai ${formatCurrency(biggestExpense.amount)}.`);
    }

    if (lower.includes("saldo") || lower.includes("ringkasan") || lower.includes("summary")) {
      return [
        `Pemasukan tercatat ${formatCurrency(summary.totalIncome)}, pengeluaran ${formatCurrency(summary.totalExpense)}, dan saldo bersih ${formatCurrency(summary.balance)}.`,
        `Rasio tabungan berada di ${formatPercent(summary.savingsRate)}.`,
        topCategory ? `Kategori pengeluaran terbesar adalah ${topCategory.category}.` : "Belum ada kategori pengeluaran yang dominan."
      ].join(" ");
    }

    if (lower.includes("terbesar")) {
      if (!biggestExpense) {
        return "Belum ada data pengeluaran untuk dianalisis.";
      }

      return [
        `Pengeluaran terbesar Anda adalah ${biggestExpense.description} di kategori ${biggestExpense.category} sebesar ${formatCurrency(biggestExpense.amount)}.`,
        topCategory ? `Secara kategori, ${topCategory.category} juga menjadi penyumbang utama pengeluaran.` : ""
      ]
        .filter(Boolean)
        .join(" ");
    }

    if (lower.includes("hemat") || lower.includes("anggaran") || lower.includes("budget") || lower.includes("saran")) {
      return ["Rekomendasi singkat berdasarkan data Anda:", ...advice.map((entry) => `- ${entry}`)].join("\n");
    }

    return [
      `Saldo Anda saat ini ${formatCurrency(summary.balance)} dari ${summary.transactionCount} transaksi.`,
      advice[0] || "Arus kas masih bisa dioptimalkan dengan menjaga pengeluaran rutin tetap proporsional.",
      "Anda dapat meminta ringkasan, melihat pengeluaran terbesar, meminta rekomendasi penghematan, atau mencatat transaksi lewat format `catat ...`."
    ].join(" ");
  }

  async function buildChatReply(message, user) {
    const parsedInput = parseChatTransactionCommand(message);
    if (parsedInput) {
      if (parsedInput.error) {
        return {
          action: "transaction-input-invalid",
          mode: "local",
          reply: `${parsedInput.error}\n\n${buildTransactionInputGuide()}`
        };
      }

      try {
        const transaction = createTransactionForUser(user.id, sanitizeTransaction(parsedInput.payload));
        const summary = computeSummary(listTransactionsByUser(user.id));

        return {
          action: "transaction-created",
          mode: "local",
          reply: [
            "Transaksi berhasil dicatat.",
            `${transaction.type === "income" ? "Pemasukan" : "Pengeluaran"} ${formatCurrency(transaction.amount)} untuk ${transaction.description}.`,
            `Kategori: ${transaction.category}. Tanggal: ${transaction.date}.`,
            `Saldo terbaru: ${formatCurrency(summary.balance)}.`
          ].join(" "),
          summary,
          transaction
        };
      } catch (error) {
        return {
          action: "transaction-input-invalid",
          mode: "local",
          reply: `Data belum dapat disimpan: ${error.message}\n\n${buildTransactionInputGuide()}`
        };
      }
    }

    const userTransactions = listTransactionsByUser(user.id);
    const summary = computeSummary(userTransactions);

    return {
      mode: "local",
      reply: generateLocalReply(message, summary)
    };
  }

  return {
    buildChatReply,
    buildTransactionInputGuide,
    computeSummary,
    formatCurrency,
    generateLocalReply,
    parseChatTransactionCommand,
    sanitizeText,
    sanitizeTransaction,
    todayDateValue
  };
}

module.exports = {
  createFinanceAssistantService
};
