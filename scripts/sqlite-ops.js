const fs = require("fs");
const path = require("path");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const index = trimmed.indexOf("=");
    if (index === -1) {
      continue;
    }

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function resolveRuntimePaths(options = {}) {
  const cwd = path.resolve(options.cwd || path.join(__dirname, ".."));
  const envFile = path.join(cwd, ".env");
  loadEnvFile(envFile);

  const configuredDataDir = String(process.env.ARUNIKA_DATA_DIR || "").trim();
  const configuredDbFile = String(process.env.ARUNIKA_DB_FILE || "").trim();
  const dataDir = configuredDataDir ? path.resolve(configuredDataDir) : path.join(cwd, "data");
  const dbFile = configuredDbFile ? path.resolve(configuredDbFile) : path.join(dataDir, "arunika.sqlite");
  const receiptsDir = path.join(dataDir, "receipts");

  return {
    cwd,
    dataDir,
    dbFile,
    envFile,
    receiptsDir
  };
}

function parseArgs(argv) {
  const result = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (!token.startsWith("--")) {
      continue;
    }

    const eqIndex = token.indexOf("=");
    if (eqIndex >= 0) {
      result[token.slice(2, eqIndex)] = token.slice(eqIndex + 1);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (typeof next === "string" && !next.startsWith("--")) {
      result[key] = next;
      index += 1;
      continue;
    }

    result[key] = true;
  }

  return result;
}

function formatStamp(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function sanitizeLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function resolveOptionalPath(baseDir, value) {
  if (!value) {
    return null;
  }

  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(baseDir, value);
}

function copyFileIfExists(sourceFile, targetFile) {
  if (!fs.existsSync(sourceFile)) {
    return false;
  }

  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.copyFileSync(sourceFile, targetFile);
  return true;
}

function removeFileIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
}

function copyDirectoryIfExists(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    return false;
  }

  fs.rmSync(targetDir, { force: true, recursive: true });
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
  return true;
}

function ensureDatabaseExists(dbFile) {
  if (!fs.existsSync(dbFile)) {
    throw new Error(`SQLite database file not found: ${dbFile}`);
  }
}

function buildBackupDirName({ label, now }) {
  const stamp = formatStamp(now);
  const cleanLabel = sanitizeLabel(label);
  return cleanLabel ? `arunika-${stamp}-${cleanLabel}` : `arunika-${stamp}`;
}

function createMetadata(payload) {
  return JSON.stringify(payload, null, 2);
}

function listSidecarSuffixes() {
  return ["-wal", "-shm", "-journal"];
}

function createBackup(options = {}) {
  const cwd = path.resolve(options.cwd || path.join(__dirname, ".."));
  const now = options.now instanceof Date ? options.now : new Date();
  const dataDir = path.resolve(options.dataDir || path.join(cwd, "data"));
  const dbFile = path.resolve(options.dbFile || path.join(dataDir, "arunika.sqlite"));
  const receiptsDir = path.resolve(options.receiptsDir || path.join(dataDir, "receipts"));
  const backupRootDir = path.resolve(options.backupRootDir || path.join(cwd, "backups"));
  const backupDir = path.join(backupRootDir, buildBackupDirName({ label: options.label, now }));
  const backupDbFile = path.join(backupDir, path.basename(dbFile));
  const backupReceiptsDir = path.join(backupDir, "receipts");

  ensureDatabaseExists(dbFile);
  fs.mkdirSync(backupDir, { recursive: true });
  copyFileIfExists(dbFile, backupDbFile);

  const sidecars = [];
  for (const suffix of listSidecarSuffixes()) {
    const copied = copyFileIfExists(`${dbFile}${suffix}`, `${backupDbFile}${suffix}`);
    if (copied) {
      sidecars.push(path.basename(`${backupDbFile}${suffix}`));
    }
  }

  const receiptsCopied = copyDirectoryIfExists(receiptsDir, backupReceiptsDir);
  const metadata = {
    createdAt: now.toISOString(),
    dataDir,
    dbFile,
    files: {
      database: path.basename(backupDbFile),
      receipts: receiptsCopied ? path.relative(backupDir, backupReceiptsDir) : null,
      sidecars
    },
    label: sanitizeLabel(options.label) || null,
    sourceDir: options.sourceDir ? path.resolve(options.sourceDir) : null
  };

  fs.writeFileSync(path.join(backupDir, "metadata.json"), createMetadata(metadata));

  return {
    backupDbFile,
    backupDir,
    backupReceiptsDir,
    metadata,
    receiptsCopied
  };
}

function resolveSourceDatabaseFile(sourceDir, expectedBaseName) {
  const preferred = path.join(sourceDir, expectedBaseName);
  if (fs.existsSync(preferred)) {
    return preferred;
  }

  const sqliteFiles = fs
    .readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.sqlite$/i.test(entry.name))
    .map((entry) => path.join(sourceDir, entry.name));

  if (sqliteFiles.length === 1) {
    return sqliteFiles[0];
  }

  throw new Error(`Unable to determine SQLite backup file inside: ${sourceDir}`);
}

function restoreBackup(options = {}) {
  if (!options.confirmRestore) {
    throw new Error("Restore requires --confirm-restore.");
  }

  const cwd = path.resolve(options.cwd || path.join(__dirname, ".."));
  const now = options.now instanceof Date ? options.now : new Date();
  const dataDir = path.resolve(options.dataDir || path.join(cwd, "data"));
  const dbFile = path.resolve(options.dbFile || path.join(dataDir, "arunika.sqlite"));
  const receiptsDir = path.resolve(options.receiptsDir || path.join(dataDir, "receipts"));
  const snapshotRootDir = path.resolve(options.snapshotRootDir || path.join(cwd, "backups", "pre-restore"));
  const sourceDir = path.resolve(options.sourceDir || "");

  if (!sourceDir || !fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    throw new Error(`Backup source directory not found: ${sourceDir}`);
  }

  const sourceDbFile = resolveSourceDatabaseFile(sourceDir, path.basename(dbFile));
  const sourceReceiptsDir = path.join(sourceDir, "receipts");
  const snapshot = createBackup({
    backupRootDir: snapshotRootDir,
    cwd,
    dataDir,
    dbFile,
    label: `pre-restore-${path.basename(sourceDir)}`,
    now,
    receiptsDir,
    sourceDir
  });

  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  fs.copyFileSync(sourceDbFile, dbFile);

  for (const suffix of listSidecarSuffixes()) {
    const sourceSidecar = `${sourceDbFile}${suffix}`;
    const targetSidecar = `${dbFile}${suffix}`;
    if (fs.existsSync(sourceSidecar)) {
      fs.copyFileSync(sourceSidecar, targetSidecar);
    } else {
      removeFileIfExists(targetSidecar);
    }
  }

  const receiptsRestored = copyDirectoryIfExists(sourceReceiptsDir, receiptsDir);

  return {
    dataDir,
    dbFile,
    receiptsDir,
    receiptsRestored,
    snapshotDir: snapshot.backupDir,
    sourceDbFile,
    sourceDir
  };
}

module.exports = {
  createBackup,
  loadEnvFile,
  parseArgs,
  resolveOptionalPath,
  resolveRuntimePaths,
  restoreBackup
};
