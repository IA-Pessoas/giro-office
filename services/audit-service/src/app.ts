import {
  createExpressErrorHandler,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  type Logger,
} from "@workspace/shared";
import express, { type Request } from "express";
import "express-async-errors";

import type { AuditServiceEnv } from "./config/env.js";
import type { AuditRequestRepository } from "./integrations/prisma/audit-request-repository.js";
import { requestContext } from "./middlewares/requestContext.js";
import { createAuditRouter } from "./routes/index.js";

function auditErrorLogContext(request: Request): Record<string, unknown> | undefined {
  const userId = request.headers[FORWARDED_AUTH_USER_ID_HEADER];
  const organizationId = request.headers[FORWARDED_AUTH_ORGANIZATION_ID_HEADER];
  const out: Record<string, unknown> = {};
  if (typeof userId === "string" && userId.length > 0) {
    out.userId = userId;
  }
  if (typeof organizationId === "string" && organizationId.length > 0) {
    out.organizationId = organizationId;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

interface CreateAppOptions {
  env: AuditServiceEnv;
  logger: Logger;
  repository?: AuditRequestRepository;
}

export function createApp({ env, logger, repository }: CreateAppOptions): express.Express {
  const app = express();

  app.set("trust proxy", true);
  app.use(express.json());
  app.use(requestContext);
  app.use(createAuditRouter({ env, logger, repository }));
  app.use(
    createExpressErrorHandler({
      logger,
      event: "audit-service.error",
      fallbackMessage: "Erro interno no serviço de auditoria.",
      getContext: auditErrorLogContext,
    }),
  );

  return app;
}
