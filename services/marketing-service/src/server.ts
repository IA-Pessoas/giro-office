import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import {
  parseDatabasePoolConnectionTimeoutMs,
  parseDatabasePoolMax,
} from "@workspace/shared/database";
import { createLogger } from "@workspace/shared/logger";

import { createMarketingApp } from "./app.js";
import { getMarketingServiceEnv } from "./config/env.js";
import { PrismaClient } from "./generated/prisma/client.js";

const env = getMarketingServiceEnv();
const logger = createLogger({
  service: "marketing-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});
const adapter = new PrismaPg({
  connectionString: env.databaseUrl,
  max: parseDatabasePoolMax(process.env.DATABASE_POOL_MAX),
  connectionTimeoutMillis: parseDatabasePoolConnectionTimeoutMs(
    process.env.DATABASE_POOL_CONNECTION_TIMEOUT_MS,
  ),
});
const prisma = new PrismaClient({ adapter });
const app = createMarketingApp({ env, logger, prisma });

const server = app.listen(env.port, () => {
  logger.info({ event: "server.start", data: { port: env.port } }, "marketing-service rodando");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  });
}
