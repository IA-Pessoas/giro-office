import { ServiceError } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

export const MIN_REGULARIZE_WRITE_PERMISSION = 2;

export function requireRegularizeWritePermission(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  const permission = typeof request.permission === "number" ? request.permission : 0;

  if (permission < MIN_REGULARIZE_WRITE_PERMISSION) {
    next(new ServiceError(403, "Permissao insuficiente para alterar dados do Regularize."));
    return;
  }

  next();
}
