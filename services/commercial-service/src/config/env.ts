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
    clientServiceUrl: z.string().url().default("http://localhost:3035"),
    clientServiceInternalToken: z.string().default("audit-service-token"),
    taskServiceUrl: z.string().url().default("http://localhost:3032"),
    taskServiceInternalToken: z.string().default("audit-service-token"),
    emailAdapterUrl: z.string().url().optional(),
    emailAdapterToken: z.string().min(1).optional(),
    emailFrom: z.string().trim().email().default("no-reply@girooffice.local"),
    emailAdapterTimeoutMs: z.coerce.number().int().positive().default(10_000),
    outboxWorkerPollIntervalMs: z.coerce.number().int().positive().default(1000),
    outboxWorkerMaxAttempts: z.coerce.number().int().positive().default(5),
    outboxWorkerRetryBaseMs: z.coerce.number().int().positive().default(1000),
    enableApiDocsEnv: z.string().optional(),
    allowedOrigins: z
      .string()
      .optional()
      .default("*")
      .transform((value) => parseAllowedOrigins(value)),
  })
  .superRefine((env, ctx) => {
    if (env.nodeEnv === "production") {
      if (!env.emailAdapterUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "COMMERCIAL_EMAIL_ADAPTER_URL é obrigatória em produção.",
          path: ["emailAdapterUrl"],
        });
      } else if (new URL(env.emailAdapterUrl).protocol !== "https:") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "COMMERCIAL_EMAIL_ADAPTER_URL deve usar HTTPS em produção.",
          path: ["emailAdapterUrl"],
        });
      }
      if (!env.emailAdapterToken) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "COMMERCIAL_EMAIL_ADAPTER_TOKEN é obrigatório em produção.",
          path: ["emailAdapterToken"],
        });
      }
    }
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
    validateProductionInternalServiceToken({
      nodeEnv: env.nodeEnv,
      serviceName: "commercial-service",
      envName: "CLIENT_SERVICE_INTERNAL_TOKEN",
      token: env.clientServiceInternalToken,
    });
    validateProductionInternalServiceToken({
      nodeEnv: env.nodeEnv,
      serviceName: "commercial-service",
      envName: "TASK_SERVICE_INTERNAL_TOKEN",
      token: env.taskServiceInternalToken,
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
    clientServiceUrl: process.env.CLIENT_SERVICE_URL,
    clientServiceInternalToken: process.env.CLIENT_SERVICE_INTERNAL_TOKEN,
    taskServiceUrl: process.env.TASK_SERVICE_URL,
    taskServiceInternalToken: process.env.TASK_SERVICE_INTERNAL_TOKEN,
    emailAdapterUrl: process.env.COMMERCIAL_EMAIL_ADAPTER_URL,
    emailAdapterToken: process.env.COMMERCIAL_EMAIL_ADAPTER_TOKEN,
    emailFrom: process.env.COMMERCIAL_EMAIL_FROM,
    emailAdapterTimeoutMs: process.env.COMMERCIAL_EMAIL_ADAPTER_TIMEOUT_MS,
    outboxWorkerPollIntervalMs: process.env.COMMERCIAL_OUTBOX_WORKER_POLL_INTERVAL_MS,
    outboxWorkerMaxAttempts: process.env.COMMERCIAL_OUTBOX_WORKER_MAX_ATTEMPTS,
    outboxWorkerRetryBaseMs: process.env.COMMERCIAL_OUTBOX_WORKER_RETRY_BASE_MS,
    enableApiDocsEnv: process.env.ENABLE_API_DOCS,
    allowedOrigins: process.env.SERVICE_ALLOWED_ORIGINS,
  });
}
