import "dotenv/config";

import { loggerLevelSchema } from "@workspace/shared/logger";
import { z } from "zod";

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

const envSchema = z
  .object({
    port: z
      .string()
      .optional()
      .default("3030")
      .transform((val: string) => {
        const parsed = Number.parseInt(val, 10);
        return Number.isNaN(parsed) ? 3030 : parsed;
      }),
    databaseUrl: z.string().url("DATABASE_URL não definida."),
    jwtSecret: z.string().min(1, "JWT_SECRET não definido."),
    adminPassword: z.string().min(1, "ADMIN_PASSWORD não definido."),
    nodeEnv: z.string().optional().default("development"),
    logLevel: loggerLevelSchema.optional().default("info"),
    supabaseUrl: z.string().url("SUPABASE_URL não definida."),
    supabaseServiceRoleKey: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY não definida."),
    logPretty: z
      .string()
      .optional()
      .default("false")
      .transform((value) => parseBoolean(value)),
    enableApiDocsEnv: z.string().optional(),
  })
  .transform((env) => {
    const { enableApiDocsEnv, ...rest } = env;
    const enableApiDocs =
      enableApiDocsEnv !== undefined && enableApiDocsEnv !== ""
        ? parseBoolean(enableApiDocsEnv)
        : rest.nodeEnv !== "production";
    return {
      ...rest,
      logPretty: rest.nodeEnv !== "production" && rest.logPretty,
      enableApiDocs,
    };
  });

export type UserServiceEnv = z.infer<typeof envSchema>;

export function getUserServiceEnv(): UserServiceEnv {
  return envSchema.parse({
    port: process.env.PORT,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    adminPassword: process.env.ADMIN_PASSWORD,
    nodeEnv: process.env.NODE_ENV,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    logLevel: process.env.LOG_LEVEL,
    logPretty: process.env.LOG_PRETTY,
    enableApiDocsEnv: process.env.ENABLE_API_DOCS,
  });
}
