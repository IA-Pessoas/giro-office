import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { manifest } from "./all-services-smoke.manifest.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("reports smoke atravessa o gateway sem cabeçalhos de identidade forjados", async () => {
  const smoke = await readFile(path.join(repoRoot, "scripts", "all-services-smoke.mjs"), "utf8");
  const handler = smoke.match(/async reportsCatalog\(op\) \{([\s\S]*?)\n {2}\},/);

  assert.ok(handler);
  assert.doesNotMatch(handler[1], /x-auth-(?:user|organization)-id/);
});

test("gateway smoke usa sessão quando a compatibilidade Bearer está desligada", async () => {
  const legacyGatewayAuth = manifest.filter(
    (entry) =>
      entry.target === "gateway" && (entry.auth === "bearer" || entry.auth === "admin-bearer"),
  );
  const smoke = await readFile(path.join(repoRoot, "scripts", "all-services-smoke.mjs"), "utf8");

  assert.deepEqual(legacyGatewayAuth, []);
  assert.match(smoke, /target === "gateway" && \(auth === "bearer" \|\| auth === "admin-bearer"\)/);
  assert.doesNotMatch(smoke, /ensureRhTargetUserToken/);
  assert.doesNotMatch(smoke, /Authorization: `Bearer \$\{targetToken\}`/);
});

test("gateway smoke limpa dados temporários antes de revogar a sessão", async () => {
  const smoke = await readFile(path.join(repoRoot, "scripts", "all-services-smoke.mjs"), "utf8");
  const logoutHandler = smoke.match(/async userSessionLogout\(op\) \{([\s\S]*?)\n {2}\},/);

  assert.ok(logoutHandler);
  assert.match(logoutHandler[1], /await runCleanupTasks\(\);[\s\S]*httpRequest\(op,/);
  assert.match(smoke, /finally \{\s*await runCleanupTasks\(\);\s*\}/);
});

test("contexto de relatórios do user-service permanece no smoke direto interno", async () => {
  const manifestSource = await readFile(
    path.join(repoRoot, "scripts", "all-services-smoke.manifest.mjs"),
    "utf8",
  );
  const loginIndex = manifest.findIndex((entry) => entry.action === "userSession");
  const reportingIndex = manifest.findIndex((entry) => entry.action === "reportingAccessContext");

  assert.match(
    manifestSource,
    /path: "\/internal\/reporting\/access-context"[\s\S]*?target: "direct"/,
  );
  assert.doesNotMatch(manifestSource, /path: "\/reports\/access-context"/);
  assert.ok(loginIndex >= 0 && reportingIndex > loginIndex);
});

test("smoke fiscal exclui cada fixture somente depois das operações que dependem dela", () => {
  for (const [deleteAction, prerequisiteActions] of [
    ["fiscalNcmDelete", ["fiscalNcmGet", "fiscalNcmList", "fiscalNcmPut", "fiscalNcmSearch"]],
    ["fiscalIcmsDelete", ["fiscalIcmsGet", "fiscalIcmsList", "fiscalIcmsPut"]],
    ["fiscalIpiDelete", ["fiscalIpiGet", "fiscalIpiList", "fiscalIpiPut"]],
  ]) {
    const deleteIndex = manifest.findIndex((entry) => entry.action === deleteAction);
    assert.ok(deleteIndex >= 0, `${deleteAction} deve existir no manifest`);

    for (const prerequisiteAction of prerequisiteActions) {
      const prerequisiteIndex = manifest.findIndex((entry) => entry.action === prerequisiteAction);
      assert.ok(prerequisiteIndex >= 0, `${prerequisiteAction} deve existir no manifest`);
      assert.ok(
        deleteIndex > prerequisiteIndex,
        `${deleteAction} deve executar depois de ${prerequisiteAction}`,
      );
    }
  }
});
