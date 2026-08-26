import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import {
  parseDatabasePoolConnectionTimeoutMs,
  parseDatabasePoolMax,
} from "@workspace/shared/database";
import { createLogger } from "@workspace/shared/logger";

import { createTiApplication } from "./app.js";
import { getTiServiceEnv } from "./config/env.js";
import { PrismaClient } from "./generated/prisma/client.js";

const env = getTiServiceEnv();
const logger = createLogger({
  service: "ti-service",
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

const app = createTiApplication({
  env,
  logger,
  prisma,
});

app.listen(env.port, () => {
  logger.info({ event: "server.start", data: { port: env.port } }, "ti-service rodando");
});
