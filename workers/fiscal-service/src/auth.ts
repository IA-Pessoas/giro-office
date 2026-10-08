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
import type { FiscalWorkerEnv } from "./env.js";

const FISCAL_WRITE_PERMISSION = 2;
const FISCAL_ADMIN_PERMISSION = 3;
// Mesma política do gateway Node: leitura exige módulo fiscal >= 1, escrita >= 2.
const FISCAL_MODULE_READ = 1;
const FISCAL_MODULE_EDIT = 2;

function header(request: Request, name: string): string | undefined {
  const value = request.headers.get(name);
  return value && value.length > 0 ? value : undefined;
}

function forwardedAuth(request: Request, env: FiscalWorkerEnv): WorkerAuthContext | undefined {
  const internalToken = header(request, INTERNAL_SERVICE_TOKEN_HEADER);
  const userId = header(request, FORWARDED_AUTH_USER_ID_HEADER);
  const organizationId = header(request, FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
  if (internalToken !== env.INTERNAL_SERVICE_TOKEN || !userId || !organizationId) return undefined;

  const modulesHeader = header(request, FORWARDED_AUTH_MODULES_HEADER);
  let modules: unknown;
  if (modulesHeader) {
    try {
      modules = JSON.parse(modulesHeader);
    } catch {
      modules = undefined;
    }
  }
  // Paridade com o Node: permissão encaminhada é lida com parseInt.
  const permissionHeader = header(request, FORWARDED_AUTH_PERMISSION_HEADER);
  const permission =
    permissionHeader === undefined ? undefined : Number.parseInt(permissionHeader, 10);
  const actorKind =
    header(request, FORWARDED_AUTH_KIND_HEADER) === "platform" ? "platform" : "organization";
  const platformRole = header(request, FORWARDED_AUTH_PLATFORM_ROLE_HEADER);
  const type = header(request, FORWARDED_AUTH_TYPE_HEADER);
  const sessionId = header(request, FORWARDED_AUTH_SESSION_ID_HEADER);
  const sessionVersionHeader = header(request, FORWARDED_AUTH_SESSION_VERSION_HEADER);
  const sessionVersion = sessionVersionHeader === undefined ? NaN : Number(sessionVersionHeader);
  const csrfHash = header(request, FORWARDED_AUTH_CSRF_HASH_HEADER);
  const sessionToken = readCookie(
    request.headers.get("cookie") ?? undefined,
    AUTH_SESSION_COOKIE_NAME,
  );
  const sessionClaims =
    sessionId &&
    csrfHash &&
    /^[a-f0-9]{64}$/u.test(csrfHash) &&
    Number.isSafeInteger(sessionVersion) &&
    sessionVersion >= 0
      ? { session_id: sessionId, session_version: sessionVersion, csrf_hash: csrfHash }
      : {};

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
  auth: WorkerAuthContext,
  env: FiscalWorkerEnv,
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

export async function authenticateFiscalRequest(
  request: Request,
  env: FiscalWorkerEnv,
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

  await requireCookieSession(request, auth, env);
  return auth;
}

export function authorizeFiscalRequest(request: Request, auth: WorkerAuthContext): void {
  if (!auth.organizationId) {
    throw new ServiceError(403, "Organização não identificada para dados fiscais.");
  }
  const isRead = ["GET", "HEAD", "OPTIONS"].includes(request.method);

  if (!isRead) {
    const required =
      request.method === "DELETE" ? FISCAL_ADMIN_PERMISSION : FISCAL_WRITE_PERMISSION;
    if (Number(auth.claims.permission ?? 0) < required) {
      throw new ServiceError(
        403,
        request.method === "DELETE"
          ? "Permissão insuficiente para excluir dados fiscais."
          : "Permissão insuficiente para alterar dados fiscais.",
      );
    }
  }

  const moduleMinimum = isRead ? FISCAL_MODULE_READ : FISCAL_MODULE_EDIT;
  if (Number(auth.claims.modules?.fiscal ?? 0) < moduleMinimum) {
    throw new ServiceError(403, "Usuário não possui permissão para este domínio.");
  }
}
