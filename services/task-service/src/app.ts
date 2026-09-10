import {
  createExpressErrorHandler,
  createRateLimitMiddleware,
  createSecurityHeadersMiddleware,
  createServiceCorsOptions,
  createSuccessResponse,
} from "@workspace/shared";
import { mountOpenApiDocs } from "@workspace/shared/http";
import type { Logger } from "@workspace/shared/logger";
import cors from "cors";
import express, { type Express, type Request } from "express";
import "express-async-errors";

import type { TaskServiceEnv } from "./config/env.js";
import { createAiTaskExtractionProvider } from "./integrations/aiTaskExtraction.js";
import { requestContext } from "./middlewares/requestContext.js";
import { requireCommercialServiceToken } from "./middlewares/requireCommercialServiceToken.js";
import { buildTaskServiceOpenApiSpec } from "./openapi/spec.js";
import prismaClient from "./prisma/index.js";
import {
  createDepsTasksRoutes,
  type DepsTasksRouteDeps,
  depsTasksRoutes,
} from "./routes/depsTasks.routes.js";
import {
  createInternalCommercialTaskBillingRouter,
  type InternalCommercialTaskBillingRouteDeps,
} from "./routes/internalCommercialTaskBilling.routes.js";
import { createInternalReportingRouter } from "./routes/internalReporting.routes.js";
import {
  createProjectPlanRoutes,
  type ProjectPlanRouteDeps,
  projectPlanRoutes,
} from "./routes/projectPlan.routes.js";
import {
  createProjectWizardRoutes,
  type ProjectWizardExtractionRouteDeps,
  type ProjectWizardRouteDeps,
} from "./routes/projectWizard.routes.js";
import { taskComercialRoutes } from "./routes/taskComercial.routes.js";
import { taskCrudRoutes } from "./routes/taskCrud.routes.js";
import { taskDependentRoutes } from "./routes/taskDependent.routes.js";
import { taskFinanceiroRoutes } from "./routes/taskFinanceiro.routes.js";
import { taskIntegrationRegularizeRoutes } from "./routes/taskIntegrationRegularize.routes.js";
import { taskLifecycleRoutes } from "./routes/taskLifecycle.routes.js";
import { taskModelRoutes } from "./routes/taskModel.routes.js";
import { MEETING_MINUTES_MAX_SOURCE_BYTES } from "./schemas/projectWizardExtraction.schemas.js";
import { CommercialTaskBillingProjectionService } from "./services/commercialTaskBillingProjectionService.js";
import { ProjectWizardExtractionService } from "./services/projectWizardExtractionService.js";
import { ProjectWizardService } from "./services/projectWizardService.js";
import { TaskReportingService } from "./services/taskReportingService.js";

const PROJECT_WIZARD_EXTRACTION_JSON_BODY_MAX_BYTES =
  MEETING_MINUTES_MAX_SOURCE_BYTES * 6 + 1024 * 1024;

function taskServiceErrorLogContext(request: Request): Record<string, unknown> | undefined {
  const userId = request.user_id;
  const organizationId = request.organization_id;
  const out: Record<string, unknown> = {};
  if (userId) {
    out.userId = userId;
  }
  if (organizationId) {
    out.organizationId = organizationId;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function createTaskApp(
  env: TaskServiceEnv,
  logger: Logger,
  options?: {
    projectPlanService?: ProjectPlanRouteDeps;
    projectWizardService?: ProjectWizardRouteDeps;
    projectWizardExtractionService?: ProjectWizardExtractionRouteDeps;
    depsTasksService?: DepsTasksRouteDeps;
    internalReportingService?: TaskReportingService;
    commercialTaskBillingProjectionService?: InternalCommercialTaskBillingRouteDeps;
  },
): Express {
  const app = express();
  const resolvedProjectPlanRoutes = options?.projectPlanService
    ? createProjectPlanRoutes(options.projectPlanService)
    : projectPlanRoutes;
  const resolvedDepsTasksRoutes = options?.depsTasksService
    ? createDepsTasksRoutes(options.depsTasksService)
    : depsTasksRoutes;
  const resolvedProjectWizardRoutes = createProjectWizardRoutes({
    service: options?.projectWizardService ?? new ProjectWizardService(),
    extractionService:
      options?.projectWizardExtractionService ??
      new ProjectWizardExtractionService(
        createAiTaskExtractionProvider({
          mode: env.aiExtractionMode,
          apiKey: env.openaiApiKey,
          baseUrl: env.openaiBaseUrl,
          model: env.openaiModel,
          timeoutMs: env.aiExtractionTimeoutMs,
        }),
      ),
    extractionRateLimit: createRateLimitMiddleware({
      key: "task-service:project-wizard-extract-tasks",
      max: env.aiExtractionRateLimitMax,
      windowMs: env.aiExtractionRateLimitWindowMs,
      methods: ["POST"],
      message: "Muitas extrações seguidas. Aguarde antes de tentar novamente.",
    }),
  });
  const internalReportingService =
    options?.internalReportingService ?? new TaskReportingService(prismaClient);
  const commercialTaskBillingProjectionService =
    options?.commercialTaskBillingProjectionService ?? new CommercialTaskBillingProjectionService();

  app.use(createSecurityHeadersMiddleware({ nodeEnv: env.nodeEnv }));
  app.use(cors(createServiceCorsOptions(env.allowedOrigins, "task-service")));
  app.use(
    "/task/project-wizard/extract-tasks",
    express.json({ limit: PROJECT_WIZARD_EXTRACTION_JSON_BODY_MAX_BYTES }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(requestContext);

  app.get("/health", (_req, res) => {
    res.status(200).json(createSuccessResponse({ status: "ok", service: "task-service" }));
  });

  app.get("/ready", (_req, res) => {
    res.status(200).json(createSuccessResponse({ status: "ready", service: "task-service" }));
  });

  if (env.enableApiDocs) {
    mountOpenApiDocs(app, {
      spec: buildTaskServiceOpenApiSpec(env),
      siteTitle: "task-service — OpenAPI",
    });
  }

  app.use("/task", taskModelRoutes);
  app.use("/task", taskDependentRoutes);
  app.use("/task", taskIntegrationRegularizeRoutes);
  app.use("/task", taskLifecycleRoutes);
  app.use("/task", taskComercialRoutes);
  app.use("/task", taskFinanceiroRoutes);
  app.use("/task", taskCrudRoutes);
  app.use("/task", resolvedProjectWizardRoutes);
  app.use("/task", resolvedProjectPlanRoutes);
  app.use("/task", resolvedDepsTasksRoutes);
  app.use(
    "/internal",
    createInternalReportingRouter({ env, reportingService: internalReportingService }),
  );
  app.use(
    "/internal",
    createInternalCommercialTaskBillingRouter(
      commercialTaskBillingProjectionService,
      requireCommercialServiceToken(env),
    ),
  );

  app.use(
    createExpressErrorHandler({
      logger,
      event: "task-service.error",
      fallbackMessage: "Erro interno no task-service.",
      getContext: taskServiceErrorLogContext,
    }),
  );

  return app;
}
