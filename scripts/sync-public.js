const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const FILES = ["index.html", "styles.css", "app.js", "transaction-categories.js", "transaction-amount.js"];

fs.mkdirSync(PUBLIC_DIR, { recursive: true });

for (const fileName of FILES) {
  const source = path.join(ROOT, fileName);
  const destination = path.join(PUBLIC_DIR, fileName);

  if (!fs.existsSync(source)) {
    throw new Error(`Source file tidak ditemukan: ${source}`);
  }

  fs.copyFileSync(source, destination);
}

console.log("Public assets synced:", FILES.join(", "));
