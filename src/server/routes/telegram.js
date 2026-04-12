function createTelegramRoutes({
  buildTelegramStatus,
  createTelegramLinkCode,
  handleTelegramUpdate,
  isTelegramConfigured,
  parseJsonBody,
  sendJson,
  unlinkTelegramByUserId,
  validateTelegramWebhookRequest
}) {
  async function handleTelegramRoute(req, res, pathname, session = null) {
    if (req.method === "POST" && pathname === "/api/telegram/webhook") {
      if (!isTelegramConfigured()) {
        sendJson(req, res, 503, { error: "Telegram bot belum dikonfigurasi." });
        return true;
      }

      if (!validateTelegramWebhookRequest(req)) {
        sendJson(req, res, 403, { error: "Webhook Telegram ditolak." });
        return true;
      }

      const payload = await parseJsonBody(req);
      sendJson(req, res, 200, { ok: true });
      handleTelegramUpdate(payload).catch((error) => {
        console.error("Telegram update failed:", error.message);
      });
      return true;
    }

    if (!session) {
      return false;
    }

    if (req.method === "GET" && pathname === "/api/telegram/status") {
      sendJson(req, res, 200, buildTelegramStatus(session.user.id));
      return true;
    }

    if (req.method === "POST" && pathname === "/api/telegram/link-code") {
      if (!isTelegramConfigured()) {
        sendJson(req, res, 400, {
          error: "Telegram belum siap. Isi TELEGRAM_BOT_TOKEN setelah aplikasi dihosting."
        });
        return true;
      }

      const code = createTelegramLinkCode(session.user.id);
      sendJson(req, res, 201, {
        ...buildTelegramStatus(session.user.id),
        command: code.code,
        expiresAt: code.expiresAt,
        linkCode: code.code
      });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/telegram/unlink") {
      const removed = unlinkTelegramByUserId(session.user.id);
      sendJson(req, res, 200, {
        ...buildTelegramStatus(session.user.id),
        message: removed ? "Telegram berhasil diputus dari akun ini." : "Akun ini belum terhubung ke Telegram."
      });
      return true;
    }

    return false;
  }

  return {
    handleTelegramRoute
  };
}

module.exports = {
  createTelegramRoutes
};
