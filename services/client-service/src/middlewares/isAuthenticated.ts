import { extractBearerToken, verifyJwtToken } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

import { getClientServiceEnv } from "../config/env.js";

type JwtClaims = {
  user_id: string;
  organization_id?: string;
  permission?: number;
  type?: "owner" | "admin" | "user";
  modules?: Record<string, number>;
};

function isValidClaims(claims: unknown): claims is JwtClaims {
  if (!claims || typeof claims !== "object") {
    return false;
  }

  const value = claims as Record<string, unknown>;

  if (typeof value.user_id !== "string" || value.user_id.length === 0) {
    return false;
  }

  if (value.organization_id !== undefined && typeof value.organization_id !== "string") {
    return false;
  }

  return true;
}

export async function isAuthenticated(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const authorizationHeader = request.headers.authorization;

  if (!authorizationHeader) {
    response.status(401).json({ error: "Token de autenticação não informado." });
    return;
  }

  try {
    const { jwtSecret } = getClientServiceEnv();
    const token = extractBearerToken(authorizationHeader);
    const claims = verifyJwtToken(token, jwtSecret);

    if (!isValidClaims(claims)) {
      response.status(401).json({ error: "Token inválido." });
      return;
    }

    const headerUserId = request.headers.user_id;
    const headerOrganizationId = request.headers.organization_id;

    if (headerUserId && headerUserId !== claims.user_id) {
      response.status(400).json({
        error: "Cabeçalho user_id não corresponde ao token.",
      });
      return;
    }

    if (headerOrganizationId && headerOrganizationId !== claims.organization_id) {
      response.status(400).json({
        error: "Cabeçalho organization_id não corresponde ao token.",
      });
      return;
    }

    request.user_id = claims.user_id;
    request.organization_id = claims.organization_id ?? "";
    request.permission = typeof claims.permission === "number" ? claims.permission : undefined;
    request.user_type = claims.type;
    request.modules = claims.modules;

    next();
  } catch {
    response.status(401).json({ error: "Não autenticado." });
  }
}
