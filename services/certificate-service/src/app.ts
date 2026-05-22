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

import type { CertificateServiceEnv } from "./config/env.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import {
  createForwardedAuthContextMiddleware,
  requestContext,
} from "./middlewares/requestContext.js";
import { buildCertificateServiceOpenApiSpec } from "./openapi/spec.js";

function certificateServiceErrorLogContext(request: Request): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};

  if (request.user_id) {
    out.userId = request.user_id;
  }
  if (request.organization_id) {
    out.organizationId = request.organization_id;
  }
  if (typeof request.permission?.certificado === "number") {
    out.certificadoPermission = request.permission.certificado;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

export interface CreateCertificateApplicationOptions {
  env: CertificateServiceEnv;
  logger: Logger;
  prisma: PrismaClient;
}

export function createCertificateApplication({
  env,
  logger,
  prisma: _prisma,
}: CreateCertificateApplicationOptions): express.Express {
  const app = express();

  app.set("trust proxy", true);
  app.use(createSecurityHeadersMiddleware({ nodeEnv: env.nodeEnv }));
  app.use(cors(createServiceCorsOptions(env.allowedOrigins, "certificate-service")));
  app.use(express.json());
  app.use(requestContext);

  app.get("/health", (_request, response) => {
    response.status(200).json(
      createSuccessResponse({
        status: "ok",
        service: "certificate-service",
        env: env.nodeEnv,
      }),
    );
  });

  app.get("/ready", (_request, response) => {
    response.status(200).json(
      createSuccessResponse({
        status: "ready",
        service: "certificate-service",
      }),
    );
  });

  app.use("/certificate", createForwardedAuthContextMiddleware(env.internalServiceToken));

  if (env.enableApiDocs) {
    mountOpenApiDocs(app, {
      spec: buildCertificateServiceOpenApiSpec(env),
      siteTitle: "certificate-service - OpenAPI",
    });
  }

  app.use(
    createExpressErrorHandler({
      logger,
      event: "certificate-service.error",
      fallbackMessage: "Erro interno no certificate-service.",
      getContext: certificateServiceErrorLogContext,
    }),
  );

  return app;
}
