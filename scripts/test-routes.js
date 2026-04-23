const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arunika-routes-"));
process.env.ARUNIKA_DATA_DIR = path.join(tempRoot, "data");
process.env.NODE_ENV = "test";
process.env.OCR_SPACE_API_KEY = "test-key";

const originalFetch = global.fetch;
global.fetch = async (url) => {
  if (/ocr\.space\/parse\/image/i.test(String(url))) {
    return {
      ok: true,
      json: async () => ({
        IsErroredOnProcessing: false,
        ParsedResults: [
          {
            FileParseExitCode: 1,
            ParsedText: [
              "Alfamart",
              "Status Order",
              "Selesai",
              "TAMAN DADAP",
              "Ref. S-260301-AGTNQLW",
              "Subtotal 113,800",
              "Total Diskon -14,000",
              "Biaya Pengiriman 0",
              "Total 99,800",
              "Tgl. 03-01-2026 11:43:48"
            ].join("\n")
          }
        ]
      })
    };
  }

  throw new Error(`Unexpected fetch in route tests: ${url}`);
};

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
    assert.strictEqual(health.body.chatMode, "local");
    assert.strictEqual(health.body.model, "local-finance-assistant");
    assert.ok(health.headers["x-request-id"]);

    const meUnauthorized = await request(server, "GET", "/api/auth/me");
    assert.strictEqual(meUnauthorized.statusCode, 401);

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
    const registerSetCookie = String(register.headers["set-cookie"]?.[0] || "");
    const registerSessionCookie = registerSetCookie.split(";")[0];
    assert.ok(registerSessionCookie.startsWith("session_id="));
    assert.match(registerSetCookie, /HttpOnly/);
    assert.match(registerSetCookie, /Path=\//);
    assert.match(registerSetCookie, /SameSite=Lax/);

    const duplicateRegister = await request(server, "POST", "/api/auth/register", {
      body: {
        email,
        name: "Route Tester",
        password: "rahasia123"
      }
    });
    assert.strictEqual(duplicateRegister.statusCode, 400);
    assert.match(String(duplicateRegister.body.error || ""), /email/i);

    const failedLogin = await request(server, "POST", "/api/auth/login", {
      body: {
        email,
        password: "password-salah"
      }
    });
    assert.strictEqual(failedLogin.statusCode, 401);
    assert.strictEqual(failedLogin.body.error, "Email atau password salah.");

    const me = await request(server, "GET", "/api/auth/me", {
      headers: {
        Cookie: registerSessionCookie
      }
    });
    assert.strictEqual(me.statusCode, 200);
    assert.strictEqual(me.body.user.email, email);

    const logout = await request(server, "POST", "/api/auth/logout", {
      headers: {
        Cookie: registerSessionCookie
      }
    });
    assert.strictEqual(logout.statusCode, 200);
    assert.match(String(logout.headers["set-cookie"]?.[0] || ""), /Max-Age=0/);

    const meAfterLogout = await request(server, "GET", "/api/auth/me", {
      headers: {
        Cookie: registerSessionCookie
      }
    });
    assert.strictEqual(meAfterLogout.statusCode, 401);

    const login = await request(server, "POST", "/api/auth/login", {
      body: {
        email,
        password: "rahasia123"
      }
    });
    assert.strictEqual(login.statusCode, 200);
    assert.strictEqual(login.body.user.email, email);
    const sessionCookie = String(login.headers["set-cookie"]?.[0] || "").split(";")[0];
    assert.ok(sessionCookie.startsWith("session_id="));

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

    const createIncome = await request(server, "POST", "/api/transactions", {
      body: {
        amount: 5000000,
        category: "Gaji",
        date: "2026-04-10",
        description: "Gaji route test",
        notes: "pemasukan bulanan",
        type: "income"
      },
      headers: {
        Cookie: sessionCookie
      }
    });

    assert.strictEqual(createIncome.statusCode, 201);
    assert.strictEqual(createIncome.body.transaction.type, "income");

    const transactions = await request(server, "GET", "/api/transactions", {
      headers: {
        Cookie: sessionCookie
      }
    });
    assert.strictEqual(transactions.statusCode, 200);
    assert.strictEqual(transactions.body.transactions.length, 2);

    const summary = await request(server, "GET", "/api/summary", {
      headers: {
        Cookie: sessionCookie
      }
    });
    assert.strictEqual(summary.statusCode, 200);
    assert.strictEqual(summary.body.summary.totalExpense, 25000);
    assert.strictEqual(summary.body.summary.totalIncome, 5000000);

    const summaryByMonth = await request(server, "GET", "/api/summary?month=2026-04", {
      headers: {
        Cookie: sessionCookie
      }
    });
    assert.strictEqual(summaryByMonth.statusCode, 200);
    assert.strictEqual(summaryByMonth.body.summary.activeMonth, "2026-04");

    const saveBudget = await request(server, "PUT", "/api/budgets", {
      body: {
        amount: 100000,
        category: "Belanja",
        month: "2026-04"
      },
      headers: {
        Cookie: sessionCookie
      }
    });
    assert.strictEqual(saveBudget.statusCode, 200);
    assert.strictEqual(saveBudget.body.budgets.length, 1);
    assert.strictEqual(saveBudget.body.summary.budgetOverview.totalBudget, 100000);
    assert.strictEqual(saveBudget.body.summary.expenseBudgetStatus[0].spentAmount, 25000);

    const getBudgets = await request(server, "GET", "/api/budgets?month=2026-04", {
      headers: {
        Cookie: sessionCookie
      }
    });
    assert.strictEqual(getBudgets.statusCode, 200);
    assert.strictEqual(getBudgets.body.budgets.length, 1);
    assert.strictEqual(getBudgets.body.summary.expenseBudgetStatus[0].budgetAmount, 100000);

    const removeBudget = await request(server, "PUT", "/api/budgets", {
      body: {
        amount: "",
        category: "Belanja",
        month: "2026-04"
      },
      headers: {
        Cookie: sessionCookie
      }
    });
    assert.strictEqual(removeBudget.statusCode, 200);
    assert.strictEqual(removeBudget.body.budgets.length, 0);
    assert.strictEqual(removeBudget.body.summary.budgetOverview.totalBudget, 0);

    const exportCsv = await request(server, "GET", "/api/transactions/export?format=csv&type=expense&search=belanja&locale=en", {
      headers: {
        Cookie: sessionCookie
      }
    });
    assert.strictEqual(exportCsv.statusCode, 200);
    assert.match(String(exportCsv.headers["content-type"] || ""), /text\/csv/i);
    assert.match(String(exportCsv.headers["content-disposition"] || ""), /attachment; filename="transaction-recap-expense-\d{4}-\d{2}-\d{2}\.csv"/i);
    assert.match(exportCsv.body, /Transaction History Recap/);
    assert.match(exportCsv.body, /"Transactions","1"/);
    assert.match(exportCsv.body, /Belanja route test/);
    assert.doesNotMatch(exportCsv.body, /Gaji route test/);

    const exportPdf = await request(server, "GET", "/api/transactions/export?format=pdf&type=income", {
      headers: {
        Cookie: sessionCookie
      }
    });
    assert.strictEqual(exportPdf.statusCode, 200);
    assert.match(String(exportPdf.headers["content-type"] || ""), /application\/pdf/i);
    assert.match(String(exportPdf.headers["content-disposition"] || ""), /attachment; filename="transaction-recap-income-\d{4}-\d{2}-\d{2}\.pdf"/i);
    assert.match(exportPdf.body, /%PDF-1\.4/);
    assert.match(exportPdf.body, /Gaji route test/);

    const exportUnsupported = await request(server, "GET", "/api/transactions/export?format=xlsx", {
      headers: {
        Cookie: sessionCookie
      }
    });
    assert.strictEqual(exportUnsupported.statusCode, 400);
    assert.strictEqual(exportUnsupported.body.error, "Format export tidak didukung.");

    const receiptAnalyze = await request(server, "POST", "/api/transactions/receipt-analyze", {
      body: {
        preferredType: "expense",
        receiptUpload: {
          dataUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0qUAAAAASUVORK5CYII=",
          fileName: "receipt-test.png"
        }
      },
      headers: {
        Cookie: sessionCookie
      }
    });

    assert.strictEqual(receiptAnalyze.statusCode, 200);
    assert.strictEqual(receiptAnalyze.body.suggestion.amount, 99800);
    assert.strictEqual(receiptAnalyze.body.suggestion.type, "expense");
    assert.ok(/alfamart/i.test(receiptAnalyze.body.suggestion.description));
  } finally {
    await close(server);
    closeDatabase();
    global.fetch = originalFetch;
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
