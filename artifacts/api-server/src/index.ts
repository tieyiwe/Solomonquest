import app from "./app";
import { logger } from "./lib/logger";

// Log-and-continue instead of crashing the whole process on an unexpected
// error outside Express's own request/response cycle (e.g. a rejected
// promise nobody awaited). Without this, one bad request could take down
// the entire server and trigger Replit's healthcheck-failure restart loop.
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
});

const port = Number(process.env["PORT"] ?? 8080);

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
