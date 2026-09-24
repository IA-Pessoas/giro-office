import { describe, expect, it } from "vitest";
import {
  AUTH_SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  createCsrfToken,
  createExpiredSessionCookieHeaders,
  createSessionCookieHeaders,
  hashCsrfToken,
  readCookie,
  SESSION_MAX_AGE_SECONDS,
  stripBrowserAuth,
  verifyCsrfToken,
} from "./index.js";

describe("edge session helpers", () => {
  it("creates a 32-byte base64url CSRF token and hashes it with SHA-256", async () => {
    const token = createCsrfToken();
    const hash = await hashCsrfToken(token);

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(hash).toMatch(/^[a-f0-9]{64}$/u);
    await expect(verifyCsrfToken(token, hash)).resolves.toBe(true);
    await expect(verifyCsrfToken(`${token}x`, hash)).resolves.toBe(false);
    const tamperedHash = `${hash.slice(0, -1)}${hash.endsWith("0") ? "1" : "0"}`;
    await expect(verifyCsrfToken(token, tamperedHash)).resolves.toBe(false);
  });

  it("preserves the session cookie contract", () => {
    expect(AUTH_SESSION_COOKIE_NAME).toBe("cw.session");
    expect(CSRF_COOKIE_NAME).toBe("cw.csrf");
    expect(CSRF_HEADER_NAME).toBe("x-csrf-token");
    expect(SESSION_MAX_AGE_SECONDS).toBe(86_400);
  });

  it("reads encoded cookies and rejects invalid or oversized input", () => {
    expect(readCookie("theme=dark; cw.session=hello%20world", AUTH_SESSION_COOKIE_NAME)).toBe(
      "hello world",
    );
    expect(readCookie("cw.session=%E0%A4%A", AUTH_SESSION_COOKIE_NAME)).toBeUndefined();
    expect(readCookie(`cw.session=${"x".repeat(4_096)}`, AUTH_SESSION_COOKIE_NAME)).toHaveLength(
      4_096,
    );
    expect(readCookie(`cw.session=${"x".repeat(4_097)}`, AUTH_SESSION_COOKIE_NAME)).toBeUndefined();
    const headerPrefix = "cw.session=ok; filler=";
    expect(
      readCookie(
        `${headerPrefix}${"x".repeat(8_192 - headerPrefix.length)}`,
        AUTH_SESSION_COOKIE_NAME,
      ),
    ).toBe("ok");
    expect(
      readCookie(
        `${headerPrefix}${"x".repeat(8_193 - headerPrefix.length)}`,
        AUTH_SESSION_COOKIE_NAME,
      ),
    ).toBeUndefined();
  });

  it("strips browser-only auth cookies and preserves other cookies", () => {
    expect(stripBrowserAuth("theme=dark; cw.session=token; cw.csrf=csrf; locale=pt-BR")).toBe(
      "theme=dark; locale=pt-BR",
    );
    expect(stripBrowserAuth("cw.session=token; cw.csrf=csrf")).toBeUndefined();
    expect(stripBrowserAuth(undefined)).toBeUndefined();
  });

  it("creates secure and non-secure session headers", () => {
    expect(createSessionCookieHeaders("session value", "csrf value", { secure: true })).toEqual([
      "cw.session=session%20value; Max-Age=86400; Path=/; HttpOnly; Secure; SameSite=Lax",
      "cw.csrf=csrf%20value; Max-Age=86400; Path=/; Secure; SameSite=Lax",
    ]);
    expect(createSessionCookieHeaders("session", "csrf", { secure: false })).toEqual([
      "cw.session=session; Max-Age=86400; Path=/; HttpOnly; SameSite=Lax",
      "cw.csrf=csrf; Max-Age=86400; Path=/; SameSite=Lax",
    ]);
  });

  it("expires session headers with the same security attributes", () => {
    expect(createExpiredSessionCookieHeaders({ secure: true })).toEqual([
      "cw.session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
      "cw.csrf=; Max-Age=0; Path=/; Secure; SameSite=Lax",
    ]);
    expect(createExpiredSessionCookieHeaders({ secure: false })).toEqual([
      "cw.session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
      "cw.csrf=; Max-Age=0; Path=/; SameSite=Lax",
    ]);
  });
});
