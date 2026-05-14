import {
  createExpressErrorHandler,
  createRateLimitMiddleware,
  createSecurityHeadersMiddleware,
  createServiceCorsOptions,
  createSuccessResponse,
} from "@workspace/shared";
import { mountOpenApiDocs } from "@workspace/shared/http";
import type { Logger } from "@workspace/shared/logger";
import cors from "cors";
import express, { type Express, type Request } from "express";
import "express-async-errors";

import type { UserServiceEnv } from "./config/env.js";
import { isAuthenticated } from "./middlewares/isAuthenticated.js";
import { requestContext } from "./middlewares/requestContext.js";
import { buildUserServiceOpenApiSpec } from "./openapi/spec.js";
import { authRoutes } from "./routes/auth.routes.js";
import { permissionRoutes } from "./routes/permission.routes.js";
import { userRoutes } from "./routes/user.routes.js";

function userServiceErrorLogContext(request: Request): Record<string, unknown> | undefined {
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

export function createUserApp(env: UserServiceEnv, logger: Logger): Express {
  const app = express();

  app.use(createSecurityHeadersMiddleware({ nodeEnv: env.nodeEnv }));
  app.use(cors(createServiceCorsOptions(env.allowedOrigins, "user-service")));
  app.use(express.json());
  app.use(requestContext);

  app.get("/health", (_req, res) => {
    res.status(200).json(createSuccessResponse({ status: "ok", service: "user-service" }));
  });

  if (env.enableApiDocs) {
    mountOpenApiDocs(app, {
      spec: buildUserServiceOpenApiSpec(env),
      siteTitle: "user-service — OpenAPI",
    });
  }

  app.use("/user", authRoutes);
  app.post(
    "/user/:id/photo",
    isAuthenticated,
    createRateLimitMiddleware({
      key: "user-service:photo-upload",
      max: env.uploadRateLimitMax,
      windowMs: env.uploadRateLimitWindowMs,
      methods: ["POST"],
    }),
  );
  app.use("/user", userRoutes);
  app.use("/user/permission", permissionRoutes);

  app.use(
    createExpressErrorHandler({
      logger,
      event: "user-service.error",
      fallbackMessage: "Erro interno no user-service.",
      getContext: userServiceErrorLogContext,
    }),
  );

  return app;
}
