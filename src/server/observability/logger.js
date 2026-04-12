const { randomUUID } = require("crypto");

function createLogger({ nodeEnv = process.env.NODE_ENV, serviceName = "arunika-finance" } = {}) {
  function write(level, message, context = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: serviceName,
      message,
      ...context
    };

    const line = JSON.stringify(entry);
    if (level === "error") {
      console.error(line);
      return;
    }

    if (level === "warn") {
      console.warn(line);
      return;
    }

    if (level === "debug" && nodeEnv === "production") {
      return;
    }

    console.log(line);
  }

  return {
    debug(message, context) {
      write("debug", message, context);
    },
    error(message, context) {
      write("error", message, context);
    },
    info(message, context) {
      write("info", message, context);
    },
    warn(message, context) {
      write("warn", message, context);
    }
  };
}

function getRequestId(req) {
  if (req && req.__requestId) {
    return req.__requestId;
  }

  const headerValue = String(req?.headers?.["x-request-id"] || "").trim();
  const requestId = headerValue || randomUUID();

  if (req) {
    req.__requestId = requestId;
  }

  return requestId;
}

module.exports = {
  createLogger,
  getRequestId
};
