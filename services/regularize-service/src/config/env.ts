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
const serviceEnvPath = path.resolve(__dirname, "../../.env");
const rootEnvPath = path.resolve(__dirname, "../../../../.env");

dotenv.config({ path: rootEnvPath });
dotenv.config({ path: serviceEnvPath, override: true });

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

const regularizeServiceEnvSchema = z
  .object({
    port: z
      .string()
      .optional()
      .default("3039")
      .transform((val) => {
        const parsed = Number.parseInt(val, 10);
        return Number.isNaN(parsed) ? 3039 : parsed;
      }),
    nodeEnv: z.string().optional().default("development"),
    databaseUrl: z.string().min(1, "DATABASE_URL não definido para o regularize-service."),
    jwtSecret: z.string().min(1, "JWT_SECRET não definido para o regularize-service."),
    auditServiceToken: z.string().optional().default("audit-service-token"),
    internalServiceToken: z.string().optional(),
    encryptionKey: z.string().min(1, "MTK_ENCRYPTION_KEY não definida."),
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
      serviceName: "regularize-service",
      envName: "AUDIT_SERVICE_TOKEN",
      token: rest.auditServiceToken,
    });
    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "regularize-service",
      envName: "REGULARIZE_SERVICE_INTERNAL_TOKEN",
      token: rest.internalServiceToken,
    });
    validateProductionCorsOrigins({
      nodeEnv: rest.nodeEnv,
      serviceName: "regularize-service",
      envName: "SERVICE_ALLOWED_ORIGINS",
      allowedOrigins: rest.allowedOrigins,
    });

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
    logLevel: process.env.LOG_LEVEL,
    logPretty: process.env.LOG_PRETTY,
    allowedOrigins: process.env.SERVICE_ALLOWED_ORIGINS,
    enableApiDocsEnv: process.env.ENABLE_API_DOCS,
  });
}
