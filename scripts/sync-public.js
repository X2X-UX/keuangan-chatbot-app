const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const CLIENT_DIR = path.join(ROOT, "src", "client");
const APP_SOURCE_DIR = path.join(CLIENT_DIR, "app");
const STATIC_FILES = ["index.html", "styles.css", "transaction-categories.js", "transaction-amount.js"];
const APP_OUTPUT_NAME = "app.js";

fs.mkdirSync(PUBLIC_DIR, { recursive: true });

for (const fileName of STATIC_FILES) {
  const source = path.join(CLIENT_DIR, fileName);
  const destinations = [path.join(ROOT, fileName), path.join(PUBLIC_DIR, fileName)];

  if (!fs.existsSync(source)) {
    throw new Error(`Source file tidak ditemukan: ${source}`);
  }

  for (const destination of destinations) {
    fs.copyFileSync(source, destination);
  }
}

const appModuleFiles = fs
  .readdirSync(APP_SOURCE_DIR)
  .filter((fileName) => fileName.endsWith(".js"))
  .sort((left, right) => left.localeCompare(right));

if (appModuleFiles.length === 0) {
  throw new Error(`Modul frontend tidak ditemukan di ${APP_SOURCE_DIR}`);
}

const appBundle = appModuleFiles
  .map((fileName) => {
    const source = path.join(APP_SOURCE_DIR, fileName);
    if (!fs.existsSync(source)) {
      throw new Error(`Source file tidak ditemukan: ${source}`);
    }

    return `// ${fileName}\n${fs.readFileSync(source, "utf8").trim()}\n`;
  })
  .join("\n");

for (const destination of [path.join(ROOT, APP_OUTPUT_NAME), path.join(PUBLIC_DIR, APP_OUTPUT_NAME)]) {
  fs.writeFileSync(destination, `${appBundle.trim()}\n`, "utf8");
}

console.log("Public assets synced:", [...STATIC_FILES, APP_OUTPUT_NAME].join(", "));
