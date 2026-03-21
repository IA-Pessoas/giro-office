import {
  extractBearerToken,
  error as logError,
  ServiceError,
  verifyJwtToken,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

type JwtClaims = {
  user_id: string;
  organization_id?: string;
};

function isValidClaims(claims: unknown): claims is JwtClaims {
  if (!claims || typeof claims !== "object") {
    return false;
  }

  const value = claims as Record<string, unknown>;

  if (typeof value.user_id !== "string" || value.user_id.length === 0) {
    return false;
  }

  if (
    value.organization_id !== undefined &&
    (typeof value.organization_id !== "string" || value.organization_id.length === 0)
  ) {
    return false;
  }

  return true;
}

export async function isAuthenticated(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  const authorizationHeader = request.headers.authorization;

  if (!authorizationHeader) {
    next(new ServiceError(401, "Token de autenticação não informado."));
    return;
  }

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logError("JWT_SECRET não definido no ambiente do rh-service", {
        err: new Error("missing JWT_SECRET"),
      });
      next(new ServiceError(500, "Configuração de autenticação não disponível."));
      return;
    }

    const token = extractBearerToken(authorizationHeader);
    const claims = verifyJwtToken(token, jwtSecret);

    if (!isValidClaims(claims)) {
      next(new ServiceError(401, "Token inválido."));
      return;
    }

    const headerUserId = request.headers.user_id;
    const headerOrganizationId = request.headers.organization_id;

    if (headerUserId && headerUserId !== claims.user_id) {
      next(new ServiceError(400, "Cabeçalho user_id não corresponde ao token."));
      return;
    }

    if (headerOrganizationId && headerOrganizationId !== claims.organization_id) {
      next(new ServiceError(400, "Cabeçalho organization_id não corresponde ao token."));
      return;
    }

    request.user_id = claims.user_id;
    request.organization_id = claims.organization_id;

    next();
  } catch (err: unknown) {
    logError("Erro ao validar autenticação no rh-service", { err });
    if (err instanceof ServiceError) {
      next(err);
      return;
    }
    next(new ServiceError(401, "Não autenticado.", err));
  }
}
