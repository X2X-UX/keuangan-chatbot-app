const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const FILES_TO_CHECK = [
  "app.js",
  "server.js",
  "server.next.js",
  "database.js",
  "database.next.js",
  "scripts/sqlite-backup.js",
  "scripts/sqlite-ops.js",
  "scripts/sqlite-restore.js",
  "transaction-amount.js",
  "transaction-categories.js",
  "register-telegram-webhook.js",
  "scripts/test-modules.js",
  "scripts/test-routes.js",
  "scripts/test-telegram-flow.js",
  "src/server/auth/session.js",
  "src/server/app.js",
  "src/server/config/runtime.js",
  "src/server/http.js",
  "src/server/runtime/server.js",
  "src/server/data/database.js",
  "src/server/observability/logger.js",
  "src/server/services/finance-assistant/service.js",
  "src/server/services/telegram/api.js",
  "src/server/services/telegram/draft.js",
  "src/client/transaction-amount.js",
  "src/client/transaction-categories.js",
  "src/client/app/core/runtime.js",
  "src/client/app/core/escape-html.js",
  "src/client/app/render/app-shell.js",
  "src/client/app/render/dashboard.js",
  "src/client/app/render/chat.js",
  "src/client/app/transactions/receipt-flow.js",
  "src/client/app/transactions/import-state.js",
  "src/client/app/transactions/import.js",
  "src/client/app/transactions/form.js",
  "src/client/app/actions/auth.js",
  "src/client/app/actions/telegram.js",
  "src/client/app/actions/transactions.js",
  "src/client/app/actions/chat.js",
  "src/client/app/bootstrap.js",
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
runNodeScript(path.join(ROOT, "scripts", "test-modules.js"));
runNodeScript(path.join(ROOT, "scripts", "test-routes.js"));
runNodeScript(path.join(ROOT, "scripts", "test-telegram-flow.js"));

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
