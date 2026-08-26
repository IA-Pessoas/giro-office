import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { manifest } from "./all-services-smoke.manifest.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("cadastros do smoke usam CNPJs válidos e distintos no mesmo namespace", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "organization-smoke-test-"));
  const cnpjs = [];
  const server = createServer(async (request, response) => {
    let rawBody = "";
    for await (const chunk of request) rawBody += chunk;
    response.setHeader("content-type", "application/json");
    if (request.url === "/user/session" || request.url === "/platform/session") {
      response.setHeader("set-cookie", ["cw.session=synthetic-session", "cw.csrf=synthetic-csrf"]);
      response.end(
        JSON.stringify({
          success: true,
          data: { id: "user-test", organization_id: "org-test", permission: 2 },
        }),
      );
      return;
    }
    if (request.url === "/organizations" || request.url === "/platform/organizations") {
      cnpjs.push(JSON.parse(rawBody).cnpj);
      response.statusCode = 201;
      response.end(
        JSON.stringify({
          success: true,
          data: { id: `org-${cnpjs.length}`, updated_at: "2026-08-25T12:00:00.000Z" },
        }),
      );
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ success: false }));
  });
  try {
    for (const name of ["all-services-smoke.mjs", "service-registry.mjs"]) {
      await copyFile(path.join(repoRoot, "scripts", name), path.join(tempDir, name));
    }
    const actions = [
      "userSession",
      "platformSession",
      "platformOrganizationCreate",
      "organizationCreate",
    ];
    const operations = actions.map((action) => manifest.find((op) => op.action === action));
    assert.ok(operations.every(Boolean));
    await writeFile(
      path.join(tempDir, "all-services-smoke.manifest.mjs"),
      `export const manifest = ${JSON.stringify(operations)};`,
    );
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [path.join(tempDir, "all-services-smoke.mjs"), "--fail-fast"],
      {
        timeout: 15_000,
        env: {
          PATH: process.env.PATH,
          SYSTEMROOT: process.env.SYSTEMROOT,
          GATEWAY_URL: `http://127.0.0.1:${port}`,
          AUDIT_ENABLED: "true",
          PLATFORM_ADMIN_EMAIL: "platform@example.com",
          PLATFORM_ADMIN_PASSWORD: "synthetic-password",
          JWT_SECRET: "synthetic-test-secret",
          LOGIN: "synthetic-user",
          PASSWORD: "synthetic-password",
          SMOKE_NAMESPACE: "organization-cnpj-regression",
          SMOKE_TMP_DIR: tempDir,
          SMOKE_UPLOAD_FIXTURE: path.join(tempDir, "all-services-smoke.mjs"),
        },
      },
    );
    assert.match(stdout, /Executed\s+: 4/);
    assert.equal(cnpjs.length, 2);
    assert.equal(new Set(cnpjs).size, 2, "cada cadastro precisa de um CNPJ diferente");
    for (const cnpj of cnpjs) {
      assert.match(cnpj, /^\d{14}$/u);
      for (const length of [12, 13]) {
        let sum = 0;
        let weight = 2;
        for (let i = length - 1; i >= 0; i--) {
          sum += Number(cnpj[i]) * weight;
          weight = weight === 9 ? 2 : weight + 1;
        }
        const remainder = sum % 11;
        assert.equal(Number(cnpj[length]), remainder < 2 ? 0 : 11 - remainder);
      }
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(tempDir, { recursive: true, force: true });
  }
});

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
