import { jwtDecode } from "jwt-decode";
import type { ModuleAccess, ModuleKey } from "./moduleAccess";

interface SessionTokenPayload {
  permission?: number;
}

export type AuthUserType = "owner" | "admin" | "user";

type PermissionCarrier = {
  permission?: number | null;
  type?: AuthUserType | null;
  modules?: Record<string, number>;
} | null | undefined;

type AdministrationAccessOptions = {
  rhAccess?: Pick<ModuleAccess, "isAdmin"> | null;
  departmentModule?: ModuleKey | null;
};

export const ADMIN_PERMISSION = 2;

export function isAdminPermission(permission?: number | null): boolean {
  return typeof permission === "number" && permission >= ADMIN_PERMISSION;
}

export function isOrganizationOwner(subject?: number | PermissionCarrier): boolean {
  if (subject === null || subject === undefined) {
    return false;
  }

  if (typeof subject === "number") {
    return false;
  }

  if (subject.type === "owner" || subject.type === "admin" || subject.type === "user") {
    return subject.type === "owner";
  }

  return false;
}

export function canCreateOrganizationOwner(subject?: number | PermissionCarrier): boolean {
  return isOrganizationOwner(subject);
}

export function canCreateUsers(
  subject?: number | PermissionCarrier,
  options: AdministrationAccessOptions = {},
): boolean {
  if (isOrganizationOwner(subject)) {
    return true;
  }

  if (subject === null || subject === undefined || typeof subject === "number") {
    return false;
  }

  if (options.rhAccess?.isAdmin) {
    return true;
  }

  return subject.modules?.rh === 3;
}

export function canAccessAdministration(
  subject?: number | PermissionCarrier,
  options: AdministrationAccessOptions = {},
): boolean {
  return canCreateUsers(subject, options);
}

export function getPermissionFromToken(token?: string | null): number | null {
  if (!token) {
    return null;
  }

  try {
    const payload = jwtDecode<SessionTokenPayload>(token);
    return typeof payload.permission === "number" ? payload.permission : null;
  } catch {
    return null;
  }
}
