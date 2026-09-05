import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseAllowedOrigins,
  validateProductionCorsOrigins,
  validateProductionInternalServiceToken,
} from "@workspace/shared";
import { loggerLevelSchema } from "@workspace/shared/logger";
import dotenv from "dotenv";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceEnvPath = path.resolve(__dirname, "../../.env");
const workspaceEnvPath = path.resolve(__dirname, "../../../../.env");

dotenv.config({ path: workspaceEnvPath });
dotenv.config({ path: serviceEnvPath, override: true });

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

const envSchema = z
  .object({
    port: z
      .string()
      .optional()
      .default("3038")
      .transform((val: string) => {
        const parsed = Number.parseInt(val, 10);
        return Number.isNaN(parsed) ? 3038 : parsed;
      }),
    databaseUrl: z.string().url("DATABASE_URL não definida."),
    jwtSecret: z.string().min(1, "JWT_SECRET não definido para o contabil-service."),
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
    auditServiceUrl: z.string().url().default("http://localhost:3020"),
    auditServiceToken: z.string().default("audit-service-token"),
    /** Quando vazio, reutiliza `auditServiceToken` (compatível com deploys que só definem AUDIT_SERVICE_TOKEN). */
    internalServiceTokenEnv: z.string().optional(),
    reportsInternalToken: z.string().optional().default("reports-service-token"),
    reportsGrantSecret: z.string().optional().default("reports-grant-secret"),
    enableApiDocsEnv: z.string().optional(),
    allowedOrigins: z
      .string()
      .optional()
      .default("*")
      .transform((value) => parseAllowedOrigins(value)),
  })
  .transform((env) => {
    const { enableApiDocsEnv, internalServiceTokenEnv, ...rest } = env;
    const enableApiDocs =
      enableApiDocsEnv !== undefined && enableApiDocsEnv !== ""
        ? parseBoolean(enableApiDocsEnv)
        : rest.nodeEnv !== "production";
    const internalServiceToken =
      internalServiceTokenEnv !== undefined && internalServiceTokenEnv !== ""
        ? internalServiceTokenEnv
        : rest.auditServiceToken;
    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "contabil-service",
      envName: "AUDIT_SERVICE_TOKEN",
      token: rest.auditServiceToken,
    });
    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "contabil-service",
      envName: "INTERNAL_SERVICE_TOKEN",
      token: internalServiceToken,
    });
    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "contabil-service",
      envName: "REPORTS_INTERNAL_TOKEN",
      token: rest.reportsInternalToken,
    });
    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "contabil-service",
      envName: "REPORTS_GRANT_SECRET",
      token: rest.reportsGrantSecret,
    });
    validateProductionCorsOrigins({
      nodeEnv: rest.nodeEnv,
      serviceName: "contabil-service",
      envName: "SERVICE_ALLOWED_ORIGINS",
      allowedOrigins: rest.allowedOrigins,
    });
    return {
      ...rest,
      internalServiceToken,
      logPretty: rest.nodeEnv !== "production" && rest.logPretty,
      enableApiDocs,
    };
  });

export type ContabilServiceEnv = z.infer<typeof envSchema>;

export function getContabilServiceEnv(): ContabilServiceEnv {
  return envSchema.parse({
    port: process.env.PORT,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,
    logPretty: process.env.LOG_PRETTY,
    auditEnabled: process.env.AUDIT_ENABLED,
    auditServiceUrl: process.env.AUDIT_SERVICE_URL,
    auditServiceToken: process.env.AUDIT_SERVICE_TOKEN,
    internalServiceTokenEnv: process.env.INTERNAL_SERVICE_TOKEN,
    reportsInternalToken: process.env.REPORTS_INTERNAL_TOKEN,
    reportsGrantSecret: process.env.REPORTS_GRANT_SECRET,
    enableApiDocsEnv: process.env.ENABLE_API_DOCS,
    allowedOrigins: process.env.SERVICE_ALLOWED_ORIGINS,
  });
}
