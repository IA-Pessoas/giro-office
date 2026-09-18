import {
  createExpressErrorHandler,
  createSecurityHeadersMiddleware,
  createServiceCorsOptions,
  createSuccessResponse,
} from "@workspace/shared";
import type { Logger } from "@workspace/shared/logger";
import { mountOpenApiDocs } from "@workspace/shared/openapi";
import cors from "cors";
import express, { type Request } from "express";
import "express-async-errors";

import type { ContabilServiceEnv } from "./config/env.js";
import prismaClient from "./integrations/prisma.js";
import { requestContext } from "./middlewares/requestContext.js";
import { buildContabilServiceOpenApiSpec } from "./openapi/spec.js";
import { type ControlRouteDeps, createControlRoutes } from "./routes/control.routes.js";
import { createInternalReportingRouter } from "./routes/internalReporting.routes.js";
import {
  createRelationshipRoutes,
  type RelationshipRouteDeps,
} from "./routes/relationship.routes.js";
import { createResponsibleRoutes, type ResponsibleRouteDeps } from "./routes/responsible.routes.js";
import {
  createTriageClosingRoutes,
  type TriageClosingRouteDeps,
} from "./routes/triageClosing.routes.js";
import {
  createTriageDocumentsRoutes,
  type TriageDocumentsRouteDeps,
} from "./routes/triageDocuments.routes.js";
import { ControlService } from "./services/controlService.js";
import { InternalReportingService } from "./services/internalReportingService.js";
import { RelationshipService } from "./services/relationshipService.js";
import { ResponsibleService } from "./services/responsibleService.js";
import { TriageClosingService } from "./services/triageClosingService.js";
import { TriageDocumentsService } from "./services/triageDocumentsService.js";

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
  triageDocumentsRouteDeps?: TriageDocumentsRouteDeps;
  triageClosingRouteDeps?: TriageClosingRouteDeps;
  internalReportingService?: InternalReportingService;
}): express.Express {
  const { env, logger } = options;
  const controlRouteDeps = options.controlRouteDeps ?? new ControlService();
  const responsibleRouteDeps = options.responsibleRouteDeps ?? new ResponsibleService();
  const relationshipRouteDeps = options.relationshipRouteDeps ?? new RelationshipService();
  const triageDocumentsRouteDeps = options.triageDocumentsRouteDeps ?? new TriageDocumentsService();
  const triageClosingRouteDeps = options.triageClosingRouteDeps ?? new TriageClosingService();
  const internalReportingService =
    options.internalReportingService ?? new InternalReportingService(prismaClient);

  const app = express();

  app.use(createSecurityHeadersMiddleware({ nodeEnv: env.nodeEnv }));
  app.use(cors(createServiceCorsOptions(env.allowedOrigins, "contabil-service")));
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
  app.use("/triagem", createTriageDocumentsRoutes(triageDocumentsRouteDeps));
  app.use("/triagem", createTriageClosingRoutes(triageClosingRouteDeps));
  app.use(
    "/internal",
    createInternalReportingRouter({ env, reportingService: internalReportingService }),
  );

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
