(() => {
  const flexibleAmountCurrencyFormatter = new Intl.NumberFormat("id-ID", {
    currency: "IDR",
    maximumFractionDigits: 0,
    style: "currency"
  });

  const AMOUNT_SUFFIX_MULTIPLIERS = {
    j: 1_000_000,
    jt: 1_000_000,
    juta: 1_000_000,
    k: 1_000,
    m: 1_000_000,
    rb: 1_000,
    ribu: 1_000
  };

  function formatFlexibleCurrency(value) {
    return flexibleAmountCurrencyFormatter.format(Number(value) || 0);
  }

  function splitAmountSuffix(value) {
    const match = String(value || "")
      .trim()
      .toLowerCase()
      .match(/^(.*?)(?:\s*(rb|ribu|k|jt|juta|m|j))?$/i);

    return {
      numericPart: match ? match[1].trim() : "",
      suffix: match && match[2] ? match[2].toLowerCase() : ""
    };
  }

  function normalizeDecimalNumber(value) {
    const raw = String(value || "").replace(/\s+/g, "");
    if (!raw) {
      return "";
    }

    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    const decimalIndex = Math.max(lastComma, lastDot);

    if (decimalIndex === -1) {
      return raw.replace(/[^\d]/g, "");
    }

    const integerPart = raw.slice(0, decimalIndex).replace(/[^\d]/g, "");
    const decimalPart = raw.slice(decimalIndex + 1).replace(/[^\d]/g, "");

    if (!integerPart && !decimalPart) {
      return "";
    }

    return decimalPart ? `${integerPart || "0"}.${decimalPart}` : integerPart;
  }

  function countOccurrences(value, pattern) {
    return (String(value || "").match(pattern) || []).length;
  }

  function hasGroupedThousands(value, separator) {
    const parts = String(value || "").split(separator);
    return parts.length > 1 && parts.slice(1).every((part) => /^\d{3}$/.test(part));
  }

  function parsePlainCurrencyAmount(value) {
    const raw = String(value || "")
      .replace(/\s+/g, "")
      .replace(/idr/gi, "")
      .replace(/[^\d,.-]/g, "")
      .replace(/^[+-]/, "");

    if (!raw) {
      return null;
    }

    const commaCount = countOccurrences(raw, /,/g);
    const dotCount = countOccurrences(raw, /\./g);
    const digitsOnly = raw.replace(/[^\d]/g, "");

    if (!commaCount && !dotCount) {
      return digitsOnly ? Number.parseInt(digitsOnly, 10) : null;
    }

    if (commaCount && !dotCount) {
      if (hasGroupedThousands(raw, ",")) {
        return Number.parseInt(raw.replace(/,/g, ""), 10);
      }

      const parts = raw.split(",");
      if (parts.length === 2 && /^\d{1,2}$/.test(parts[1])) {
        const normalized = normalizeDecimalNumber(raw);
        const amount = Number(normalized);
        return Number.isFinite(amount) ? Math.round(amount) : null;
      }

      return digitsOnly ? Number.parseInt(digitsOnly, 10) : null;
    }

    if (dotCount && !commaCount) {
      if (hasGroupedThousands(raw, ".")) {
        return Number.parseInt(raw.replace(/\./g, ""), 10);
      }

      const parts = raw.split(".");
      if (parts.length === 2 && /^\d{1,2}$/.test(parts[1])) {
        const normalized = normalizeDecimalNumber(raw);
        const amount = Number(normalized);
        return Number.isFinite(amount) ? Math.round(amount) : null;
      }

      return digitsOnly ? Number.parseInt(digitsOnly, 10) : null;
    }

    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    const decimalIndex = Math.max(lastComma, lastDot);
    const decimalPart = raw.slice(decimalIndex + 1).replace(/[^\d]/g, "");

    if (/^\d{1,2}$/.test(decimalPart)) {
      const normalized = normalizeDecimalNumber(raw);
      const amount = Number(normalized);
      return Number.isFinite(amount) ? Math.round(amount) : null;
    }

    return digitsOnly ? Number.parseInt(digitsOnly, 10) : null;
  }

  function parseFlexibleAmount(value) {
    const raw = String(value || "")
      .toLowerCase()
      .replace(/rp\.?/g, "")
      .trim();

    if (!raw) {
      return null;
    }

    const { numericPart, suffix } = splitAmountSuffix(raw);
    const multiplier = suffix ? AMOUNT_SUFFIX_MULTIPLIERS[suffix] : 1;

    if (!numericPart) {
      return null;
    }

    if (multiplier > 1) {
      const normalized = normalizeDecimalNumber(numericPart);
      if (!normalized) {
        return null;
      }

      const amount = Number(normalized) * multiplier;
      return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null;
    }

    const amount = parsePlainCurrencyAmount(numericPart);
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }

    return amount;
  }

  const transactionAmountExports = {
    formatCurrency: formatFlexibleCurrency,
    parseFlexibleAmount
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = transactionAmountExports;
  }

  if (typeof globalThis !== "undefined") {
    globalThis.formatFlexibleCurrency = formatFlexibleCurrency;
    globalThis.parseFlexibleAmount = parseFlexibleAmount;
  }
})();
