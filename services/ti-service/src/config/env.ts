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
const rootEnvPath = path.resolve(__dirname, "../../../../.env");
const serviceEnvPath = path.resolve(__dirname, "../../.env");

dotenv.config({ path: rootEnvPath });
dotenv.config({ path: serviceEnvPath, override: true });

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

const tiServiceEnvSchema = z
  .object({
    nodeEnv: z.string().optional().default("development"),
    port: z.coerce.number().int().positive().default(3040),
    databaseUrl: z.string().min(1, "DATABASE_URL nao definido para o ti-service."),
    auditServiceUrl: z.string().url("AUDIT_SERVICE_URL invalida."),
    auditServiceToken: z.string().min(1, "AUDIT_SERVICE_TOKEN nao definido."),
    internalServiceToken: z.string().min(1, "TI_SERVICE_INTERNAL_TOKEN nao definido."),
    passwordEncryptionKey: z.string().min(1, "MTK_ENCRYPTION_KEY nao definido."),
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
      .transform((value) => parseBoolean(value)),
  })
  .transform((env) => {
    const { enableApiDocsEnv, ...rest } = env;
    const enableApiDocs =
      enableApiDocsEnv !== undefined && enableApiDocsEnv !== ""
        ? parseBoolean(enableApiDocsEnv)
        : rest.nodeEnv !== "production";

    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "ti-service",
      envName: "AUDIT_SERVICE_TOKEN",
      token: rest.auditServiceToken,
    });
    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "ti-service",
      envName: "TI_SERVICE_INTERNAL_TOKEN",
      token: rest.internalServiceToken,
    });
    validateProductionCorsOrigins({
      nodeEnv: rest.nodeEnv,
      serviceName: "ti-service",
      envName: "SERVICE_ALLOWED_ORIGINS",
      allowedOrigins: rest.allowedOrigins,
    });

    return {
      ...rest,
      enableApiDocs,
      logPretty: rest.nodeEnv !== "production" && rest.logPretty,
    };
  });

export type TiServiceEnv = z.infer<typeof tiServiceEnvSchema>;

export function getTiServiceEnv(): TiServiceEnv {
  return tiServiceEnvSchema.parse({
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    databaseUrl: process.env.DATABASE_URL,
    auditServiceUrl: process.env.AUDIT_SERVICE_URL,
    auditServiceToken: process.env.AUDIT_SERVICE_TOKEN,
    internalServiceToken: process.env.TI_SERVICE_INTERNAL_TOKEN,
    passwordEncryptionKey: process.env.MTK_ENCRYPTION_KEY,
    allowedOrigins: process.env.SERVICE_ALLOWED_ORIGINS,
    enableApiDocsEnv: process.env.ENABLE_API_DOCS,
    logLevel: process.env.LOG_LEVEL,
    logPretty: process.env.LOG_PRETTY,
  });
}
