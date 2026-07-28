import {
  type AuthenticatedRequestContext,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import type { Request } from "express";

const ADMIN_PERMISSION = 3;
const RH_MODULE_KEY = "rh";

function requireUserAuth(request: Request): AuthenticatedRequestContext {
  return requireAuthenticatedRequestContext(request, {
    userIdMessage: "N\u00e3o autenticado.",
    organizationIdMessage: "N\u00e3o autenticado.",
  });
}

function isExplicitOwnerRequest(request: Request): boolean {
  return request.user_type === "owner";
}

function hasRhAdminPermission(request: Request): boolean {
  const rhPermission = request.modules?.[RH_MODULE_KEY];
  return typeof rhPermission === "number" && rhPermission >= ADMIN_PERMISSION;
}

export function requireManageUsersAuth(request: Request): AuthenticatedRequestContext {
  const auth = requireUserAuth(request);

  if (isExplicitOwnerRequest(request) || hasRhAdminPermission(request)) {
    return auth;
  }

  throw new ServiceError(403, "Usu\u00e1rio n\u00e3o tem permiss\u00e3o.");
}

export function requireOwnerUserAuth(request: Request): AuthenticatedRequestContext {
  const auth = requireUserAuth(request);

  if (isExplicitOwnerRequest(request)) {
    return auth;
  }

  throw new ServiceError(403, "Usu\u00e1rio n\u00e3o tem permiss\u00e3o.");
}

export function isOwnerMutationPayload(body: {
  first_owner_flag?: boolean;
  type?: "admin" | "owner" | "user" | null;
  modules?: Record<string, number>;
}): boolean {
  return body.type === "owner" || body.first_owner_flag === true || body.modules !== undefined;
}
