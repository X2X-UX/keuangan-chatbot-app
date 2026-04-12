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

const appModuleFiles = listJavaScriptFiles(APP_SOURCE_DIR).sort(compareAppModulePaths);

if (appModuleFiles.length === 0) {
  throw new Error(`Modul frontend tidak ditemukan di ${APP_SOURCE_DIR}`);
}

const appBundle = appModuleFiles
  .map((relativePath) => {
    const source = path.join(APP_SOURCE_DIR, relativePath);
    if (!fs.existsSync(source)) {
      throw new Error(`Source file tidak ditemukan: ${source}`);
    }

    return `// ${relativePath.replace(/\\/g, "/")}\n${fs.readFileSync(source, "utf8").trim()}\n`;
  })
  .join("\n");

for (const destination of [path.join(ROOT, APP_OUTPUT_NAME), path.join(PUBLIC_DIR, APP_OUTPUT_NAME)]) {
  fs.writeFileSync(destination, `${appBundle.trim()}\n`, "utf8");
}

console.log("Public assets synced:", [...STATIC_FILES, APP_OUTPUT_NAME].join(", "));

function listJavaScriptFiles(directory, relativePrefix = "") {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const nextRelativePath = path.join(relativePrefix, entry.name);
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...listJavaScriptFiles(fullPath, nextRelativePath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(nextRelativePath);
    }
  }

  return files;
}

function compareAppModulePaths(left, right) {
  return getAppModulePriority(left) - getAppModulePriority(right) || left.localeCompare(right);
}

function getAppModulePriority(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");

  if (normalized.startsWith("core/")) {
    return 10;
  }

  if (normalized.startsWith("render/")) {
    return 20;
  }

  if (normalized.startsWith("transactions/")) {
    return 30;
  }

  if (normalized.startsWith("actions/")) {
    return 40;
  }

  if (normalized === "bootstrap.js" || normalized.startsWith("bootstrap/")) {
    return 90;
  }

  return 50;
}
