function createChatRoutes({
  buildChatReply,
  enforceRateLimit,
  parseJsonBody,
  sendJson
}) {
  async function handleChatRoute(req, res, pathname, session) {
    if (!session) {
      return false;
    }

    if (req.method !== "POST" || pathname !== "/api/chat") {
      return false;
    }

    if (enforceRateLimit(req, res, "chat", `user:${session.user.id}`)) {
      return true;
    }

    const payload = await parseJsonBody(req);
    const message = String(payload.message || "").trim();
    if (!message) {
      sendJson(req, res, 400, { error: "Pesan asisten tidak boleh kosong." });
      return true;
    }

    const result = await buildChatReply(message, Array.isArray(payload.history) ? payload.history : [], session.user);
    sendJson(req, res, 200, result);
    return true;
  }

  return {
    handleChatRoute
  };
}

module.exports = {
  createChatRoutes
};
