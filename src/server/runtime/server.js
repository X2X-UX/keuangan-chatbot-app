const http = require("http");

function createServerRuntime({
  URLClass,
  autoSetTelegramWebhook,
  ensureTelegramWebhook,
  enforceRateLimit,
  getCorsHeaders,
  getRequestId,
  getSecurityHeaders,
  getSessionFromRequest,
  handleAuthRoute,
  handleChatRoute,
  handleSystemRoute,
  handleTelegramRoute,
  handleTransactionRoute,
  hasTelegramWebhookConfig,
  initializeDatabase,
  isTrustedRequestOrigin,
  isUnsafeApiMutation,
  logger,
  port,
  sendJson,
  sendText,
  sendUnauthorized,
  serveStatic,
  slowRequestThresholdMs
}) {
  function resolveApiErrorStatusCode(message) {
    return /wajib|harus|valid|password|email|telegram|kategori|nominal|tanggal|transaksi/i.test(String(message || ""))
      ? 400
      : 500;
  }

  async function handleRequest(req, res) {
    if (!req.url) {
      sendText(req, res, 400, "Permintaan tidak valid.");
      return;
    }

    let pathname = "";

    if (req.method === "OPTIONS") {
      const corsHeaders = getCorsHeaders(req);
      const hasOrigin = Boolean(String(req.headers.origin || "").trim());
      if (hasOrigin && Object.keys(corsHeaders).length === 0) {
        sendJson(req, res, 403, { error: "Origin tidak diizinkan." });
        return;
      }

      res.writeHead(204, {
        ...getSecurityHeaders(req),
        ...corsHeaders,
        "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      });
      res.end();
      return;
    }

    const url = new URLClass(req.url, "http://localhost");
    pathname = url.pathname;

    try {
      const isApiPath = pathname.startsWith("/api/");
      const isWebhookPath = pathname === "/api/telegram/webhook";

      if (isApiPath && isUnsafeApiMutation(req.method) && !isWebhookPath && !isTrustedRequestOrigin(req)) {
        sendJson(req, res, 403, { error: "Origin permintaan tidak diizinkan." });
        return;
      }

      if (isWebhookPath) {
        if (enforceRateLimit(req, res, "telegramWebhook")) {
          return;
        }
      } else if (isApiPath && enforceRateLimit(req, res, "api")) {
        return;
      }

      if (await handleTelegramRoute(req, res, pathname)) {
        return;
      }

      if (await handleSystemRoute(req, res, pathname)) {
        return;
      }

      if (await handleAuthRoute(req, res, pathname)) {
        return;
      }

      const session = getSessionFromRequest(req);
      if (!session && pathname.startsWith("/api/")) {
        sendUnauthorized(req, res);
        return;
      }

      if (await handleTelegramRoute(req, res, pathname, session)) {
        return;
      }

      if (await handleTransactionRoute(req, res, url, session)) {
        return;
      }

      if (await handleChatRoute(req, res, pathname, session)) {
        return;
      }

      await serveStatic(req, res, pathname);
    } catch (error) {
      const requestId = getRequestId(req);
      const statusCode = resolveApiErrorStatusCode(error?.message);
      if (statusCode >= 500) {
        logger.error("unhandled-server-error", {
          errorMessage: error?.message || "Unknown error",
          method: req.method,
          pathname,
          requestId
        });
        sendJson(req, res, 500, { error: "Terjadi kesalahan pada server. Silakan coba kembali." });
        return;
      }

      sendJson(req, res, statusCode, { error: error?.message || "Permintaan tidak dapat diproses." });
    }
  }

  function createAppServer() {
    return http.createServer((req, res) => {
      const requestId = getRequestId(req);
      const startedAt = Date.now();

      res.setHeader("X-Request-Id", requestId);
      res.on("finish", () => {
        const durationMs = Date.now() - startedAt;
        const pathname = req.url ? new URLClass(req.url, "http://localhost").pathname : "";
        if (!pathname.startsWith("/api/")) {
          return;
        }

        if (res.statusCode >= 500) {
          logger.error("api-request-failed", {
            durationMs,
            method: req.method,
            pathname,
            requestId,
            statusCode: res.statusCode
          });
          return;
        }

        if (res.statusCode >= 400) {
          logger.warn("api-request-warning", {
            durationMs,
            method: req.method,
            pathname,
            requestId,
            statusCode: res.statusCode
          });
          return;
        }

        if (durationMs >= slowRequestThresholdMs) {
          logger.info("api-request-slow", {
            durationMs,
            method: req.method,
            pathname,
            requestId,
            statusCode: res.statusCode
          });
        }
      });

      Promise.resolve(handleRequest(req, res)).catch((error) => {
        logger.error("request-dispatch-failed", {
          errorMessage: error?.message || "Unknown error",
          method: req.method,
          pathname: req.url || "",
          requestId
        });
        if (!res.headersSent) {
          sendJson(req, res, 500, { error: "Terjadi kesalahan pada server. Silakan coba kembali." });
        } else {
          res.end();
        }
      });
    });
  }

  async function startServer(activePort = port) {
    initializeDatabase();
    logger.info("server-starting", {
      port: activePort
    });

    if (autoSetTelegramWebhook && hasTelegramWebhookConfig()) {
      try {
        await ensureTelegramWebhook();
      } catch (error) {
        logger.warn("telegram-webhook-setup-failed", {
          errorMessage: error?.message || "Unknown error"
        });
      }
    }

    const server = createAppServer();
    await new Promise((resolve) => server.listen(activePort, "0.0.0.0", resolve));
    logger.info("server-ready", {
      port: activePort
    });
    return server;
  }

  return {
    createAppServer,
    handleRequest,
    startServer
  };
}

module.exports = {
  createServerRuntime
};
