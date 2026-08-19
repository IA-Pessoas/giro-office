import { isIP } from "node:net";
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

function parseBoundedPositiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
  envName: string,
  ctx: z.RefinementCtx,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  const result = value === undefined || value.trim() === "" ? fallback : parsed;

  if (!Number.isInteger(result) || result < 1 || result > maximum) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${envName} deve ser um inteiro entre 1 e ${maximum}.`,
    });
    return z.NEVER;
  }

  return result;
}

function parseTrustedProxyCidrs(value: string | undefined, ctx: z.RefinementCtx): string[] {
  const cidrs = (value ?? "")
    .split(",")
    .map((cidr) => cidr.trim())
    .filter(Boolean);

  for (const cidr of cidrs) {
    const [address, prefix, ...rest] = cidr.split("/");
    const family = address ? isIP(address) : 0;
    const maxPrefix = family === 4 ? 32 : 128;
    const parsedPrefix = Number.parseInt(prefix ?? "", 10);

    if (
      rest.length > 0 ||
      family === 0 ||
      !Number.isInteger(parsedPrefix) ||
      parsedPrefix < 0 ||
      parsedPrefix > maxPrefix
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "TRUSTED_PROXY_CIDRS deve conter apenas CIDRs válidos.",
      });
      return z.NEVER;
    }
  }

  return cidrs;
}

function parseOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function isValidJsonBodyLimit(value: string): boolean {
  const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb)?$/i.exec(value);

  if (!match) {
    return false;
  }

  return Number.parseFloat(match[1] ?? "0") > 0;
}

function parseJsonBodyLimit(value: string | undefined, ctx: z.RefinementCtx): string {
  const normalized = parseOptionalString(value) ?? "1mb";

  if (!isValidJsonBodyLimit(normalized)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "GATEWAY_JSON_BODY_LIMIT inválido.",
    });
    return z.NEVER;
  }

  return normalized;
}

const optionalUrlEnvSchema = z
  .string()
  .optional()
  .transform((value) => parseOptionalString(value))
  .pipe(z.union([z.string().url(), z.undefined()]));

const gatewayEnvSchema = z
  .object({
    nodeEnv: z.string().optional().default("development"),
    enableApiDocsEnv: z.string().optional(),
    authorizationMode: z.enum(["enforce", "observe"]).optional().default("enforce"),
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
    clientServiceInternalToken: z.string().optional().transform(parseOptionalString),
    fiscalServiceUrl: z.string().url().default("http://localhost:3037"),
    contabilServiceUrl: z.string().url().default("http://localhost:3038"),
    regularizeServiceUrl: z.string().url().default("http://localhost:3039"),
    tiServiceUrl: z.string().url().default("http://localhost:3040"),
    tiServiceInternalToken: z.string().optional().default("ti-service-token"),
    certificateServiceUrl: z.string().url().default("http://localhost:3041"),
    certificateServiceInternalToken: z.string().optional().default("certificate-service-token"),
    pessoalServiceUrl: z.string().url().default("http://localhost:3042"),
    parcelamentoServiceUrl: z.string().url().default("http://localhost:3043"),
    websocketUpstreamUrl: z
      .string()
      .optional()
      .transform((value) => parseOptionalString(value))
      .pipe(z.union([z.string().url(), z.undefined()])),
    databaseUrl: z
      .string()
      .optional()
      .transform((value) => parseOptionalString(value)),
    publicGatewayUrl: optionalUrlEnvSchema,
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
    authRateLimitKeySecret: z
      .string()
      .optional()
      .transform((value) => parseOptionalString(value)),
    authRateLimitIpMax: z
      .string()
      .optional()
      .transform((value, ctx) =>
        parseBoundedPositiveInteger(value, 10, 1_000, "AUTH_RATE_LIMIT_IP_MAX", ctx),
      ),
    authRateLimitAccountMax: z
      .string()
      .optional()
      .transform((value, ctx) =>
        parseBoundedPositiveInteger(value, 3, 1_000, "AUTH_RATE_LIMIT_ACCOUNT_MAX", ctx),
      ),
    authRateLimitIpAccountMax: z
      .string()
      .optional()
      .transform((value, ctx) =>
        parseBoundedPositiveInteger(value, 5, 1_000, "AUTH_RATE_LIMIT_IP_ACCOUNT_MAX", ctx),
      ),
    authRateLimitWindowMs: z
      .string()
      .optional()
      .transform((value, ctx) =>
        parseBoundedPositiveInteger(value, 60_000, 86_400_000, "AUTH_RATE_LIMIT_WINDOW_MS", ctx),
      ),
    authRateLimitTimeoutMs: z
      .string()
      .optional()
      .transform((value, ctx) =>
        parseBoundedPositiveInteger(value, 1_000, 10_000, "AUTH_RATE_LIMIT_TIMEOUT_MS", ctx),
      ),
    authRateLimitDegradationMode: z.enum(["block", "observe"]).optional().default("block"),
    trustedProxyCidrs: z
      .string()
      .optional()
      .transform((value, ctx) => parseTrustedProxyCidrs(value, ctx)),
    jsonBodyLimit: z
      .string()
      .optional()
      .transform((value, ctx) => parseJsonBodyLimit(value, ctx)),
  })
  .transform((env) => {
    const enableApiDocs =
      env.enableApiDocsEnv === undefined
        ? env.nodeEnv !== "production"
        : parseBoolean(env.enableApiDocsEnv);
    const clientServiceInternalToken =
      env.nodeEnv === "production"
        ? env.clientServiceInternalToken
        : (env.clientServiceInternalToken ?? env.auditServiceToken);

    validateProductionInternalServiceToken({
      nodeEnv: env.nodeEnv,
      serviceName: "gateway",
      envName: "AUDIT_SERVICE_TOKEN",
      token: env.auditServiceToken,
    });
    validateProductionInternalServiceToken({
      nodeEnv: env.nodeEnv,
      serviceName: "gateway",
      envName: "TI_SERVICE_INTERNAL_TOKEN",
      token: env.tiServiceInternalToken,
    });
    validateProductionInternalServiceToken({
      nodeEnv: env.nodeEnv,
      serviceName: "gateway",
      envName: "CERTIFICATE_SERVICE_INTERNAL_TOKEN",
      token: env.certificateServiceInternalToken,
    });
    validateProductionInternalServiceToken({
      nodeEnv: env.nodeEnv,
      serviceName: "gateway",
      envName: "CLIENT_SERVICE_INTERNAL_TOKEN",
      token: clientServiceInternalToken,
    });
    validateProductionCorsOrigins({
      nodeEnv: env.nodeEnv,
      serviceName: "gateway",
      envName: "GATEWAY_ALLOWED_ORIGINS",
      allowedOrigins: env.allowedOrigins,
    });
    if (
      env.nodeEnv === "production" &&
      (!env.authRateLimitKeySecret || env.authRateLimitKeySecret.length < 32)
    ) {
      throw new Error(
        "gateway: AUTH_RATE_LIMIT_KEY_SECRET deve ter ao menos 32 caracteres em produção.",
      );
    }
    if (env.nodeEnv === "production" && !env.databaseUrl) {
      throw new Error(
        "gateway: DATABASE_URL é obrigatória para o rate limit de autenticação em produção.",
      );
    }

    return {
      ...env,
      clientServiceInternalToken,
      enableApiDocs,
      logPretty: env.nodeEnv !== "production" && env.logPretty,
      authRateLimitKeySecret: env.authRateLimitKeySecret ?? "development-auth-rate-limit-secret",
    };
  });

export interface GatewayEnv {
  nodeEnv: string;
  enableApiDocs: boolean;
  authorizationMode: "enforce" | "observe";
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
  clientServiceInternalToken: string;
  fiscalServiceUrl: string;
  contabilServiceUrl: string;
  regularizeServiceUrl: string;
  tiServiceUrl: string;
  tiServiceInternalToken: string;
  certificateServiceUrl: string;
  certificateServiceInternalToken: string;
  pessoalServiceUrl: string;
  parcelamentoServiceUrl: string;
  websocketUpstreamUrl?: string;
  databaseUrl?: string;
  publicGatewayUrl?: string;
  jwtSecret: string;
  logLevel: LoggerLevel;
  logPretty: boolean;
  allowedOrigins: string[];
  rateLimitMax: number;
  rateLimitWindowMs: number;
  authRateLimitWindowMs: number;
  authRateLimitKeySecret: string;
  authRateLimitIpMax: number;
  authRateLimitAccountMax: number;
  authRateLimitIpAccountMax: number;
  authRateLimitTimeoutMs: number;
  authRateLimitDegradationMode: "block" | "observe";
  trustedProxyCidrs: string[];
  jsonBodyLimit: string;
}

export function getGatewayEnv(): GatewayEnv {
  return gatewayEnvSchema.parse({
    nodeEnv: process.env.NODE_ENV,
    enableApiDocsEnv: process.env.ENABLE_API_DOCS,
    authorizationMode: process.env.GATEWAY_AUTHORIZATION_MODE,
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
    clientServiceInternalToken: process.env.CLIENT_SERVICE_INTERNAL_TOKEN,
    fiscalServiceUrl: process.env.FISCAL_SERVICE_URL,
    contabilServiceUrl: process.env.CONTABIL_SERVICE_URL,
    regularizeServiceUrl: process.env.REGULARIZE_SERVICE_URL,
    tiServiceUrl: process.env.TI_SERVICE_URL,
    tiServiceInternalToken: process.env.TI_SERVICE_INTERNAL_TOKEN,
    certificateServiceUrl: process.env.CERTIFICATE_SERVICE_URL,
    certificateServiceInternalToken: process.env.CERTIFICATE_SERVICE_INTERNAL_TOKEN,
    pessoalServiceUrl: process.env.PESSOAL_SERVICE_URL,
    parcelamentoServiceUrl: process.env.PARCELAMENTO_SERVICE_URL,
    websocketUpstreamUrl: process.env.WEBSOCKET_UPSTREAM_URL,
    databaseUrl: process.env.DATABASE_URL,
    publicGatewayUrl: process.env.GATEWAY_PUBLIC_URL,
    jwtSecret: process.env.JWT_SECRET,
    logLevel: process.env.LOG_LEVEL,
    logPretty: process.env.LOG_PRETTY,
    allowedOrigins: process.env.GATEWAY_ALLOWED_ORIGINS,
    rateLimitMax: process.env.GATEWAY_RATE_LIMIT_MAX,
    rateLimitWindowMs: process.env.GATEWAY_RATE_LIMIT_WINDOW_MS,
    authRateLimitKeySecret: process.env.AUTH_RATE_LIMIT_KEY_SECRET,
    authRateLimitIpMax: process.env.AUTH_RATE_LIMIT_IP_MAX,
    authRateLimitAccountMax: process.env.AUTH_RATE_LIMIT_ACCOUNT_MAX,
    authRateLimitIpAccountMax: process.env.AUTH_RATE_LIMIT_IP_ACCOUNT_MAX,
    authRateLimitWindowMs: process.env.AUTH_RATE_LIMIT_WINDOW_MS,
    authRateLimitTimeoutMs: process.env.AUTH_RATE_LIMIT_TIMEOUT_MS,
    authRateLimitDegradationMode: process.env.AUTH_RATE_LIMIT_DEGRADATION_MODE,
    trustedProxyCidrs: process.env.TRUSTED_PROXY_CIDRS,
    jsonBodyLimit: process.env.GATEWAY_JSON_BODY_LIMIT,
  }) as GatewayEnv;
}
