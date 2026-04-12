const server = require("./app");

async function main() {
  const activeServer = await server.startServer();
  const address = activeServer.address();
  const port = typeof address === "object" && address ? address.port : process.env.PORT || 3000;
  console.log(`Arunika Finance berjalan di http://localhost:${port}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Gagal menjalankan server:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  ...server,
  main
};
