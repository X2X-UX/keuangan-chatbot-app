function parseEnvOrigins(value, URLClass = URL) {
  const items = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const origins = new Set();
  for (const item of items) {
    try {
      origins.add(new URLClass(item).origin);
    } catch {
      // ignore malformed origin values from env
    }
  }

  return origins;
}

function buildAllowedOrigins({ appBaseUrl, envAllowedOrigins, port, URLClass = URL }) {
  const origins = new Set();
  const defaults = [
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ];

  for (const item of defaults) {
    origins.add(item);
  }

  try {
    if (appBaseUrl) {
      origins.add(new URLClass(appBaseUrl).origin);
    }
  } catch {
    // APP_BASE_URL validation is handled elsewhere
  }

  const extraOrigins = parseEnvOrigins(envAllowedOrigins, URLClass);
  for (const origin of extraOrigins) {
    origins.add(origin);
  }

  return origins;
}

function createHttpService({
  allowedOrigins,
  rateLimits,
  rateLimitStore,
  sendJsonFallback,
  nodeEnv
}) {
  function getRequestOrigin(req) {
    const origin = String(req?.headers?.origin || "").trim();
    if (origin) {
      try {
        return new URL(origin).origin;
      } catch {
        return "";
      }
    }

    const referer = String(req?.headers?.referer || "").trim();
    if (!referer) {
      return "";
    }

    try {
      return new URL(referer).origin;
    } catch {
      return "";
    }
  }

  function getCorsHeaders(req) {
    const origin = getRequestOrigin(req);
    if (!origin || !allowedOrigins.has(origin)) {
      return {};
    }

    return {
      "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin"
    };
  }

  function getSecurityHeaders(req) {
    const headers = {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY"
    };

    headers["Content-Security-Policy"] = [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data:",
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'"
    ].join("; ");

    if (nodeEnv === "production") {
      const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "").toLowerCase();
      if (forwardedProto.includes("https")) {
        headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
      }
    }

    return headers;
  }

  function getClientIp(req) {
    const forwarded = String(req.headers["x-forwarded-for"] || "").trim();
    if (forwarded) {
      return forwarded.split(",")[0].trim();
    }

    return String(req.socket?.remoteAddress || "unknown");
  }

  function sweepRateLimitStore(now = Date.now()) {
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetAt <= now) {
        rateLimitStore.delete(key);
      }
    }
  }

  function takeRateLimit(bucket, identifier) {
    const config = rateLimits[bucket];
    if (!config) {
      return { limited: false, retryAfterSeconds: 0 };
    }

    const now = Date.now();
    if (rateLimitStore.size > 10_000) {
      sweepRateLimitStore(now);
    }

    const key = `${bucket}:${identifier}`;
    const current = rateLimitStore.get(key);
    if (!current || current.resetAt <= now) {
      rateLimitStore.set(key, { count: 1, resetAt: now + config.windowMs });
      return { limited: false, retryAfterSeconds: 0 };
    }

    current.count += 1;
    rateLimitStore.set(key, current);
    if (current.count <= config.max) {
      return { limited: false, retryAfterSeconds: 0 };
    }

    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
    };
  }

  function isUnsafeApiMutation(method) {
    return method === "POST" || method === "DELETE" || method === "PUT" || method === "PATCH";
  }

  function isTrustedRequestOrigin(req) {
    const secFetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
    if (secFetchSite && !["same-origin", "same-site", "none"].includes(secFetchSite)) {
      return false;
    }

    const origin = getRequestOrigin(req);
    if (!origin) {
      return true;
    }

    return allowedOrigins.has(origin);
  }

  function sendJson(arg1, arg2, arg3, arg4, arg5) {
    const hasReq = Boolean(arg1 && typeof arg1.method === "string" && arg1.headers);
    const req = hasReq ? arg1 : null;
    const res = hasReq ? arg2 : arg1;
    const statusCode = hasReq ? arg3 : arg2;
    const payload = hasReq ? arg4 : arg3;
    const extraHeaders = hasReq ? arg5 || {} : arg4 || {};

    res.writeHead(statusCode, {
      ...getSecurityHeaders(req),
      ...getCorsHeaders(req),
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    });
    res.end(JSON.stringify(payload));
  }

  function sendText(arg1, arg2, arg3, arg4) {
    const hasReq = Boolean(arg1 && typeof arg1.method === "string" && arg1.headers);
    const req = hasReq ? arg1 : null;
    const res = hasReq ? arg2 : arg1;
    const statusCode = hasReq ? arg3 : arg2;
    const text = hasReq ? arg4 : arg3;

    res.writeHead(statusCode, {
      ...getSecurityHeaders(req),
      ...getCorsHeaders(req),
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8"
    });
    res.end(text);
  }

  function sendUnauthorized(req, res) {
    sendJson(req, res, 401, { error: "Silakan masuk terlebih dahulu." });
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let body = "";

      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 5_000_000) {
          reject(new Error("Payload terlalu besar."));
          req.destroy();
        }
      });

      req.on("end", () => resolve(body));
      req.on("error", reject);
    });
  }

  async function parseJsonBody(req) {
    const raw = await readBody(req);
    if (!raw) {
      return {};
    }

    try {
      return JSON.parse(raw);
    } catch {
      throw new Error("Body JSON tidak valid.");
    }
  }

  function enforceRateLimit(req, res, bucket, identifierSuffix = "") {
    const identifier = `${getClientIp(req)}:${identifierSuffix}`;
    const { limited, retryAfterSeconds } = takeRateLimit(bucket, identifier);
    if (!limited) {
      return false;
    }

    (sendJsonFallback || sendJson)(req, res, 429, { error: "Terlalu banyak permintaan. Silakan coba kembali beberapa saat lagi." }, {
      "Retry-After": String(retryAfterSeconds)
    });
    return true;
  }

  return {
    enforceRateLimit,
    getCorsHeaders,
    getSecurityHeaders,
    isTrustedRequestOrigin,
    isUnsafeApiMutation,
    parseJsonBody,
    readBody,
    sendJson,
    sendText,
    sendUnauthorized
  };
}

module.exports = {
  buildAllowedOrigins,
  createHttpService,
  parseEnvOrigins
};
