import { createExpressErrorHandler, type Logger } from "@workspace/shared";
import express from "express";

import type { AuditServiceEnv } from "./config/env.js";
import type { AuditRequestRepository } from "./integrations/prisma/audit-request-repository.js";
import { createAuditRouter } from "./routes/index.js";

interface CreateAppOptions {
  env: AuditServiceEnv;
  logger: Logger;
  repository?: AuditRequestRepository;
}

export function createApp({ env, logger, repository }: CreateAppOptions): express.Express {
  const app = express();

  app.set("trust proxy", true);
  app.use(express.json());
  app.use(createAuditRouter({ env, logger, repository }));
  app.use(
    createExpressErrorHandler({
      logger,
      event: "audit-service.error",
      fallbackMessage: "Erro interno no serviço de auditoria.",
    }),
  );

  return app;
}
