export const AUTH_SESSION_COOKIE_NAME = "cw.session";
export const CSRF_COOKIE_NAME = "cw.csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";
export const SESSION_MAX_AGE_SECONDS = 86_400;

const MAX_COOKIE_HEADER_BYTES = 8_192;
const MAX_COOKIE_VALUE_BYTES = 4_096;
const CSRF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const CSRF_HASH_PATTERN = /^[a-f0-9]{64}$/u;
const textEncoder = new TextEncoder();

export interface SessionCookieOptions {
  secure: boolean;
  /** Padrão: SESSION_MAX_AGE_SECONDS. A personificação usa 60 minutos. */
  maxAgeSeconds?: number;
}

function byteLength(value: string): number {
  return textEncoder.encode(value).byteLength;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function encodeHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

export async function hashCsrfToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(token));
  return encodeHex(new Uint8Array(digest));
}

function securelyEquals(actual: Uint8Array, expected: Uint8Array): boolean {
  let difference = actual.length ^ expected.length;
  const length = Math.max(actual.length, expected.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (actual[index] ?? 0) ^ (expected[index] ?? 0);
  }
  return difference === 0;
}

export async function verifyCsrfToken(token: string, expectedHash: string): Promise<boolean> {
  if (!CSRF_TOKEN_PATTERN.test(token) || !CSRF_HASH_PATTERN.test(expectedHash)) {
    return false;
  }

  const actualHash = await hashCsrfToken(token);
  return securelyEquals(textEncoder.encode(actualHash), textEncoder.encode(expectedHash));
}

export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader || byteLength(cookieHeader) > MAX_COOKIE_HEADER_BYTES) {
    return undefined;
  }

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) {
      continue;
    }

    const rawValue = part.slice(separator + 1).trim();
    if (byteLength(rawValue) > MAX_COOKIE_VALUE_BYTES) {
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
  if (!cookieHeader || byteLength(cookieHeader) > MAX_COOKIE_HEADER_BYTES) {
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

function cookieAttributes(
  { secure, maxAgeSeconds = SESSION_MAX_AGE_SECONDS }: SessionCookieOptions,
  httpOnly: boolean,
): string {
  return [
    `Max-Age=${maxAgeSeconds}`,
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
