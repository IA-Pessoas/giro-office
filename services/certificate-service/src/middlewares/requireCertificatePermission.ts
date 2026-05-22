import { requireAuthenticatedRequestContext, ServiceError } from "@workspace/shared";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export const CERTIFICATE_ELEVATED_PERMISSION = 2;

export const requireCertificatePermission: RequestHandler = function requireCertificatePermission(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  try {
    requireAuthenticatedRequestContext(request);

    if (request.permission?.certificado !== CERTIFICATE_ELEVATED_PERMISSION) {
      next(new ServiceError(403, "Permissao insuficiente para acessar certificados."));
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};
