import jwt, { JwtPayload } from "jsonwebtoken";

import type { AuthIdentity, AuthContext } from "./types.js";

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
    organization_id: typeof payload.organization_id === "string" ? payload.organization_id : undefined,
    permission: typeof payload.permission === "number" ? payload.permission : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
    login: typeof payload.login === "string" ? payload.login : undefined
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
  jwtSecret: string
): AuthContext {
  const token = extractBearerToken(authorizationHeader);
  const claims = verifyJwtToken(token, jwtSecret);

  const organizationId = typeof claims.organization_id === "string" ? claims.organization_id : "";

  return {
    token,
    userId: claims.user_id,
    organizationId,
    claims
  };
}
