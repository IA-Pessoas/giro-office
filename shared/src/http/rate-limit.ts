import { createHmac } from "node:crypto";
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

export type AuthenticationRateLimitBucket = "ip" | "account" | "ip-account";

export interface AuthenticationRateLimitOptions {
  store?: RateLimitStore;
  keySecret: string;
  ipMax: number;
  accountMax: number;
  ipAccountMax: number;
  windowMs: number;
  timeoutMs: number;
  degradationMode: "block" | "observe";
  methods?: string[];
  buckets?: AuthenticationRateLimitBucket[];
  onDecision?: (input: {
    bucket: AuthenticationRateLimitBucket;
    outcome: "blocked" | "observed";
  }) => void;
  onDegraded?: () => void;
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

function getLoginFromRequest(request: Request): string {
  const body = request.body as { login?: unknown } | undefined;
  return typeof body?.login === "string" ? body.login.trim().toLocaleLowerCase("en-US") : "";
}

function createAuthenticationKey(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

async function consumeWithTimeout(
  store: RateLimitStore,
  input: Parameters<RateLimitStore["consume"]>[0],
  timeoutMs: number,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      store.consume(input),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("Rate limit storage timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export function createAuthenticationRateLimitMiddleware({
  store,
  keySecret,
  ipMax,
  accountMax,
  ipAccountMax,
  windowMs,
  timeoutMs,
  degradationMode,
  methods = ["POST"],
  buckets = ["ip", "account", "ip-account"],
  onDecision,
  onDegraded,
}: AuthenticationRateLimitOptions) {
  const limits: Record<AuthenticationRateLimitBucket, number> = {
    ip: ipMax,
    account: accountMax,
    "ip-account": ipAccountMax,
  };

  return async function authenticationRateLimit(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    if (!methods.includes(request.method.toUpperCase())) {
      next();
      return;
    }

    const ip = getRequestIp(request);
    const login = getLoginFromRequest(request);
    const keys: Record<AuthenticationRateLimitBucket, string> = {
      ip: `auth:ip:${createAuthenticationKey(keySecret, ip)}`,
      account: `auth:account:${createAuthenticationKey(keySecret, login)}`,
      "ip-account": `auth:ip-account:${createAuthenticationKey(keySecret, `${ip}\u001f${login}`)}`,
    };

    try {
      if (!store) {
        throw new Error("Rate limit storage is unavailable.");
      }

      for (const bucket of buckets) {
        const result = await consumeWithTimeout(
          store,
          { key: keys[bucket], max: limits[bucket], windowMs },
          timeoutMs,
        );

        if (result.allowed) {
          continue;
        }

        if (degradationMode === "observe") {
          onDecision?.({ bucket, outcome: "observed" });
          continue;
        }

        response.setHeader("Retry-After", String(result.retryAfterSeconds));
        onDecision?.({ bucket, outcome: "blocked" });
        next(
          new ServiceError(429, "Muitas tentativas de autenticação. Tente novamente em instantes."),
        );
        return;
      }
    } catch {
      onDegraded?.();
      if (degradationMode === "block") {
        next(new ServiceError(503, "Serviço de autenticação temporariamente indisponível."));
        return;
      }
    }

    next();
  };
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
