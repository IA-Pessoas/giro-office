import "dotenv/config";

import { createLogger } from "@workspace/shared/logger";

import { createTriagemApp } from "./app.js";
import { getTriagemServiceEnv } from "./config/env.js";
import { assertTriagemDatabaseRuntime, createTriagemPrismaClient } from "./integrations/prisma.js";

const env = getTriagemServiceEnv();
const logger = createLogger({
  service: "triagem-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});
const prisma = createTriagemPrismaClient(env.databaseUrl);
const app = createTriagemApp({ env, logger, prisma });

async function start(): Promise<void> {
  await assertTriagemDatabaseRuntime(prisma);
  app.listen(env.port, () => {
    logger.info({ event: "server.start", data: { port: env.port } }, "triagem-service rodando");
  });
}

start().catch(async (error: unknown) => {
  logger.error({ event: "server.start.failed", err: error }, "triagem-service não iniciou");
  await prisma.$disconnect();
  process.exitCode = 1;
});
