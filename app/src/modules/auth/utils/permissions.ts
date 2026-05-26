import { jwtDecode } from "jwt-decode";

interface SessionTokenPayload {
  permission?: number;
}

export const ADMIN_PERMISSION = 2;

export function isAdminPermission(permission?: number | null): boolean {
  return permission === ADMIN_PERMISSION;
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
