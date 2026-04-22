const path = require("path");
const { createBackup, parseArgs, resolveOptionalPath, resolveRuntimePaths } = require("./sqlite-ops");

run();

function run() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const runtime = resolveRuntimePaths();
    const backupRootDir = resolveOptionalPath(runtime.cwd, args["backup-root"]) || path.join(runtime.cwd, "backups");
    const result = createBackup({
      backupRootDir,
      cwd: runtime.cwd,
      dataDir: runtime.dataDir,
      dbFile: runtime.dbFile,
      label: args.label,
      receiptsDir: runtime.receiptsDir
    });

    console.log(`Backup created: ${result.backupDir}`);
    console.log(`Database file: ${result.backupDbFile}`);
    console.log(`Receipts copied: ${result.receiptsCopied ? "yes" : "no"}`);
  } catch (error) {
    console.error(`Backup failed: ${error.message}`);
    process.exitCode = 1;
  }
}
