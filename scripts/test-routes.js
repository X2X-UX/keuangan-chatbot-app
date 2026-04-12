const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arunika-routes-"));
process.env.ARUNIKA_DATA_DIR = path.join(tempRoot, "data");
process.env.NODE_ENV = "test";

const { createAppServer } = require("../src/server/app");
const { closeDatabase } = require("../src/server/data/database");

run()
  .then(() => {
    console.log("Route tests OK");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

async function run() {
  const server = createAppServer();
  await listen(server);

  try {
    const health = await request(server, "GET", "/api/health");
    assert.strictEqual(health.statusCode, 200);
    assert.strictEqual(health.body.status, "ok");
    assert.ok(health.headers["x-request-id"]);

    const unauthorized = await request(server, "GET", "/api/transactions");
    assert.strictEqual(unauthorized.statusCode, 401);

    const email = `tester-${Date.now()}@example.com`;
    const register = await request(server, "POST", "/api/auth/register", {
      body: {
        email,
        name: "Route Tester",
        password: "rahasia123"
      }
    });

    assert.strictEqual(register.statusCode, 201);
    assert.strictEqual(register.body.user.email, email);
    const sessionCookie = String(register.headers["set-cookie"]?.[0] || "").split(";")[0];
    assert.ok(sessionCookie.startsWith("session_id="));

    const me = await request(server, "GET", "/api/auth/me", {
      headers: {
        Cookie: sessionCookie
      }
    });
    assert.strictEqual(me.statusCode, 200);
    assert.strictEqual(me.body.user.email, email);

    const createTransaction = await request(server, "POST", "/api/transactions", {
      body: {
        amount: 25000,
        category: "Belanja",
        date: "2026-04-12",
        description: "Belanja route test",
        notes: "dibuat dari test route",
        type: "expense"
      },
      headers: {
        Cookie: sessionCookie
      }
    });

    assert.strictEqual(createTransaction.statusCode, 201);
    assert.strictEqual(createTransaction.body.transaction.amount, 25000);

    const transactions = await request(server, "GET", "/api/transactions", {
      headers: {
        Cookie: sessionCookie
      }
    });
    assert.strictEqual(transactions.statusCode, 200);
    assert.strictEqual(transactions.body.transactions.length, 1);

    const summary = await request(server, "GET", "/api/summary", {
      headers: {
        Cookie: sessionCookie
      }
    });
    assert.strictEqual(summary.statusCode, 200);
    assert.strictEqual(summary.body.summary.totalExpense, 25000);
    assert.strictEqual(summary.body.summary.totalIncome, 0);
  } finally {
    await close(server);
    closeDatabase();
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function request(server, method, requestPath, options = {}) {
  const address = server.address();
  const payload = options.body ? JSON.stringify(options.body) : "";

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        method,
        path: requestPath,
        port: typeof address === "object" && address ? address.port : 0,
        headers: {
          ...(payload
            ? {
                "Content-Length": Buffer.byteLength(payload),
                "Content-Type": "application/json"
              }
            : {}),
          ...(options.headers || {})
        }
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          resolve({
            body: parseResponseBody(raw, res.headers["content-type"]),
            headers: res.headers,
            statusCode: res.statusCode || 0
          });
        });
      }
    );

    req.on("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function parseResponseBody(raw, contentType) {
  if (/application\/json/i.test(String(contentType || ""))) {
    return JSON.parse(raw || "{}");
  }

  return raw;
}
