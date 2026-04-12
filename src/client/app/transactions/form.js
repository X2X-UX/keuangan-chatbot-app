function populateTransactionForm(transaction) {
  if (!transaction) {
    return;
  }

  state.editingTransactionId = transaction.id;
  state.transactionEntryMethod = transaction.receiptPath ? "scan" : "manual";
  state.transactionEntryStep = "review";
  state.transactionReviewVisited = true;
  elements.transactionType.value = transaction.type;
  syncTransactionCategoryOptions(transaction.category);
  elements.transactionForm.elements.description.value = transaction.description || "";
  elements.transactionAmount.value = formatFlexibleCurrency(transaction.amount);
  elements.transactionForm.elements.date.value = transaction.date || todayInputValue();
  elements.transactionForm.elements.notes.value = transaction.notes || "";
  renderTransactionAmountHint();
  resetTransactionReceiptState(transaction);
  setTransactionFormMode(true);
  elements.transactionForm.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
}

