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
import { createLddRoutes } from "./routes/ldd.routes.js";
import { createObligationRoutes } from "./routes/obligation.routes.js";
import { createPasswordRoutes } from "./routes/password.routes.js";
import { createPayrollRoutes } from "./routes/payroll.routes.js";
import { createSituationRoutes } from "./routes/situation.routes.js";
import { createUnionRoutes } from "./routes/union.routes.js";
import { LddService } from "./services/lddService.js";
import { ObligationService } from "./services/obligationService.js";
import { PasswordService } from "./services/passwordService.js";
import { PayrollService } from "./services/payrollService.js";
import { PessoalAuditService } from "./services/pessoalAuditService.js";
import {
  createPessoalPasswordCrypto,
  type PessoalPasswordCrypto,
} from "./services/pessoalPasswordCrypto.js";
import { SituationService } from "./services/situationService.js";
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
  const situationService = new SituationService(prisma, domainAuditService);
  const unionService = new UnionService(prisma, domainAuditService);
  const payrollService = new PayrollService(prisma, domainAuditService);
  const obligationService = new ObligationService(prisma, domainAuditService);
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
  app.use("/pessoal/situations", createSituationRoutes(situationService));
  app.use("/pessoal/unions", createUnionRoutes(unionService));
  app.use("/pessoal/payroll", createPayrollRoutes(payrollService));
  app.use("/pessoal/obrigations", createObligationRoutes(obligationService));
  app.use("/pessoal/passwords", createPasswordRoutes(passwordService));

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
