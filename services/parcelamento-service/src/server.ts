import "dotenv/config";

import { createLogger } from "@workspace/shared/logger";

import { createParcelamentoApp } from "./app.js";
import { getParcelamentoServiceEnv } from "./config/env.js";
import { createParcelamentoPrismaClient } from "./prisma/index.js";

const env = getParcelamentoServiceEnv();
const logger = createLogger({
  service: "parcelamento-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});
const prisma = createParcelamentoPrismaClient(env.databaseUrl);
const auditService = { recordChange: async (): Promise<void> => undefined };

const app = createParcelamentoApp({ env, logger, prisma, auditService });

app.listen(env.port, () => {
  logger.info({ event: "server.start", data: { port: env.port } }, "parcelamento-service rodando");
});
