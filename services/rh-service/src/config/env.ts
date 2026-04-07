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
    pointMinIntervalMinutes: z
      .string()
      .optional()
      .default("30")
      .transform((val) => {
        const parsed = Number.parseInt(val, 10);
        if (Number.isNaN(parsed) || parsed < 1) {
          return 1;
        }
        return parsed;
      }),
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

export type RhEnv = z.infer<typeof rhEnvSchema>;

export function getRhEnv(): RhEnv {
  return rhEnvSchema.parse({
    port: process.env.PORT,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,
    logPretty: process.env.LOG_PRETTY,
    pointMinIntervalMinutes: process.env.POINT_MIN_INTERVAL_MINUTES,
    enableApiDocsEnv: process.env.ENABLE_API_DOCS,
  });
}
