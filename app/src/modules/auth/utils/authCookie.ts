export const AUTH_COOKIE_NAME = "cw.token";
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function resolveAuthCookieSecure(nodeEnv = process.env.NODE_ENV) {
  const secureOverride = process.env.NEXT_PUBLIC_AUTH_COOKIE_SECURE;

  if (secureOverride === "true") {
    return true;
  }

  if (secureOverride === "false") {
    return false;
  }

  return nodeEnv === "production";
}

export function getAuthCookieOptions(nodeEnv = process.env.NODE_ENV) {
  return {
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: resolveAuthCookieSecure(nodeEnv),
  };
}

export const AUTH_COOKIE_DESTROY_OPTIONS = {
  path: "/",
} as const;
