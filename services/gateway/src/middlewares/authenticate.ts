import {
  AUTH_SESSION_COOKIE_NAME,
  AUTH_SESSION_TRANSPORT_HEADER,
  type AuthContext,
  authenticateFromAuthHeader,
  authenticateFromToken,
  INTERNAL_SERVICE_TOKEN_HEADER,
  readCookie,
  ServiceError,
} from "@workspace/shared";
import type { Logger } from "@workspace/shared/logger";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { isPublicRoute } from "../security/publicRoutes.js";

export type SessionValidator = (auth: AuthContext, transport: "cookie" | "bearer") => Promise<void>;

/**
 * Janela em que uma sessão já validada dispensa nova ida ao user-service.
 * Curta de propósito: é o atraso máximo para uma revogação feita fora do gateway
 * (expiração de sessão, troca de senha) parar de ser aceita aqui.
 */
const SESSION_CACHE_TTL_MS = 5_000;
const SESSION_CACHE_MAX_ENTRIES = 10_000;

function sessionCacheKey(auth: AuthContext, transport: "cookie" | "bearer"): string {
  return `${transport}:${auth.claims.session_id ?? auth.token}:${auth.claims.session_version ?? 0}`;
}

interface SessionCache {
  isValid(key: string, now: number): boolean;
  remember(key: string, now: number): void;
  forget(auth: AuthContext): void;
}

/**
 * Vive na instância do middleware, não no módulo: cada gateway (e cada teste)
 * tem o seu, sem estado compartilhado entre eles.
 * Só o resultado positivo entra; falha sempre revalida.
 */
function createSessionCache(): SessionCache {
  const validUntil = new Map<string, number>();

  return {
    isValid(key, now) {
      const expiresAt = validUntil.get(key);
      if (expiresAt === undefined) {
        return false;
      }
      if (expiresAt <= now) {
        validUntil.delete(key);
        return false;
      }
      return true;
    },
    remember(key, now) {
      // ponytail: varredura simples ao encher; trocar por LRU se aparecer no perfil.
      if (validUntil.size >= SESSION_CACHE_MAX_ENTRIES) {
        for (const [cachedKey, expiresAt] of validUntil) {
          if (expiresAt <= now) {
            validUntil.delete(cachedKey);
          }
        }
        if (validUntil.size >= SESSION_CACHE_MAX_ENTRIES) {
          validUntil.clear();
        }
      }
      validUntil.set(key, now + SESSION_CACHE_TTL_MS);
    },
    forget(auth) {
      const sessionId = auth.claims.session_id ?? auth.token;
      for (const key of validUntil.keys()) {
        if (key.includes(`:${sessionId}:`)) {
          validUntil.delete(key);
        }
      }
    },
  };
}

export function createUserServiceSessionValidator(
  userServiceUrl: string,
  internalServiceToken: string,
): SessionValidator {
  const organizationValidationUrl = new URL("/user/session/validate", userServiceUrl);
  const platformValidationUrl = new URL("/platform/session/validate", userServiceUrl);

  return async (auth: AuthContext, transport: "cookie" | "bearer"): Promise<void> => {
    let response: globalThis.Response;
    const isPlatform = auth.actorKind === "platform";

    try {
      response = await fetch(isPlatform ? platformValidationUrl : organizationValidationUrl, {
        method: isPlatform ? "POST" : "GET",
        headers: {
          authorization: `Bearer ${auth.token}`,
          [AUTH_SESSION_TRANSPORT_HEADER]: transport,
          [INTERNAL_SERVICE_TOKEN_HEADER]: internalServiceToken,
        },
      });
    } catch (error) {
      throw new ServiceError(503, "Não foi possível validar a sessão.", error);
    }

    if (!response.ok) {
      const statusCode = response.status === 401 || response.status === 409 ? response.status : 503;
      throw new ServiceError(statusCode, "Sessão inválida.");
    }
  };
}

export interface AuthenticateMiddlewareOptions {
  jwtSecret: string;
  sessionValidator?: SessionValidator;
  bearerAuthCompatibility: boolean;
  authCookieSecure: boolean;
  logger: Logger;
}

export function buildAuthenticateMiddleware(
  options: AuthenticateMiddlewareOptions,
): RequestHandler {
  const sessionCache = createSessionCache();

  return async function authenticate(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    if (isPublicRoute(request.method, request.path)) {
      next();
      return;
    }

    const cookieToken = readCookie(request.headers.cookie, AUTH_SESSION_COOKIE_NAME);
    const usingCookie = cookieToken !== undefined;
    let failureReason = "invalid_token";

    try {
      if (usingCookie) {
        request.auth = authenticateFromToken(cookieToken, options.jwtSecret);
        request.authTransport = "cookie";
      } else {
        if (!options.bearerAuthCompatibility) {
          throw new ServiceError(401, "Sessão de autenticação não informada.");
        }
        request.auth = authenticateFromAuthHeader(request.headers.authorization, options.jwtSecret);
        request.authTransport = "bearer";
        if (request.auth.actorKind === "platform") {
          throw new ServiceError(401, "Sessão de autenticação não informada.");
        }
      }

      if (options.sessionValidator) {
        failureReason = "session_validation";
        // Só leitura reaproveita a validação. Todo método que altera estado revalida
        // no user-service e derruba a entrada, então logout e revogação valem na hora.
        const cacheable = request.method === "GET" || request.method === "HEAD";
        const key = sessionCacheKey(request.auth, request.authTransport);
        const now = Date.now();

        if (!cacheable) {
          sessionCache.forget(request.auth);
          await options.sessionValidator(request.auth, request.authTransport);
        } else if (!sessionCache.isValid(key, now)) {
          await options.sessionValidator(request.auth, request.authTransport);
          sessionCache.remember(key, now);
        }
      }

      if (!usingCookie) {
        options.logger.info({
          event: "auth.bearer_compat.accepted",
          message: "Bearer compatibility accepted",
        });
      }
      next();
    } catch (error) {
      if (usingCookie) {
        options.logger.warn({
          event: "auth.session.validation.failed",
          reason: failureReason,
          message: "Cookie session validation failed",
        });
      }
      const serviceStatus = error instanceof ServiceError ? error.statusCode : undefined;
      if (
        serviceStatus === 409 &&
        usingCookie &&
        request.method === "DELETE" &&
        (request.path === "/user/session" || request.path === "/platform/session")
      ) {
        next();
        return;
      }

      const statusCode = serviceStatus === 409 || serviceStatus === 503 ? serviceStatus : 401;
      if (statusCode === 409) {
        response.setHeader("x-auth-session-state", "superseded");
      }
      next(
        new ServiceError(
          statusCode,
          statusCode === 409
            ? "Sessão substituída."
            : statusCode === 503
              ? "Não foi possível validar a sessão."
              : "Não autenticado.",
          error,
        ),
      );
    }
  };
}
