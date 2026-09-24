import {
  createExpressErrorHandler,
  createRateLimitMiddleware,
  createSecurityHeadersMiddleware,
  createServiceCorsOptions,
  createSuccessResponse,
} from "@workspace/shared";
import { requestContext } from "@workspace/shared/http";
import type { Logger } from "@workspace/shared/logger";
import { mountOpenApiDocs } from "@workspace/shared/openapi";
import cors from "cors";
import express, { type Express, type Request } from "express";
import "express-async-errors";

import type { UserServiceEnv } from "./config/env.js";
import type { UserAuditRecorder } from "./integrations/audit.js";
import { isAuthenticated } from "./middlewares/isAuthenticated.js";
import { buildUserServiceOpenApiSpec } from "./openapi/spec.js";
import { createAuthRoutes } from "./routes/auth.routes.js";
import { createInternalReportingRouter } from "./routes/internalReporting.routes.js";
import { createPermissionRoutes } from "./routes/permission.routes.js";
import { createPlatformAuthRoutes } from "./routes/platformAuth.routes.js";
import { createPlatformUsersRoutes } from "./routes/platformUsers.routes.js";
import { createUserRoutes } from "./routes/user.routes.js";

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

export function createUserApp(
  env: UserServiceEnv,
  logger: Logger,
  options: { audit?: UserAuditRecorder } = {},
): Express {
  const app = express();
  const userRoutes = createUserRoutes({ audit: options.audit });
  const permissionRoutes = createPermissionRoutes({ audit: options.audit });

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

  app.use("/internal", createInternalReportingRouter(env));
  app.use("/platform", createPlatformAuthRoutes(env));
  app.use(
    "/platform",
    createPlatformUsersRoutes({ audit: options.audit, authCookieSecure: env.authCookieSecure }),
  );
  app.use("/user", createAuthRoutes(env));
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
