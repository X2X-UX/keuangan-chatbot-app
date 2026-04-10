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
  "register-telegram-webhook.js"
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
