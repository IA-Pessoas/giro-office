import { type LoggerLevel, loggerLevelSchema } from "@workspace/shared";
import { z } from "zod";

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

const regularizeServiceEnvSchema = z
  .object({
    port: z
      .string()
      .optional()
      .default("3411")
      .transform((val) => {
        const parsed = Number.parseInt(val, 10);
        return Number.isNaN(parsed) ? 3411 : parsed;
      }),
    nodeEnv: z.string().optional().default("development"),
    databaseUrl: z.string().min(1, "DATABASE_URL não definido para o regularize-service."),
    jwtSecret: z.string().min(1, "JWT_SECRET não definido para o regularize-service."),
    auditServiceToken: z.string().optional().default("audit-service-token"),
    internalServiceToken: z.string().optional(),
    encryptionKey: z.string().min(1, "MTK_ENCRYPTION_KEY não definida."),
    enableReconciliationSchedule: z
      .string()
      .optional()
      .default("false")
      .transform((value) => parseBoolean(value)),
    licenseNotificationCron: z.string().optional().default("30 4 * * *"),
    clientPfStatusCron: z.string().optional().default("* 5 * * *"),
    clientPfDocumentsCron: z.string().optional().default("30 5 * * *"),
    reconciliationTimezone: z.string().optional().default("America/Sao_Paulo"),
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

export type RegularizeServiceEnv = z.infer<typeof regularizeServiceEnvSchema> & {
  logLevel: LoggerLevel;
  logPretty: boolean;
};

export function getRegularizeServiceEnv(): RegularizeServiceEnv {
  return regularizeServiceEnvSchema.parse({
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    auditServiceToken: process.env.AUDIT_SERVICE_TOKEN,
    internalServiceToken: process.env.REGULARIZE_SERVICE_INTERNAL_TOKEN,
    encryptionKey: process.env.MTK_ENCRYPTION_KEY,
    enableReconciliationSchedule: process.env.REGULARIZE_ENABLE_RECONCILIATION_SCHEDULE,
    licenseNotificationCron: process.env.REGULARIZE_LICENSE_NOTIFICATION_CRON,
    clientPfStatusCron: process.env.REGULARIZE_CLIENT_PF_STATUS_CRON,
    clientPfDocumentsCron: process.env.REGULARIZE_CLIENT_PF_DOCUMENTS_CRON,
    reconciliationTimezone: process.env.REGULARIZE_RECONCILIATION_TIMEZONE,
    logLevel: process.env.LOG_LEVEL,
    logPretty: process.env.LOG_PRETTY,
    enableApiDocsEnv: process.env.ENABLE_API_DOCS,
  });
}
