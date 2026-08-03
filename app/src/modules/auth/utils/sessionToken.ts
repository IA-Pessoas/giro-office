import { jwtDecode } from "jwt-decode";
import { MODULE_KEYS } from "./moduleAccess";

interface SessionTokenPayload {
  modules?: Record<string, unknown>;
}

function normalizeModuleValue(value: unknown): number {
  return value === 0 || value === 1 || value === 2 || value === 3 ? value : 0;
}

export function getModulePermissionsFromToken(
  token?: string | null,
): Record<string, number> | null {
  if (!token) {
    return null;
  }

  try {
    const payload = jwtDecode<SessionTokenPayload>(token);

    const source = payload.modules && typeof payload.modules === "object" ? payload.modules : {};
    return MODULE_KEYS.reduce<Record<string, number>>((acc, moduleKey) => {
      acc[moduleKey] = normalizeModuleValue(source[moduleKey]);
      return acc;
    }, {});
  } catch {
    return null;
  }
}
