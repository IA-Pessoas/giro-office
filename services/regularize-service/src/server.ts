import "dotenv/config";

import { createLogger } from "@workspace/shared/logger";

import { createApp } from "./app.js";
import { getRegularizeServiceEnv } from "./config/env.js";
import { prismaClient } from "./integrations/prisma.js";
import { RegularizeReconciliationService } from "./services/regularizeReconciliationService.js";

const env = getRegularizeServiceEnv();
const logger = createLogger({
  service: "regularize-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

const reconciliationService = new RegularizeReconciliationService(prismaClient);

async function runReconciliation(): Promise<Record<string, unknown>> {
  return reconciliationService.runFullReconciliation();
}

async function runLicenseNotificationReconciliation(): Promise<Record<string, unknown>> {
  return reconciliationService.runLicenseNotificationReconciliation();
}

async function runClientPfStatusReconciliation(): Promise<Record<string, unknown>> {
  return reconciliationService.runInactiveClientPfStatusReconciliation();
}

async function runClientPfDocumentsReconciliation(): Promise<Record<string, unknown>> {
  return reconciliationService.runClientPfDocumentNotificationReconciliation();
}

const app = createApp({
  env,
  logger,
  prisma: prismaClient,
  reconciliationService,
  runReconciliation,
  runLicenseNotificationReconciliation,
  runClientPfStatusReconciliation,
  runClientPfDocumentsReconciliation,
});

app.listen(env.port, () => {
  logger.info(
    {
      event: "server.start",
      data: { port: env.port },
    },
    "regularize-service em execucao",
  );
});
