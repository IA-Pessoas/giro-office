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

const gatewayEnvSchema = z
  .object({
    nodeEnv: z.string().optional().default("development"),
    auditEnabled: z
      .string()
      .optional()
      .default("false")
      .transform((value) => parseBoolean(value)),
    auditServiceToken: z.string().optional().default("audit-service-token"),
    auditServiceUrl: z.string().url().default("http://localhost:3020"),
    port: z
      .string()
      .optional()
      .default("3010")
      .transform((val: string) => {
        const parsed = Number.parseInt(val, 10);
        return Number.isNaN(parsed) ? 3010 : parsed;
      }),
    organizationServiceUrl: z.string().url().default("http://localhost:3031"),
    rhServiceUrl: z.string().url().default("http://localhost:3034"),
    userServiceUrl: z.string().url().default("http://localhost:3030"),
    departmentServiceUrl: z.string().url().default("http://localhost:3036"),
    taskServiceUrl: z.string().url().default("http://localhost:3032"),
    projectServiceUrl: z.string().url().default("http://localhost:3033"),
    clientServiceUrl: z.string().url().default("http://localhost:3035"),
    fiscalServiceUrl: z.string().url().default("http://localhost:3037"),
    contabilServiceUrl: z.string().url().default("http://localhost:3038"),
    websocketUpstreamUrl: z
      .string()
      .optional()
      .transform((value) => {
        if (value === undefined || value.trim() === "") {
          return undefined;
        }
        return value.trim();
      })
      .pipe(z.union([z.string().url(), z.undefined()])),
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
      .transform((val: string) => parseAllowedOrigins(val)),
    rateLimitMax: z
      .string()
      .optional()
      .transform((value) => parsePositiveInteger(value, 300)),
    rateLimitWindowMs: z
      .string()
      .optional()
      .transform((value) => parsePositiveInteger(value, 60_000)),
    authRateLimitMax: z
      .string()
      .optional()
      .transform((value) => parsePositiveInteger(value, 10)),
    authRateLimitWindowMs: z
      .string()
      .optional()
      .transform((value) => parsePositiveInteger(value, 60_000)),
  })
  .transform((env) => {
    validateProductionInternalServiceToken({
      nodeEnv: env.nodeEnv,
      serviceName: "gateway",
      envName: "AUDIT_SERVICE_TOKEN",
      token: env.auditServiceToken,
    });
    validateProductionCorsOrigins({
      nodeEnv: env.nodeEnv,
      serviceName: "gateway",
      envName: "GATEWAY_ALLOWED_ORIGINS",
      allowedOrigins: env.allowedOrigins,
    });

    return {
      ...env,
      logPretty: env.nodeEnv !== "production" && env.logPretty,
    };
  });

export interface GatewayEnv {
  nodeEnv: string;
  auditEnabled: boolean;
  auditServiceToken: string;
  auditServiceUrl: string;
  port: number;
  organizationServiceUrl: string;
  rhServiceUrl: string;
  userServiceUrl: string;
  departmentServiceUrl: string;
  taskServiceUrl: string;
  projectServiceUrl: string;
  clientServiceUrl: string;
  fiscalServiceUrl: string;
  contabilServiceUrl: string;
  websocketUpstreamUrl?: string;
  jwtSecret: string;
  logLevel: LoggerLevel;
  logPretty: boolean;
  allowedOrigins: string[];
  rateLimitMax: number;
  rateLimitWindowMs: number;
  authRateLimitMax: number;
  authRateLimitWindowMs: number;
}

export function getGatewayEnv(): GatewayEnv {
  return gatewayEnvSchema.parse({
    nodeEnv: process.env.NODE_ENV,
    auditEnabled: process.env.AUDIT_ENABLED,
    auditServiceToken: process.env.AUDIT_SERVICE_TOKEN,
    auditServiceUrl: process.env.AUDIT_SERVICE_URL,
    port: process.env.GATEWAY_PORT,
    organizationServiceUrl: process.env.ORGANIZATION_SERVICE_URL,
    rhServiceUrl: process.env.RH_SERVICE_URL,
    userServiceUrl: process.env.USER_SERVICE_URL,
    departmentServiceUrl: process.env.DEPARTMENT_SERVICE_URL,
    taskServiceUrl: process.env.TASK_SERVICE_URL,
    projectServiceUrl: process.env.PROJECT_SERVICE_URL,
    clientServiceUrl: process.env.CLIENT_SERVICE_URL,
    fiscalServiceUrl: process.env.FISCAL_SERVICE_URL,
    contabilServiceUrl: process.env.CONTABIL_SERVICE_URL,
    websocketUpstreamUrl: process.env.WEBSOCKET_UPSTREAM_URL,
    jwtSecret: process.env.JWT_SECRET,
    logLevel: process.env.LOG_LEVEL,
    logPretty: process.env.LOG_PRETTY,
    allowedOrigins: process.env.GATEWAY_ALLOWED_ORIGINS,
    rateLimitMax: process.env.GATEWAY_RATE_LIMIT_MAX,
    rateLimitWindowMs: process.env.GATEWAY_RATE_LIMIT_WINDOW_MS,
    authRateLimitMax: process.env.GATEWAY_AUTH_RATE_LIMIT_MAX,
    authRateLimitWindowMs: process.env.GATEWAY_AUTH_RATE_LIMIT_WINDOW_MS,
  }) as GatewayEnv;
}
