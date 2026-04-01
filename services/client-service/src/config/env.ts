import { type LoggerLevel, loggerLevelSchema } from "@workspace/shared";
import { z } from "zod";

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

const clientServiceEnvSchema = z.object({
  port: z
    .string()
    .optional()
    .default("3410")
    .transform((val: string) => {
      const parsed = Number.parseInt(val, 10);
      return Number.isNaN(parsed) ? 3410 : parsed;
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
  /** Diretório base para uploads de histórico (alternativa ao Firebase). */
  historyStorageDir: z.string().optional().default(".data/client-history-uploads"),
  /** Token para `POST /internal/competence-output-update` (header `x-internal-service-token`). */
  internalServiceToken: z.string().optional(),
  /** Agenda a rotina diária de competência (07:00 America/Sao_Paulo) no processo. */
  enableCompetenceOutputCron: z
    .string()
    .optional()
    .default("false")
    .transform((value) => parseBoolean(value)),
});

export type ClientServiceEnv = z.infer<typeof clientServiceEnvSchema> & {
  logLevel: LoggerLevel;
  logPretty: boolean;
};

export function getClientServiceEnv(): ClientServiceEnv {
  const parsed = clientServiceEnvSchema.parse({
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    logLevel: process.env.LOG_LEVEL,
    logPretty: process.env.LOG_PRETTY,
    historyStorageDir: process.env.CLIENT_HISTORY_STORAGE_DIR,
    internalServiceToken: process.env.CLIENT_SERVICE_INTERNAL_TOKEN,
    enableCompetenceOutputCron: process.env.CLIENT_ENABLE_COMPETENCE_OUTPUT_CRON,
  });

  return {
    ...parsed,
    logPretty: parsed.nodeEnv !== "production" && parsed.logPretty,
  };
}
