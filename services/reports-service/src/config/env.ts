import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseAllowedOrigins,
  validateProductionCorsOrigins,
  validateProductionInternalServiceToken,
} from "@workspace/shared";
import { type LoggerLevel, loggerLevelSchema } from "@workspace/shared/logger";
import dotenv from "dotenv";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnvPath = path.resolve(__dirname, "../../../../.env");
const serviceEnvPath = path.resolve(__dirname, "../../.env");

dotenv.config({ path: rootEnvPath });
dotenv.config({ path: serviceEnvPath, override: process.env.NODE_ENV !== "test" });

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

const reportsServiceEnvSchema = z
  .object({
    port: z.coerce.number().int().positive().default(3044),
    nodeEnv: z.string().optional().default("development"),
    databaseUrl: z.string().min(1, "DATABASE_URL nao definido para o reports-service."),
    jwtSecret: z.string().min(1, "JWT_SECRET nao definido para o reports-service."),
    reportsInternalToken: z.string().optional().default("reports-service-token"),
    reportsGrantSecret: z.string().optional().default("reports-grant-secret"),
    certificateReportingToken: z.string().optional().default(""),
    certificateReportingGrantSecret: z.string().optional().default(""),
    auditEnabled: z
      .string()
      .optional()
      .default("true")
      .transform((value) => parseBoolean(value)),
    auditServiceUrl: z.string().url().default("http://localhost:3020"),
    auditServiceToken: z.string().default("audit-service-token"),
    userServiceUrl: z.string().url("USER_SERVICE_URL invalida.").default("http://localhost:3001"),
    parcelamentoServiceUrl: z
      .string()
      .url("PARCELAMENTO_SERVICE_URL invalida.")
      .default("http://localhost:3043"),
    clientServiceUrl: z
      .string()
      .url("CLIENT_SERVICE_URL invalida.")
      .default("http://localhost:3000"),
    contabilServiceUrl: z
      .string()
      .url("CONTABIL_SERVICE_URL invalida.")
      .default("http://localhost:3038"),
    taskServiceUrl: z.string().url("TASK_SERVICE_URL invalida.").default("http://localhost:3032"),
    projectServiceUrl: z
      .string()
      .url("PROJECT_SERVICE_URL invalida.")
      .default("http://localhost:3033"),
    certificateServiceUrl: z
      .string()
      .url("CERTIFICATE_SERVICE_URL invalida.")
      .default("http://localhost:3041"),
    fiscalServiceUrl: z
      .string()
      .url("FISCAL_SERVICE_URL invalida.")
      .default("http://localhost:3037"),
    workerPollIntervalMs: z.coerce.number().int().positive().default(5000),
    workerConcurrency: z.coerce.number().int().positive().default(2),
    workerLeaseSeconds: z.coerce.number().int().positive().default(120),
    adapterTimeoutMs: z.coerce.number().int().positive().default(10000),
    sourceTimeoutMs: z.coerce.number().int().positive().default(10000),
    previewRowLimit: z.coerce.number().int().positive().max(1000).default(100),
    logLevel: loggerLevelSchema.optional().default("info"),
    logPretty: z
      .string()
      .optional()
      .default("false")
      .transform((value) => parseBoolean(value)),
    allowedOrigins: z
      .string()
      .optional()
      .default("*")
      .transform((value) => parseAllowedOrigins(value)),
    enableApiDocsEnv: z.string().optional(),
  })
  .transform((env) => {
    const { enableApiDocsEnv, ...rest } = env;
    const enableApiDocs =
      enableApiDocsEnv !== undefined && enableApiDocsEnv !== ""
        ? parseBoolean(enableApiDocsEnv)
        : rest.nodeEnv !== "production";

    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "reports-service",
      envName: "REPORTS_INTERNAL_TOKEN",
      token: rest.reportsInternalToken,
    });
    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "reports-service",
      envName: "REPORTS_GRANT_SECRET",
      token: rest.reportsGrantSecret,
    });
    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "reports-service",
      envName: "CERTIFICATE_REPORTING_TOKEN",
      token: rest.certificateReportingToken,
    });
    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "reports-service",
      envName: "CERTIFICATE_REPORTING_GRANT_SECRET",
      token: rest.certificateReportingGrantSecret,
    });
    validateProductionCorsOrigins({
      nodeEnv: rest.nodeEnv,
      serviceName: "reports-service",
      envName: "SERVICE_ALLOWED_ORIGINS",
      allowedOrigins: rest.allowedOrigins,
    });

    return {
      ...rest,
      logPretty: rest.nodeEnv !== "production" && rest.logPretty,
      enableApiDocs,
    };
  });

export type ReportsServiceEnv = z.infer<typeof reportsServiceEnvSchema> & {
  logLevel: LoggerLevel;
  logPretty: boolean;
};

export function parseReportsServiceEnv(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>,
): ReportsServiceEnv {
  return reportsServiceEnvSchema.parse({
    port: source.PORT,
    nodeEnv: source.NODE_ENV,
    databaseUrl: source.DATABASE_URL,
    jwtSecret: source.JWT_SECRET,
    reportsInternalToken: source.REPORTS_INTERNAL_TOKEN,
    reportsGrantSecret: source.REPORTS_GRANT_SECRET,
    certificateReportingToken: source.CERTIFICATE_REPORTING_TOKEN,
    certificateReportingGrantSecret: source.CERTIFICATE_REPORTING_GRANT_SECRET,
    auditEnabled: source.AUDIT_ENABLED,
    auditServiceUrl: source.AUDIT_SERVICE_URL,
    auditServiceToken: source.AUDIT_SERVICE_TOKEN,
    userServiceUrl: source.USER_SERVICE_URL,
    parcelamentoServiceUrl: source.PARCELAMENTO_SERVICE_URL,
    clientServiceUrl: source.CLIENT_SERVICE_URL,
    contabilServiceUrl: source.CONTABIL_SERVICE_URL,
    taskServiceUrl: source.TASK_SERVICE_URL,
    projectServiceUrl: source.PROJECT_SERVICE_URL,
    certificateServiceUrl: source.CERTIFICATE_SERVICE_URL,
    fiscalServiceUrl: source.FISCAL_SERVICE_URL,
    workerPollIntervalMs: source.REPORTS_WORKER_POLL_INTERVAL_MS,
    workerConcurrency: source.REPORTS_WORKER_CONCURRENCY,
    workerLeaseSeconds: source.REPORTS_WORKER_LEASE_SECONDS,
    adapterTimeoutMs: source.REPORTS_ADAPTER_TIMEOUT_MS,
    sourceTimeoutMs: source.REPORTS_SOURCE_TIMEOUT_MS,
    previewRowLimit: source.REPORTS_PREVIEW_ROW_LIMIT,
    logLevel: source.LOG_LEVEL,
    logPretty: source.LOG_PRETTY,
    allowedOrigins: source.SERVICE_ALLOWED_ORIGINS,
    enableApiDocsEnv: source.ENABLE_API_DOCS,
  });
}

export function getReportsServiceEnv(): ReportsServiceEnv {
  return parseReportsServiceEnv(process.env);
}
