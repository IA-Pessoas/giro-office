import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import nextConfig, { securityHeaders } from "../app/next.config.mjs";

const fontsSource = await readFile(
  new URL("../app/src/styles/new-layout/fonts.css", import.meta.url),
  "utf8",
);

test("production CSP is enforced without unsafe eval or broad connection schemes", () => {
  const enforced = securityHeaders.find((header) => header.key === "Content-Security-Policy");
  const reportOnly = securityHeaders.find(
    (header) => header.key === "Content-Security-Policy-Report-Only",
  );

  assert.equal(reportOnly, undefined);
  assert.ok(enforced);
  assert.match(enforced.value, /script-src 'self' 'unsafe-inline'/);
  assert.doesNotMatch(enforced.value, /'unsafe-eval'/);
  assert.match(enforced.value, /connect-src 'self'/);
  assert.doesNotMatch(enforced.value, /connect-src[^;]*(?:http:|https:|ws:|wss:)/);
  assert.match(enforced.value, /object-src 'none'/);
  assert.match(enforced.value, /upgrade-insecure-requests/);
});

test("Next development server accepts both local browser hostnames", () => {
  assert.deepEqual(nextConfig.allowedDevOrigins, ["localhost", "127.0.0.1"]);
});

test("font stylesheet does not import resources blocked by the enforced CSP", () => {
  assert.doesNotMatch(fontsSource, /@import\s+url\(\s*["']https?:/u);
});
