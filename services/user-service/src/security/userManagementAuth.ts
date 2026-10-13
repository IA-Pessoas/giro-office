import {
  type AuthenticatedRequestContext,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import type { Request } from "express";

import type { ActorGrantScope } from "../services/userService.js";

const ADMIN_PERMISSION = 3;
const USER_ADMIN_MODULE_KEYS = ["rh", "ti"] as const;
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

function hasUserAdminModulePermission(request: Request): boolean {
  return USER_ADMIN_MODULE_KEYS.some((module) => {
    const permission = request.modules?.[module];
    return typeof permission === "number" && permission >= ADMIN_PERMISSION;
  });
}

/** Owner, admin de RH (rh=3) e admin de TI (ti=3), como no gateway e no Worker. */
function canManageUsers(request: Request): boolean {
  return isExplicitOwnerRequest(request) || hasUserAdminModulePermission(request);
}

/** Quem não é owner gerencia usuários sem conceder nem revogar acessos. */
export function actorGrantScope(request: Request): ActorGrantScope | undefined {
  return isExplicitOwnerRequest(request) ? undefined : "none";
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
