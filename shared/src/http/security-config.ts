import { ServiceError } from "./errors.js";
import { CSRF_HEADER_NAME } from "./session-security.js";

const DEFAULT_INTERNAL_SERVICE_TOKEN = "audit-service-token";
const MIN_INTERNAL_SERVICE_TOKEN_LENGTH = 32;

export interface InternalServiceTokenValidationOptions {
  nodeEnv: string;
  serviceName: string;
  envName: string;
  token: string | undefined;
}

export interface CorsOriginsValidationOptions {
  nodeEnv: string;
  serviceName: string;
  envName: string;
  allowedOrigins: string[];
}

export interface ServiceCorsOptions {
  origin(
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean | string) => void,
  ): void;
  methods: string;
  allowedHeaders: string[];
  exposedHeaders: string[];
  credentials: boolean;
}

export function parseAllowedOrigins(value: string | undefined, defaultValue = "*"): string[] {
  const raw = value === undefined || value.trim() === "" ? defaultValue : value;

  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function validateProductionInternalServiceToken({
  nodeEnv,
  serviceName,
  envName,
  token,
}: InternalServiceTokenValidationOptions): void {
  if (nodeEnv !== "production") {
    return;
  }

  if (
    !token ||
    token === DEFAULT_INTERNAL_SERVICE_TOKEN ||
    token.length < MIN_INTERNAL_SERVICE_TOKEN_LENGTH
  ) {
    throw new Error(
      `${serviceName}: ${envName} must be set to a non-default value with at least ${MIN_INTERNAL_SERVICE_TOKEN_LENGTH} characters in production.`,
    );
  }
}

export function validateProductionCorsOrigins({
  nodeEnv,
  serviceName,
  envName,
  allowedOrigins,
}: CorsOriginsValidationOptions): void {
  if (nodeEnv !== "production") {
    return;
  }

  if (allowedOrigins.length === 0 || allowedOrigins.includes("*")) {
    throw new Error(
      `${serviceName}: ${envName} must list explicit origins in production; wildcard origins are not allowed.`,
    );
  }
}

export function createServiceCorsOptions(
  allowedOrigins: string[],
  // Mantido na assinatura dos serviços; o nome interno não vai mais na mensagem (#1371).
  _serviceLabel: string,
): ServiceCorsOptions {
  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        callback(null, origin);
        return;
      }

      callback(new ServiceError(403, "Origem não permitida."));
    },
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Idempotency-Key",
      "x-request-id",
      CSRF_HEADER_NAME,
    ],
    exposedHeaders: ["x-auth-session-state"],
    credentials: true,
  };
}
