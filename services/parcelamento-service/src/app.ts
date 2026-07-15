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

import type { ParcelamentoServiceEnv } from "./config/env.js";
import { requestContext } from "./middlewares/requestContext.js";
import { buildParcelamentoServiceOpenApiSpec } from "./openapi/spec.js";
import type { ParcelamentoPrismaClient } from "./prisma/index.js";
import { createInstallmentRouter } from "./routes/installment.routes.js";
import {
  createInstallmentCompetencyCollectionRouter,
  createInstallmentCompetencyItemRouter,
} from "./routes/installmentCompetency.routes.js";
import { createPanoramaRouter } from "./routes/panorama.routes.js";
import { InstallmentCompetencyService } from "./services/installmentCompetencyService.js";
import { InstallmentService } from "./services/installmentService.js";
import { PanoramaService } from "./services/panoramaService.js";

function parcelamentoServiceErrorLogContext(request: Request): Record<string, unknown> | undefined {
  const context = request.parcelamentoContext;

  if (!context) {
    return undefined;
  }

  return {
    requestId: context.requestId,
    ...(context.userId ? { userId: context.userId } : {}),
    ...(context.organizationId ? { organizationId: context.organizationId } : {}),
    ...(context.permission ? { permission: context.permission } : {}),
  };
}

export interface CreateParcelamentoAppOptions {
  env: ParcelamentoServiceEnv;
  logger: Logger;
  prisma: ParcelamentoPrismaClient;
  auditService: {
    recordChange: (...args: unknown[]) => Promise<void>;
  };
}

export function createParcelamentoApp({
  env,
  logger,
  prisma,
  auditService,
}: CreateParcelamentoAppOptions): express.Express {
  const app = express();
  const installmentService = new InstallmentService({ prisma, auditService });
  const competencyService = new InstallmentCompetencyService({
    prisma,
    installmentService,
    auditService,
  });
  const panoramaService = new PanoramaService({ prisma });

  app.set("trust proxy", true);
  app.use(createSecurityHeadersMiddleware({ nodeEnv: env.nodeEnv }));
  app.use(cors(createServiceCorsOptions(env.allowedOrigins, "parcelamento-service")));
  app.use(express.json({ limit: "1mb" }));
  app.use(requestContext);

  app.get("/health", (_request, response) => {
    response.status(200).json(
      createSuccessResponse({
        status: "ok",
        service: "parcelamento-service",
        env: env.nodeEnv,
      }),
    );
  });

  app.get("/ready", async (_request, response) => {
    await prisma.$queryRaw`SELECT 1`;

    response.status(200).json(
      createSuccessResponse({
        status: "ready",
        service: "parcelamento-service",
      }),
    );
  });

  if (env.enableApiDocs) {
    mountOpenApiDocs(app, {
      spec: buildParcelamentoServiceOpenApiSpec(env),
      siteTitle: "Parcelamento Service - OpenAPI",
    });
  }

  app.use(
    "/parcelamento/installments",
    createInstallmentCompetencyCollectionRouter({ competencyService }),
  );
  app.use("/parcelamento/installments", createInstallmentRouter({ installmentService }));
  app.use(
    "/parcelamento/installment-competencies",
    createInstallmentCompetencyItemRouter({ competencyService }),
  );
  app.use("/parcelamento/panoramas", createPanoramaRouter({ panoramaService }));

  app.use(
    createExpressErrorHandler({
      logger,
      event: "parcelamento-service.error",
      fallbackMessage: "Erro interno no parcelamento-service.",
      getContext: parcelamentoServiceErrorLogContext,
    }),
  );

  return app;
}
