import {
  createExpressErrorHandler,
  createSecurityHeadersMiddleware,
  createServiceCorsOptions,
  createSuccessResponse,
} from "@workspace/shared";
import { requestContext } from "@workspace/shared/http";
import type { Logger } from "@workspace/shared/logger";
import { mountOpenApiDocs } from "@workspace/shared/openapi";
import cors from "cors";
import express, { type Request } from "express";
import "express-async-errors";

import type { FiscalServiceEnv } from "./config/env.js";
import { createLog, logUpdateIfChanged } from "./integrations/audit.js";
import prismaClient from "./integrations/prisma.js";
import { buildFiscalServiceOpenApiSpec } from "./openapi/spec.js";
import { InternalReportingService } from "./reporting/internalReportingService.js";
import {
  createFiscalSearchRoutes,
  type FiscalSearchRouteDeps,
} from "./routes/fiscalSearch.routes.js";
import { createIcmsRoutes, type IcmsRouteDeps } from "./routes/icms.routes.js";
import { createInternalReportingRouter } from "./routes/internalReporting.routes.js";
import { createIpiRoutes, type IpiRouteDeps } from "./routes/ipi.routes.js";
import { createNcmRoutes, type NcmRouteDeps } from "./routes/ncm.routes.js";
import { FiscalSearchService } from "./services/fiscalSearchService.js";
import { IcmsService } from "./services/icmsService.js";
import { IpiService } from "./services/ipiService.js";
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
  fiscalSearchRouteDeps?: FiscalSearchRouteDeps;
  icmsRouteDeps?: IcmsRouteDeps;
  ipiRouteDeps?: IpiRouteDeps;
  ncmRouteDeps?: NcmRouteDeps;
  internalReportingService?: InternalReportingService;
}): express.Express {
  const { env, logger } = options;
  const fiscalSearchRouteDeps = options.fiscalSearchRouteDeps ?? new FiscalSearchService();
  const icmsRouteDeps =
    options.icmsRouteDeps ?? new IcmsService(prismaClient, { createLog, logUpdateIfChanged });
  const ipiRouteDeps = options.ipiRouteDeps ?? new IpiService();
  const ncmRouteDeps = options.ncmRouteDeps ?? new NcmService();
  const internalReportingService =
    options.internalReportingService ?? new InternalReportingService(prismaClient);

  const app = express();

  app.use(createSecurityHeadersMiddleware({ nodeEnv: env.nodeEnv }));
  app.use(cors(createServiceCorsOptions(env.allowedOrigins, "fiscal-service")));
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

  app.use("/fiscal", createNcmRoutes(ncmRouteDeps));
  app.use("/fiscal", createIcmsRoutes(icmsRouteDeps));
  app.use("/fiscal", createIpiRoutes(ipiRouteDeps));
  app.use("/fiscal", createFiscalSearchRoutes(fiscalSearchRouteDeps));
  app.use(
    "/internal",
    createInternalReportingRouter({ env, reportingService: internalReportingService }),
  );

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
