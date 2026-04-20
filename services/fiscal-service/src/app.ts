import { createExpressErrorHandler, createSuccessResponse } from "@workspace/shared";
import { mountOpenApiDocs } from "@workspace/shared/http";
import type { Logger } from "@workspace/shared/logger";
import cors from "cors";
import express, { type Request } from "express";
import "express-async-errors";

import type { FiscalServiceEnv } from "./config/env.js";
import { requestContext } from "./middlewares/requestContext.js";
import { buildFiscalServiceOpenApiSpec } from "./openapi/spec.js";
import { createFiscalRoutes, type FiscalRouteDeps } from "./routes/fiscal.routes.js";
import { NcmService } from "./services/ncmService.js";

function fiscalServiceErrorLogContext(request: Request): Record<string, unknown> | undefined {
  const userId = request.user_id;
  const organizationId = request.organization_id;
  const permission = request.permission;
  const out: Record<string, unknown> = {};
  if (userId) {
    out.userId = userId;
  }
  if (organizationId) {
    out.organizationId = organizationId;
  }
  if (typeof permission === "number") {
    out.permission = permission;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function createFiscalApp(options: {
  env: FiscalServiceEnv;
  logger: Logger;
  fiscalRouteDeps?: FiscalRouteDeps;
}): express.Express {
  const { env, logger } = options;

  const defaultDeps: FiscalRouteDeps = {
    ncmService: new NcmService(),
  };
  const fiscalRouteDeps = options.fiscalRouteDeps ?? defaultDeps;

  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(requestContext);

  app.get("/health", (_req, res) => {
    res.status(200).json(createSuccessResponse({ status: "ok", service: "fiscal-service" }));
  });

  if (env.enableApiDocs) {
    mountOpenApiDocs(app, {
      spec: buildFiscalServiceOpenApiSpec(env),
      siteTitle: "fiscal-service — OpenAPI",
    });
  }

  app.use("/fiscal", createFiscalRoutes(fiscalRouteDeps));

  app.use(
    createExpressErrorHandler({
      logger,
      event: "fiscal-service.error",
      fallbackMessage: "Erro interno no fiscal-service.",
      getContext: fiscalServiceErrorLogContext,
    }),
  );

  return app;
}
