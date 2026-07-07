import {
  type AuthenticatedRequestContext,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import type { Request } from "express";

const ADMIN_PERMISSION = 2;
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

function isLegacyGlobalAdmin(auth: AuthenticatedRequestContext, request: Request): boolean {
  return (
    request.user_type === undefined &&
    typeof auth.permission === "number" &&
    auth.permission >= ADMIN_PERMISSION
  );
}

function hasRhAdminPermission(request: Request): boolean {
  const rhPermission = request.modules?.[RH_MODULE_KEY];
  return typeof rhPermission === "number" && rhPermission >= ADMIN_PERMISSION;
}

export function requireManageUsersAuth(request: Request): AuthenticatedRequestContext {
  const auth = requireUserAuth(request);

  if (
    isExplicitOwnerRequest(request) ||
    isLegacyGlobalAdmin(auth, request) ||
    hasRhAdminPermission(request)
  ) {
    return auth;
  }

  throw new ServiceError(403, "Usu\u00e1rio n\u00e3o tem permiss\u00e3o.");
}

export function requireOwnerUserAuth(request: Request): AuthenticatedRequestContext {
  const auth = requireUserAuth(request);

  if (isExplicitOwnerRequest(request) || isLegacyGlobalAdmin(auth, request)) {
    return auth;
  }

  throw new ServiceError(403, "Usu\u00e1rio n\u00e3o tem permiss\u00e3o.");
}

export function isOwnerMutationPayload(body: {
  first_owner_flag?: boolean;
  type?: "admin" | "owner" | "user" | null;
}): boolean {
  return body.type === "owner" || body.first_owner_flag === true;
}
