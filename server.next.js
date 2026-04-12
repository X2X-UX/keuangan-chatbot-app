const server = require("./src/server/index");

if (require.main === module) {
  server.main().catch((error) => {
    console.error("Gagal menjalankan server:", error);
    process.exitCode = 1;
  });
}

module.exports = server;
