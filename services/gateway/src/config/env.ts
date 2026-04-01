import path from "node:path";
import { fileURLToPath } from "node:url";
import { loggerLevelSchema, type LoggerLevel } from "@workspace/shared";
import dotenv from "dotenv";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnvPath = path.resolve(__dirname, "../../../../.env");

dotenv.config({ path: rootEnvPath });

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

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
    taskServiceUrl: z.string().url().default("http://localhost:3337"),
    organizationServiceUrl: z.string().url().default("http://localhost:3400"),
    clientServiceUrl: z.string().url().default("http://localhost:3410"),
    rhServiceUrl: z.string().url().default("http://localhost:3339"),
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

export interface GatewayEnv {
  nodeEnv: string;
  auditEnabled: boolean;
  auditServiceToken: string;
  auditServiceUrl: string;
  port: number;
  legacyApiUrl: string;
  userServiceUrl: string;
  taskServiceUrl: string;
  organizationServiceUrl: string;
  clientServiceUrl: string;
  rhServiceUrl: string;
  jwtSecret: string;
  logLevel: LoggerLevel;
  logPretty: boolean;
  allowedOrigins: string[];
}

export function getGatewayEnv(): GatewayEnv {
  return gatewayEnvSchema.parse({
    nodeEnv: process.env.NODE_ENV,
    auditEnabled: process.env.AUDIT_ENABLED,
    auditServiceToken: process.env.AUDIT_SERVICE_TOKEN,
    auditServiceUrl: process.env.AUDIT_SERVICE_URL,
    port: process.env.GATEWAY_PORT,
    legacyApiUrl: process.env.LEGACY_API_URL,
    userServiceUrl: process.env.USER_SERVICE_URL,
    taskServiceUrl: process.env.TASK_SERVICE_URL,
    organizationServiceUrl: process.env.ORGANIZATION_SERVICE_URL,
    clientServiceUrl: process.env.CLIENT_SERVICE_URL,
    rhServiceUrl: process.env.RH_SERVICE_URL,
    jwtSecret: process.env.JWT_SECRET,
    logLevel: process.env.LOG_LEVEL,
    logPretty: process.env.LOG_PRETTY,
    allowedOrigins: process.env.GATEWAY_ALLOWED_ORIGINS,
  }) as GatewayEnv;
}
