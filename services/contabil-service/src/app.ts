import { createExpressErrorHandler, createSuccessResponse } from "@workspace/shared";
import { mountOpenApiDocs } from "@workspace/shared/http";
import type { Logger } from "@workspace/shared/logger";
import cors from "cors";
import express, { type Request } from "express";
import "express-async-errors";

import type { ContabilServiceEnv } from "./config/env.js";
import { requestContext } from "./middlewares/requestContext.js";
import { buildContabilServiceOpenApiSpec } from "./openapi/spec.js";
import { type ControlRouteDeps, createControlRoutes } from "./routes/control.routes.js";
import {
  createRelationshipRoutes,
  type RelationshipRouteDeps,
} from "./routes/relationship.routes.js";
import { createResponsibleRoutes, type ResponsibleRouteDeps } from "./routes/responsible.routes.js";
import { ControlService } from "./services/controlService.js";
import { RelationshipService } from "./services/relationshipService.js";
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
 * Composição da app: infraestrutura (`/health`, `/ready`), documentação e rotas de domínio sob `/contabil`.
 */
export function createContabilApp(options: {
  env: ContabilServiceEnv;
  logger: Logger;
  controlRouteDeps?: ControlRouteDeps;
  responsibleRouteDeps?: ResponsibleRouteDeps;
  relationshipRouteDeps?: RelationshipRouteDeps;
}): express.Express {
  const { env, logger } = options;
  const controlRouteDeps = options.controlRouteDeps ?? new ControlService();
  const responsibleRouteDeps = options.responsibleRouteDeps ?? new ResponsibleService();
  const relationshipRouteDeps = options.relationshipRouteDeps ?? new RelationshipService();

  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(requestContext);

  app.get("/health", (_req, res) => {
    res.status(200).json(createSuccessResponse({ status: "ok", service: "contabil-service" }));
  });

  app.get("/ready", (_req, res) => {
    res.status(200).json(createSuccessResponse({ status: "ready", service: "contabil-service" }));
  });

  if (env.enableApiDocs) {
    mountOpenApiDocs(app, {
      spec: buildContabilServiceOpenApiSpec(env),
      siteTitle: "contabil-service — OpenAPI",
    });
  }

  app.use("/contabil", createControlRoutes(controlRouteDeps));
  app.use("/contabil", createResponsibleRoutes(responsibleRouteDeps));
  app.use("/contabil", createRelationshipRoutes(relationshipRouteDeps));

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
