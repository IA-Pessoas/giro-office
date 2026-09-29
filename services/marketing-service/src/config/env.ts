import {
  parseAllowedOrigins,
  validateProductionCorsOrigins,
  validateProductionInternalServiceToken,
} from "@workspace/shared";
import { loggerLevelSchema } from "@workspace/shared/logger";
import { z } from "zod";

const marketingServiceEnvSchema = z
  .object({
    nodeEnv: z.string().optional().default("development"),
    port: z.coerce.number().int().positive().default(3047),
    databaseUrl: z.string().min(1, "DATABASE_URL não definido para o marketing-service."),
    jwtSecret: z.string().min(1, "JWT_SECRET não definido."),
    internalServiceToken: z.string().min(1, "MARKETING_SERVICE_INTERNAL_TOKEN não definido."),
    mtkEncryptionKey: z.string().min(1, "MTK_ENCRYPTION_KEY não definido."),
    allowedOrigins: z
      .string()
      .optional()
      .default("*")
      .transform((value) => parseAllowedOrigins(value)),
    enableApiDocsEnv: z.string().optional(),
    logLevel: loggerLevelSchema.optional().default("info"),
    logPretty: z
      .string()
      .optional()
      .default("false")
      .transform((value) => value === "true" || value === "1"),
  })
  .transform((env) => {
    const enableApiDocs =
      env.enableApiDocsEnv !== undefined && env.enableApiDocsEnv !== ""
        ? env.enableApiDocsEnv === "true" || env.enableApiDocsEnv === "1"
        : env.nodeEnv !== "production";

    validateProductionInternalServiceToken({
      nodeEnv: env.nodeEnv,
      serviceName: "marketing-service",
      envName: "MARKETING_SERVICE_INTERNAL_TOKEN",
      token: env.internalServiceToken,
    });
    validateProductionCorsOrigins({
      nodeEnv: env.nodeEnv,
      serviceName: "marketing-service",
      envName: "SERVICE_ALLOWED_ORIGINS",
      allowedOrigins: env.allowedOrigins,
    });

    return {
      nodeEnv: env.nodeEnv,
      port: env.port,
      databaseUrl: env.databaseUrl,
      jwtSecret: env.jwtSecret,
      internalServiceToken: env.internalServiceToken,
      mtkEncryptionKey: env.mtkEncryptionKey,
      allowedOrigins: env.allowedOrigins,
      enableApiDocs,
      logLevel: env.logLevel,
      logPretty: env.nodeEnv !== "production" && env.logPretty,
    };
  });

export type MarketingServiceEnv = z.infer<typeof marketingServiceEnvSchema>;

export function getMarketingServiceEnv(): MarketingServiceEnv {
  return marketingServiceEnvSchema.parse({
    nodeEnv: process.env.NODE_ENV,
    port: process.env.MARKETING_SERVICE_PORT ?? process.env.PORT,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    internalServiceToken: process.env.MARKETING_SERVICE_INTERNAL_TOKEN,
    mtkEncryptionKey: process.env.MTK_ENCRYPTION_KEY,
    allowedOrigins: process.env.SERVICE_ALLOWED_ORIGINS,
    enableApiDocsEnv: process.env.ENABLE_API_DOCS,
    logLevel: process.env.LOG_LEVEL,
    logPretty: process.env.LOG_PRETTY,
  });
}
