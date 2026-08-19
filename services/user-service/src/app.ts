import { createRequire } from "node:module";
import {
  createAuthenticationRateLimitMiddleware,
  createExpressErrorHandler,
  createPostgresRateLimitStore,
  createRateLimitMiddleware,
  createSecurityHeadersMiddleware,
  createServiceCorsOptions,
  createSuccessResponse,
  type RateLimitStore,
} from "@workspace/shared";
import { mountOpenApiDocs } from "@workspace/shared/http";
import type { Logger } from "@workspace/shared/logger";
import cors from "cors";
import express, { type Express, type Request } from "express";
import "express-async-errors";

import type { UserServiceEnv } from "./config/env.js";
import type { UserAuditRecorder } from "./integrations/audit.js";
import { isAuthenticated } from "./middlewares/isAuthenticated.js";
import { requestContext } from "./middlewares/requestContext.js";
import { buildUserServiceOpenApiSpec } from "./openapi/spec.js";
import { authRoutes } from "./routes/auth.routes.js";
import { createPermissionRoutes } from "./routes/permission.routes.js";
import { createUserRoutes } from "./routes/user.routes.js";

const { Pool } = createRequire(import.meta.url)("pg") as {
  Pool: new (options: {
    connectionString: string;
  }) => {
    query(
      text: string,
      values: readonly unknown[],
    ): Promise<{ rows: Array<{ allowed: boolean; retry_after_seconds: number }> }>;
  };
};

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
  options: { audit?: UserAuditRecorder; rateLimitStore?: RateLimitStore } = {},
): Express {
  const app = express();
  const userRoutes = createUserRoutes({ audit: options.audit });
  const permissionRoutes = createPermissionRoutes({ audit: options.audit });

  const rateLimitStore =
    options.rateLimitStore ??
    (env.nodeEnv === "test"
      ? undefined
      : createPostgresRateLimitStore(new Pool({ connectionString: env.databaseUrl })));
  const authRateLimitOptions = {
    store: rateLimitStore,
    keySecret: env.authRateLimitKeySecret,
    ipMax: env.authRateLimitIpMax,
    accountMax: env.authRateLimitAccountMax,
    ipAccountMax: env.authRateLimitIpAccountMax,
    windowMs: env.authRateLimitWindowMs,
    timeoutMs: env.authRateLimitTimeoutMs,
    degradationMode: env.authRateLimitDegradationMode,
    onDecision: ({ bucket, outcome }: { bucket: string; outcome: "blocked" | "observed" }) =>
      logger.warn({ event: "auth.rate_limit.decision", data: { bucket, outcome } }),
    onDegraded: () => logger.warn({ event: "auth.rate_limit.degraded" }),
  };

  app.set("trust proxy", env.trustedProxyCidrs);
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

  app.use("/user/session", createAuthenticationRateLimitMiddleware(authRateLimitOptions));
  app.use(
    "/user/start-config",
    createAuthenticationRateLimitMiddleware({ ...authRateLimitOptions, buckets: ["ip"] }),
  );
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
