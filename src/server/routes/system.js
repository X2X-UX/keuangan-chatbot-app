function createSystemRoutes({
  appName,
  chatModeResolver,
  fsp,
  fs,
  getCorsHeaders,
  getSecurityHeaders,
  hasTelegramWebhookConfig,
  isTelegramConfigured,
  mimeTypes,
  model,
  path,
  publicDir,
  sendJson,
  sendText
}) {
  async function serveStatic(req, res, pathname) {
    const targetPath = pathname === "/" ? "/index.html" : pathname;
    const safeRelative = path
      .normalize(decodeURIComponent(targetPath))
      .replace(/^([/\\])+/, "")
      .replace(/^(\.\.[/\\])+/, "");
    const filePath = path.join(publicDir, safeRelative);
    const relativePath = path.relative(publicDir, filePath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      sendText(req, res, 403, "Akses file ditolak.");
      return;
    }

    try {
      const stat = await fsp.stat(filePath);
      if (!stat.isFile()) {
        sendText(req, res, 404, "File tidak ditemukan.");
        return;
      }

      const extension = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        ...getSecurityHeaders(req),
        ...getCorsHeaders(req),
        "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=300",
        "Content-Type": mimeTypes[extension] || "application/octet-stream"
      });
      fs.createReadStream(filePath).pipe(res);
    } catch {
      sendText(req, res, 404, "File tidak ditemukan.");
    }
  }

  async function handleSystemRoute(req, res, pathname) {
    if (req.method === "GET" && pathname === "/api/health") {
      sendJson(req, res, 200, {
        appName,
        authRequired: true,
        chatMode: chatModeResolver(),
        database: "sqlite",
        model,
        status: "ok",
        telegramConfigured: isTelegramConfigured(),
        telegramWebhookReady: hasTelegramWebhookConfig()
      });
      return true;
    }

    return false;
  }

  return {
    handleSystemRoute,
    serveStatic
  };
}

module.exports = {
  createSystemRoutes
};
