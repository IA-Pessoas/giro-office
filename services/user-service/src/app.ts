import { createExpressErrorHandler, createSuccessResponse } from "@workspace/shared";
import type { Logger } from "@workspace/shared/logger";
import cors from "cors";
import express, { type Express } from "express";
import "express-async-errors";

import type { UserServiceEnv } from "./config/env.js";
import { authRoutes } from "./routes/auth.routes.js";
import { permissionRoutes } from "./routes/permission.routes.js";
import { userRoutes } from "./routes/user.routes.js";

export function createUserApp(_env: UserServiceEnv, logger: Logger): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json(createSuccessResponse({ status: "ok", service: "user-service" }));
  });

  app.use(authRoutes);
  app.use("/users", userRoutes);
  app.use("/permission", permissionRoutes);

  app.use(
    createExpressErrorHandler({
      logger,
      event: "user-service.error",
      fallbackMessage: "Erro interno no user-service.",
    }),
  );

  return app;
}
