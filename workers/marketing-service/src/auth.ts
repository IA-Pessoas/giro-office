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
import type { MarketingWorkerEnv } from "./env.js";

function header(request: Request, name: string): string | undefined {
  const value = request.headers.get(name);
  return value && value.length > 0 ? value : undefined;
}

function forwardedAuth(request: Request, env: MarketingWorkerEnv): WorkerAuthContext | undefined {
  if (header(request, INTERNAL_SERVICE_TOKEN_HEADER) !== env.INTERNAL_SERVICE_TOKEN) return;
  const userId = header(request, FORWARDED_AUTH_USER_ID_HEADER);
  const organizationId = header(request, FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
  if (!userId || !organizationId) return;

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
  const type = header(request, FORWARDED_AUTH_TYPE_HEADER);
  const platformRole = header(request, FORWARDED_AUTH_PLATFORM_ROLE_HEADER);
  const permissionHeader = header(request, FORWARDED_AUTH_PERMISSION_HEADER);
  const permission = permissionHeader === undefined ? undefined : Number(permissionHeader);
  const sessionVersionHeader = header(request, FORWARDED_AUTH_SESSION_VERSION_HEADER);
  const sessionVersion =
    sessionVersionHeader === undefined ? undefined : Number(sessionVersionHeader);
  const sessionId = header(request, FORWARDED_AUTH_SESSION_ID_HEADER);
  const csrfHash = header(request, FORWARDED_AUTH_CSRF_HASH_HEADER);

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
      ...(Number.isFinite(permission) ? { permission } : {}),
      ...(type === "owner" || type === "admin" || type === "user" ? { type } : {}),
      ...(platformRole === "super_admin" ? { platform_role: "super_admin" as const } : {}),
      ...(sessionId ? { session_id: sessionId } : {}),
      ...(sessionVersion !== undefined &&
      Number.isSafeInteger(sessionVersion) &&
      sessionVersion >= 0
        ? { session_version: sessionVersion }
        : {}),
      ...(csrfHash && /^[a-f0-9]{64}$/u.test(csrfHash) ? { csrf_hash: csrfHash } : {}),
    },
  };
}

export async function authenticateMarketingRequest(
  request: Request,
  env: MarketingWorkerEnv,
): Promise<WorkerAuthContext> {
  let auth: WorkerAuthContext;
  const forwarded = forwardedAuth(request, env);
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

  const cookie = readCookie(request.headers.get("cookie") ?? undefined, AUTH_SESSION_COOKIE_NAME);
  if (!cookie) return auth;
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const csrfCookie = readCookie(request.headers.get("cookie") ?? undefined, CSRF_COOKIE_NAME);
    const csrfHeader = request.headers.get(CSRF_HEADER_NAME);
    const csrfHash = auth.claims.csrf_hash;
    if (
      !csrfCookie ||
      !csrfHeader ||
      !csrfHash ||
      !(await verifyCsrfToken(csrfHeader, await hashCsrfToken(csrfCookie))) ||
      !(await verifyCsrfToken(csrfHeader, csrfHash))
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
    if (error instanceof WorkerSessionValidationError)
      throw new ServiceError(error.statusCode, error.message);
    throw error;
  }
  return auth;
}

/**
 * `requireMarketingPermission` do Node: 1 = leitura, 2 = edição. Owner passa, como no
 * `forwardedPermission` do gateway, que encaminha permissão 3 para ele.
 */
export function requireMarketingPermission(auth: WorkerAuthContext, minimum: 1 | 2): void {
  if (auth.claims.type === "owner") return;
  if ((auth.claims.modules.marketing ?? 0) < minimum) {
    throw new ServiceError(403, "Permissão insuficiente para acessar o Marketing.");
  }
}
