function createAuthRoutes({
  authenticateUser,
  buildClearCookie,
  buildSessionCookie,
  createSession,
  createUser,
  deleteSession,
  enforceRateLimit,
  getSessionFromRequest,
  parseJsonBody,
  sendJson,
  sendUnauthorized
}) {
  async function handleAuthRoute(req, res, pathname) {
    if (req.method === "POST" && pathname === "/api/auth/register") {
      if (enforceRateLimit(req, res, "auth", "register")) {
        return true;
      }

      const payload = await parseJsonBody(req);
      const user = createUser(payload);
      const session = createSession(user.id);

      sendJson(
        req,
        res,
        201,
        { message: "Akun berhasil dibuat.", user },
        { "Set-Cookie": buildSessionCookie(session.id) }
      );
      return true;
    }

    if (req.method === "POST" && pathname === "/api/auth/login") {
      const payload = await parseJsonBody(req);
      if (enforceRateLimit(req, res, "auth", `login:${String(payload.email || "").toLowerCase()}`)) {
        return true;
      }

      const user = authenticateUser(payload.email, payload.password);

      if (!user) {
        sendJson(req, res, 401, { error: "Email atau password salah." });
        return true;
      }

      const session = createSession(user.id);
      sendJson(
        req,
        res,
        200,
        { message: "Berhasil masuk.", user },
        { "Set-Cookie": buildSessionCookie(session.id) }
      );
      return true;
    }

    if (req.method === "POST" && pathname === "/api/auth/logout") {
      const session = getSessionFromRequest(req);
      if (session?.sessionId) {
        deleteSession(session.sessionId);
      }

      sendJson(
        req,
        res,
        200,
        { message: "Berhasil keluar." },
        { "Set-Cookie": buildClearCookie() }
      );
      return true;
    }

    if (req.method === "GET" && pathname === "/api/auth/me") {
      const session = getSessionFromRequest(req);
      if (!session) {
        sendUnauthorized(req, res);
        return true;
      }

      sendJson(req, res, 200, { user: session.user });
      return true;
    }

    return false;
  }

  return {
    handleAuthRoute
  };
}

module.exports = {
  createAuthRoutes
};
