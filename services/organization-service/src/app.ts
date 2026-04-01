import "dotenv/config";
import { createExpressErrorHandler, createSuccessResponse } from "@workspace/shared";
import type { Logger } from "@workspace/shared/logger";
import cors from "cors";
import express, { type Request, type Response } from "express";
import "express-async-errors";

import { requestContext } from "./middlewares/requestContext.js";
import organizationRoutes from "./routes/organization.routes.js";

export function createOrganizationApp(logger: Logger): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(requestContext);

  app.get("/health", (_request: Request, response: Response) => {
    response.status(200).json(
      createSuccessResponse({ status: "ok", service: "organization-service" }),
    );
  });

  app.use(organizationRoutes);

  app.use(
    createExpressErrorHandler({
      logger,
      event: "organization-service.error",
      fallbackMessage: "Erro interno no organization-service.",
    }),
  );

  return app;
}
