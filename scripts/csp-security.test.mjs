import assert from "node:assert/strict";
import test from "node:test";

import { securityHeaders } from "../app/next.config.mjs";

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
