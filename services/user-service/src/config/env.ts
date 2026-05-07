import path from "node:path";

import { fileURLToPath } from "node:url";
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

const rawEnvSchema = z

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

    supabaseUrl: z.string().trim().min(1, "SUPABASE_URL não definida."),

    supabaseServiceRoleKey: z.string().trim().min(1, "SUPABASE_SERVICE_ROLE_KEY não definida."),

    logPretty: z

      .string()

      .optional()

      .default("false")

      .transform((value) => parseBoolean(value)),

    enableApiDocsEnv: z.string().optional(),

    /** Token interno igual ao do gateway (`AUDIT_SERVICE_TOKEN`) para pedidos com headers x-auth-* */

    auditServiceToken: z.string().optional().default("audit-service-token"),
  })

  .superRefine((env, ctx) => {
    if (!z.string().url().safeParse(env.supabaseUrl).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,

        message: "SUPABASE_URL inválida.",

        path: ["supabaseUrl"],
      });
    }
  });

const envSchema = rawEnvSchema.transform((env) => {
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

    auditServiceToken: process.env.AUDIT_SERVICE_TOKEN,
  });
}
