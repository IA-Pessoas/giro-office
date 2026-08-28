import "dotenv/config";

import { createLogger } from "@workspace/shared/logger";

import { createReportsApp } from "./app.js";
import { getReportsServiceEnv } from "./config/env.js";
import { CertificatePfAdapter } from "./integrations/certificatePfAdapter.js";
import { CertificatePjAdapter } from "./integrations/certificatePjAdapter.js";
import { ClientIntegrationAdapter } from "./integrations/clientIntegrationAdapter.js";
import { ContabilControlAdapter } from "./integrations/contabilControlAdapter.js";
import { ContabilRelationshipAdapter } from "./integrations/contabilRelationshipAdapter.js";
import { ContabilResponsiblesAdapter } from "./integrations/contabilResponsiblesAdapter.js";
import { FiscalIcmsAdapter } from "./integrations/fiscalIcmsAdapter.js";
import { FiscalNcmAdapter } from "./integrations/fiscalNcmAdapter.js";
import { ParcelamentoAdapter } from "./integrations/parcelamentoAdapter.js";
import { ProjectAdapter } from "./integrations/projectAdapter.js";
import { TaskAdapter } from "./integrations/taskAdapter.js";
import { createReportsPrismaClient } from "./prisma/index.js";

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
    adapters: [
      new ParcelamentoAdapter(env),
      new ClientIntegrationAdapter(env),
      new ContabilControlAdapter(env),
      new ContabilRelationshipAdapter(env),
      new ContabilResponsiblesAdapter(env),
      new TaskAdapter(env),
      new ProjectAdapter(env),
      new CertificatePfAdapter(env),
      new FiscalIcmsAdapter(env),
      new CertificatePjAdapter(env),
      new FiscalNcmAdapter(env),
    ],
  },
});

app.listen(env.port, () => {
  logger.info({ event: "server.start", data: { port: env.port } }, "reports-service rodando");
});
