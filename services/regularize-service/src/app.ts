import {
  createExpressErrorHandler,
  createSecurityHeadersMiddleware,
  createServiceCorsOptions,
  createSuccessResponse,
} from "@workspace/shared";
import { requestContext } from "@workspace/shared/http";
import type { Logger } from "@workspace/shared/logger";
import { mountOpenApiDocs } from "@workspace/shared/openapi";
import { createSupabaseServiceClient } from "@workspace/shared/storage";
import cors from "cors";
import express, { type Request } from "express";
import "express-async-errors";

import type { RegularizeServiceEnv } from "./config/env.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { buildRegularizeServiceOpenApiSpec } from "./openapi/spec.js";
import {
  RegularizeLicenseReportingService,
  RegularizeMunicipalTaxesReportingService,
} from "./reporting/internalReportingService.js";
import { createRegularizeRoutes } from "./routes/index.js";
import { createInternalReportingRouter } from "./routes/internalReporting.routes.js";
import { createRegularizeInternalRoutes } from "./routes/regularizeInternal.routes.js";
import {
  type LicenseProtocolStorage,
  SupabaseLicenseProtocolStorage,
} from "./services/licenseProtocolStorage.js";
import type { RegularizeReconciliationService } from "./services/regularizeReconciliationService.js";

export function regularizeServiceErrorLogContext(request: Request): Record<string, unknown> {
  const userId = request.user_id;
  const organizationId = request.organization_id;
  const permission = request.permission;
  const out: Record<string, unknown> = {
    method: request.method,
    route: request.originalUrl,
  };

  if (request.requestId) {
    out.requestId = request.requestId;
  }
  if (userId) {
    out.userId = userId;
  }
  if (organizationId) {
    out.organizationId = organizationId;
  }
  if (typeof permission === "number") {
    out.permission = permission;
  }

  return out;
}

export interface CreateAppOptions {
  env: RegularizeServiceEnv;
  logger: Logger;
  prisma: PrismaClient;
  reconciliationService: RegularizeReconciliationService;
  runReconciliation: () => Promise<Record<string, unknown>>;
  runLicenseNotificationReconciliation: () => Promise<Record<string, unknown>>;
  runClientPfStatusReconciliation: () => Promise<Record<string, unknown>>;
  runClientPfDocumentsReconciliation: () => Promise<Record<string, unknown>>;
  internalReportingService?: RegularizeLicenseReportingService;
  municipalTaxesReportingService?: RegularizeMunicipalTaxesReportingService;
  protocolStorage?: LicenseProtocolStorage;
}

export function createApp({
  env,
  logger,
  prisma,
  reconciliationService,
  runReconciliation,
  runLicenseNotificationReconciliation,
  runClientPfStatusReconciliation,
  runClientPfDocumentsReconciliation,
  internalReportingService: injectedInternalReportingService,
  municipalTaxesReportingService: injectedMunicipalTaxesReportingService,
  protocolStorage,
}: CreateAppOptions): express.Express {
  const app = express();
  const licenseProtocolStorage =
    protocolStorage ??
    new SupabaseLicenseProtocolStorage(
      createSupabaseServiceClient(env.supabaseUrl, env.supabaseServiceRoleKey),
      env.licenseProtocolBucket,
    );

  app.use(createSecurityHeadersMiddleware({ nodeEnv: env.nodeEnv }));
  app.use(cors(createServiceCorsOptions(env.allowedOrigins, "regularize-service")));
  // 1mb como no gateway: a colagem de DTE (#1744) passa dos 100kb padrão.
  app.use(express.json({ limit: "1mb" }));
  app.use(requestContext);

  app.get("/health", (_request, response) => {
    response.status(200).json(
      createSuccessResponse({
        status: "ok",
        service: "regularize-service",
        env: env.nodeEnv,
      }),
    );
  });

  if (env.enableApiDocs) {
    mountOpenApiDocs(app, {
      spec: buildRegularizeServiceOpenApiSpec(env),
      siteTitle: "regularize-service - OpenAPI",
    });
  }

  app.use(
    "/internal",
    createRegularizeInternalRoutes({
      env,
      runReconciliation,
      runLicenseNotificationReconciliation,
      runClientPfStatusReconciliation,
      runClientPfDocumentsReconciliation,
    }),
  );
  app.use(
    "/internal",
    createInternalReportingRouter({
      env,
      reportingService:
        injectedInternalReportingService ?? new RegularizeLicenseReportingService(prisma),
      municipalTaxesReportingService:
        injectedMunicipalTaxesReportingService ??
        new RegularizeMunicipalTaxesReportingService(prisma),
    }),
  );

  app.use(
    "/regularize",
    createRegularizeRoutes({
      prisma,
      env,
      reconciliationService,
      protocolStorage: licenseProtocolStorage,
    }),
  );

  app.use(
    createExpressErrorHandler({
      logger,
      event: "regularize-service.error",
      fallbackMessage: "Erro interno no regularize-service.",
      getContext: regularizeServiceErrorLogContext,
    }),
  );

  return app;
}
