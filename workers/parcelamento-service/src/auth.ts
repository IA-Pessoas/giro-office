import {
  AUTH_SESSION_COOKIE_NAME,
  authenticateWorkerRequest,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  hashCsrfToken,
  readCookie,
  validateWorkerSession,
  verifyCsrfToken,
  type WorkerAuthContext,
  WorkerAuthenticationError,
  WorkerSessionValidationError,
} from "@workspace/runtime";
import { normalizeModulePermissions } from "@workspace/shared/auth";
import {
  FORWARDED_AUTH_CSRF_HASH_HEADER,
  FORWARDED_AUTH_KIND_HEADER,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_PLATFORM_ROLE_HEADER,
  FORWARDED_AUTH_SESSION_ID_HEADER,
  FORWARDED_AUTH_SESSION_VERSION_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  ServiceError,
} from "@workspace/shared/http";
import type { ParcelamentoWorkerEnv } from "./env.js";

function header(request: Request, name: string): string | undefined {
  const value = request.headers.get(name);
  return value && value.length > 0 ? value : undefined;
}

function forwardedAuth(
  request: Request,
  env: ParcelamentoWorkerEnv,
): WorkerAuthContext | undefined {
  if (header(request, INTERNAL_SERVICE_TOKEN_HEADER) !== env.INTERNAL_SERVICE_TOKEN) {
    return undefined;
  }

  const userId = header(request, FORWARDED_AUTH_USER_ID_HEADER);
  const organizationId = header(request, FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
  if (!userId || !organizationId) return undefined;

  let modules: unknown;
  const modulesHeader = header(request, FORWARDED_AUTH_MODULES_HEADER);
  if (modulesHeader) {
    try {
      modules = JSON.parse(modulesHeader);
    } catch {
      modules = undefined;
    }
  }

  const actorKind =
    header(request, FORWARDED_AUTH_KIND_HEADER) === "platform" ? "platform" : "organization";
  const platformRole = header(request, FORWARDED_AUTH_PLATFORM_ROLE_HEADER);
  const type = header(request, FORWARDED_AUTH_TYPE_HEADER);
  const permissionHeader = header(request, FORWARDED_AUTH_PERMISSION_HEADER);
  const permission = permissionHeader === undefined ? undefined : Number(permissionHeader);
  const sessionId = header(request, FORWARDED_AUTH_SESSION_ID_HEADER);
  const sessionVersionHeader = header(request, FORWARDED_AUTH_SESSION_VERSION_HEADER);
  const sessionVersion =
    sessionVersionHeader === undefined ? undefined : Number(sessionVersionHeader);
  const csrfHash = header(request, FORWARDED_AUTH_CSRF_HASH_HEADER);
  const sessionClaims =
    sessionId &&
    /^[a-f0-9]{64}$/u.test(csrfHash ?? "") &&
    Number.isSafeInteger(sessionVersion) &&
    (sessionVersion as number) >= 0
      ? {
          session_id: sessionId,
          session_version: sessionVersion as number,
          csrf_hash: csrfHash as string,
        }
      : {};

  return {
    // O JWT do cookie vai junto para a revalidacao no user-service; o placeholder nao e verificavel.
    token:
      readCookie(request.headers.get("cookie") ?? undefined, AUTH_SESSION_COOKIE_NAME) ??
      "forwarded-by-gateway",
    userId,
    organizationId,
    actorKind,
    isPlatformAdmin: actorKind === "platform" && platformRole === "super_admin",
    claims: {
      user_id: userId,
      organization_id: organizationId,
      auth_kind: actorKind,
      modules: normalizeModulePermissions(modules) as WorkerAuthContext["claims"]["modules"],
      modulePermissionsPresent: modulesHeader !== undefined,
      ...sessionClaims,
      ...(Number.isFinite(permission) ? { permission } : {}),
      ...(platformRole === "super_admin" ? { platform_role: "super_admin" as const } : {}),
      ...(type === "owner" || type === "admin" || type === "user" ? { type } : {}),
    },
  };
}

async function requireCookieSession(
  request: Request,
  env: ParcelamentoWorkerEnv,
  auth: WorkerAuthContext,
): Promise<void> {
  const cookies = request.headers.get("cookie") ?? undefined;
  if (!readCookie(cookies, AUTH_SESSION_COOKIE_NAME)) return;

  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const csrfCookie = readCookie(cookies, CSRF_COOKIE_NAME);
    const csrfHeader = request.headers.get(CSRF_HEADER_NAME);
    const expectedHash = auth.claims.csrf_hash;
    if (
      !csrfCookie ||
      !csrfHeader ||
      !expectedHash ||
      !(await verifyCsrfToken(csrfHeader, await hashCsrfToken(csrfCookie))) ||
      !(await verifyCsrfToken(csrfHeader, expectedHash))
    ) {
      throw new ServiceError(403, "Token CSRF inválido.");
    }
  }

  if (!env.USER_SERVICE || !env.USER_SERVICE_INTERNAL_TOKEN) {
    throw new ServiceError(503, "Validação de sessão indisponível para cookie.");
  }
  try {
    await validateWorkerSession(auth, env.USER_SERVICE, "cookie", {
      internalServiceToken: env.USER_SERVICE_INTERNAL_TOKEN,
    });
  } catch (error) {
    if (error instanceof WorkerSessionValidationError) {
      throw new ServiceError(error.statusCode, error.message);
    }
    throw error;
  }
}

export async function authenticateParcelamentoRequest(
  request: Request,
  env: ParcelamentoWorkerEnv,
): Promise<WorkerAuthContext> {
  const forwarded = forwardedAuth(request, env);
  let auth: WorkerAuthContext;
  if (forwarded) {
    auth = forwarded;
  } else {
    try {
      auth = await authenticateWorkerRequest(request, {
        jwtSecret: env.JWT_SECRET,
        allowBearer: true,
      });
    } catch (error) {
      if (error instanceof WorkerAuthenticationError) {
        throw new ServiceError(401, "Não autenticado.");
      }
      throw error;
    }
  }

  await requireCookieSession(request, env, auth);
  return auth;
}
