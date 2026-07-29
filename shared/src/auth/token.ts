import jwt, { type JwtPayload } from "jsonwebtoken";

import { normalizeModulePermissions } from "./modules.js";
import type { AuthContext, AuthIdentity, AuthUserType } from "./types.js";

function normalizeAuthUserType(value: unknown): AuthUserType | undefined {
  return value === "owner" || value === "admin" || value === "user" ? value : undefined;
}

/**
 * Extrai e normaliza os claims do payload JWT para AuthIdentity.
 * Aceita user_id ou sub (padrão JWT) como identificador do usuário.
 */
function normalizeAuthIdentity(payload: string | JwtPayload): AuthIdentity {
  if (typeof payload === "string") {
    throw new Error("Token JWT inválido: payload em formato inesperado.");
  }

  const modulePermissionsPresent = Object.prototype.hasOwnProperty.call(payload, "modules");

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
    modules: normalizeModulePermissions(payload.modules),
    modulePermissionsPresent,
    session_version:
      typeof payload.session_version === "number" &&
      Number.isInteger(payload.session_version) &&
      payload.session_version >= 0
        ? payload.session_version
        : undefined,
    type: normalizeAuthUserType(payload.type),
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

  const organizationId = typeof claims.organization_id === "string" ? claims.organization_id : "";

  return {
    token,
    userId: claims.user_id,
    organizationId,
    claims,
  };
}
