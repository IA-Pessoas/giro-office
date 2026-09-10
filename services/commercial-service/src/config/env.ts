import "dotenv/config";

import {
  parseAllowedOrigins,
  validateProductionCorsOrigins,
  validateProductionInternalServiceToken,
} from "@workspace/shared";
import { loggerLevelSchema } from "@workspace/shared/logger";
import { z } from "zod";

const envSchema = z
  .object({
    port: z
      .string()
      .optional()
      .default("3045")
      .transform((value) => {
        const parsed = Number.parseInt(value, 10);
        return Number.isNaN(parsed) ? 3045 : parsed;
      }),
    databaseUrl: z.string().url("DATABASE_URL não definida."),
    jwtSecret: z.string().min(1, "JWT_SECRET não definido para o commercial-service."),
    nodeEnv: z.string().optional().default("development"),
    logLevel: loggerLevelSchema.optional().default("info"),
    logPretty: z
      .string()
      .optional()
      .default("false")
      .transform((value) => value === "true" || value === "1"),
    auditEnabled: z
      .string()
      .optional()
      .default("true")
      .transform((value) => value === "true" || value === "1"),
    auditServiceUrl: z.string().url().default("http://localhost:3020"),
    auditServiceToken: z.string().default("audit-service-token"),
    enableApiDocsEnv: z.string().optional(),
    allowedOrigins: z
      .string()
      .optional()
      .default("*")
      .transform((value) => parseAllowedOrigins(value)),
  })
  .transform((env) => {
    const enableApiDocs = env.enableApiDocsEnv
      ? env.enableApiDocsEnv === "true" || env.enableApiDocsEnv === "1"
      : env.nodeEnv !== "production";

    validateProductionInternalServiceToken({
      nodeEnv: env.nodeEnv,
      serviceName: "commercial-service",
      envName: "AUDIT_SERVICE_TOKEN",
      token: env.auditServiceToken,
    });
    validateProductionCorsOrigins({
      nodeEnv: env.nodeEnv,
      serviceName: "commercial-service",
      envName: "SERVICE_ALLOWED_ORIGINS",
      allowedOrigins: env.allowedOrigins,
    });

    return { ...env, enableApiDocs, logPretty: env.nodeEnv !== "production" && env.logPretty };
  });

export type CommercialServiceEnv = z.infer<typeof envSchema>;

export function getCommercialServiceEnv(): CommercialServiceEnv {
  return envSchema.parse({
    port: process.env.COMMERCIAL_SERVICE_PORT ?? process.env.PORT,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,
    logPretty: process.env.LOG_PRETTY,
    auditEnabled: process.env.AUDIT_ENABLED,
    auditServiceUrl: process.env.AUDIT_SERVICE_URL,
    auditServiceToken: process.env.AUDIT_SERVICE_TOKEN,
    enableApiDocsEnv: process.env.ENABLE_API_DOCS,
    allowedOrigins: process.env.SERVICE_ALLOWED_ORIGINS,
  });
}
