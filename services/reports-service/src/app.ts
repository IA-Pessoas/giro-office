import {
  createExpressErrorHandler,
  createSecurityHeadersMiddleware,
  createServiceCorsOptions,
  createSuccessResponse,
} from "@workspace/shared";
import type { Logger } from "@workspace/shared/logger";
import { mountOpenApiDocs } from "@workspace/shared/openapi";
import cors from "cors";
import express from "express";
import "express-async-errors";

import { SourceCatalogService } from "./catalog/sourceCatalogService.js";
import type { ReportSourceAdapter } from "./catalog/types.js";
import type { ReportsServiceEnv } from "./config/env.js";
import { UserAccessContextClient } from "./integrations/userAccessContextClient.js";
import { buildReportsServiceOpenApiSpec } from "./openapi/spec.js";
import type { ReportsPrismaClient } from "./prisma/index.js";
import { createReportPreviewRouter } from "./routes/preview.routes.js";
import { createReportCatalogRouter } from "./routes/reportCatalog.routes.js";
import { createReportExportRouter } from "./routes/reportExport.routes.js";
import type { ReportingAccessContextClient } from "./routes/reportingContext.js";
import { createReportJobRouter } from "./routes/reportJob.routes.js";
import { createReportModelRouter } from "./routes/reportModel.routes.js";
import { createReportRetentionRouter } from "./routes/reportRetention.routes.js";
import { createReportAuditService } from "./services/reportAuditService.js";
import { ReportAuthorizationService } from "./services/reportAuthorizationService.js";
import { ReportCsvService } from "./services/reportCsvService.js";
import { ReportDefinitionService } from "./services/reportDefinitionService.js";
import { ReportExportService } from "./services/reportExportService.js";
import { ReportJobService } from "./services/reportJobService.js";
import {
  type ReportLetterheadAsset,
  ReportLetterheadService,
} from "./services/reportLetterheadService.js";
import { ReportLifecycleService } from "./services/reportLifecycleService.js";
import { ReportModelService } from "./services/reportModelService.js";
import { ReportPdfService } from "./services/reportPdfService.js";
import { ReportPreviewService } from "./services/reportPreviewService.js";
import { ReportRetentionService } from "./services/reportRetentionService.js";
import { ReportSnapshotService } from "./services/reportSnapshotService.js";
import { ReportXlsxService } from "./services/reportXlsxService.js";

export interface CreateReportsAppOptions {
  env: ReportsServiceEnv;
  logger: Logger;
  prisma: ReportsPrismaClient;
  reporting?: {
    adapters?: readonly ReportSourceAdapter[];
    accessContextClient?: ReportingAccessContextClient;
    letterheads?: readonly ReportLetterheadAsset[];
  };
}

export function createReportsApp({
  env,
  logger,
  prisma,
  reporting,
}: CreateReportsAppOptions): express.Express {
  const app = express();

  app.use(createSecurityHeadersMiddleware({ nodeEnv: env.nodeEnv }));
  app.use(cors(createServiceCorsOptions(env.allowedOrigins, "reports-service")));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.status(200).json(
      createSuccessResponse({
        status: "ok",
        service: "reports-service",
        env: env.nodeEnv,
      }),
    );
  });

  app.get("/ready", async (_request, response) => {
    await prisma.$queryRaw`SELECT 1`;
    response
      .status(200)
      .json(createSuccessResponse({ status: "ready", service: "reports-service" }));
  });

  if (env.enableApiDocs) {
    mountOpenApiDocs(app, {
      spec: buildReportsServiceOpenApiSpec(env),
      siteTitle: "Reports Service - OpenAPI",
    });
  }

  const sourceCatalog = new SourceCatalogService(reporting?.adapters ?? []);
  const definitionService = new ReportDefinitionService(sourceCatalog);
  const accessContextClient = reporting?.accessContextClient ?? new UserAccessContextClient(env);
  const previewService = new ReportPreviewService(
    sourceCatalog,
    definitionService,
    env.previewRowLimit,
  );
  const letterheadService = new ReportLetterheadService(reporting?.letterheads ?? []);
  const authorizationService = new ReportAuthorizationService(
    accessContextClient,
    definitionService,
    letterheadService,
  );
  const modelService = new ReportModelService(prisma);
  const jobService = new ReportJobService(prisma);
  const snapshotService = new ReportSnapshotService(prisma);
  const auditService = createReportAuditService(prisma as never, {
    enabled: env.auditEnabled,
    serviceUrl: env.auditServiceUrl,
    serviceToken: env.auditServiceToken,
    logger,
  });
  const exportService = new ReportExportService(
    snapshotService,
    {
      csv: new ReportCsvService(),
      xlsx: new ReportXlsxService(),
      pdf: new ReportPdfService(letterheadService),
    },
    auditService,
    jobService,
    authorizationService,
    accessContextClient,
  );
  const retentionService = new ReportRetentionService(prisma, auditService);
  const lifecycleService = new ReportLifecycleService(prisma as never, auditService);

  app.use(
    "/reports",
    createReportCatalogRouter({
      sourceCatalog,
      accessContextClient,
      letterheads: letterheadService,
    }),
  );
  app.use("/reports", createReportPreviewRouter({ previewService, accessContextClient }));
  app.use("/reports", createReportExportRouter({ exportService }));
  app.use(
    "/reports",
    createReportModelRouter({ modelService, authorizationService, previewService }),
  );
  app.use(
    "/reports",
    createReportJobRouter({
      jobService,
      snapshotService,
      authorizationService,
      lifecycleService,
      accessContextClient,
    }),
  );
  app.use("/reports", createReportRetentionRouter({ retentionService, accessContextClient }));
  app.use(
    createExpressErrorHandler({
      logger,
      event: "reports-service.error",
      fallbackMessage: "Erro interno no reports-service.",
    }),
  );

  return app;
}
