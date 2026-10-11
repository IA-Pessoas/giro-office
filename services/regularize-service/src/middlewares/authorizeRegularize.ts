import { ServiceError } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

const MIN_REGULARIZE_READ_PERMISSION = 1;
const MIN_REGULARIZE_WRITE_PERMISSION = 2;
const READ_METHODS = new Set(["GET", "HEAD"]);
// O comparador Veri é um POST que só lê a carteira e não grava nada (#1739).
const VERI_COMPARE_PATH = "/veri/compare";

export function requireRegularizePermission(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  const method = request.method.toUpperCase();
  const readOnly =
    READ_METHODS.has(method) || (method === "POST" && request.path === VERI_COMPARE_PATH);
  const minimumPermission = readOnly
    ? MIN_REGULARIZE_READ_PERMISSION
    : MIN_REGULARIZE_WRITE_PERMISSION;

  if (Number(request.permission ?? 0) < minimumPermission) {
    next(new ServiceError(403, "Permissão insuficiente para acessar o módulo Regularize."));
    return;
  }

  next();
}
