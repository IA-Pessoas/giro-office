import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const AUTH_SESSION_COOKIE_NAME = "cw.session";
export const CSRF_COOKIE_NAME = "cw.csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";
export const SESSION_MAX_AGE_SECONDS = 86_400;

const MAX_COOKIE_HEADER_BYTES = 8_192;
const MAX_COOKIE_VALUE_BYTES = 4_096;
const CSRF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const CSRF_HASH_PATTERN = /^[a-f0-9]{64}$/u;

export interface SessionCookieOptions {
  secure: boolean;
}

export function createCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashCsrfToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyCsrfToken(token: string, expectedHash: string): boolean {
  if (!CSRF_TOKEN_PATTERN.test(token) || !CSRF_HASH_PATTERN.test(expectedHash)) {
    return false;
  }

  const actual = Buffer.from(hashCsrfToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return timingSafeEqual(actual, expected);
}

export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader || Buffer.byteLength(cookieHeader, "utf8") > MAX_COOKIE_HEADER_BYTES) {
    return undefined;
  }

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) {
      continue;
    }

    const rawValue = part.slice(separator + 1).trim();
    if (Buffer.byteLength(rawValue, "utf8") > MAX_COOKIE_VALUE_BYTES) {
      return undefined;
    }

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export function stripBrowserAuth(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader || Buffer.byteLength(cookieHeader, "utf8") > MAX_COOKIE_HEADER_BYTES) {
    return undefined;
  }

  const remaining = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => {
      const separator = part.indexOf("=");
      const name = separator < 0 ? part : part.slice(0, separator).trim();
      return name !== AUTH_SESSION_COOKIE_NAME && name !== CSRF_COOKIE_NAME;
    });

  return remaining.length > 0 ? remaining.join("; ") : undefined;
}

function cookieAttributes({ secure }: SessionCookieOptions, httpOnly: boolean): string {
  return [
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    "Path=/",
    httpOnly ? "HttpOnly" : undefined,
    secure ? "Secure" : undefined,
    "SameSite=Lax",
  ]
    .filter(Boolean)
    .join("; ");
}

export function createSessionCookieHeaders(
  sessionToken: string,
  csrfToken: string,
  options: SessionCookieOptions,
): [string, string] {
  return [
    `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}; ${cookieAttributes(options, true)}`,
    `${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}; ${cookieAttributes(options, false)}`,
  ];
}

export function createExpiredSessionCookieHeaders(options: SessionCookieOptions): [string, string] {
  const secure = options.secure ? "; Secure" : "";
  return [
    `${AUTH_SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly${secure}; SameSite=Lax`,
    `${CSRF_COOKIE_NAME}=; Max-Age=0; Path=/${secure}; SameSite=Lax`,
  ];
}
