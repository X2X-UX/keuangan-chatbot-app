const TRANSACTION_CATEGORY_OPTIONS = {
  expense: [
    "Makanan",
    "Transportasi",
    "Tagihan",
    "Belanja",
    "Kesehatan",
    "Pendidikan",
    "Hiburan",
    "Rumah Tangga"
  ],
  income: [
    "Gaji",
    "Freelance",
    "Bonus",
    "Penjualan",
    "Investasi",
    "Hadiah"
  ]
};

const TRANSACTION_CATEGORY_ALIASES = {
  expense: {
    Makanan: ["makan", "makanan", "kuliner", "sarapan", "makan siang", "makan malam", "snack", "jajan"],
    Transportasi: ["transport", "transportasi", "bensin", "bbm", "parkir", "ojek", "tol", "kereta", "bus"],
    Tagihan: ["tagihan", "listrik", "air", "ipl", "pln", "pam", "bpjs", "asuransi", "telepon"],
    Belanja: ["belanja", "shopping", "sembako", "minimarket", "supermarket", "marketplace"],
    Kesehatan: ["kesehatan", "obat", "dokter", "klinik", "rumah sakit", "vitamin"],
    Pendidikan: ["pendidikan", "sekolah", "kuliah", "kursus", "buku", "les"],
    Hiburan: ["hiburan", "bioskop", "game", "streaming", "rekreasi", "nongkrong"],
    "Rumah Tangga": ["rumah tangga", "kebersihan", "dapur", "perabot", "alat rumah"]
  },
  income: {
    Gaji: ["gaji", "salary", "payroll"],
    Freelance: ["freelance", "freelan", "project", "proyek", "jasa", "fee"],
    Bonus: ["bonus", "insentif", "reward"],
    Penjualan: ["penjualan", "jualan", "sales", "omzet", "order"],
    Investasi: ["investasi", "return", "capital gain", "profit"],
    Hadiah: ["hadiah", "gift", "pemberian", "hibah"]
  }
};

function normalizeCategoryToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTransactionCategories(type) {
  return Array.isArray(TRANSACTION_CATEGORY_OPTIONS[type]) ? [...TRANSACTION_CATEGORY_OPTIONS[type]] : [];
}

function findCanonicalCategory(type, rawValue) {
  const normalizedValue = normalizeCategoryToken(rawValue);
  if (!normalizedValue) {
    return null;
  }

  for (const category of getTransactionCategories(type)) {
    if (normalizeCategoryToken(category) === normalizedValue) {
      return category;
    }
  }

  const aliases = TRANSACTION_CATEGORY_ALIASES[type] || {};
  for (const category of getTransactionCategories(type)) {
    const aliasList = aliases[category] || [];
    for (const alias of aliasList) {
      const normalizedAlias = normalizeCategoryToken(alias);
      if (
        normalizedAlias === normalizedValue ||
        normalizedValue.includes(normalizedAlias) ||
        normalizedAlias.includes(normalizedValue)
      ) {
        return category;
      }
    }
  }

  return null;
}

function inferTransactionCategory(type, text) {
  const normalizedText = normalizeCategoryToken(text);
  if (!normalizedText) {
    return null;
  }

  const aliases = TRANSACTION_CATEGORY_ALIASES[type] || {};
  for (const category of getTransactionCategories(type)) {
    const aliasList = aliases[category] || [];
    for (const alias of aliasList) {
      const normalizedAlias = normalizeCategoryToken(alias);
      if (normalizedAlias && normalizedText.includes(normalizedAlias)) {
        return category;
      }
    }
  }

  return null;
}

function formatTransactionCategoryList(type) {
  return getTransactionCategories(type).join(", ");
}

const exported = {
  TRANSACTION_CATEGORY_OPTIONS,
  findCanonicalCategory,
  formatTransactionCategoryList,
  getTransactionCategories,
  inferTransactionCategory
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = exported;
}

if (typeof globalThis !== "undefined") {
  globalThis.TRANSACTION_CATEGORY_OPTIONS = TRANSACTION_CATEGORY_OPTIONS;
}
