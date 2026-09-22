import {
  authenticateWorkerRequest,
  verifyHs256Jwt,
  type WorkerAuthClaims,
  type WorkerAuthContext,
  WorkerAuthenticationError,
} from "@workspace/runtime";
import {
  ACTIVE_MODULE_KEYS,
  type ModulePermissions,
  normalizeModulePermissions,
} from "@workspace/shared/auth";
import {
  AUTH_SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
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
  hashCsrfToken,
  INTERNAL_SERVICE_TOKEN_HEADER,
  readCookie,
  ServiceError,
  verifyCsrfToken,
} from "@workspace/shared/http";

import type { UserWorkerEnv } from "./env.js";
import type { Row, UserPrismaClient } from "./types.js";

export type AuthTransport = "cookie" | "bearer" | "forwarded";

export interface UserAuthContext extends WorkerAuthContext {
  transport: AuthTransport;
}

export interface PlatformIdentity {
  id: string;
  name: string;
  email: string;
  auth_kind: "platform";
  platform_role: "super_admin";
}

function header(request: Request, name: string): string | undefined {
  const value = request.headers.get(name);
  return value && value.length > 0 ? value : undefined;
}

function modulePermissions(request: Request): ModulePermissions | undefined {
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

function forwardedAuth(request: Request, env: UserWorkerEnv): UserAuthContext | undefined {
  if (header(request, INTERNAL_SERVICE_TOKEN_HEADER) !== env.INTERNAL_SERVICE_TOKEN)
    return undefined;

  const userId = header(request, FORWARDED_AUTH_USER_ID_HEADER);
  const kindHeader = header(request, FORWARDED_AUTH_KIND_HEADER);
  if (kindHeader !== "platform" && kindHeader !== "organization") return undefined;
  const kind = kindHeader;
  const organizationId = header(request, FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
  const sessionId = header(request, FORWARDED_AUTH_SESSION_ID_HEADER);
  const sessionVersion = Number(header(request, FORWARDED_AUTH_SESSION_VERSION_HEADER));
  const csrfHash = header(request, FORWARDED_AUTH_CSRF_HASH_HEADER);
  if (
    !userId ||
    !sessionId ||
    !csrfHash ||
    !/^[a-f0-9]{64}$/u.test(csrfHash) ||
    !Number.isSafeInteger(sessionVersion) ||
    sessionVersion < 0 ||
    (kind === "organization" && !organizationId)
  ) {
    return undefined;
  }

  const modules = (modulePermissions(request) ??
    normalizeModulePermissions(undefined)) as WorkerAuthClaims["modules"];
  const permissionHeader = header(request, FORWARDED_AUTH_PERMISSION_HEADER);
  const permission = permissionHeader === undefined ? undefined : Number(permissionHeader);
  const type = header(request, FORWARDED_AUTH_TYPE_HEADER);
  const platformRole = header(request, FORWARDED_AUTH_PLATFORM_ROLE_HEADER);
  const claims: WorkerAuthClaims = {
    user_id: userId,
    ...(organizationId ? { organization_id: organizationId } : {}),
    auth_kind: kind,
    modules,
    modulePermissionsPresent: modulePermissions(request) !== undefined,
    ...(Number.isSafeInteger(permission) ? { permission } : {}),
    ...(type === "owner" || type === "admin" || type === "user" ? { type } : {}),
    ...(platformRole === "super_admin" ? { platform_role: "super_admin" as const } : {}),
    session_version: sessionVersion,
    session_id: sessionId,
    csrf_hash: csrfHash,
  };

  return {
    token: "forwarded-by-gateway",
    userId,
    organizationId: kind === "platform" ? "" : (organizationId ?? ""),
    actorKind: kind,
    isPlatformAdmin: kind === "platform" && platformRole === "super_admin",
    claims,
    transport: "forwarded",
  };
}

export async function authenticateUserRequest(
  request: Request,
  env: UserWorkerEnv,
): Promise<UserAuthContext> {
  const hasBrowserSession = readCookie(
    request.headers.get("cookie") ?? undefined,
    AUTH_SESSION_COOKIE_NAME,
  );
  if (!hasBrowserSession) {
    try {
      const auth = await authenticateWorkerRequest(request, {
        jwtSecret: env.JWT_SECRET,
        allowBearer: true,
      });
      return { ...auth, transport: "bearer" };
    } catch (error) {
      if (!(error instanceof WorkerAuthenticationError)) throw error;
      const forwarded = forwardedAuth(request, env);
      if (forwarded) return forwarded;
    }
  }

  try {
    const auth = await authenticateWorkerRequest(request, {
      jwtSecret: env.JWT_SECRET,
      allowBearer: true,
    });
    return {
      ...auth,
      transport: readCookie(request.headers.get("cookie") ?? undefined, AUTH_SESSION_COOKIE_NAME)
        ? "cookie"
        : "bearer",
    };
  } catch (error) {
    if (error instanceof WorkerAuthenticationError) {
      console.warn("Token recusado", { event: "auth.token.rejected", message: error.message });
      throw new ServiceError(401, "Não autenticado.");
    }
    throw error;
  }
}

export function requirePlatformGatewayAuthorization(
  request: Request,
  env: UserWorkerEnv,
  login = false,
): void {
  if (request.headers.get(INTERNAL_SERVICE_TOKEN_HEADER) !== env.INTERNAL_SERVICE_TOKEN) {
    throw new ServiceError(login ? 403 : 401, login ? "Acesso negado." : "Não autenticado.");
  }
  if (login) return;
  if (
    request.headers.get(FORWARDED_AUTH_KIND_HEADER) !== "platform" ||
    request.headers.get(FORWARDED_AUTH_PLATFORM_ROLE_HEADER) !== "super_admin"
  ) {
    throw new ServiceError(403, "Acesso negado.");
  }
  if (!request.headers.get(FORWARDED_AUTH_USER_ID_HEADER)) {
    throw new ServiceError(401, "Não autenticado.");
  }
}

function sessionClaims(auth: UserAuthContext): {
  sessionId: string;
  sessionVersion: number;
  csrfHash: string;
} {
  const sessionId = auth.claims.session_id;
  const sessionVersion = auth.claims.session_version;
  const csrfHash = auth.claims.csrf_hash;
  if (!sessionId || !Number.isSafeInteger(sessionVersion) || !csrfHash) {
    throw new ServiceError(401, "Sessão obsoleta. Faça login novamente.");
  }
  return { sessionId, sessionVersion: sessionVersion as number, csrfHash };
}

export function activeOrganizationId(user: Row): string | undefined {
  if (user.status !== "active") return undefined;
  const department = user.department as Row | undefined;
  const departmentOrganization = department?.organization as Row | undefined;
  const explicitOrganization = user.organization as Row | undefined;
  const resolvedOrganizationId =
    (typeof user.organization_id === "string" && user.organization_id) ||
    (typeof department?.organization_id === "string" && department.organization_id);
  if (
    !resolvedOrganizationId ||
    !department ||
    department.organization_id !== resolvedOrganizationId ||
    !departmentOrganization ||
    departmentOrganization.id !== resolvedOrganizationId
  ) {
    return undefined;
  }

  const organization = user.organization_id ? explicitOrganization : departmentOrganization;
  return organization?.id === resolvedOrganizationId &&
    (organization.status === "active" || organization.status === "trial")
    ? resolvedOrganizationId
    : undefined;
}

function hasActiveOrganization(user: Row, organizationId: string): boolean {
  return activeOrganizationId(user) === organizationId;
}

export async function validateUserSession(
  auth: UserAuthContext,
  prisma: UserPrismaClient,
): Promise<void> {
  const { sessionId, sessionVersion, csrfHash } = sessionClaims(auth);
  const session = await prisma.authSession.findFirst({
    where: {
      id: sessionId,
      user_id: auth.userId,
      revoked_at: null,
      expires_at: { gt: new Date() },
    },
    select: {
      csrf_hash: true,
      user: {
        select: {
          organization_id: true,
          session_version: true,
          status: true,
          organization: { select: { id: true, status: true } },
          department: {
            select: {
              organization_id: true,
              organization: { select: { id: true, status: true } },
            },
          },
        },
      },
    },
  });
  const user = (session?.user ?? null) as Row | null;
  const reason = !session
    ? "session_not_found"
    : session.csrf_hash !== csrfHash
      ? "csrf_mismatch"
      : user?.status !== "active"
        ? "inactive_user"
        : !hasActiveOrganization(user, auth.organizationId)
          ? "inactive_organization"
          : user.session_version !== sessionVersion
            ? "session_version_mismatch"
            : undefined;
  if (reason) {
    // Paridade com o auth.session.rejected do Node: o motivo fica no log, a resposta segue generica.
    console.warn("Sessao recusada", {
      event: "auth.session.rejected",
      reason,
      transport: auth.transport,
    });
    throw new ServiceError(401, "Sessão inválida.");
  }
}

function platformClaims(payload: Record<string, unknown>): UserAuthContext {
  if (
    payload.auth_kind !== "platform" ||
    payload.platform_role !== "super_admin" ||
    typeof payload.user_id !== "string" ||
    typeof payload.session_id !== "string" ||
    !Number.isSafeInteger(payload.session_version) ||
    typeof payload.csrf_hash !== "string"
  ) {
    throw new ServiceError(401, "Não autenticado.");
  }
  const userId = payload.user_id as string;
  const sessionId = payload.session_id as string;
  const sessionVersion = payload.session_version as number;
  const csrfHash = payload.csrf_hash as string;
  const claims = {
    user_id: userId,
    auth_kind: "platform" as const,
    platform_role: "super_admin" as const,
    session_id: sessionId,
    session_version: sessionVersion,
    csrf_hash: csrfHash,
    modules: normalizeModulePermissions(undefined) as WorkerAuthClaims["modules"],
    modulePermissionsPresent: false,
  } satisfies WorkerAuthClaims;
  return {
    token: "platform-validation",
    userId,
    organizationId: "",
    actorKind: "platform",
    isPlatformAdmin: true,
    claims,
    transport: "bearer",
  };
}

export async function authenticatePlatformValidationRequest(
  request: Request,
  env: UserWorkerEnv,
): Promise<UserAuthContext> {
  if (header(request, INTERNAL_SERVICE_TOKEN_HEADER) !== env.INTERNAL_SERVICE_TOKEN) {
    throw new ServiceError(403, "Acesso negado.");
  }
  const authorization = header(request, "authorization");
  const token = authorization?.split(" ")[1];
  if (!token) throw new ServiceError(401, "Não autenticado.");
  try {
    const payload = await verifyHs256Jwt(token, env.JWT_SECRET);
    return { ...platformClaims(payload), token };
  } catch {
    throw new ServiceError(401, "Não autenticado.");
  }
}

export async function validatePlatformSession(
  auth: UserAuthContext,
  prisma: UserPrismaClient,
): Promise<PlatformIdentity> {
  if (!auth.isPlatformAdmin) throw new ServiceError(403, "Acesso negado.");
  const { sessionId, sessionVersion, csrfHash } = sessionClaims(auth);
  const session = await prisma.platformAuthSession.findFirst({
    where: {
      id: sessionId,
      platform_user_id: auth.userId,
      revoked_at: null,
      expires_at: { gt: new Date() },
    },
    select: {
      csrf_hash: true,
      platformUser: {
        select: {
          id: true,
          name: true,
          email: true,
          platform_role: true,
          status: true,
          session_version: true,
        },
      },
    },
  });
  const user = (session?.platformUser ?? null) as Row | null;
  if (
    !session ||
    session.csrf_hash !== csrfHash ||
    user?.id !== auth.userId ||
    user.platform_role !== "super_admin" ||
    user.status !== "active" ||
    user.session_version !== sessionVersion
  ) {
    throw new ServiceError(401, "Não autenticado.");
  }
  return {
    id: String(user.id),
    name: String(user.name),
    email: String(user.email),
    auth_kind: "platform",
    platform_role: "super_admin",
  };
}

export async function requireCsrf(request: Request, auth: UserAuthContext): Promise<void> {
  const cookieToken = readCookie(request.headers.get("cookie") ?? undefined, CSRF_COOKIE_NAME);
  const submittedToken = request.headers.get(CSRF_HEADER_NAME);
  const expectedHash = auth.claims.csrf_hash;
  if (auth.transport === "forwarded") {
    if (
      !submittedToken ||
      !expectedHash ||
      !(await verifyCsrfToken(submittedToken, expectedHash))
    ) {
      throw new ServiceError(403, "Requisição não autorizada.");
    }
    return;
  }
  if (
    !cookieToken ||
    !submittedToken ||
    !expectedHash ||
    !(await verifyCsrfToken(submittedToken, await hashCsrfToken(cookieToken))) ||
    !(await verifyCsrfToken(submittedToken, expectedHash))
  ) {
    throw new ServiceError(403, "Requisição não autorizada.");
  }
}

export function requireOrganizationAuth(auth: UserAuthContext): void {
  if (auth.actorKind !== "organization" || !auth.organizationId) {
    throw new ServiceError(403, "Acesso negado.");
  }
}

export function requireManageUsers(auth: UserAuthContext): void {
  requireOrganizationAuth(auth);
  if (auth.claims.type !== "owner" && (auth.claims.modules.rh ?? 0) < 3) {
    throw new ServiceError(403, "Usuário não tem permissão.");
  }
}

export function requireOwner(auth: UserAuthContext): void {
  requireOrganizationAuth(auth);
  if (auth.claims.type !== "owner") throw new ServiceError(403, "Usuário não tem permissão.");
}

export { ACTIVE_MODULE_KEYS };
