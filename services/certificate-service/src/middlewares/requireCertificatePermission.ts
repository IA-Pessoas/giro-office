import { requireAuthenticatedRequestContext, ServiceError } from "@workspace/shared";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export const CERTIFICATE_ELEVATED_PERMISSION = 2;
export const CERTIFICATE_READ_PERMISSION = 1;

export function requireCertificatePermissionLevel(minPermission: number): RequestHandler {
  return function requireCertificatePermissionLevelMiddleware(
    request: Request,
    _response: Response,
    next: NextFunction,
  ): void {
    try {
      requireAuthenticatedRequestContext(request);

      if (
        typeof request.permission?.certificado !== "number" ||
        request.permission.certificado < minPermission
      ) {
        next(new ServiceError(403, "Permissao insuficiente para acessar certificados."));
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export const requireCertificateReadPermission: RequestHandler = requireCertificatePermissionLevel(
  CERTIFICATE_READ_PERMISSION,
);
export const requireCertificatePermission: RequestHandler = requireCertificatePermissionLevel(
  CERTIFICATE_ELEVATED_PERMISSION,
);
