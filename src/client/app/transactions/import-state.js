function resetImportState(options = {}) {
  const preserveMessage = options.preserveMessage === true;
  state.csvImport = null;
  elements.importMappingSection.classList.add("is-hidden");
  elements.importPreviewSection.classList.add("is-hidden");
  elements.importPreviewList.innerHTML = "";
  elements.importPreviewSummary.textContent = "Belum ada data yang dipreview.";
  elements.importFileName.textContent = "Belum ada file";
  elements.importMetaText.textContent = "Unggah file untuk melihat mapping kolom.";
  elements.importPreviewButton.disabled = true;
  elements.importSubmitButton.disabled = true;
  if (elements.importPresetSelect) {
    elements.importPresetSelect.innerHTML = "";
    elements.importPresetSelect.disabled = true;
  }

  for (const element of Object.values(IMPORT_MAPPING_ELEMENTS)) {
    if (element) {
      element.innerHTML = "";
    }
  }

  if (!preserveMessage) {
    setImportMessage("");
  }
}

function setImportMessage(message, tone = "") {
  elements.importMessage.textContent = message;
  elements.importMessage.classList.toggle("is-error", tone === "error");
  elements.importMessage.classList.toggle("is-success", tone === "success");
}

function normalizeImportHeader(value, index) {
  const trimmed = String(value || "").trim();
  return trimmed || `Kolom ${index + 1}`;
}

function normalizeImportHeaderToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectCsvDelimiter(text) {
  const sample = String(text || "").split(/\r?\n/, 1)[0] || "";
  const commaCount = (sample.match(/,/g) || []).length;
  const semicolonCount = (sample.match(/;/g) || []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

