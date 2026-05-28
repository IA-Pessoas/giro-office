import { jwtDecode } from "jwt-decode";

interface SessionTokenPayload {
  permission?: number;
}

type PermissionCarrier = {
  permission?: number | null;
} | null | undefined;

export const ADMIN_PERMISSION = 2;

export function isAdminPermission(permission?: number | null): boolean {
  return permission === ADMIN_PERMISSION;
}

export function canAccessAdministration(subject?: number | PermissionCarrier): boolean {
  if (subject === null || subject === undefined) {
    return false;
  }

  if (typeof subject === "number") {
    return isAdminPermission(subject);
  }

  return isAdminPermission(subject.permission);
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
