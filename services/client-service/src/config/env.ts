import { type LoggerLevel, loggerLevelSchema } from "@workspace/shared";
import { z } from "zod";

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

const clientServiceEnvSchema = z
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
    databaseUrl: z.string().min(1, "DATABASE_URL nao definido para o client-service."),
    jwtSecret: z.string().min(1, "JWT_SECRET nao definido para o client-service."),
    logLevel: loggerLevelSchema.optional().default("info"),
    logPretty: z
      .string()
      .optional()
      .default("false")
      .transform((value) => parseBoolean(value)),
    supabaseUrl: z.string().url("SUPABASE_URL nao definida."),
    supabaseServiceRoleKey: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY nao definida."),
    historyStorageBucket: z.string().optional().default("ClientHistory"),
    historyStorageDir: z.string().optional().default(".data/client-history-uploads"),
    internalServiceToken: z.string().optional(),
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

export type ClientServiceEnv = z.infer<typeof clientServiceEnvSchema> & {
  logLevel: LoggerLevel;
  logPretty: boolean;
};

export function getClientServiceEnv(): ClientServiceEnv {
  return clientServiceEnvSchema.parse({
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    logLevel: process.env.LOG_LEVEL,
    logPretty: process.env.LOG_PRETTY,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    historyStorageBucket: process.env.CLIENT_HISTORY_STORAGE_BUCKET,
    historyStorageDir: process.env.CLIENT_HISTORY_STORAGE_DIR,
    internalServiceToken: process.env.CLIENT_SERVICE_INTERNAL_TOKEN,
    enableApiDocsEnv: process.env.ENABLE_API_DOCS,
  });
}
