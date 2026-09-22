import { verifyHs256Jwt } from "./jwt.js";
import { AUTH_SESSION_COOKIE_NAME, readCookie } from "./session.js";

export type WorkerAuthKind = "organization" | "platform";
export type WorkerAuthUserType = "owner" | "admin" | "user";

export interface WorkerAuthClaims {
  user_id: string;
  organization_id?: string;
  permission?: number;
  auth_kind: WorkerAuthKind;
  platform_role?: "super_admin";
  session_version?: number;
  session_id?: string;
  csrf_hash?: string;
  type?: WorkerAuthUserType;
  name?: string;
  login?: string;
}

export interface WorkerAuthContext {
  token: string;
  userId: string;
  organizationId: string;
  actorKind: WorkerAuthKind;
  isPlatformAdmin: boolean;
  claims: WorkerAuthClaims;
}

export interface AuthenticateWorkerRequestOptions {
  jwtSecret: string;
  allowBearer?: boolean;
}

export class WorkerAuthenticationError extends Error {
  readonly statusCode = 401;

  constructor() {
    super("Não autenticado.");
    this.name = "WorkerAuthenticationError";
  }
}

const CSRF_HASH_PATTERN = /^[a-f0-9]{64}$/u;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function normalizeClaims(payload: Record<string, unknown>): WorkerAuthClaims {
  const userId = isNonEmptyString(payload.user_id)
    ? payload.user_id
    : isNonEmptyString(payload.sub)
      ? payload.sub
      : undefined;

  if (!userId) throw new WorkerAuthenticationError();

  const claims: WorkerAuthClaims = {
    user_id: userId,
    auth_kind: payload.auth_kind === "platform" ? "platform" : "organization",
  };

  if (isNonEmptyString(payload.organization_id)) claims.organization_id = payload.organization_id;
  if (typeof payload.permission === "number" && Number.isFinite(payload.permission)) {
    claims.permission = payload.permission;
  }
  if (payload.platform_role === "super_admin") claims.platform_role = "super_admin";
  if (
    typeof payload.session_version === "number" &&
    Number.isSafeInteger(payload.session_version) &&
    payload.session_version >= 0
  ) {
    claims.session_version = payload.session_version;
  }
  if (isNonEmptyString(payload.session_id)) claims.session_id = payload.session_id;
  if (typeof payload.csrf_hash === "string" && CSRF_HASH_PATTERN.test(payload.csrf_hash)) {
    claims.csrf_hash = payload.csrf_hash;
  }
  if (payload.type === "owner" || payload.type === "admin" || payload.type === "user") {
    claims.type = payload.type;
  }
  if (isNonEmptyString(payload.name)) claims.name = payload.name;
  if (isNonEmptyString(payload.login)) claims.login = payload.login;

  return claims;
}

function bearerToken(authorization: string | null): string | undefined {
  if (!authorization) return undefined;
  const parts = authorization.trim().split(/\s+/u);
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== "bearer" || !parts[1]) {
    throw new WorkerAuthenticationError();
  }
  return parts[1];
}

function hasSessionCookie(cookieHeader: string | undefined): boolean {
  return (
    cookieHeader
      ?.split(";")
      .some((part) => part.trim().split("=", 1)[0]?.trim() === AUTH_SESSION_COOKIE_NAME) ?? false
  );
}

export async function authenticateWorkerRequest(
  request: Request,
  options: AuthenticateWorkerRequestOptions,
): Promise<WorkerAuthContext> {
  const cookieHeader = request.headers.get("cookie") ?? undefined;
  const cookieToken = readCookie(cookieHeader, AUTH_SESSION_COOKIE_NAME);
  let token = cookieToken;

  if (!token) {
    if (hasSessionCookie(cookieHeader) || !options.allowBearer) {
      throw new WorkerAuthenticationError();
    }
    token = bearerToken(request.headers.get("authorization"));
    if (!token) throw new WorkerAuthenticationError();
  }

  try {
    const claims = normalizeClaims(await verifyHs256Jwt(token, options.jwtSecret));
    const isPlatformAdmin =
      claims.auth_kind === "platform" && claims.platform_role === "super_admin";

    return {
      token,
      userId: claims.user_id,
      organizationId: isPlatformAdmin ? "" : (claims.organization_id ?? ""),
      actorKind: claims.auth_kind,
      isPlatformAdmin,
      claims,
    };
  } catch {
    throw new WorkerAuthenticationError();
  }
}
