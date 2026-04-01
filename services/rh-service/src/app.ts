import "dotenv/config";
import { createExpressErrorHandler, createSuccessResponse } from "@workspace/shared";
import type { Logger } from "@workspace/shared";
import cors from "cors";
import express, { type Request, type Response } from "express";
import "express-async-errors";

import { requestContext } from "./middlewares/requestContext.js";
import pointConfigRoutes from "./routes/point-config.routes.js";

function rhErrorLogContext(request: Request): Record<string, unknown> | undefined {
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

export function createApp(logger: Logger): express.Express {
  const app = express();

  app.set("trust proxy", true);
  app.use(cors());
  app.use(express.json());
  app.use(requestContext);

  app.get("/health", (_request: Request, response: Response) => {
    response.status(200).json(createSuccessResponse({ status: "ok", service: "rh-service" }));
  });

  app.use("/rh", pointConfigRoutes);

  app.use(
    createExpressErrorHandler({
      logger,
      event: "rh-service.error",
      fallbackMessage: "Erro interno no rh-service.",
      getContext: rhErrorLogContext,
    }),
  );

  return app;
}
