export const AUTH_COOKIE_NAME = "cw.token";
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function getAuthCookieOptions(nodeEnv = process.env.NODE_ENV) {
  return {
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: nodeEnv === "production",
  };
}

export const AUTH_COOKIE_DESTROY_OPTIONS = {
  path: "/",
} as const;
