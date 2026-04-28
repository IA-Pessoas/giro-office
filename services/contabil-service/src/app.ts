import { createExpressErrorHandler, createSuccessResponse } from "@workspace/shared";
import type { Logger } from "@workspace/shared/logger";
import cors from "cors";
import express, { type Request } from "express";
import "express-async-errors";

import type { ContabilServiceEnv } from "./config/env.js";
import { requestContext } from "./middlewares/requestContext.js";
import { type ControlRouteDeps, createControlRoutes } from "./routes/control.routes.js";
import { type ResponsibleRouteDeps, createResponsibleRoutes } from "./routes/responsible.routes.js";
import { ControlService } from "./services/controlService.js";
import { ResponsibleService } from "./services/responsibleService.js";

function contabilServiceErrorLogContext(request: Request): Record<string, unknown> | undefined {
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

/**
 * Composição da app: infraestrutura, `/health` e rotas de domínio sob `/contabil`.
 */
export function createContabilApp(options: {
  env: ContabilServiceEnv;
  logger: Logger;
  controlRouteDeps?: ControlRouteDeps;
  responsibleRouteDeps?: ResponsibleRouteDeps;
}): express.Express {
  const { logger } = options;
  const controlRouteDeps = options.controlRouteDeps ?? new ControlService();
  const responsibleRouteDeps = options.responsibleRouteDeps ?? new ResponsibleService();

  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(requestContext);

  app.get("/health", (_req, res) => {
    res.status(200).json(createSuccessResponse({ status: "ok", service: "contabil-service" }));
  });

  app.use("/contabil", createControlRoutes(controlRouteDeps));
  app.use("/contabil", createResponsibleRoutes(responsibleRouteDeps));

  app.use(
    createExpressErrorHandler({
      logger,
      event: "contabil-service.error",
      fallbackMessage: "Erro interno no contabil-service.",
      getContext: contabilServiceErrorLogContext,
    }),
  );

  return app;
}
