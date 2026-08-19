import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("o runbook exige segredo e não instrui registrar login", () => {
  const runbook = readFileSync("docs/security/distributed-auth-rate-limits.md", "utf8");

  assert.match(runbook, /AUTH_RATE_LIMIT_KEY_SECRET/);
  assert.doesNotMatch(runbook, /log\(.*login/i);
});
