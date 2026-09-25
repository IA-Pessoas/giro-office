import { ServiceError } from "@workspace/shared";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export const RH_SELF_SERVICE_PERMISSION = 1;
export const RH_WORKFLOW_MESSAGE_PERMISSION = 2;
export const RH_MANAGEMENT_PERMISSION = 3;

export function getRhPermissionLevel(request: Request): number {
  return typeof request.rh_permission === "number" ? request.rh_permission : 0;
}

export function canManageRh(request: Request): boolean {
  return getRhPermissionLevel(request) >= RH_MANAGEMENT_PERMISSION;
}

export function canUseRhWorkflowMessages(request: Request): boolean {
  return getRhPermissionLevel(request) >= RH_WORKFLOW_MESSAGE_PERMISSION;
}

export function requireRhPermission(minPermission: number): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (getRhPermissionLevel(request) < minPermission) {
      next(new ServiceError(403, "Permissão insuficiente para acessar o módulo RH."));
      return;
    }

    next();
  };
}
