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

import { AI_TASK_EXTRACTION_MODES } from "../integrations/aiTaskExtraction.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceEnvPath = path.resolve(__dirname, "../../.env");

dotenv.config({ path: serviceEnvPath });

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const envSchema = z
  .object({
    port: z
      .string()
      .optional()
      .default("3032")
      .transform((val: string) => {
        const parsed = Number.parseInt(val, 10);
        return Number.isNaN(parsed) ? 3032 : parsed;
      }),
    databaseUrl: z.string().url("DATABASE_URL não definida."),
    jwtSecret: z.string().min(1, "JWT_SECRET não definido para o task-service."),
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
    commercialServiceToken: z.string().default("audit-service-token"),
    projectServiceUrl: z.string().url().default("http://localhost:3033"),
    supabaseUrl: z.string().url().optional(),
    supabaseServiceRoleKey: z.string().trim().min(1).optional(),
    taskAttachmentStorageBucket: z.string().trim().min(1).default("TaskAttachmentsPrivate"),
    aiExtractionMode: z.enum(AI_TASK_EXTRACTION_MODES).optional().default("fake"),
    openaiApiKey: z.string().trim().min(1).optional(),
    openaiBaseUrl: z.string().url().optional(),
    openaiModel: z.string().trim().min(1).optional(),
    aiExtractionTimeoutMs: z
      .string()
      .optional()
      .transform((value) => parsePositiveInteger(value, 30_000)),
    aiExtractionRateLimitMax: z
      .string()
      .optional()
      .transform((value) => parsePositiveInteger(value, 10)),
    aiExtractionRateLimitWindowMs: z
      .string()
      .optional()
      .transform((value) => parsePositiveInteger(value, 60_000)),
    reportsInternalToken: z.string().optional().default("reports-service-token"),
    reportsGrantSecret: z.string().optional().default("reports-grant-secret"),
    enableApiDocsEnv: z.string().optional(),
    allowedOrigins: z
      .string()
      .optional()
      .default("*")
      .transform((value) => parseAllowedOrigins(value)),
  })
  .superRefine((env, ctx) => {
    if (env.aiExtractionMode === "fake" && env.nodeEnv === "production") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AI_EXTRACTION_MODE=fake não é permitido em produção.",
        path: ["aiExtractionMode"],
      });
    }

    if (env.aiExtractionMode === "openai" && !env.openaiApiKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "OPENAI_API_KEY é obrigatória quando AI_EXTRACTION_MODE=openai.",
        path: ["openaiApiKey"],
      });
    }
    if (env.nodeEnv === "production" && !env.supabaseUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SUPABASE_URL é obrigatória para anexos de tarefas em produção.",
        path: ["supabaseUrl"],
      });
    }
    if (env.nodeEnv === "production" && !env.supabaseServiceRoleKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SUPABASE_SERVICE_ROLE_KEY é obrigatória para anexos de tarefas em produção.",
        path: ["supabaseServiceRoleKey"],
      });
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
      serviceName: "task-service",
      envName: "AUDIT_SERVICE_TOKEN",
      token: rest.auditServiceToken,
    });
    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "task-service",
      envName: "COMMERCIAL_SERVICE_TOKEN",
      token: rest.commercialServiceToken,
    });
    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "task-service",
      envName: "REPORTS_INTERNAL_TOKEN",
      token: rest.reportsInternalToken,
    });
    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "task-service",
      envName: "REPORTS_GRANT_SECRET",
      token: rest.reportsGrantSecret,
    });
    validateProductionCorsOrigins({
      nodeEnv: rest.nodeEnv,
      serviceName: "task-service",
      envName: "SERVICE_ALLOWED_ORIGINS",
      allowedOrigins: rest.allowedOrigins,
    });
    return {
      ...rest,
      supabaseUrl: rest.supabaseUrl ?? "http://localhost:54321",
      supabaseServiceRoleKey: rest.supabaseServiceRoleKey ?? "task-attachment-storage-test-key",
      logPretty: rest.nodeEnv !== "production" && rest.logPretty,
      enableApiDocs,
    };
  });

export type TaskServiceEnv = z.infer<typeof envSchema>;

export function getTaskServiceEnv(): TaskServiceEnv {
  return envSchema.parse({
    port: process.env.PORT,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    nodeEnv: process.env.NODE_ENV,
    auditEnabled: process.env.AUDIT_ENABLED,
    auditServiceUrl: process.env.AUDIT_SERVICE_URL,
    auditServiceToken: process.env.AUDIT_SERVICE_TOKEN,
    commercialServiceToken: process.env.COMMERCIAL_SERVICE_TOKEN,
    projectServiceUrl: process.env.PROJECT_SERVICE_URL,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    taskAttachmentStorageBucket: process.env.TASK_ATTACHMENT_STORAGE_BUCKET,
    aiExtractionMode: process.env.AI_EXTRACTION_MODE,
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiBaseUrl: process.env.OPENAI_BASE_URL,
    openaiModel: process.env.OPENAI_MODEL,
    aiExtractionTimeoutMs: process.env.AI_EXTRACTION_TIMEOUT_MS,
    aiExtractionRateLimitMax: process.env.AI_EXTRACTION_RATE_LIMIT_MAX,
    aiExtractionRateLimitWindowMs: process.env.AI_EXTRACTION_RATE_LIMIT_WINDOW_MS,
    reportsInternalToken: process.env.REPORTS_INTERNAL_TOKEN,
    reportsGrantSecret: process.env.REPORTS_GRANT_SECRET,
    logLevel: process.env.LOG_LEVEL,
    logPretty: process.env.LOG_PRETTY,
    enableApiDocsEnv: process.env.ENABLE_API_DOCS,
    allowedOrigins: process.env.SERVICE_ALLOWED_ORIGINS,
  });
}
