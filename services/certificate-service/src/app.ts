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
import express, { type Request } from "express";
import "express-async-errors";

import type { CertificateServiceEnv } from "./config/env.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import {
  createForwardedAuthContextMiddleware,
  requestContext,
} from "./middlewares/requestContext.js";
import { buildCertificateServiceOpenApiSpec } from "./openapi/spec.js";
import { createCertificateNotificationRoutes } from "./routes/certificateNotification.routes.js";
import { createCertificatePfRoutes } from "./routes/certificatePf.routes.js";
import { createCertificatePjRoutes } from "./routes/certificatePj.routes.js";
import { createInternalNotificationRoutes } from "./routes/internalNotification.routes.js";
import type { createCertificateFileCrypto } from "./services/certificateFileCrypto.js";
import type { CertificateFileStorage } from "./services/certificateFileStorage.js";
import { createCertificatePasswordCrypto } from "./services/certificatePasswordCrypto.js";

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
  certificateFileStorage?: CertificateFileStorage;
  certificateFileCrypto?: ReturnType<typeof createCertificateFileCrypto>;
}

export function createCertificateApplication({
  env,
  logger,
  prisma: _prisma,
  certificateFileStorage,
  certificateFileCrypto,
}: CreateCertificateApplicationOptions): express.Express {
  const app = express();
  const certificatePasswordCrypto = createCertificatePasswordCrypto({
    keyBase64: env.certificatePasswordEncryptionKey,
    keyVersion: env.certificatePasswordEncryptionKeyVersion,
  });

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
  app.use("/certificate/notifications", createCertificateNotificationRoutes(_prisma));
  app.use(
    "/certificate/pj",
    createCertificatePjRoutes({
      prisma: _prisma,
      certificateFileStorage,
      certificateFileCrypto,
      certificatePasswordCrypto,
      maxFileSizeBytes: env.certificateFileMaxSizeBytes,
      storageProvider: env.storageMode,
      storageBucket: env.storageBucket,
      uploadRateLimit: createRateLimitMiddleware({
        key: "certificate-service:pj-file-upload",
        max: env.uploadRateLimitMax,
        windowMs: env.uploadRateLimitWindowMs,
        methods: ["POST"],
      }),
    }),
  );
  app.use(
    "/certificate/pf",
    createCertificatePfRoutes({
      prisma: _prisma,
      certificateFileStorage,
      certificateFileCrypto,
      certificatePasswordCrypto,
      maxFileSizeBytes: env.certificateFileMaxSizeBytes,
      storageProvider: env.storageMode,
      storageBucket: env.storageBucket,
      uploadRateLimit: createRateLimitMiddleware({
        key: "certificate-service:pf-file-upload",
        max: env.uploadRateLimitMax,
        windowMs: env.uploadRateLimitWindowMs,
        methods: ["POST"],
      }),
    }),
  );
  app.use("/internal/notifications", createInternalNotificationRoutes(_prisma, env));

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
