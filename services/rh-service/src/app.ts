import "dotenv/config";
import type { Logger } from "@workspace/shared";
import { createExpressErrorHandler, createSuccessResponse } from "@workspace/shared";
import cors from "cors";
import express, { type Request, type Response } from "express";
import "express-async-errors";

import { requestContext } from "./middlewares/requestContext.js";
import categoryRoutes from "./routes/category.routes.js";
import holidayRoutes from "./routes/holiday.routes.js";
import pointRoutes from "./routes/point.routes.js";
import pointConfigRoutes from "./routes/point-config.routes.js";
import requestRoutes from "./routes/request.routes.js";
import timeClockRequestRoutes from "./routes/timeClockRequest.routes.js";

export function createApp(logger: Logger): express.Express {
  const app = express();

  app.set("trust proxy", true);
  app.use(cors());
  app.use(express.json());
  app.use(requestContext);

  app.get("/health", (_request: Request, response: Response) => {
    response.status(200).json(createSuccessResponse({ status: "ok", service: "rh-service" }));
  });

  app.use("/rh/point-config", pointConfigRoutes);
  app.use("/rh/point", pointRoutes);
  app.use("/rh/point", timeClockRequestRoutes);
  app.use("/rh/categories", categoryRoutes);
  app.use("/rh/requests", requestRoutes);
  app.use("/rh/holidays", holidayRoutes);

  app.use(
    createExpressErrorHandler({
      logger,
      event: "rh-service.error",
      fallbackMessage: "Erro interno no rh-service.",
    }),
  );

  return app;
}
