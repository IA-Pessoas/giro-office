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

dotenv.config({ path: serviceEnvPath });

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

const rhEnvSchema = z
  .object({
    port: z
      .string()
      .optional()
      .default("3034")
      .transform((val: string) => {
        const parsed = Number.parseInt(val, 10);
        return Number.isNaN(parsed) ? 3034 : parsed;
      }),
    databaseUrl: z.string().min(1, "DATABASE_URL não definido para o rh-service."),
    databasePoolMax: z
      .string()
      .optional()
      .default("1")
      .transform((value, ctx) => {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "DATABASE_POOL_MAX deve ser um inteiro positivo.",
          });
          return z.NEVER;
        }
        return parsed;
      }),
    jwtSecret: z.string().min(1, "JWT_SECRET não definido para o rh-service."),
    reportsInternalToken: z.string().optional().default("reports-internal-token"),
    reportsGrantSecret: z.string().optional().default("reports-grant-secret"),
    supabaseUrl: z.string().url("SUPABASE_URL invalida.").optional(),
    supabaseServiceRoleKey: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY invalida.").optional(),
    rhPointAdjustmentBucket: z
      .string()
      .trim()
      .min(1, "RH_POINT_ADJUSTMENT_BUCKET invalido.")
      .optional(),
    nodeEnv: z.string().optional().default("development"),
    logLevel: loggerLevelSchema.optional().default("info"),
    logPretty: z
      .string()
      .optional()
      .default("false")
      .transform((value) => parseBoolean(value)),
    pointMinIntervalMinutes: z
      .string()
      .optional()
      .default("30")
      .transform((val) => {
        const parsed = Number.parseInt(val, 10);
        if (Number.isNaN(parsed) || parsed < 0) {
          return 0;
        }
        return parsed;
      }),
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
    validateProductionCorsOrigins({
      nodeEnv: rest.nodeEnv,
      serviceName: "rh-service",
      envName: "SERVICE_ALLOWED_ORIGINS",
      allowedOrigins: rest.allowedOrigins,
    });
    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "rh-service",
      envName: "REPORTS_INTERNAL_TOKEN",
      token: rest.reportsInternalToken,
    });
    validateProductionInternalServiceToken({
      nodeEnv: rest.nodeEnv,
      serviceName: "rh-service",
      envName: "REPORTS_GRANT_SECRET",
      token: rest.reportsGrantSecret,
    });
    return {
      ...rest,
      logPretty: rest.nodeEnv !== "production" && rest.logPretty,
      enableApiDocs,
    };
  });

export type RhEnv = z.infer<typeof rhEnvSchema>;

export function getRhEnv(): RhEnv {
  return rhEnvSchema.parse({
    port: process.env.PORT,
    databaseUrl: process.env.DATABASE_URL,
    databasePoolMax: process.env.DATABASE_POOL_MAX,
    jwtSecret: process.env.JWT_SECRET,
    reportsInternalToken: process.env.REPORTS_INTERNAL_TOKEN,
    reportsGrantSecret: process.env.REPORTS_GRANT_SECRET,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    rhPointAdjustmentBucket: process.env.RH_POINT_ADJUSTMENT_BUCKET,
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,
    logPretty: process.env.LOG_PRETTY,
    pointMinIntervalMinutes: process.env.POINT_MIN_INTERVAL_MINUTES,
    enableApiDocsEnv: process.env.ENABLE_API_DOCS,
    allowedOrigins: process.env.SERVICE_ALLOWED_ORIGINS,
  });
}
