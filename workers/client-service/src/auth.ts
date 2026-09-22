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
import type { ClientWorkerEnv } from "./env.js";

function header(request: Request, name: string): string | undefined {
  const value = request.headers.get(name);
  return value && value.length > 0 ? value : undefined;
}

function modules(request: Request): Record<string, number> | undefined {
  const value = header(request, FORWARDED_AUTH_MODULES_HEADER);
  if (!value) return undefined;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return normalizeModulePermissions(parsed);
  } catch {
    return undefined;
  }
}

function forwardedAuth(request: Request, env: ClientWorkerEnv): WorkerAuthContext | undefined {
  const internalToken = header(request, INTERNAL_SERVICE_TOKEN_HEADER);
  const userId = header(request, FORWARDED_AUTH_USER_ID_HEADER);
  const organizationId = header(request, FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
  if (internalToken !== env.INTERNAL_SERVICE_TOKEN || !userId || !organizationId) return undefined;

  const actorKind =
    header(request, FORWARDED_AUTH_KIND_HEADER) === "platform" ? "platform" : "organization";
  const type = header(request, FORWARDED_AUTH_TYPE_HEADER);
  const platformRole = header(request, FORWARDED_AUTH_PLATFORM_ROLE_HEADER);
  const permissionHeader = header(request, FORWARDED_AUTH_PERMISSION_HEADER);
  const permission = permissionHeader === undefined ? undefined : Number(permissionHeader);
  const parsedModules = modules(request);
  const sessionId = header(request, FORWARDED_AUTH_SESSION_ID_HEADER);
  const sessionVersionHeader = header(request, FORWARDED_AUTH_SESSION_VERSION_HEADER);
  const sessionVersion =
    sessionVersionHeader === undefined ? undefined : Number(sessionVersionHeader);
  const csrfHash = header(request, FORWARDED_AUTH_CSRF_HASH_HEADER);
  const validSessionVersion =
    typeof sessionVersion === "number" &&
    Number.isSafeInteger(sessionVersion) &&
    sessionVersion >= 0
      ? sessionVersion
      : undefined;

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
      modules: (parsedModules ??
        normalizeModulePermissions(undefined)) as WorkerAuthContext["claims"]["modules"],
      modulePermissionsPresent: parsedModules !== undefined,
      ...(Number.isFinite(permission) ? { permission } : {}),
      ...(type === "owner" || type === "admin" || type === "user" ? { type } : {}),
      ...(platformRole === "super_admin" ? { platform_role: "super_admin" as const } : {}),
      ...(sessionId ? { session_id: sessionId } : {}),
      ...(validSessionVersion !== undefined ? { session_version: validSessionVersion } : {}),
      ...(csrfHash && /^[a-f0-9]{64}$/u.test(csrfHash) ? { csrf_hash: csrfHash } : {}),
    },
  };
}

export async function authenticateClientRequest(
  request: Request,
  env: ClientWorkerEnv,
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
      if (error instanceof WorkerAuthenticationError)
        throw new ServiceError(401, "Não autenticado.");
      throw error;
    }
  }

  const cookies = request.headers.get("cookie") ?? undefined;
  if (!readCookie(cookies, AUTH_SESSION_COOKIE_NAME)) return auth;

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
  return auth;
}

export function requireOrganization(auth: WorkerAuthContext): void {
  if (auth.actorKind !== "organization" || !auth.organizationId) {
    throw new ServiceError(403, "Organização não informada.");
  }
}

export function clientAuthorization(auth: WorkerAuthContext) {
  return {
    userId: auth.userId,
    level: auth.claims.modules.integracao,
    modules: auth.claims.modules,
    permission: auth.claims.permission,
    isOwner: auth.claims.type === "owner",
  };
}
