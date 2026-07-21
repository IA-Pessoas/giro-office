import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { PHASE1_TABLES, preparePhase1Load } from "./migration-v2-phase1-load.mjs";

test("preparePhase1Load gera CSV e SQL da fase 1", async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), "giro-office-phase1-test-"));
  const inputDir = path.join(baseDir, "load");
  const outputDir = path.join(baseDir, "phase1");

  const fixtures = {
    departments: [
      {
        id: "department-1",
        name: "Fiscal",
        color: "#ffffff",
        status: "1",
        solution: false,
        organization_id: "org-id",
      },
    ],
    users: [
      {
        id: "user-1",
        name: "Maria",
        login: "maria",
        password: "secret",
        permission: 1,
        status: "Ativo",
        organization_id: "org-id",
        type: null,
        first_owner_flag: false,
        department_id: "department-1",
      },
    ],
    clients: [
      {
        id: "client-1",
        name: "Cliente, A",
        status: "Ativo",
        prospecting_status: "Migrado",
        cpf_cnpj: "",
        type: "PJ",
        type_registration: "Migrado",
        organization_id: "org-id",
      },
    ],
    "clients.pf": [],
    "integracao.tasksModel": [],
    "integracao.projectPlan": [],
    "integracao.projectPlanTasks": [],
    "integracao.projects": [],
  };

  await import("node:fs/promises").then(({ mkdir }) => mkdir(inputDir, { recursive: true }));
  await Promise.all(
    Object.entries(fixtures).map(([name, rows]) =>
      writeFile(path.join(inputDir, `${name}.json`), `${JSON.stringify(rows, null, 2)}\n`),
    ),
  );

  try {
    const manifest = await preparePhase1Load({
      inputDir,
      outputDir,
      organizationId: "org-id",
    });

    assert.equal(manifest.counts.departments, 1);
    assert.equal(manifest.counts.clients, 1);
    assert.equal(manifest.tables.length, PHASE1_TABLES.length);

    const clientsCsv = await readFile(path.join(outputDir, "csv", "clients.csv"), "utf8");
    assert.match(clientsCsv, /"Cliente, A"/);

    const sql = await readFile(path.join(outputDir, "apply-phase1.sql"), "utf8");
    assert.match(sql, /TRUNCATE TABLE/);
    assert.match(sql, /created_at, updated_at/);
    assert.match(sql, /\\copy public\.clients/);
    assert.match(sql, /COMMIT;/);
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});
