function createSessionAuth({
  cookieName,
  getSessionWithUser,
  nodeEnv,
  sameSite,
  sessionMaxAgeSeconds
}) {
  function parseCookies(req) {
    const cookieHeader = String(req.headers.cookie || "");
    if (!cookieHeader) {
      return {};
    }

    return Object.fromEntries(
      cookieHeader.split(";").map((part) => {
        const [key, ...rest] = part.trim().split("=");
        return [key, decodeURIComponent(rest.join("="))];
      })
    );
  }

  function getSessionFromRequest(req) {
    const cookies = parseCookies(req);
    return getSessionWithUser(cookies[cookieName]);
  }

  function buildSessionCookie(sessionId) {
    const parts = [
      `${cookieName}=${sessionId}`,
      "Path=/",
      "HttpOnly",
      `SameSite=${sameSite}`,
      `Max-Age=${sessionMaxAgeSeconds}`
    ];

    if (nodeEnv === "production") {
      parts.push("Secure");
    }

    return parts.join("; ");
  }

  function buildClearCookie() {
    const parts = [`${cookieName}=`, "Path=/", "HttpOnly", `SameSite=${sameSite}`, "Max-Age=0"];
    if (nodeEnv === "production") {
      parts.push("Secure");
    }

    return parts.join("; ");
  }

  return {
    buildClearCookie,
    buildSessionCookie,
    getSessionFromRequest,
    parseCookies
  };
}

module.exports = {
  createSessionAuth
};
