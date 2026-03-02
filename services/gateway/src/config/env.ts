import "dotenv/config";

export interface GatewayEnv {
  port: number;
  legacyApiUrl: string;
  jwtSecret: string;
  allowedOrigins: string[];
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value) {
    return ["*"];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getGatewayEnv(): GatewayEnv {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("JWT_SECRET não definido para o gateway.");
  }

  return {
    port: parsePort(process.env.GATEWAY_PORT, 3334),
    legacyApiUrl: process.env.LEGACY_API_URL ?? "http://localhost:3333",
    jwtSecret,
    allowedOrigins: parseAllowedOrigins(process.env.GATEWAY_ALLOWED_ORIGINS)
  };
}
