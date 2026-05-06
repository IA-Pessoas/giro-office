import "dotenv/config";
import type { Logger } from "@workspace/shared";
import { createExpressErrorHandler, createSuccessResponse } from "@workspace/shared";
import { mountOpenApiDocs } from "@workspace/shared/http";
import cors from "cors";
import express, { type Request, type Response } from "express";
import "express-async-errors";

import type { RhEnv } from "./config/env.js";
import { requestContext } from "./middlewares/requestContext.js";
import { buildRhServiceOpenApiSpec } from "./openapi/spec.js";
import categoryRoutes from "./routes/category.routes.js";
import holidayRoutes from "./routes/holiday.routes.js";
import messageRoutes from "./routes/message.routes.js";
import pointRoutes from "./routes/point.routes.js";
import pointConfigRoutes from "./routes/pointConfig.routes.js";
import requestRoutes from "./routes/request.routes.js";
import scoreEvaluationRoutes from "./routes/scoreEvaluation.routes.js";
import scoreNitroRoutes from "./routes/scoreNitro.routes.js";
import scoreQuarterRoutes from "./routes/scoreQuarter.routes.js";
import scoreQuestionRoutes from "./routes/scoreQuestion.routes.js";
import timeBankReleaseRoutes from "./routes/timeBankRelease.routes.js";
import timeClockRequestRoutes from "./routes/timeClockRequest.routes.js";
import timeSheetRoutes from "./routes/timeSheet.routes.js";

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

export function createApp(logger: Logger, env: RhEnv): express.Express {
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
  app.use("/rh/score/questions", scoreQuestionRoutes);
  app.use("/rh/score/quarters", scoreQuarterRoutes);
  app.use("/rh/score/evaluations", scoreEvaluationRoutes);
  app.use("/rh/holidays", holidayRoutes);
  app.use("/rh/time-bank-releases", timeBankReleaseRoutes);
  app.use("/rh/messages", messageRoutes);
  app.use("/rh/timesheets", timeSheetRoutes);
  app.use("/rh/score/nitro", scoreNitroRoutes);
  if (env.enableApiDocs) {
    mountOpenApiDocs(app, {
      spec: buildRhServiceOpenApiSpec(env),
      siteTitle: "rh-service — OpenAPI",
    });
  }

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
