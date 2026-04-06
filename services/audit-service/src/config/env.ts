import path from "node:path";
import { fileURLToPath } from "node:url";

import { loggerLevelSchema } from "@workspace/shared";
import dotenv from "dotenv";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnvPath = path.resolve(__dirname, "../../../../.env");

dotenv.config({ path: rootEnvPath });

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

const auditServiceEnvSchema = z
  .object({
    nodeEnv: z.string().optional().default("development"),
    auditEnabled: z
      .string()
      .optional()
      .default("false")
      .transform((value) => parseBoolean(value)),
    auditServicePort: z
      .string()
      .optional()
      .default("3336")
      .transform((value) => {
        const parsed = Number.parseInt(value, 10);
        return Number.isNaN(parsed) ? 3336 : parsed;
      }),
    auditServiceToken: z.string().optional().default("audit-service-token"),
    databaseUrl: z.string().min(1, "DATABASE_URL não definido para o audit-service."),
    logLevel: loggerLevelSchema.optional().default("info"),
    logPretty: z
      .string()
      .optional()
      .default("false")
      .transform((value) => parseBoolean(value)),
    enableApiDocsEnv: z.string().optional(),
  })
  .transform((env) => {
    const { enableApiDocsEnv, ...rest } = env;
    const enableApiDocs =
      enableApiDocsEnv !== undefined && enableApiDocsEnv !== ""
        ? parseBoolean(enableApiDocsEnv)
        : rest.nodeEnv !== "production";
    return {
      ...rest,
      logPretty: rest.nodeEnv !== "production" && rest.logPretty,
      enableApiDocs,
    };
  });

export type AuditServiceEnv = z.infer<typeof auditServiceEnvSchema>;

export function getAuditServiceEnv(): AuditServiceEnv {
  return auditServiceEnvSchema.parse({
    nodeEnv: process.env.NODE_ENV,
    auditEnabled: process.env.AUDIT_ENABLED,
    auditServicePort: process.env.AUDIT_SERVICE_PORT,
    auditServiceToken: process.env.AUDIT_SERVICE_TOKEN,
    databaseUrl: process.env.DATABASE_URL,
    logLevel: process.env.LOG_LEVEL,
    logPretty: process.env.LOG_PRETTY,
    enableApiDocsEnv: process.env.ENABLE_API_DOCS,
  });
}
