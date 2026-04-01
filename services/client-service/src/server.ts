import "dotenv/config";

import { createLogger } from "@workspace/shared/logger";

import { createApp } from "./app.js";
import { getClientServiceEnv } from "./config/env.js";
import { prismaClient } from "./integrations/prisma.js";
import { ClientService } from "./services/clientService.js";

const env = getClientServiceEnv();
const logger = createLogger({
  service: "client-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

const clientService = new ClientService(prismaClient);
const app = createApp({ clientService, env, logger });

app.listen(env.port, () => {
  logger.info({ event: "server.start", data: { port: env.port } }, "client-service em execução");
});
