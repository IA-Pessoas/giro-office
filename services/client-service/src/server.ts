import "dotenv/config";

import { createLogger } from "@workspace/shared/logger";
import cron from "node-cron";

import { createApp } from "./app.js";
import { getClientServiceEnv } from "./config/env.js";
import { prismaClient } from "./integrations/prisma.js";
import { ClientService } from "./services/clientService.js";
import { runCompetenceOutputUpdate } from "./services/competenceOutputRoutine.js";
import { LocalHistoryFileStorage } from "./services/historyStorage.js";

const env = getClientServiceEnv();
const logger = createLogger({
  service: "client-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

const clientService = new ClientService(prismaClient);
const historyStorage = new LocalHistoryFileStorage(env.historyStorageDir);

const app = createApp({
  clientService,
  prisma: prismaClient,
  env,
  logger,
  historyStorage,
});

if (env.enableCompetenceOutputCron) {
  cron.schedule(
    "0 7 * * *",
    () => {
      void runCompetenceOutputUpdate(prismaClient).catch((err: unknown) => {
        logger.error(
          { event: "competence_output.cron_failed", err },
          "Falha na rotina de competência",
        );
      });
    },
    { timezone: "America/Sao_Paulo" },
  );
  logger.info(
    { event: "competence_output.cron_enabled" },
    "Cron de competência ativo (07:00 America/Sao_Paulo)",
  );
}

app.listen(env.port, () => {
  logger.info({ event: "server.start", data: { port: env.port } }, "client-service em execução");
});
