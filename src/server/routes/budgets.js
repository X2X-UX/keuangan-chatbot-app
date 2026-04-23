function createBudgetRoutes({
  computeUserSummary,
  deleteCategoryBudgetForUser,
  enforceRateLimit,
  findCanonicalCategory,
  listCategoryBudgetsByUser,
  parseFlexibleAmount,
  parseJsonBody,
  sendJson,
  upsertCategoryBudgetForUser
}) {
  function todayMonthValue() {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - offsetMs).toISOString().slice(0, 7);
  }

  function sanitizeBudgetMonth(value) {
    const month = String(value || todayMonthValue()).trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new Error("Periode budget harus memakai format YYYY-MM.");
    }
    return month;
  }

  function sanitizeBudgetPayload(payload) {
    const month = sanitizeBudgetMonth(payload?.month);
    const category = findCanonicalCategory("expense", payload?.category);
    if (!category) {
      throw new Error("Kategori budget harus memakai kategori pengeluaran yang valid.");
    }

    const rawAmount = String(payload?.amount ?? "").trim();
    if (!rawAmount) {
      return {
        amount: 0,
        category,
        month
      };
    }

    const amount = parseFlexibleAmount(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Nominal budget harus lebih besar dari nol atau kosongkan field untuk menghapus budget.");
    }

    return {
      amount: Math.round(amount),
      category,
      month
    };
  }

  async function handleBudgetRoute(req, res, url, session) {
    const pathname = url.pathname;

    if (req.method === "GET" && pathname === "/api/budgets") {
      const month = sanitizeBudgetMonth(url.searchParams.get("month"));
      sendJson(req, res, 200, {
        budgets: listCategoryBudgetsByUser(session.user.id, month),
        month,
        summary: computeUserSummary(session.user.id, { activeMonth: month })
      });
      return true;
    }

    if (req.method === "PUT" && pathname === "/api/budgets") {
      if (enforceRateLimit(req, res, "transactionWrite", `budget:${session.user.id}`)) {
        return true;
      }

      const payload = await parseJsonBody(req);
      const budget = sanitizeBudgetPayload(payload);
      const removedBudget = !budget.amount ? deleteCategoryBudgetForUser(session.user.id, budget.month, budget.category) : null;
      const savedBudget = budget.amount ? upsertCategoryBudgetForUser(session.user.id, budget) : null;

      sendJson(req, res, 200, {
        budget: savedBudget,
        budgets: listCategoryBudgetsByUser(session.user.id, budget.month),
        message: savedBudget
          ? `Budget ${savedBudget.category} untuk ${savedBudget.month} berhasil disimpan.`
          : removedBudget
            ? `Budget ${budget.category} untuk ${budget.month} berhasil dihapus.`
            : `Tidak ada budget ${budget.category} untuk ${budget.month} yang perlu dihapus.`,
        month: budget.month,
        summary: computeUserSummary(session.user.id, { activeMonth: budget.month })
      });
      return true;
    }

    return false;
  }

  return {
    handleBudgetRoute
  };
}

module.exports = {
  createBudgetRoutes
};
