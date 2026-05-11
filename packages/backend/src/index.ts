import { startServer } from "./server.js";
import { logger } from "./logger.js";

startServer().catch((err) => {
  logger.fatal({ err }, "failed to start server");
  process.exit(1);
});
