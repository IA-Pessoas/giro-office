import jwt, { type JwtPayload } from "jsonwebtoken";

import type { AuthContext, AuthIdentity, AuthKind, AuthUserType, PlatformRole } from "./types.js";

function normalizePermissionModules(value: unknown): Record<string, number | null> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const modules: Record<string, number | null> = {};

  for (const [key, modulePermission] of Object.entries(value)) {
    if (typeof modulePermission === "number" || modulePermission === null) {
      modules[key] = modulePermission;
    }
  }

  return modules;
}

function normalizeAuthUserType(value: unknown): AuthUserType | undefined {
  return value === "owner" || value === "admin" || value === "user" ? value : undefined;
}

function normalizeAuthKind(value: unknown): AuthKind {
  return value === "platform" ? "platform" : "organization";
}

function normalizePlatformRole(value: unknown): PlatformRole | undefined {
  return value === "super_admin" ? value : undefined;
}

/**
 * Extrai e normaliza os claims do payload JWT para AuthIdentity.
 * Aceita user_id ou sub (padrão JWT) como identificador do usuário.
 */
function normalizeAuthIdentity(payload: string | JwtPayload): AuthIdentity {
  if (typeof payload === "string") {
    throw new Error("Token JWT inválido: payload em formato inesperado.");
  }

  const user_id =
    (typeof payload.user_id === "string" ? payload.user_id : undefined) ??
    (typeof payload.sub === "string" ? payload.sub : undefined);

  if (!user_id) {
    throw new Error("Token JWT inválido: claim 'user_id' ou 'sub' ausente.");
  }

  return {
    user_id,
    organization_id:
      typeof payload.organization_id === "string" ? payload.organization_id : undefined,
    permission: typeof payload.permission === "number" ? payload.permission : undefined,
    modules: normalizePermissionModules(payload.modules),
    type: normalizeAuthUserType(payload.type),
    auth_kind: normalizeAuthKind(payload.auth_kind),
    platform_role: normalizePlatformRole(payload.platform_role),
    support_mode: payload.support_mode === true,
    support_session_id:
      typeof payload.support_session_id === "string" ? payload.support_session_id : undefined,
    support_organization_id:
      typeof payload.support_organization_id === "string"
        ? payload.support_organization_id
        : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
    login: typeof payload.login === "string" ? payload.login : undefined,
  };
}

export function extractBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader) {
    throw new Error("Cabeçalho Authorization não informado.");
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    throw new Error("Formato de Authorization inválido. Use 'Bearer <token>'.");
  }

  return token;
}

export function verifyJwtToken(token: string, jwtSecret: string): AuthIdentity {
  const decoded = jwt.verify(token, jwtSecret);
  return normalizeAuthIdentity(decoded);
}

export function authenticateFromAuthHeader(
  authorizationHeader: string | undefined,
  jwtSecret: string,
): AuthContext {
  const token = extractBearerToken(authorizationHeader);
  const claims = verifyJwtToken(token, jwtSecret);

  const actorKind = claims.auth_kind === "platform" ? "platform" : "organization";
  const isPlatformAdmin = actorKind === "platform" && claims.platform_role === "super_admin";
  const supportOrganizationId =
    typeof claims.support_organization_id === "string" ? claims.support_organization_id : undefined;
  const supportSessionId =
    typeof claims.support_session_id === "string" ? claims.support_session_id : undefined;
  const isSupportMode =
    isPlatformAdmin &&
    claims.support_mode === true &&
    !!supportOrganizationId &&
    !!supportSessionId;
  const organizationId =
    isSupportMode && supportOrganizationId
      ? supportOrganizationId
      : typeof claims.organization_id === "string"
        ? claims.organization_id
        : "";

  return {
    token,
    userId: claims.user_id,
    organizationId,
    claims,
    actorKind,
    isPlatformAdmin,
    isSupportMode,
    supportOrganizationId,
    supportSessionId,
  };
}
