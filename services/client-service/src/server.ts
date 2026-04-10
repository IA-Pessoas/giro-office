import "dotenv/config";

import { createClient } from "@supabase/supabase-js";
import { createLogger } from "@workspace/shared/logger";

import { createApp } from "./app.js";
import { getClientServiceEnv } from "./config/env.js";
import { prismaClient } from "./integrations/prisma.js";
import { ClientService } from "./services/clientService.js";
import {
  LocalHistoryFileStorage,
  SupabaseHistoryFileStorage,
} from "./services/historyStorageService.js";

const env = getClientServiceEnv();
const logger = createLogger({
  service: "client-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

const clientService = new ClientService(prismaClient);
const historyStorage =
  env.historyStorageMode === "local"
    ? new LocalHistoryFileStorage(env.historyStorageDir)
    : new SupabaseHistoryFileStorage(
        createClient(env.supabaseUrl, env.supabaseServiceRoleKey),
        env.historyStorageBucket,
      );

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
