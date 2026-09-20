import "dotenv/config";

import http from "node:http";
import { serverError, serviceStart } from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";

import { createCommercialApp } from "./app.js";
import { getCommercialServiceEnv } from "./config/env.js";
import { ClientProjectionHttpClient } from "./integrations/clientProjection.js";
import {
  CommercialEmailHttpAdapter,
  MissingCommercialEmailAdapter,
} from "./integrations/commercialEmailAdapter.js";
import { CommercialOutboxHttpDelivery } from "./integrations/commercialOutboxDelivery.js";
import prismaClient from "./integrations/prisma.js";
import { ProspectingCloseHttpClient } from "./integrations/prospectingClose.js";
import { TaskProjectionHttpClient } from "./integrations/taskProjection.js";
import {
  type CommercialEmailNotificationPrisma,
  CommercialEmailNotificationService,
} from "./services/commercialEmailNotificationService.js";
import {
  type CommercialOutboxWorkerPrisma,
  CommercialOutboxWorkerService,
} from "./services/commercialOutboxWorkerService.js";

const env = getCommercialServiceEnv();
const logger = createLogger({
  service: "commercial-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});
const server = http.createServer(createCommercialApp({ env, logger }));

const emailAdapter = env.emailAdapterUrl
  ? new CommercialEmailHttpAdapter(
      env.emailAdapterUrl,
      env.emailAdapterToken ?? "",
      env.emailFrom,
      env.emailAdapterTimeoutMs,
    )
  : new MissingCommercialEmailAdapter();

const outboxWorker = new CommercialOutboxWorkerService(
  prismaClient as unknown as CommercialOutboxWorkerPrisma,
  new CommercialOutboxHttpDelivery(
    new ClientProjectionHttpClient(env.clientServiceUrl, env.clientServiceInternalToken),
    new TaskProjectionHttpClient(env.taskServiceUrl, env.taskServiceInternalToken),
    new ProspectingCloseHttpClient(env.taskServiceUrl, env.taskServiceInternalToken),
    new CommercialEmailNotificationService(
      prismaClient as unknown as CommercialEmailNotificationPrisma,
      emailAdapter,
    ),
  ),
  {
    maxAttempts: env.outboxWorkerMaxAttempts,
    retryBaseMs: env.outboxWorkerRetryBaseMs,
  },
);
let outboxPolling = false;

async function processCommercialOutbox(): Promise<void> {
  if (outboxPolling) return;
  outboxPolling = true;
  try {
    while (await outboxWorker.processNext()) {
      // Drena eventos já disponíveis em ordem de criação, sem concorrência por agregado.
    }
  } catch (error) {
    logger.error({ event: "commercial.outbox.worker.error", error }, "falha no worker de outbox");
  } finally {
    outboxPolling = false;
  }
}

server.listen(env.port, () => serviceStart({ service: "commercial-service", port: env.port }));
server.on("error", (error) => serverError("Erro no servidor commercial-service", error));
setInterval(() => void processCommercialOutbox(), env.outboxWorkerPollIntervalMs);
void processCommercialOutbox();
