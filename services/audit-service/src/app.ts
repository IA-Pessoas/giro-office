import {
  createExpressErrorHandler,
  createSecurityHeadersMiddleware,
  createSuccessResponse,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  type Logger,
} from "@workspace/shared";
import { mountOpenApiDocs } from "@workspace/shared/http";
import express, { type Request } from "express";
import "express-async-errors";

import type { AuditServiceEnv } from "./config/env.js";
import type { AuditRequestRepository } from "./integrations/prisma/auditRequestRepository.js";
import { requestContext } from "./middlewares/requestContext.js";
import { buildAuditServiceOpenApiSpec } from "./openapi/spec.js";
import { createAuditInternalRouter, createAuditPublicRouter } from "./routes/audit.routes.js";

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
  app.use(createSecurityHeadersMiddleware({ nodeEnv: env.nodeEnv }));
  app.use(express.json());
  app.use(requestContext);

  app.get("/health", (_request, response) => {
    response.status(200).json(
      createSuccessResponse({
        status: "ok",
        service: "audit-service",
      }),
    );
  });

  app.get("/ready", (_request, response) => {
    response.status(200).json(
      createSuccessResponse({
        status: "ready",
        service: "audit-service",
      }),
    );
  });

  if (env.enableApiDocs) {
    mountOpenApiDocs(app, {
      spec: buildAuditServiceOpenApiSpec(env),
      siteTitle: "audit-service - OpenAPI",
    });
  }

  app.use("/audit", createAuditPublicRouter({ env, logger, repository }));
  app.use("/platform/audit", createAuditPublicRouter({ env, logger, repository }));
  app.use("/internal", createAuditInternalRouter({ env, logger, repository }));
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
