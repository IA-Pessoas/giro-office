import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  type LoggerLevel,
  loggerLevelSchema,
  parseAllowedOrigins,
  validateProductionCorsOrigins,
  validateProductionInternalServiceToken,
} from "@workspace/shared";
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

const parcelamentoServiceEnvSchema = z
  .object({
    port: z.coerce.number().int().positive().default(3043),
    nodeEnv: z.string().optional().default("development"),
    databaseUrl: z.string().min(1, "DATABASE_URL nao definido para o parcelamento-service."),
    jwtSecret: z.string().min(1, "JWT_SECRET nao definido para o parcelamento-service."),
    auditEnabled: z
      .string()
      .optional()
      .default("true")
      .transform((value) => parseBoolean(value)),
    auditServiceUrl: z.string().url("AUDIT_SERVICE_URL invalida.").default("http://localhost:3020"),
    auditServiceToken: z.string().optional().default("audit-service-token"),
    reportsInternalToken: z.string().optional().default("reports-service-token"),
    reportsGrantSecret: z.string().optional().default("reports-grant-secret"),
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
      serviceName: "parcelamento-service",
      envName: "AUDIT_SERVICE_TOKEN",
      token: rest.auditServiceToken,
    });
    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "parcelamento-service",
      envName: "REPORTS_INTERNAL_TOKEN",
      token: rest.reportsInternalToken,
    });
    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "parcelamento-service",
      envName: "REPORTS_GRANT_SECRET",
      token: rest.reportsGrantSecret,
    });
    validateProductionCorsOrigins({
      nodeEnv: rest.nodeEnv,
      serviceName: "parcelamento-service",
      envName: "SERVICE_ALLOWED_ORIGINS",
      allowedOrigins: rest.allowedOrigins,
    });

    return {
      ...rest,
      logPretty: rest.nodeEnv !== "production" && rest.logPretty,
      enableApiDocs,
    };
  });

export type ParcelamentoServiceEnv = z.infer<typeof parcelamentoServiceEnvSchema> & {
  logLevel: LoggerLevel;
  logPretty: boolean;
};

export function parseParcelamentoServiceEnv(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>,
): ParcelamentoServiceEnv {
  return parcelamentoServiceEnvSchema.parse({
    port: source.PORT,
    nodeEnv: source.NODE_ENV,
    databaseUrl: source.DATABASE_URL,
    jwtSecret: source.JWT_SECRET,
    auditEnabled: source.AUDIT_ENABLED,
    auditServiceUrl: source.AUDIT_SERVICE_URL,
    auditServiceToken: source.AUDIT_SERVICE_TOKEN,
    reportsInternalToken: source.REPORTS_INTERNAL_TOKEN,
    reportsGrantSecret: source.REPORTS_GRANT_SECRET,
    logLevel: source.LOG_LEVEL,
    logPretty: source.LOG_PRETTY,
    allowedOrigins: source.SERVICE_ALLOWED_ORIGINS,
    enableApiDocsEnv: source.ENABLE_API_DOCS,
  });
}

export function getParcelamentoServiceEnv(): ParcelamentoServiceEnv {
  return parseParcelamentoServiceEnv(process.env);
}
