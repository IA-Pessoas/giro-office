import jwt, { JwtPayload } from "jsonwebtoken";

import type { AuthClaims, AuthContext } from "./types.js";

function normalizeClaims(payload: string | JwtPayload): AuthClaims {
  if (typeof payload === "string") {
    throw new Error("Token JWT inválido: payload em formato inesperado.");
  }

  const subject = payload.sub;
  if (!subject || typeof subject !== "string") {
    throw new Error("Token JWT inválido: claim 'sub' ausente.");
  }

  const permission = typeof payload.permission === "number" ? payload.permission : undefined;

  return {
    ...payload,
    sub: subject,
    permission,
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

export function verifyJwtToken(token: string, jwtSecret: string): AuthClaims {
  const decoded = jwt.verify(token, jwtSecret);
  return normalizeClaims(decoded);
}

export function authenticateFromAuthHeader(
  authorizationHeader: string | undefined,
  jwtSecret: string
): AuthContext {
  const token = extractBearerToken(authorizationHeader);
  const claims = verifyJwtToken(token, jwtSecret);

  return {
    token,
    userId: claims.sub,
    claims
  };
}
