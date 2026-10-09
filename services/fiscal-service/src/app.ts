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
import { createFiscalRateRoutes, type FiscalRateRouteDeps } from "./routes/fiscalRate.routes.js";
import {
  createFiscalSearchRoutes,
  type FiscalSearchRouteDeps,
} from "./routes/fiscalSearch.routes.js";
import { createIcmsRoutes, type IcmsRouteDeps } from "./routes/icms.routes.js";
import { createInternalReportingRouter } from "./routes/internalReporting.routes.js";
import { createIpiRoutes, type IpiRouteDeps } from "./routes/ipi.routes.js";
import {
  createMonthlyControlRoutes,
  type MonthlyControlRouteDeps,
} from "./routes/monthlyControl.routes.js";
import {
  createMonthlyObligationRoutes,
  type MonthlyObligationRouteDeps,
} from "./routes/monthlyObligation.routes.js";
import {
  createMonthlyRevenueRoutes,
  type MonthlyRevenueRouteDeps,
} from "./routes/monthlyRevenue.routes.js";
import { createNcmRoutes, type NcmRouteDeps } from "./routes/ncm.routes.js";
import { createSimplesRateRoutes, type SimplesRateRouteDeps } from "./routes/simplesRate.routes.js";
import { FiscalRateService } from "./services/fiscalRateService.js";
import { FiscalSearchService } from "./services/fiscalSearchService.js";
import { IcmsService } from "./services/icmsService.js";
import { IpiService } from "./services/ipiService.js";
import { MonthlyControlService } from "./services/monthlyControlService.js";
import { MonthlyObligationService } from "./services/monthlyObligationService.js";
import { MonthlyRevenueService } from "./services/monthlyRevenueService.js";
import { NcmService } from "./services/ncmService.js";
import { SimplesRateService } from "./services/simplesRateService.js";

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
  fiscalRateRouteDeps?: FiscalRateRouteDeps;
  monthlyRevenueRouteDeps?: MonthlyRevenueRouteDeps;
  monthlyControlRouteDeps?: MonthlyControlRouteDeps;
  monthlyObligationRouteDeps?: MonthlyObligationRouteDeps;
  simplesRateRouteDeps?: SimplesRateRouteDeps;
  icmsRouteDeps?: IcmsRouteDeps;
  ipiRouteDeps?: IpiRouteDeps;
  ncmRouteDeps?: NcmRouteDeps;
  internalReportingService?: InternalReportingService;
}): express.Express {
  const { env, logger } = options;
  const fiscalSearchRouteDeps = options.fiscalSearchRouteDeps ?? new FiscalSearchService();
  const fiscalRateRouteDeps =
    options.fiscalRateRouteDeps ?? new FiscalRateService(prismaClient, { createLog });
  const monthlyRevenueRouteDeps =
    options.monthlyRevenueRouteDeps ?? new MonthlyRevenueService(prismaClient, { createLog });
  const monthlyControlRouteDeps =
    options.monthlyControlRouteDeps ?? new MonthlyControlService(prismaClient, { createLog });
  const monthlyObligationRouteDeps =
    options.monthlyObligationRouteDeps ?? new MonthlyObligationService(prismaClient, { createLog });
  const simplesRateRouteDeps = options.simplesRateRouteDeps ?? new SimplesRateService(prismaClient);
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
  app.use("/fiscal", createFiscalRateRoutes(fiscalRateRouteDeps));
  app.use("/fiscal", createMonthlyRevenueRoutes(monthlyRevenueRouteDeps));
  app.use("/fiscal", createMonthlyControlRoutes(monthlyControlRouteDeps));
  app.use("/fiscal", createMonthlyObligationRoutes(monthlyObligationRouteDeps));
  app.use("/fiscal", createSimplesRateRoutes(simplesRateRouteDeps));
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
