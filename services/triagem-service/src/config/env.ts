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

dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env"), override: true });

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

const triagemServiceEnvSchema = z
  .object({
    port: z.coerce.number().int().positive().default(3046),
    databaseUrl: z.string().url("DATABASE_URL não definida para o triagem-service."),
    jwtSecret: z.string().min(1, "JWT_SECRET não definido para o triagem-service."),
    nodeEnv: z.string().optional().default("development"),
    auditEnabled: z.string().optional().default("true").transform(parseBoolean),
    auditServiceUrl: z.string().url().default("http://localhost:3020"),
    auditServiceToken: z.string().default("audit-service-token"),
    internalServiceToken: z.string().optional().default("audit-service-token"),
    logLevel: loggerLevelSchema.optional().default("info"),
    logPretty: z.string().optional().default("false").transform(parseBoolean),
    enableApiDocsEnv: z.string().optional(),
    allowedOrigins: z
      .string()
      .optional()
      .default("*")
      .transform((value) => parseAllowedOrigins(value)),
  })
  .transform((env) => {
    const { enableApiDocsEnv, ...rest } = env;
    const enableApiDocs =
      enableApiDocsEnv !== undefined && enableApiDocsEnv !== ""
        ? parseBoolean(enableApiDocsEnv)
        : rest.nodeEnv !== "production";

    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "triagem-service",
      envName: "INTERNAL_SERVICE_TOKEN",
      token: rest.internalServiceToken,
    });
    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "triagem-service",
      envName: "AUDIT_SERVICE_TOKEN",
      token: rest.auditServiceToken,
    });
    validateProductionCorsOrigins({
      nodeEnv: rest.nodeEnv,
      serviceName: "triagem-service",
      envName: "SERVICE_ALLOWED_ORIGINS",
      allowedOrigins: rest.allowedOrigins,
    });

    return { ...rest, enableApiDocs };
  });

export type TriagemServiceEnv = z.infer<typeof triagemServiceEnvSchema>;

export function getTriagemServiceEnv(): TriagemServiceEnv {
  return triagemServiceEnvSchema.parse({
    port: process.env.PORT,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    nodeEnv: process.env.NODE_ENV,
    auditEnabled: process.env.AUDIT_ENABLED,
    auditServiceUrl: process.env.AUDIT_SERVICE_URL,
    auditServiceToken: process.env.AUDIT_SERVICE_TOKEN,
    internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN ?? process.env.AUDIT_SERVICE_TOKEN,
    logLevel: process.env.LOG_LEVEL,
    logPretty: process.env.LOG_PRETTY,
    enableApiDocsEnv: process.env.ENABLE_API_DOCS,
    allowedOrigins: process.env.SERVICE_ALLOWED_ORIGINS,
  });
}
