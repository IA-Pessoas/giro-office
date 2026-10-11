import "dotenv/config";

import { createLogger } from "@workspace/shared/logger";

import { createReportsApp } from "./app.js";
import { getReportsServiceEnv } from "./config/env.js";
import { MarketingBudgetAdapter } from "./integrations/marketingBudgetAdapter.js";
import { createReportsPrismaClient } from "./prisma/index.js";
import { createEnvSourceAdapters } from "./workerCatalog.js";

const env = getReportsServiceEnv();
const logger = createLogger({
  service: "reports-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});
const prisma = createReportsPrismaClient(env.databaseUrl);
const app = createReportsApp({
  env,
  logger,
  prisma,
  reporting: {
    adapters: [...createEnvSourceAdapters(env), new MarketingBudgetAdapter(prisma)],
  },
});

app.listen(env.port, () => {
  logger.info({ event: "server.start", data: { port: env.port } }, "reports-service rodando");
});
