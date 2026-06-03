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
import { requestContext } from "./middlewares/requestContext.js";
import { buildPessoalServiceOpenApiSpec } from "./openapi/spec.js";

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
}

export function createPessoalApp({ env, logger }: CreatePessoalAppOptions): express.Express {
  const app = express();

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
