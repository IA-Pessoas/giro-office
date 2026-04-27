import { createExpressErrorHandler, createSuccessResponse } from "@workspace/shared";
import type { Logger } from "@workspace/shared/logger";
import cors from "cors";
import express, { type Request } from "express";
import "express-async-errors";

import type { ContabilServiceEnv } from "./config/env.js";
import { requestContext } from "./middlewares/requestContext.js";

function contabilServiceErrorLogContext(request: Request): Record<string, unknown> | undefined {
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

/**
 * Composição mínima (PR 1): apenas infraestrutura e `/health`.
 * Rotas de domínio `/contabil/*` entram nas PRs seguintes.
 */
export function createContabilApp(options: {
  env: ContabilServiceEnv;
  logger: Logger;
}): express.Express {
  const { logger } = options;

  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(requestContext);

  app.get("/health", (_req, res) => {
    res.status(200).json(createSuccessResponse({ status: "ok", service: "contabil-service" }));
  });

  app.use(
    createExpressErrorHandler({
      logger,
      event: "contabil-service.error",
      fallbackMessage: "Erro interno no contabil-service.",
      getContext: contabilServiceErrorLogContext,
    }),
  );

  return app;
}
