import {
  createExpressErrorHandler,
  createSecurityHeadersMiddleware,
  createServiceCorsOptions,
  createSuccessResponse,
  EncryptionService,
} from "@workspace/shared";
import { mountOpenApiDocs } from "@workspace/shared/http";
import type { Logger } from "@workspace/shared/logger";
import cors from "cors";
import express, { type Request } from "express";
import "express-async-errors";

import type { TiServiceEnv } from "./config/env.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import {
  createForwardedAuthContextMiddleware,
  requestContext,
} from "./middlewares/requestContext.js";
import { buildTiServiceOpenApiSpec } from "./openapi/spec.js";
import { createTiDashboardRoutes } from "./routes/tiDashboard.routes.js";
import { createTiExtensionRoutes } from "./routes/tiExtension.routes.js";
import { createTiInventoryRoutes } from "./routes/tiInventory.routes.js";
import { createTiInventoryCategoryRoutes } from "./routes/tiInventoryCategory.routes.js";
import { createTiInventoryLocationRoutes } from "./routes/tiInventoryLocation.routes.js";
import { createTiPasswordRoutes } from "./routes/tiPassword.routes.js";
import { createTiRequestRoutes } from "./routes/tiRequest.routes.js";
import { createTiRequestCategoryRoutes } from "./routes/tiRequestCategory.routes.js";
import { createTiRobotRoutes } from "./routes/tiRobot.routes.js";
import { createTiStockRoutes } from "./routes/tiStock.routes.js";
import { createTiTermRoutes } from "./routes/tiTerm.routes.js";

function tiServiceErrorLogContext(request: Request): Record<string, unknown> | undefined {
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

export interface CreateTiApplicationOptions {
  env: TiServiceEnv;
  logger: Logger;
  prisma: PrismaClient;
}

export function createTiApplication({
  env,
  logger,
  prisma,
}: CreateTiApplicationOptions): express.Express {
  const app = express();
  const encryptionService = new EncryptionService(env.passwordEncryptionKey);

  app.set("trust proxy", true);
  app.use(createSecurityHeadersMiddleware({ nodeEnv: env.nodeEnv }));
  app.use(cors(createServiceCorsOptions(env.allowedOrigins, "ti-service")));
  app.use(express.json());
  app.use(requestContext);

  app.get("/health", (_request, response) => {
    response.status(200).json(
      createSuccessResponse({
        status: "ok",
        service: "ti-service",
        env: env.nodeEnv,
      }),
    );
  });

  app.get("/ready", (_request, response) => {
    response.status(200).json(
      createSuccessResponse({
        status: "ready",
        service: "ti-service",
      }),
    );
  });

  app.use("/ti", createForwardedAuthContextMiddleware(env.internalServiceToken));

  app.use("/ti/inventory", createTiInventoryRoutes(prisma));
  app.use("/ti/inventory-categories", createTiInventoryCategoryRoutes(prisma));
  app.use("/ti/inventory-locations", createTiInventoryLocationRoutes(prisma));
  app.use("/ti/passwords", createTiPasswordRoutes(prisma, encryptionService));
  app.use("/ti/extensions", createTiExtensionRoutes(prisma));
  app.use("/ti/terms", createTiTermRoutes(prisma));
  app.use("/ti/stock", createTiStockRoutes(prisma));
  app.use("/ti/robots", createTiRobotRoutes(prisma));
  app.use("/ti/dashboard", createTiDashboardRoutes(prisma));
  app.use("/ti/requests", createTiRequestRoutes(prisma));
  app.use("/ti/request-categories", createTiRequestCategoryRoutes(prisma));

  if (env.enableApiDocs) {
    mountOpenApiDocs(app, {
      spec: buildTiServiceOpenApiSpec(env),
      siteTitle: "ti-service - OpenAPI",
    });
  }

  app.use(
    createExpressErrorHandler({
      logger,
      event: "ti-service.error",
      fallbackMessage: "Erro interno no ti-service.",
      getContext: tiServiceErrorLogContext,
    }),
  );

  return app;
}
