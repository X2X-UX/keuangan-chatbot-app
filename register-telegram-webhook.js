const fs = require("fs");
const path = require("path");

loadEnvFile(path.join(__dirname, ".env"));

const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const appBaseUrl = String(process.env.APP_BASE_URL || "").trim();
const secret = String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();

if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN belum diisi.");
}

if (!appBaseUrl) {
  throw new Error("APP_BASE_URL belum diisi.");
}

async function main() {
  const url = new URL("/api/telegram/webhook", appBaseUrl).toString();
  const payload = {
    allowed_updates: ["message"],
    url
  };

  if (secret) {
    payload.secret_token = secret;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(data?.description || "Gagal mendaftarkan webhook Telegram.");
  }

  console.log(JSON.stringify({ ok: true, webhookUrl: url, result: data.result }, null, 2));
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

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
