import {
  type AuthenticatedRequestContext,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import type { Request } from "express";

const ADMIN_PERMISSION = 3;
const RH_MODULE_KEY = "rh";
const MARKETING_VIEW_PERMISSION = 1;
const MARKETING_EDIT_PERMISSION = 2;

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

function canManageUsers(request: Request): boolean {
  return isExplicitOwnerRequest(request) || hasRhAdminPermission(request);
}

function hasMarketingPermission(request: Request, minPermission: number): boolean {
  const marketingPermission = request.modules?.marketing;
  return typeof marketingPermission === "number" && marketingPermission >= minPermission;
}

export function requireManageUsersAuth(request: Request): AuthenticatedRequestContext {
  const auth = requireUserAuth(request);

  if (canManageUsers(request)) {
    return auth;
  }

  throw new ServiceError(403, "Usu\u00e1rio n\u00e3o tem permiss\u00e3o.");
}

export function isMarketingOnlyUserListAccess(request: Request): boolean {
  return !canManageUsers(request) && hasMarketingPermission(request, MARKETING_VIEW_PERMISSION);
}

export function requireListUsersAuth(request: Request): AuthenticatedRequestContext {
  const auth = requireUserAuth(request);
  if (canManageUsers(request) || hasMarketingPermission(request, MARKETING_VIEW_PERMISSION)) {
    return auth;
  }

  throw new ServiceError(403, "Usuário não tem permissão.");
}

export function requireViewUserPhotoAuth(request: Request): AuthenticatedRequestContext {
  const auth = requireUserAuth(request);
  if (canManageUsers(request) || hasMarketingPermission(request, MARKETING_VIEW_PERMISSION)) {
    return auth;
  }

  throw new ServiceError(403, "Usuário não tem permissão.");
}

export function requireUpdateUserPhotoAuth(request: Request): AuthenticatedRequestContext {
  const auth = requireUserAuth(request);
  if (canManageUsers(request) || hasMarketingPermission(request, MARKETING_EDIT_PERMISSION)) {
    return auth;
  }

  throw new ServiceError(403, "Usuário não tem permissão.");
}

export function isMarketingOnlyUserPhotoUpdate(request: Request): boolean {
  return !canManageUsers(request) && hasMarketingPermission(request, MARKETING_EDIT_PERMISSION);
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
