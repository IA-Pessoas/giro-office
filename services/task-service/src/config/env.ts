import "dotenv/config";

import { loggerLevelSchema } from "@workspace/shared/logger";
import { z } from "zod";

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

const envSchema = z
  .object({
    port: z
      .string()
      .optional()
      .default("3337")
      .transform((val: string) => {
        const parsed = Number.parseInt(val, 10);
        return Number.isNaN(parsed) ? 3337 : parsed;
      }),
    databaseUrl: z.string().url("DATABASE_URL não definida."),
    jwtSecret: z.string().min(1, "JWT_SECRET não definido para o task-service."),
    nodeEnv: z.string().optional().default("development"),
    logLevel: loggerLevelSchema.optional().default("info"),
    logPretty: z
      .string()
      .optional()
      .default("false")
      .transform((value) => parseBoolean(value)),
    auditEnabled: z
      .string()
      .optional()
      .default("true")
      .transform((value) => parseBoolean(value)),
    auditServiceUrl: z.string().url().default("http://localhost:3336"),
    auditServiceToken: z.string().default("audit-service-token"),
  })
  .transform((env) => ({
    ...env,
    logPretty: env.nodeEnv !== "production" && env.logPretty,
  }));

export type TaskServiceEnv = z.infer<typeof envSchema>;

export function getTaskServiceEnv(): TaskServiceEnv {
  return envSchema.parse({
    port: process.env.PORT,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    nodeEnv: process.env.NODE_ENV,
    auditEnabled: process.env.AUDIT_ENABLED,
    auditServiceUrl: process.env.AUDIT_SERVICE_URL,
    auditServiceToken: process.env.AUDIT_SERVICE_TOKEN,
    logLevel: process.env.LOG_LEVEL,
    logPretty: process.env.LOG_PRETTY,
  });
}
