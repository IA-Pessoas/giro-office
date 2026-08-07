import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { PHASE2_TABLES, preparePhase2Load } from "./migration-v2-phase2-load.mjs";

test("preparePhase2Load gera CSV e SQL da fase 2", async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), "giro-office-phase2-test-"));
  const inputDir = path.join(baseDir, "load");
  const outputDir = path.join(baseDir, "phase2");

  const fixtures = {
    "integracao.tasks": [
      {
        id: "task-1",
        model_id: "model-1",
        project_id: "project-1",
        client_id: "client-1",
        name: "Tarefa, A",
        status: "Aberta",
        department_id: "department-1",
        billing: "0",
        urgency: "0",
        responsible_id: "user-1",
        organization_id: "org-id",
      },
    ],
    "regularize.license": [],
    "regularize.process": [],
    "regularize.proceduralGuidances": [],
    "regularize.partners": [],
    "regularize.municipalTaxes": [],
    "regularize.passowordsSites": [
      {
        id: "site-1",
        name: "Portal",
        sphere: "legacy",
        link: null,
        user: "",
        password: "",
        status: true,
        organization_id: "org-id",
      },
    ],
    "regularize.passwordsRegularize": [
      {
        id: "password-1",
        client_id: "client-1",
        site_id: "site-1",
        login: "login",
        password: "senha, com virgula",
        notes: null,
        organization_id: "org-id",
      },
    ],
  };

  await import("node:fs/promises").then(({ mkdir }) => mkdir(inputDir, { recursive: true }));
  await Promise.all(
    Object.entries(fixtures).map(([name, rows]) =>
      writeFile(path.join(inputDir, `${name}.json`), `${JSON.stringify(rows, null, 2)}\n`),
    ),
  );

  try {
    const manifest = await preparePhase2Load({
      inputDir,
      outputDir,
      organizationId: "org-id",
    });

    assert.equal(manifest.counts["integracao.tasks"], 1);
    assert.equal(manifest.counts["regularize.passwordsRegularize"], 1);
    assert.equal(manifest.tables.length, PHASE2_TABLES.length);

    const passwordsCsv = await readFile(
      path.join(outputDir, "csv", "regularize.passwordsRegularize.csv"),
      "utf8",
    );
    assert.match(passwordsCsv, /"senha, com virgula"/);

    const sql = await readFile(path.join(outputDir, "apply-phase2.sql"), "utf8");
    assert.match(sql, /TRUNCATE TABLE/);
    assert.match(sql, /\\copy public\."integracao.tasks"/);
    assert.match(sql, /\\copy public\."regularize.passwordsRegularize"/);
    assert.match(sql, /COMMIT;/);
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});
