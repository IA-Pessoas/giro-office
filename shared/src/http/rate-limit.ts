import type { NextFunction, Request, Response } from "express";
import { ServiceError } from "./errors.js";

export interface RateLimitOptions {
  key: string;
  max: number;
  windowMs: number;
  message?: string;
  methods?: string[];
  now?: () => number;
  keyGenerator?: (request: Request) => string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  consume(input: {
    key: string;
    max: number;
    windowMs: number;
    now?: Date;
  }): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}

const POSTGRES_RATE_LIMIT_QUERY = `
INSERT INTO security.rate_limit_buckets (bucket_key, expires_at, hits)
VALUES ($1, clock_timestamp() + ($2 * interval '1 millisecond'), 1)
ON CONFLICT (bucket_key) DO UPDATE
SET hits = CASE WHEN security.rate_limit_buckets.expires_at <= clock_timestamp() THEN 1 ELSE security.rate_limit_buckets.hits + 1 END,
    expires_at = CASE WHEN security.rate_limit_buckets.expires_at <= clock_timestamp() THEN clock_timestamp() + ($2 * interval '1 millisecond') ELSE security.rate_limit_buckets.expires_at END
RETURNING hits <= $3 AS allowed, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (expires_at - clock_timestamp())))::int) AS retry_after_seconds;
`;

export function createMemoryRateLimitStore(): RateLimitStore {
  const buckets = new Map<string, RateLimitEntry>();

  return {
    async consume({ key, max, windowMs, now = new Date() }) {
      const currentTime = now.getTime();
      const current = buckets.get(key);
      const entry =
        current && current.resetAt > currentTime
          ? current
          : { count: 0, resetAt: currentTime + windowMs };

      if (entry.count >= max) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1000)),
        };
      }

      entry.count += 1;
      buckets.set(key, entry);
      return {
        allowed: true,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1000)),
      };
    },
  };
}

export function createPostgresRateLimitStore(client: {
  query(
    text: string,
    values: readonly unknown[],
  ): Promise<{ rows: Array<{ allowed: boolean; retry_after_seconds: number }> }>;
}): RateLimitStore {
  return {
    async consume({ key, max, windowMs }) {
      const { rows } = await client.query(POSTGRES_RATE_LIMIT_QUERY, [key, windowMs, max]);
      const result = rows[0];

      if (!result) {
        throw new Error("A consulta de limite de requisições não retornou resultado.");
      }

      return { allowed: result.allowed, retryAfterSeconds: result.retry_after_seconds };
    },
  };
}

type RequestWithAuthContext = Request & {
  auth?: {
    userId?: unknown;
    organizationId?: unknown;
  };
  user_id?: unknown;
  organization_id?: unknown;
};

function getRequestIp(request: Request): string {
  return request.ip || request.socket?.remoteAddress || "unknown";
}

function getAuthScopedKey(request: Request): string | undefined {
  const requestWithContext = request as RequestWithAuthContext;
  const auth = requestWithContext.auth;
  if (
    auth &&
    typeof auth.userId === "string" &&
    auth.userId.length > 0 &&
    typeof auth.organizationId === "string" &&
    auth.organizationId.length > 0
  ) {
    return `auth:${auth.organizationId}:${auth.userId}`;
  }

  const userId = requestWithContext.user_id;
  const organizationId = requestWithContext.organization_id;
  if (
    typeof userId === "string" &&
    userId.length > 0 &&
    typeof organizationId === "string" &&
    organizationId.length > 0
  ) {
    return `auth:${organizationId}:${userId}`;
  }

  return undefined;
}

function defaultRateLimitKey(request: Request): string {
  return getAuthScopedKey(request) ?? `ip:${getRequestIp(request)}`;
}

function normalizeMethods(methods: string[] | undefined): Set<string> | undefined {
  if (!methods || methods.length === 0) {
    return undefined;
  }

  return new Set(methods.map((method) => method.toUpperCase()));
}

export function createRateLimitMiddleware({
  key,
  max,
  windowMs,
  message = "Muitas requisições. Tente novamente em instantes.",
  methods,
  now = () => Date.now(),
  keyGenerator = defaultRateLimitKey,
}: RateLimitOptions) {
  const hits = new Map<string, RateLimitEntry>();
  const limitedMethods = normalizeMethods(methods);
  const safeMax = Math.max(1, max);
  const safeWindowMs = Math.max(1, windowMs);

  return function rateLimit(request: Request, response: Response, next: NextFunction): void {
    if (limitedMethods && !limitedMethods.has(request.method.toUpperCase())) {
      next();
      return;
    }

    const currentTime = now();
    const requestKey = `${key}:${keyGenerator(request)}`;
    const current = hits.get(requestKey);
    const entry =
      current && current.resetAt > currentTime
        ? current
        : { count: 0, resetAt: currentTime + safeWindowMs };

    if (entry.count >= safeMax) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1000));
      response.setHeader("Retry-After", String(retryAfterSeconds));
      next(new ServiceError(429, message));
      return;
    }

    entry.count += 1;
    hits.set(requestKey, entry);
    next();
  };
}
