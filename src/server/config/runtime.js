const fs = require("fs");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const index = trimmed.indexOf("=");
    if (index === -1) {
      continue;
    }

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function readPositiveIntEnv(value, fallback) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readRateLimitEnv(prefix, fallback) {
  return {
    max: readPositiveIntEnv(process.env[`RATE_LIMIT_${prefix}_MAX`], fallback.max),
    windowMs: readPositiveIntEnv(process.env[`RATE_LIMIT_${prefix}_WINDOW_MS`], fallback.windowMs)
  };
}

function parseCookieSameSite(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["strict", "none"].includes(normalized)) {
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  return "Lax";
}

module.exports = {
  loadEnvFile,
  parseCookieSameSite,
  readPositiveIntEnv,
  readRateLimitEnv
};
