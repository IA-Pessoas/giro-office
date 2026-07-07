import { jwtDecode } from "jwt-decode";

interface SessionTokenPayload {
  modules?: Record<string, unknown>;
}

function normalizeModuleValue(value: unknown): number | null {
  return value === 0 || value === 1 || value === 2 ? value : null;
}

export function getModulePermissionsFromToken(
  token?: string | null,
): Record<string, number | null> | null {
  if (!token) {
    return null;
  }

  try {
    const payload = jwtDecode<SessionTokenPayload>(token);

    if (!payload.modules || typeof payload.modules !== "object") {
      return null;
    }

    return Object.entries(payload.modules).reduce<Record<string, number | null>>(
      (acc, [moduleKey, value]) => {
        acc[moduleKey] = normalizeModuleValue(value);
        return acc;
      },
      {},
    );
  } catch {
    return null;
  }
}
