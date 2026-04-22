const path = require("path");

function createTelegramApiService({ appBaseUrl, botToken, botUsername, getTelegramLinkByUserId, mimeTypes, secretToken }) {
  function isTelegramConfigured() {
    return Boolean(botToken);
  }

  function hasTelegramWebhookConfig() {
    return isTelegramConfigured() && Boolean(appBaseUrl);
  }

  function getTelegramBotUrl() {
    return botUsername ? `https://t.me/${botUsername}` : null;
  }

  function getTelegramWebhookUrl() {
    if (!hasTelegramWebhookConfig()) {
      return null;
    }

    return new URL("/api/telegram/webhook", appBaseUrl).toString();
  }

  function buildTelegramStatus(userId) {
    const link = userId ? getTelegramLinkByUserId(userId) : null;
    return {
      botUrl: getTelegramBotUrl(),
      botUsername: botUsername || null,
      configured: isTelegramConfigured(),
      linked: Boolean(link),
      link,
      webhookReady: hasTelegramWebhookConfig()
    };
  }

  function validateTelegramWebhookRequest(req) {
    if (!isTelegramConfigured()) {
      return false;
    }

    if (!secretToken) {
      return true;
    }

    const incomingSecret = String(req.headers["x-telegram-bot-api-secret-token"] || "");
    return incomingSecret === secretToken;
  }

  async function sendTelegramApiRequest(method, payload) {
    if (!isTelegramConfigured()) {
      throw new Error("Telegram bot belum dikonfigurasi.");
    }

    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000)
    });

    const data = await response.json();
    if (!response.ok || data.ok === false) {
      throw new Error(data?.description || `Telegram API ${method} gagal.`);
    }

    return data.result;
  }

  function chunkTelegramText(text) {
    const chunks = [];
    const normalized = String(text || "").trim() || "-";
    const limit = 3500;

    for (let index = 0; index < normalized.length; index += limit) {
      chunks.push(normalized.slice(index, index + limit));
    }

    return chunks.length > 0 ? chunks : ["-"];
  }

  async function sendTelegramMessage(chatId, text, options = {}) {
    const chunks = chunkTelegramText(text);

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const isLastChunk = index === chunks.length - 1;
      await sendTelegramApiRequest("sendMessage", {
        chat_id: chatId,
        text: chunk,
        ...(isLastChunk && options.replyMarkup ? { reply_markup: options.replyMarkup } : {})
      });
    }
  }

  function getMimeTypeFromTelegramFilePath(filePath) {
    return mimeTypes[path.extname(String(filePath || "")).toLowerCase()] || "image/jpeg";
  }

  async function downloadTelegramPhotoUpload(message) {
    const photoList = Array.isArray(message?.photo) ? message.photo : [];
    const picked = photoList[photoList.length - 1];
    if (!picked?.file_id) {
      return null;
    }

    const file = await sendTelegramApiRequest("getFile", {
      file_id: picked.file_id
    });

    if (!file?.file_path) {
      throw new Error("Telegram tidak mengembalikan path file foto.");
    }

    const response = await fetch(`https://api.telegram.org/file/bot${botToken}/${file.file_path}`, {
      signal: AbortSignal.timeout(25_000)
    });

    if (!response.ok) {
      throw new Error("Gagal mengunduh foto struk dari Telegram.");
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      fileName: path.basename(file.file_path),
      mimeType: getMimeTypeFromTelegramFilePath(file.file_path)
    };
  }

  async function ensureTelegramWebhook() {
    if (!hasTelegramWebhookConfig()) {
      return null;
    }

    const payload = {
      url: getTelegramWebhookUrl(),
      allowed_updates: ["message", "callback_query"]
    };

    if (secretToken) {
      payload.secret_token = secretToken;
    }

    return sendTelegramApiRequest("setWebhook", payload);
  }

  return {
    buildTelegramStatus,
    downloadTelegramPhotoUpload,
    ensureTelegramWebhook,
    getTelegramBotUrl,
    hasTelegramWebhookConfig,
    isTelegramConfigured,
    sendTelegramApiRequest,
    sendTelegramMessage,
    validateTelegramWebhookRequest
  };
}

module.exports = {
  createTelegramApiService
};
