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

dotenv.config({ path: serviceEnvPath });

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const historyStorageModeSchema = z.enum(["supabase", "local"]);

const rawClientServiceEnvSchema = z
  .object({
    port: z
      .string()
      .optional()
      .default("3035")
      .transform((val: string) => {
        const parsed = Number.parseInt(val, 10);
        return Number.isNaN(parsed) ? 3035 : parsed;
      }),
    nodeEnv: z.string().optional().default("development"),
    databaseUrl: z.string().min(1, "DATABASE_URL não definido para o client-service."),
    jwtSecret: z.string().min(1, "JWT_SECRET não definido para o client-service."),
    logLevel: loggerLevelSchema.optional().default("info"),
    logPretty: z
      .string()
      .optional()
      .default("false")
      .transform((value) => parseBoolean(value)),
    supabaseUrl: z.string().trim().optional(),
    supabaseServiceRoleKey: z.string().trim().optional(),
    historyStorageMode: historyStorageModeSchema.optional().default("supabase"),
    historyStorageBucket: z.string().optional().default("ClientHistory"),
    historyStorageDir: z.string().optional().default(".data/client-history-uploads"),
    internalServiceToken: z.string().optional(),
    reportsInternalToken: z.string().optional(),
    reportsGrantSecret: z.string().optional(),
    cnpjLookupApiUrl: z.string().trim().optional().default(""),
    cnpjLookupApiToken: z.string().trim().optional().default(""),
    enableApiDocsEnv: z.string().optional(),
    allowedOrigins: z
      .string()
      .optional()
      .default("*")
      .transform((value) => parseAllowedOrigins(value)),
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
    if (env.historyStorageMode === "supabase") {
      if (!env.supabaseUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "SUPABASE_URL não definida.",
          path: ["supabaseUrl"],
        });
      } else if (!z.string().url().safeParse(env.supabaseUrl).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "SUPABASE_URL não definida.",
          path: ["supabaseUrl"],
        });
      }

      if (!env.supabaseServiceRoleKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "SUPABASE_SERVICE_ROLE_KEY não definida.",
          path: ["supabaseServiceRoleKey"],
        });
      }
    }
  });

const clientServiceEnvSchema = rawClientServiceEnvSchema.transform((env) => {
  const { enableApiDocsEnv, ...rest } = env;
  const enableApiDocs =
    enableApiDocsEnv !== undefined && enableApiDocsEnv !== ""
      ? parseBoolean(enableApiDocsEnv)
      : rest.nodeEnv !== "production";

  validateProductionInternalServiceToken({
    nodeEnv: rest.nodeEnv,
    serviceName: "client-service",
    envName: "CLIENT_SERVICE_INTERNAL_TOKEN",
    token: rest.internalServiceToken,
  });
  validateProductionInternalServiceToken({
    nodeEnv: rest.nodeEnv,
    serviceName: "client-service",
    envName: "REPORTS_INTERNAL_TOKEN",
    token: rest.reportsInternalToken,
  });
  validateProductionInternalServiceToken({
    nodeEnv: rest.nodeEnv,
    serviceName: "client-service",
    envName: "REPORTS_GRANT_SECRET",
    token: rest.reportsGrantSecret,
  });
  validateProductionCorsOrigins({
    nodeEnv: rest.nodeEnv,
    serviceName: "client-service",
    envName: "SERVICE_ALLOWED_ORIGINS",
    allowedOrigins: rest.allowedOrigins,
  });

  return {
    ...rest,
    supabaseUrl: rest.supabaseUrl ?? "",
    supabaseServiceRoleKey: rest.supabaseServiceRoleKey ?? "",
    logPretty: rest.nodeEnv !== "production" && rest.logPretty,
    enableApiDocs,
  };
});

export type ClientServiceEnv = z.infer<typeof clientServiceEnvSchema> & {
  logLevel: LoggerLevel;
  logPretty: boolean;
};

export function parseClientServiceEnv(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>,
): ClientServiceEnv {
  return clientServiceEnvSchema.parse({
    port: source.PORT,
    nodeEnv: source.NODE_ENV,
    databaseUrl: source.DATABASE_URL,
    jwtSecret: source.JWT_SECRET,
    logLevel: source.LOG_LEVEL,
    logPretty: source.LOG_PRETTY,
    supabaseUrl: source.SUPABASE_URL,
    supabaseServiceRoleKey: source.SUPABASE_SERVICE_ROLE_KEY,
    historyStorageMode: source.CLIENT_HISTORY_STORAGE_MODE,
    historyStorageBucket: source.CLIENT_HISTORY_STORAGE_BUCKET,
    historyStorageDir: source.CLIENT_HISTORY_STORAGE_DIR,
    internalServiceToken:
      source.CLIENT_SERVICE_INTERNAL_TOKEN ||
      (source.NODE_ENV === "production" ? undefined : source.AUDIT_SERVICE_TOKEN),
    reportsInternalToken: source.REPORTS_INTERNAL_TOKEN,
    reportsGrantSecret: source.REPORTS_GRANT_SECRET,
    cnpjLookupApiUrl: source.CNPJ_LOOKUP_API_URL,
    cnpjLookupApiToken: source.CNPJ_LOOKUP_API_TOKEN,
    enableApiDocsEnv: source.ENABLE_API_DOCS,
    allowedOrigins: source.SERVICE_ALLOWED_ORIGINS,
    uploadRateLimitMax: source.UPLOAD_RATE_LIMIT_MAX,
    uploadRateLimitWindowMs: source.UPLOAD_RATE_LIMIT_WINDOW_MS,
  });
}

export function getClientServiceEnv(): ClientServiceEnv {
  return parseClientServiceEnv(process.env);
}
