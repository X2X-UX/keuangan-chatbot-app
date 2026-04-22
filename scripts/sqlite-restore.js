const path = require("path");
const { parseArgs, resolveOptionalPath, resolveRuntimePaths, restoreBackup } = require("./sqlite-ops");

run();

function run() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const runtime = resolveRuntimePaths();
    const sourceDir = resolveOptionalPath(runtime.cwd, args.source);
    const snapshotRootDir = resolveOptionalPath(runtime.cwd, args["snapshot-root"]) || path.join(runtime.cwd, "backups", "pre-restore");

    if (!sourceDir) {
      throw new Error("Restore requires --source <backup-directory>.");
    }

    const result = restoreBackup({
      confirmRestore: args["confirm-restore"] === true,
      cwd: runtime.cwd,
      dataDir: runtime.dataDir,
      dbFile: runtime.dbFile,
      receiptsDir: runtime.receiptsDir,
      snapshotRootDir,
      sourceDir
    });

    console.log(`Restore source: ${result.sourceDir}`);
    console.log(`Pre-restore snapshot: ${result.snapshotDir}`);
    console.log(`Database restored to: ${result.dbFile}`);
    console.log(`Receipts restored: ${result.receiptsRestored ? "yes" : "no"}`);
  } catch (error) {
    console.error(`Restore failed: ${error.message}`);
    process.exitCode = 1;
  }
}
