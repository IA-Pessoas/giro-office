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
dotenv.config({ path: serviceEnvPath, override: process.env.NODE_ENV !== "test" });

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

function validateBase64Key(value: string): boolean {
  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
}

const pessoalServiceEnvSchema = z
  .object({
    nodeEnv: z.string().optional().default("development"),
    port: z.coerce.number().int().positive().default(3042),
    databaseUrl: z.string().min(1, "DATABASE_URL nao definido para o pessoal-service."),
    jwtSecret: z.string().min(1, "JWT_SECRET nao definido para o pessoal-service."),
    auditServiceUrl: z.string().url("AUDIT_SERVICE_URL invalida.").default("http://localhost:3020"),
    auditServiceToken: z.string().min(1, "AUDIT_SERVICE_TOKEN nao definido."),
    internalServiceTokenEnv: z.string().optional(),
    passwordEncryptionKey: z
      .string()
      .min(1, "PESSOAL_PASSWORD_ENCRYPTION_KEY nao definida.")
      .refine(validateBase64Key, "PESSOAL_PASSWORD_ENCRYPTION_KEY deve ter 32 bytes em base64."),
    passwordEncryptionKeyVersion: z.string().min(1).default("v1"),
    domainAuditEnabled: z
      .string()
      .optional()
      .default("true")
      .transform((value) => parseBoolean(value)),
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
    const { enableApiDocsEnv, internalServiceTokenEnv, ...rest } = env;
    const enableApiDocs =
      enableApiDocsEnv !== undefined && enableApiDocsEnv !== ""
        ? parseBoolean(enableApiDocsEnv)
        : rest.nodeEnv !== "production";
    const internalServiceToken =
      internalServiceTokenEnv !== undefined && internalServiceTokenEnv !== ""
        ? internalServiceTokenEnv
        : rest.nodeEnv === "production"
          ? undefined
          : rest.auditServiceToken;

    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "pessoal-service",
      envName: "AUDIT_SERVICE_TOKEN",
      token: rest.auditServiceToken,
    });
    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "pessoal-service",
      envName: "INTERNAL_SERVICE_TOKEN",
      token: internalServiceToken,
    });
    if (!internalServiceToken) {
      throw new Error("pessoal-service: INTERNAL_SERVICE_TOKEN deve ser definido.");
    }
    validateProductionCorsOrigins({
      nodeEnv: rest.nodeEnv,
      serviceName: "pessoal-service",
      envName: "SERVICE_ALLOWED_ORIGINS",
      allowedOrigins: rest.allowedOrigins,
    });

    return {
      ...rest,
      internalServiceToken,
      enableApiDocs,
      logPretty: rest.nodeEnv !== "production" && rest.logPretty,
    };
  });

export type PessoalServiceEnv = z.infer<typeof pessoalServiceEnvSchema>;

export function parsePessoalServiceEnv(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>,
): PessoalServiceEnv {
  return pessoalServiceEnvSchema.parse({
    nodeEnv: source.NODE_ENV,
    port: source.PORT,
    databaseUrl: source.DATABASE_URL,
    jwtSecret: source.JWT_SECRET,
    auditServiceUrl: source.AUDIT_SERVICE_URL,
    auditServiceToken: source.AUDIT_SERVICE_TOKEN,
    internalServiceTokenEnv: source.INTERNAL_SERVICE_TOKEN,
    passwordEncryptionKey: source.PESSOAL_PASSWORD_ENCRYPTION_KEY,
    passwordEncryptionKeyVersion: source.PESSOAL_PASSWORD_ENCRYPTION_KEY_VERSION,
    domainAuditEnabled: source.PESSOAL_DOMAIN_AUDIT_ENABLED,
    allowedOrigins: source.SERVICE_ALLOWED_ORIGINS,
    enableApiDocsEnv: source.ENABLE_API_DOCS,
    logLevel: source.LOG_LEVEL,
    logPretty: source.LOG_PRETTY,
  });
}

export function getPessoalServiceEnv(): PessoalServiceEnv {
  return parsePessoalServiceEnv(process.env);
}
