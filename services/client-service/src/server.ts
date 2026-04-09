import "dotenv/config";

import { createLogger } from "@workspace/shared/logger";

import { createApp } from "./app.js";
import { getClientServiceEnv } from "./config/env.js";
import { prismaClient } from "./integrations/prisma.js";
import { supabase } from "./integrations/supabase.js";
import { ClientService } from "./services/clientService.js";
import { SupabaseHistoryFileStorage } from "./services/historyStorageService.js";

const env = getClientServiceEnv();
const logger = createLogger({
  service: "client-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

const clientService = new ClientService(prismaClient);
const historyStorage = new SupabaseHistoryFileStorage(supabase, env.historyStorageBucket);

const app = createApp({
  clientService,
  prisma: prismaClient,
  env,
  logger,
  historyStorage,
});

app.listen(env.port, () => {
  logger.info({ event: "server.start", data: { port: env.port } }, "client-service em execução");
});
