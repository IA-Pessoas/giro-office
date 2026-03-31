import { createExpressErrorHandler, createSuccessResponse } from "@workspace/shared";
import type { Logger } from "@workspace/shared/logger";
import cors from "cors";
import express from "express";
import "express-async-errors";

import type { ClientServiceEnv } from "./config/env.js";
import { createClientRouter } from "./routes/client.routes.js";
import type { IClientService } from "./services/clientService.js";

export interface CreateAppOptions {
  clientService: IClientService;
  env: ClientServiceEnv;
  logger: Logger;
}

export function createApp({ clientService, env, logger }: CreateAppOptions): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

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
    }),
  );

  return app;
}
