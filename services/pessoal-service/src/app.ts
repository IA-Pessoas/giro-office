import {
  createExpressErrorHandler,
  createSecurityHeadersMiddleware,
  createServiceCorsOptions,
  createSuccessResponse,
} from "@workspace/shared";
import { mountOpenApiDocs } from "@workspace/shared/http";
import type { Logger } from "@workspace/shared/logger";
import cors from "cors";
import express, { type Request } from "express";
import "express-async-errors";

import type { PessoalServiceEnv } from "./config/env.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { requestContext } from "./middlewares/requestContext.js";
import { buildPessoalServiceOpenApiSpec } from "./openapi/spec.js";
import { prismaClient } from "./prisma/index.js";
import { InternalReportingService } from "./reporting/internalReportingService.js";
import { createGroupRoutes } from "./routes/group.routes.js";
import { createGroupAssignmentRoutes } from "./routes/groupAssignment.routes.js";
import { createGroupAssignmentOutboxRoutes } from "./routes/groupAssignmentOutbox.routes.js";
import { createInternalReportingRouter } from "./routes/internalReporting.routes.js";
import { createLddRoutes } from "./routes/ldd.routes.js";
import { createObligationRoutes } from "./routes/obligation.routes.js";
import { createPasswordRoutes } from "./routes/password.routes.js";
import { createPayrollRoutes } from "./routes/payroll.routes.js";
import { createPessoalOverviewRoutes } from "./routes/pessoalOverview.routes.js";
import { createSituationRoutes } from "./routes/situation.routes.js";
import { createUnionRoutes } from "./routes/union.routes.js";
import { createPessoalInternalNotificationRoutes } from "./routes/unionNotification.routes.js";
import { GroupAssignmentService } from "./services/groupAssignmentService.js";
import { GroupService } from "./services/groupService.js";
import { LddService } from "./services/lddService.js";
import { ObligationService } from "./services/obligationService.js";
import { PasswordService } from "./services/passwordService.js";
import { PayrollService } from "./services/payrollService.js";
import { PessoalAuditService } from "./services/pessoalAuditService.js";
import { PessoalOverviewService } from "./services/pessoalOverviewService.js";
import {
  createPessoalPasswordCrypto,
  type PessoalPasswordCrypto,
} from "./services/pessoalPasswordCrypto.js";
import { SituationService } from "./services/situationService.js";
import { UnionNotificationService } from "./services/unionNotificationService.js";
import { UnionService } from "./services/unionService.js";

function pessoalServiceErrorLogContext(request: Request): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};

  if (request.user_id) {
    out.userId = request.user_id;
  }
  if (request.organization_id) {
    out.organizationId = request.organization_id;
  }
  if (typeof request.permission === "number") {
    out.permission = request.permission;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

export interface CreatePessoalAppOptions {
  env: PessoalServiceEnv;
  logger: Logger;
  prisma?: PrismaClient;
  auditService?: PessoalAuditService;
  passwordCrypto?: PessoalPasswordCrypto;
}

export function createPessoalApp({
  env,
  logger,
  prisma = prismaClient,
  auditService,
  passwordCrypto,
}: CreatePessoalAppOptions): express.Express {
  const app = express();
  const domainAuditService =
    auditService ??
    new PessoalAuditService({
      enabled: env.domainAuditEnabled,
      serviceUrl: env.auditServiceUrl,
      serviceToken: env.auditServiceToken,
      logger,
    });
  const lddService = new LddService(prisma, domainAuditService);
  const groupService = new GroupService(prisma, domainAuditService);
  const groupAssignmentService = new GroupAssignmentService(prisma, domainAuditService);
  const situationService = new SituationService(prisma, domainAuditService);
  const unionService = new UnionService(prisma, domainAuditService);
  const payrollService = new PayrollService(prisma, domainAuditService);
  const obligationService = new ObligationService(prisma, domainAuditService);
  const overviewService = new PessoalOverviewService(prisma);
  const unionNotificationService = new UnionNotificationService(prisma);
  const pessoalPasswordCrypto =
    passwordCrypto ??
    createPessoalPasswordCrypto({
      keyBase64: env.passwordEncryptionKey,
      keyVersion: env.passwordEncryptionKeyVersion,
    });
  const passwordService = new PasswordService(prisma, pessoalPasswordCrypto, domainAuditService);

  app.set("trust proxy", true);
  app.use(createSecurityHeadersMiddleware({ nodeEnv: env.nodeEnv }));
  app.use(cors(createServiceCorsOptions(env.allowedOrigins, "pessoal-service")));
  app.use(express.json());
  app.use(requestContext);

  app.get("/health", (_request, response) => {
    response.status(200).json(
      createSuccessResponse({
        status: "ok",
        service: "pessoal-service",
        env: env.nodeEnv,
      }),
    );
  });

  app.get("/ready", (_request, response) => {
    response.status(200).json(
      createSuccessResponse({
        status: "ready",
        service: "pessoal-service",
      }),
    );
  });

  app.use("/pessoal/ldd", createLddRoutes(lddService));
  app.use("/pessoal/groups", createGroupRoutes(groupService));
  app.use("/pessoal/group-assignments", createGroupAssignmentRoutes(groupAssignmentService));
  app.use(
    "/internal/pessoal/group-assignments/audit-outbox",
    createGroupAssignmentOutboxRoutes({
      internalServiceToken: env.internalServiceToken,
      service: groupAssignmentService,
    }),
  );
  app.use(
    "/internal",
    createInternalReportingRouter({
      env,
      reportingService: new InternalReportingService(prisma),
    }),
  );
  app.use("/pessoal/overview", createPessoalOverviewRoutes(overviewService));
  app.use("/pessoal/situations", createSituationRoutes(situationService));
  app.use("/pessoal/unions", createUnionRoutes(unionService));
  app.use("/pessoal/payroll", createPayrollRoutes(payrollService));
  app.use("/pessoal/obrigations", createObligationRoutes(obligationService));
  app.use("/pessoal/passwords", createPasswordRoutes(passwordService));
  app.use(
    "/internal/pessoal/union-notifications",
    createPessoalInternalNotificationRoutes({
      internalServiceToken: env.internalServiceToken,
      service: unionNotificationService,
    }),
  );

  if (env.enableApiDocs) {
    mountOpenApiDocs(app, {
      spec: buildPessoalServiceOpenApiSpec(env),
      siteTitle: "pessoal-service - OpenAPI",
    });
  }

  app.use(
    createExpressErrorHandler({
      logger,
      event: "pessoal-service.error",
      fallbackMessage: "Erro interno no pessoal-service.",
      getContext: pessoalServiceErrorLogContext,
    }),
  );

  return app;
}
