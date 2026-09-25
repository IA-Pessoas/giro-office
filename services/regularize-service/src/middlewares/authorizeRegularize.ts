import { ServiceError } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

const MIN_REGULARIZE_READ_PERMISSION = 1;
const MIN_REGULARIZE_WRITE_PERMISSION = 2;
const READ_METHODS = new Set(["GET", "HEAD"]);

export function requireRegularizePermission(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  const minimumPermission = READ_METHODS.has(request.method.toUpperCase())
    ? MIN_REGULARIZE_READ_PERMISSION
    : MIN_REGULARIZE_WRITE_PERMISSION;

  if (Number(request.permission ?? 0) < minimumPermission) {
    next(new ServiceError(403, "Permissão insuficiente para acessar o módulo Regularize."));
    return;
  }

  next();
}
