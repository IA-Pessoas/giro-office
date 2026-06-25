import assert from "node:assert/strict";
import test from "node:test";

import { createSecurityHeadersMiddleware } from "../../src/http/security-headers.js";

function runMiddleware(nodeEnv?: string) {
  const headers = new Map<string, string | number | readonly string[]>();
  const middleware = createSecurityHeadersMiddleware({ nodeEnv });

  middleware(
    {} as never,
    {
      setHeader(name: string, value: string | number | readonly string[]) {
        headers.set(name, value);
        return this;
      },
    } as never,
    () => undefined,
  );

  return headers;
}

test("createSecurityHeadersMiddleware applies standard API hardening headers", () => {
  const headers = runMiddleware("test");

  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.equal(headers.get("Referrer-Policy"), "no-referrer");
  assert.equal(headers.get("Permissions-Policy"), "camera=(), microphone=(), geolocation=()");
  assert.equal(headers.has("Strict-Transport-Security"), false);
});

test("createSecurityHeadersMiddleware enables HSTS in production", () => {
  const headers = runMiddleware("production");

  assert.equal(headers.get("Strict-Transport-Security"), "max-age=15552000; includeSubDomains");
});
