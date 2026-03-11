import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LoggerLevel } from "@workspace/shared/logger";
import dotenv from "dotenv";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnvPath = path.resolve(__dirname, "../../../../.env");

dotenv.config({ path: rootEnvPath });

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

const loggerLevelSchema = z.enum([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "silent",
]) satisfies z.ZodType<LoggerLevel>;

const gatewayEnvSchema = z
  .object({
    nodeEnv: z.string().optional().default("development"),
    auditEnabled: z
      .string()
      .optional()
      .default("false")
      .transform((value) => parseBoolean(value)),
    auditServiceToken: z.string().optional().default("audit-service-token"),
    auditServiceUrl: z.string().url().default("http://localhost:3336"),
    port: z
      .string()
      .optional()
      .default("3334")
      .transform((val: string) => {
        const parsed = Number.parseInt(val, 10);
        return Number.isNaN(parsed) ? 3334 : parsed;
      }),
    legacyApiUrl: z.string().url().default("http://localhost:3333"),
    userServiceUrl: z.string().url().default("http://localhost:3335"),
    jwtSecret: z.string().min(1, "JWT_SECRET não definido para o gateway."),
    logLevel: loggerLevelSchema.optional().default("info"),
    logPretty: z
      .string()
      .optional()
      .default("false")
      .transform((value) => parseBoolean(value)),
    allowedOrigins: z
      .string()
      .optional()
      .default("*")
      .transform((val: string) =>
        val
          .split(",")
          .map((origin: string) => origin.trim())
          .filter(Boolean),
      ),
  })
  .transform((env) => ({
    ...env,
    logPretty: env.nodeEnv !== "production" && env.logPretty,
  }));

export type GatewayEnv = z.infer<typeof gatewayEnvSchema>;

export function getGatewayEnv(): GatewayEnv {
  return gatewayEnvSchema.parse({
    nodeEnv: process.env.NODE_ENV,
    auditEnabled: process.env.AUDIT_ENABLED,
    auditServiceToken: process.env.AUDIT_SERVICE_TOKEN,
    auditServiceUrl: process.env.AUDIT_SERVICE_URL,
    port: process.env.GATEWAY_PORT,
    legacyApiUrl: process.env.LEGACY_API_URL,
    userServiceUrl: process.env.USER_SERVICE_URL,
    jwtSecret: process.env.JWT_SECRET,
    logLevel: process.env.LOG_LEVEL,
    logPretty: process.env.LOG_PRETTY,
    allowedOrigins: process.env.GATEWAY_ALLOWED_ORIGINS,
  });
}
