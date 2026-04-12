const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const FILES_TO_CHECK = [
  "app.js",
  "server.js",
  "server.next.js",
  "database.js",
  "database.next.js",
  "transaction-amount.js",
  "transaction-categories.js",
  "register-telegram-webhook.js",
  "src/server/auth/session.js",
  "src/server/app.js",
  "src/server/http.js",
  "src/server/routes/auth.js",
  "src/server/routes/chat.js",
  "src/server/index.js",
  "src/server/routes/system.js",
  "src/server/routes/telegram.js",
  "src/server/routes/transactions.js",
  "src/server/services/receipts/analyzer.js",
  "src/server/services/receipts/parser.js",
  "src/server/services/telegram/service.js",
  "src/server/services/transactions/service.js"
];

runNodeScript(path.join(ROOT, "scripts", "sync-public.js"));

for (const relativePath of FILES_TO_CHECK) {
  runNodeCommand(["--check", path.join(ROOT, relativePath)]);
}

console.log("Verify OK");

function runNodeScript(scriptPath) {
  runNodeCommand([scriptPath]);
}

function runNodeCommand(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "inherit"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
