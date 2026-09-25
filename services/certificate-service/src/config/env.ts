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

function isCanonicalBase64(value: string): boolean {
  return (
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value) &&
    Buffer.from(value, "base64").toString("base64") === value
  );
}

const storageModeSchema = z.enum(["supabase", "local"]);

const certificateServiceEnvSchema = z
  .object({
    nodeEnv: z.string().optional().default("development"),
    port: z.coerce.number().int().positive().default(3041),
    databaseUrl: z.string().min(1, "DATABASE_URL não definido para o certificate-service."),
    jwtSecret: z.string().min(1, "JWT_SECRET não definido."),
    auditServiceUrl: z.string().url("AUDIT_SERVICE_URL inválida."),
    auditServiceToken: z.string().min(1, "AUDIT_SERVICE_TOKEN não definido."),
    internalServiceToken: z.string().min(1, "CERTIFICATE_SERVICE_INTERNAL_TOKEN não definido."),
    certificateReportingToken: z.string().optional().default(""),
    certificateReportingGrantSecret: z.string().optional().default(""),
    reportsInternalToken: z.string().optional().default("reports-service-token"),
    reportsGrantSecret: z.string().optional().default("reports-grant-secret"),
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
      .min(1, "CERTIFICATE_FILE_ENCRYPTION_KEY não definida."),
    certificateFileEncryptionKeyVersion: z.string().optional().default("v1"),
    certificatePasswordEncryptionKey: z
      .string()
      .min(1, "CERTIFICATE_PASSWORD_ENCRYPTION_KEY não definida.")
      .refine(
        (value) => isCanonicalBase64(value) && Buffer.from(value, "base64").length === 32,
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
        message: "CERTIFICATE_STORAGE_MODE=local não é permitido em produção.",
        path: ["storageMode"],
      });
    }

    if (env.storageMode === "supabase") {
      if (!env.supabaseUrl || !z.string().url().safeParse(env.supabaseUrl).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "SUPABASE_URL inválida para certificate-service.",
          path: ["supabaseUrl"],
        });
      }

      if (!env.supabaseServiceRoleKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "SUPABASE_SERVICE_ROLE_KEY não definida para certificate-service.",
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
    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "certificate-service",
      envName: "CERTIFICATE_REPORTING_TOKEN",
      token: rest.certificateReportingToken,
    });
    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "certificate-service",
      envName: "REPORTS_INTERNAL_TOKEN",
      token: rest.reportsInternalToken,
    });
    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "certificate-service",
      envName: "CERTIFICATE_REPORTING_GRANT_SECRET",
      token: rest.certificateReportingGrantSecret,
    });
    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "certificate-service",
      envName: "REPORTS_GRANT_SECRET",
      token: rest.reportsGrantSecret,
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
    certificateReportingToken: process.env.CERTIFICATE_REPORTING_TOKEN,
    certificateReportingGrantSecret: process.env.CERTIFICATE_REPORTING_GRANT_SECRET,
    reportsInternalToken: process.env.REPORTS_INTERNAL_TOKEN,
    reportsGrantSecret: process.env.REPORTS_GRANT_SECRET,
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
