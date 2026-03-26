import "dotenv/config";

import { loggerLevelSchema } from "@workspace/shared/logger";
import { z } from "zod";

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

const rhEnvSchema = z
  .object({
    port: z
      .string()
      .optional()
      .default("3339")
      .transform((val: string) => {
        const parsed = Number.parseInt(val, 10);
        return Number.isNaN(parsed) ? 3339 : parsed;
      }),
    databaseUrl: z.string().min(1, "DATABASE_URL não definido para o rh-service."),
    jwtSecret: z.string().min(1, "JWT_SECRET não definido para o rh-service."),
    nodeEnv: z.string().optional().default("development"),
    logLevel: loggerLevelSchema.optional().default("info"),
    logPretty: z
      .string()
      .optional()
      .default("false")
      .transform((value) => parseBoolean(value)),
  })
  .transform((env) => ({
    ...env,
    logPretty: env.nodeEnv !== "production" && env.logPretty,
  }));

export type RhEnv = z.infer<typeof rhEnvSchema>;

export function getRhEnv(): RhEnv {
  return rhEnvSchema.parse({
    port: process.env.PORT,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,
    logPretty: process.env.LOG_PRETTY,
  });
}
