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

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const storageModeSchema = z.enum(["supabase", "local"]);

const certificateServiceEnvSchema = z
  .object({
    nodeEnv: z.string().optional().default("development"),
    port: z.coerce.number().int().positive().default(3041),
    databaseUrl: z.string().min(1, "DATABASE_URL nao definido para o certificate-service."),
    jwtSecret: z.string().min(1, "JWT_SECRET nao definido."),
    auditServiceUrl: z.string().url("AUDIT_SERVICE_URL invalida."),
    auditServiceToken: z.string().min(1, "AUDIT_SERVICE_TOKEN nao definido."),
    internalServiceToken: z.string().min(1, "CERTIFICATE_SERVICE_INTERNAL_TOKEN nao definido."),
    notificationWindowDays: z.coerce.number().int().positive().default(30),
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
    storageMode: storageModeSchema.optional().default("supabase"),
    storageBucket: z.string().optional().default("Certificados"),
    storageDir: z.string().optional().default(".data/certificate-files"),
    certificateFileMaxSizeBytes: z
      .string()
      .optional()
      .transform((value) => parsePositiveInteger(value, 5 * 1024 * 1024)),
    certificateFileEncryptionKey: z
      .string()
      .min(1, "CERTIFICATE_FILE_ENCRYPTION_KEY nao definida."),
    certificateFileEncryptionKeyVersion: z.string().optional().default("v1"),
    certificatePasswordEncryptionKey: z
      .string()
      .min(1, "CERTIFICATE_PASSWORD_ENCRYPTION_KEY nao definida.")
      .refine(
        (value) => Buffer.from(value, "base64").length === 32,
        "CERTIFICATE_PASSWORD_ENCRYPTION_KEY deve ter 32 bytes em base64.",
      ),
    certificatePasswordEncryptionKeyVersion: z.string().min(1).default("v1"),
    supabaseUrl: z.string().trim().optional(),
    supabaseServiceRoleKey: z.string().trim().optional(),
    uploadRateLimitMax: z
      .string()
      .optional()
      .transform((value) => parsePositiveInteger(value, 30)),
    uploadRateLimitWindowMs: z
      .string()
      .optional()
      .transform((value) => parsePositiveInteger(value, 600_000)),
  })
  .superRefine((env, ctx) => {
    const key = Buffer.from(env.certificateFileEncryptionKey, "base64");
    if (key.length !== 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "CERTIFICATE_FILE_ENCRYPTION_KEY deve ser base64 com 32 bytes.",
        path: ["certificateFileEncryptionKey"],
      });
    }

    if (env.nodeEnv === "production" && env.storageMode === "local") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "CERTIFICATE_STORAGE_MODE=local nao e permitido em producao.",
        path: ["storageMode"],
      });
    }

    if (env.storageMode === "supabase") {
      if (!env.supabaseUrl || !z.string().url().safeParse(env.supabaseUrl).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "SUPABASE_URL invalida para certificate-service.",
          path: ["supabaseUrl"],
        });
      }

      if (!env.supabaseServiceRoleKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "SUPABASE_SERVICE_ROLE_KEY nao definida para certificate-service.",
          path: ["supabaseServiceRoleKey"],
        });
      }
    }
  })
  .transform((env) => {
    const { enableApiDocsEnv, ...rest } = env;
    const enableApiDocs =
      enableApiDocsEnv !== undefined && enableApiDocsEnv !== ""
        ? parseBoolean(enableApiDocsEnv)
        : rest.nodeEnv !== "production";

    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "certificate-service",
      envName: "AUDIT_SERVICE_TOKEN",
      token: rest.auditServiceToken,
    });
    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "certificate-service",
      envName: "CERTIFICATE_SERVICE_INTERNAL_TOKEN",
      token: rest.internalServiceToken,
    });
    validateProductionCorsOrigins({
      nodeEnv: rest.nodeEnv,
      serviceName: "certificate-service",
      envName: "SERVICE_ALLOWED_ORIGINS",
      allowedOrigins: rest.allowedOrigins,
    });

    return {
      ...rest,
      enableApiDocs,
      supabaseUrl: rest.supabaseUrl ?? "",
      supabaseServiceRoleKey: rest.supabaseServiceRoleKey ?? "",
      logPretty: rest.nodeEnv !== "production" && rest.logPretty,
    };
  });

export type CertificateServiceEnv = z.infer<typeof certificateServiceEnvSchema>;

export function getCertificateServiceEnv(): CertificateServiceEnv {
  return certificateServiceEnvSchema.parse({
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    auditServiceUrl: process.env.AUDIT_SERVICE_URL,
    auditServiceToken: process.env.AUDIT_SERVICE_TOKEN,
    internalServiceToken: process.env.CERTIFICATE_SERVICE_INTERNAL_TOKEN,
    notificationWindowDays: process.env.CERTIFICATE_NOTIFICATION_WINDOW_DAYS,
    allowedOrigins: process.env.SERVICE_ALLOWED_ORIGINS,
    enableApiDocsEnv: process.env.ENABLE_API_DOCS,
    logLevel: process.env.LOG_LEVEL,
    logPretty: process.env.LOG_PRETTY,
    storageMode: process.env.CERTIFICATE_STORAGE_MODE,
    storageBucket: process.env.CERTIFICATE_STORAGE_BUCKET,
    storageDir: process.env.CERTIFICATE_STORAGE_DIR,
    certificateFileMaxSizeBytes: process.env.CERTIFICATE_FILE_MAX_SIZE_BYTES,
    certificateFileEncryptionKey: process.env.CERTIFICATE_FILE_ENCRYPTION_KEY,
    certificateFileEncryptionKeyVersion: process.env.CERTIFICATE_FILE_ENCRYPTION_KEY_VERSION,
    certificatePasswordEncryptionKey: process.env.CERTIFICATE_PASSWORD_ENCRYPTION_KEY,
    certificatePasswordEncryptionKeyVersion:
      process.env.CERTIFICATE_PASSWORD_ENCRYPTION_KEY_VERSION,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    uploadRateLimitMax: process.env.UPLOAD_RATE_LIMIT_MAX,
    uploadRateLimitWindowMs: process.env.UPLOAD_RATE_LIMIT_WINDOW_MS,
  });
}
