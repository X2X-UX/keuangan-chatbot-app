const fs = require("fs");
const path = require("path");

const requiredForTelegram = ["APP_BASE_URL", "TELEGRAM_BOT_TOKEN"];
const recommended = ["TELEGRAM_BOT_USERNAME", "OPENAI_API_KEY", "TELEGRAM_WEBHOOK_SECRET"];

loadEnvFile(path.join(__dirname, "..", ".env"));

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function mask(name, value) {
  if (!value) {
    return "[EMPTY]";
  }

  if (/(TOKEN|KEY|SECRET)/i.test(name)) {
    return "[SET]";
  }

  return value;
}

let hasError = false;

console.log("Arunika Finance preflight");
console.log("=========================");

for (const key of requiredForTelegram) {
  const value = String(process.env[key] || "").trim();
  const ok = Boolean(value);

  if (!ok) {
    hasError = true;
  }

  console.log(`${ok ? "[OK]  " : "[ERR] "} ${key} = ${mask(key, value)}`);
}

const appBaseUrl = String(process.env.APP_BASE_URL || "").trim();
if (appBaseUrl && !isHttpsUrl(appBaseUrl)) {
  hasError = true;
  console.log("[ERR] APP_BASE_URL must be a public HTTPS URL.");
}

for (const key of recommended) {
  const value = String(process.env[key] || "").trim();
  console.log(`${value ? "[INFO]" : "[WARN]"} ${key} = ${mask(key, value)}`);
}

if (hasError) {
  console.log("\nStatus: NOT READY");
  process.exitCode = 1;
} else {
  console.log("\nStatus: READY FOR DEPLOYMENT");
}

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

    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
