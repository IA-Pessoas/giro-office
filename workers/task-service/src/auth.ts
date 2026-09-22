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
import type { TaskWorkerEnv } from "./env.js";

function forwarded(request: Request, env: TaskWorkerEnv): WorkerAuthContext | undefined {
  if (request.headers.get(INTERNAL_SERVICE_TOKEN_HEADER) !== env.INTERNAL_SERVICE_TOKEN) {
    return undefined;
  }

  const userId = request.headers.get(FORWARDED_AUTH_USER_ID_HEADER);
  const organizationId = request.headers.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
  if (!userId || !organizationId) return undefined;

  const modulesHeader = request.headers.get(FORWARDED_AUTH_MODULES_HEADER);
  let modules: unknown;
  try {
    modules = modulesHeader ? JSON.parse(modulesHeader) : undefined;
  } catch {
    modules = undefined;
  }
  const permissionHeader = request.headers.get(FORWARDED_AUTH_PERMISSION_HEADER);
  const permission = permissionHeader === null ? undefined : Number(permissionHeader);
  const actorKind =
    request.headers.get(FORWARDED_AUTH_KIND_HEADER) === "platform" ? "platform" : "organization";
  const platformRole = request.headers.get(FORWARDED_AUTH_PLATFORM_ROLE_HEADER);
  const type = request.headers.get(FORWARDED_AUTH_TYPE_HEADER);
  const sessionId = request.headers.get(FORWARDED_AUTH_SESSION_ID_HEADER);
  const sessionVersionHeader = request.headers.get(FORWARDED_AUTH_SESSION_VERSION_HEADER);
  const sessionVersion = sessionVersionHeader === null ? undefined : Number(sessionVersionHeader);
  const csrfHash = request.headers.get(FORWARDED_AUTH_CSRF_HASH_HEADER);
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
  const sessionToken = readCookie(
    request.headers.get("cookie") ?? undefined,
    AUTH_SESSION_COOKIE_NAME,
  );

  return {
    token: sessionToken ?? "forwarded-by-gateway",
    userId,
    organizationId,
    actorKind,
    isPlatformAdmin: actorKind === "platform" && platformRole === "super_admin",
    claims: {
      user_id: userId,
      organization_id: organizationId,
      auth_kind: actorKind,
      modules: normalizeModulePermissions(modules) as WorkerAuthContext["claims"]["modules"],
      modulePermissionsPresent: modulesHeader !== null,
      ...sessionClaims,
      ...(Number.isFinite(permission) ? { permission } : {}),
      ...(platformRole === "super_admin" ? { platform_role: platformRole } : {}),
      ...(type === "owner" || type === "admin" || type === "user" ? { type } : {}),
    },
  };
}

async function authenticate(request: Request, env: TaskWorkerEnv): Promise<WorkerAuthContext> {
  const context = forwarded(request, env);
  if (context) return context;

  try {
    return await authenticateWorkerRequest(request, {
      jwtSecret: env.JWT_SECRET,
      allowBearer: true,
    });
  } catch (error) {
    if (error instanceof WorkerAuthenticationError) throw new ServiceError(401, "Não autenticado.");
    throw error;
  }
}

export async function authenticateTaskRequest(
  request: Request,
  env: TaskWorkerEnv,
): Promise<WorkerAuthContext> {
  const auth = await authenticate(request, env);
  const cookies = request.headers.get("cookie") ?? undefined;
  const sessionToken = readCookie(cookies, AUTH_SESSION_COOKIE_NAME);
  if (!sessionToken) return auth;

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
