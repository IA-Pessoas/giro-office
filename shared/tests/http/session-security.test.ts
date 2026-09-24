import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";

import { authenticateFromToken } from "../../src/auth/token.js";
import {
  createExpiredSessionCookieHeaders,
  createSessionCookieHeaders,
  hashCsrfToken,
  readCookie,
  stripBrowserAuth,
  verifyCsrfToken,
} from "../../src/http/session-security.js";

test("session cookies carry the production security attributes", () => {
  const headers = createSessionCookieHeaders("signed.jwt", "csrf-value", { secure: true });

  assert.match(headers[0], /^cw\.session=signed\.jwt;/);
  assert.match(headers[0], /HttpOnly/u);
  assert.match(headers[0], /Secure/u);
  assert.match(headers[0], /SameSite=Lax/u);
  assert.match(headers[0], /Path=\//u);
  assert.match(headers[0], /Max-Age=86400/u);
  assert.doesNotMatch(headers[1], /HttpOnly/u);
  assert.match(headers[1], /^cw\.csrf=csrf-value;/);
});

test("session cookie lifetime can be shortened for impersonation", () => {
  const headers = createSessionCookieHeaders("signed.jwt", "csrf-value", {
    secure: true,
    maxAgeSeconds: 3600,
  });

  assert.match(headers[0], /Max-Age=3600/u);
  assert.match(headers[1], /Max-Age=3600/u);
});

test("expired session cookies clear both browser values", () => {
  const headers = createExpiredSessionCookieHeaders({ secure: true });

  assert.match(headers[0], /^cw\.session=; Max-Age=0;/);
  assert.match(headers[0], /HttpOnly/u);
  assert.match(headers[1], /^cw\.csrf=; Max-Age=0;/);
});

test("CSRF proof is bound to one signed session hash", () => {
  const token = "A".repeat(43);

  assert.equal(verifyCsrfToken(token, hashCsrfToken(token)), true);
  assert.equal(verifyCsrfToken("B".repeat(43), hashCsrfToken(token)), false);
  assert.equal(verifyCsrfToken("oversized".repeat(100), hashCsrfToken(token)), false);
  assert.equal(verifyCsrfToken(token, "not-a-hash"), false);
});

test("cookie parsing is bounded and exact", () => {
  assert.equal(readCookie("theme=dark; cw.session=signed.jwt", "cw.session"), "signed.jwt");
  assert.equal(readCookie(`cw.session=${"x".repeat(4097)}`, "cw.session"), undefined);
  assert.equal(readCookie("x".repeat(8193), "cw.session"), undefined);
});

test("browser auth removal preserves unrelated cookies", () => {
  assert.equal(
    stripBrowserAuth("theme=dark; cw.session=secret; cw.csrf=proof; locale=pt-BR"),
    "theme=dark; locale=pt-BR",
  );
});

test("authenticateFromToken exposes the signed session binding", () => {
  const token = jwt.sign(
    {
      user_id: "user-1",
      organization_id: "org-1",
      session_id: "session-1",
      csrf_hash: "a".repeat(64),
    },
    "secret",
  );

  assert.equal(authenticateFromToken(token, "secret").claims.csrf_hash, "a".repeat(64));
  assert.equal(authenticateFromToken(token, "secret").claims.session_id, "session-1");
});
