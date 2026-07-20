import { jwtDecode } from "jwt-decode";

interface SessionTokenPayload {
  modules?: Record<string, unknown>;
  auth_kind?: "organization" | "platform";
  platform_role?: "super_admin";
  support_mode?: boolean;
}

export interface PlatformSessionToken {
  auth_kind: "platform" | null;
  platform_role: "super_admin" | null;
  support_mode: boolean;
}

export interface SessionTokenContext {
  modules: Record<string, number | null> | null;
  platformSession: PlatformSessionToken;
}

const EMPTY_PLATFORM_SESSION: PlatformSessionToken = {
  auth_kind: null,
  platform_role: null,
  support_mode: false,
};

function normalizeModuleValue(value: unknown): number | null {
  return value === 0 || value === 1 || value === 2 ? value : null;
}

function decodeSessionTokenPayload(token?: string | null): SessionTokenPayload | null {
  if (!token) {
    return null;
  }

  try {
    return jwtDecode<SessionTokenPayload>(token);
  } catch {
    return null;
  }
}

function getModulePermissionsFromPayload(
  payload: SessionTokenPayload | null,
): Record<string, number | null> | null {
  if (!payload?.modules || typeof payload.modules !== "object") {
    return null;
  }

  return Object.entries(payload.modules).reduce<Record<string, number | null>>(
    (acc, [moduleKey, value]) => {
      acc[moduleKey] = normalizeModuleValue(value);
      return acc;
    },
    {},
  );
}

function getPlatformSessionFromPayload(payload: SessionTokenPayload | null): PlatformSessionToken {
  if (!payload) {
    return EMPTY_PLATFORM_SESSION;
  }

  const authKind = payload.auth_kind === "platform" ? "platform" : null;

  return {
    auth_kind: authKind,
    platform_role:
      authKind === "platform" && payload.platform_role === "super_admin" ? "super_admin" : null,
    support_mode: payload.support_mode === true,
  };
}

export function getSessionContextFromToken(token?: string | null): SessionTokenContext {
  const payload = decodeSessionTokenPayload(token);

  return {
    modules: getModulePermissionsFromPayload(payload),
    platformSession: getPlatformSessionFromPayload(payload),
  };
}

export function getModulePermissionsFromToken(
  token?: string | null,
): Record<string, number | null> | null {
  return getSessionContextFromToken(token).modules;
}

export function getPlatformSessionFromToken(token?: string | null): PlatformSessionToken {
  return getSessionContextFromToken(token).platformSession;
}

export function canAccessPlatformAdminToken(token?: string | null): boolean {
  const platformSession = getPlatformSessionFromToken(token);

  return (
    platformSession.auth_kind === "platform" &&
    platformSession.platform_role === "super_admin"
  );
}
