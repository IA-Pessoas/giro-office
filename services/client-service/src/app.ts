import { createExpressErrorHandler, createSuccessResponse } from "@workspace/shared";
import type { Logger } from "@workspace/shared/logger";
import cors from "cors";
import express, { type Request } from "express";
import "express-async-errors";

import type { ClientServiceEnv } from "./config/env.js";
import { requestContext } from "./middlewares/requestContext.js";
import { createClientRouter } from "./routes/client.routes.js";
import type { IClientService } from "./services/clientService.js";

function clientServiceErrorLogContext(request: Request): Record<string, unknown> | undefined {
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

export interface CreateAppOptions {
  clientService: IClientService;
  env: ClientServiceEnv;
  logger: Logger;
}

export function createApp({ clientService, env, logger }: CreateAppOptions): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(requestContext);

  app.get("/health", (_request, response) => {
    response.status(200).json(
      createSuccessResponse({
        status: "ok",
        service: "client-service",
        env: env.nodeEnv,
      }),
    );
  });

  app.use(createClientRouter(clientService));

  app.use(
    createExpressErrorHandler({
      logger,
      event: "client-service.error",
      fallbackMessage: "Erro interno no client-service.",
      getContext: clientServiceErrorLogContext,
    }),
  );

  return app;
}
