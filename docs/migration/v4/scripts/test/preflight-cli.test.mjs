import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../preflight.mjs";

const ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const PRISMA_FIXTURE = new URL("./fixtures/schema-catalog.prisma", import.meta.url).pathname;

test("CLI aceita somente package, prisma e organization-id da Castelo", async (t) => {
  const directory = await createPackage(t);
  let createCount = 0;
  const dependencies = {
    createClient: async () => {
      createCount += 1;
      return createReadOnlyFakeClient();
    },
  };

  for (const args of [
    ["--package", directory, "--prisma", PRISMA_FIXTURE],
    [
      "--package",
      directory,
      "--prisma",
      PRISMA_FIXTURE,
      "--organization-id",
      "45337d55-bb0c-48eb-8ee5-9657c4e5f7df",
    ],
    [
      "--package",
      directory,
      "--prisma",
      PRISMA_FIXTURE,
      "--organization-id",
      ORGANIZATION_ID,
      "--apply",
    ],
  ]) {
    const io = createIo();
    const exitCode = await runCli({
      args,
      env: { DATABASE_URL: createDatabaseUrl("argument-fixture-password") },
      ...io,
      ...dependencies,
    });
    assert.equal(exitCode, 1);
    assert.doesNotMatch(
      `${io.stdout.text}${io.stderr.text}`,
      /argument-fixture-password|postgresql:\/\//i,
    );
  }
  assert.equal(createCount, 0);
});

test("CLI usa DATABASE_URL, grava somente o relatório e mantém exit 0 com pending", async (t) => {
  const directory = await createPackage(t, { pending: true });
  const databaseUrl = createDatabaseUrl("database-fixture-password");
  let selectedDatabaseUrl;
  const io = createIo();
  const exitCode = await runCli({
    args: validArguments(directory),
    env: { DATABASE_URL: databaseUrl, DIRECT_URL: createDatabaseUrl("fallback-password") },
    ...io,
    createClient: async ({ databaseUrl: selected }) => {
      selectedDatabaseUrl = selected;
      return createReadOnlyFakeClient();
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(selectedDatabaseUrl, databaseUrl);
  const outputPath = path.join(directory, "reports", "supabase-preflight.json");
  const report = JSON.parse(await readFile(outputPath, "utf8"));
  assert.equal(report.readyForMigration, false);
  assert.equal(report.transactionMode, "READ ONLY");
  assert.equal(report.writesPerformed, false);
  assert.equal(report.blockers[0].reasonCode, "PENDING_MAPPING_EXISTS");
  assert.doesNotMatch(
    `${io.stdout.text}${io.stderr.text}${JSON.stringify(report)}`,
    /database-fixture-password|postgresql:\/\//i,
  );
  assert.deepEqual((await listPackageFiles(directory)).sort(), [
    "mapping/columns.json",
    "mapping/destinations.json",
    "mapping/tables.json",
    "pending-mapping/tables.json",
    "quarantine/summary.json",
    "reports/supabase-preflight.json",
  ]);
});

test("CLI usa DIRECT_URL como fallback e falha tecnicamente sem revelar conexão", async (t) => {
  const directory = await createPackage(t);
  const directUrl = createDatabaseUrl("direct-fixture-password");
  let selectedDatabaseUrl;
  const successIo = createIo();
  const successCode = await runCli({
    args: validArguments(directory),
    env: { DIRECT_URL: directUrl },
    ...successIo,
    createClient: async ({ databaseUrl }) => {
      selectedDatabaseUrl = databaseUrl;
      return createReadOnlyFakeClient();
    },
  });
  assert.equal(successCode, 0);
  assert.equal(selectedDatabaseUrl, directUrl);

  const failureDirectory = await createPackage(t);
  const failureIo = createIo();
  const failureCode = await runCli({
    args: validArguments(failureDirectory),
    env: { DATABASE_URL: createDatabaseUrl("connection-fixture-password") },
    ...failureIo,
    createClient: async () => createReadOnlyFakeClient({ connectError: new Error("ECONNREFUSED") }),
  });
  assert.equal(failureCode, 1);
  assert.doesNotMatch(
    `${failureIo.stdout.text}${failureIo.stderr.text}`,
    /connection-fixture-password|postgresql:\/\//i,
  );
  await assert.rejects(
    readFile(path.join(failureDirectory, "reports", "supabase-preflight.json"), "utf8"),
    /ENOENT/,
  );
});

test("CLI rejeita package ou reports por symlink sem escrever fora do pacote", async (t) => {
  const directory = await createPackage(t);
  const packageAlias = `${directory}-alias`;
  t.after(() => rm(packageAlias, { force: true }));
  await symlink(directory, packageAlias, "dir");
  const aliasIo = createIo();
  assert.equal(
    await runCli({
      args: validArguments(packageAlias),
      env: { DATABASE_URL: createDatabaseUrl() },
      ...aliasIo,
      createClient: async () => createReadOnlyFakeClient(),
    }),
    1,
  );

  const outside = await mkdtemp(path.join(os.tmpdir(), "v4-preflight-outside-"));
  t.after(() => rm(outside, { force: true, recursive: true }));
  await symlink(outside, path.join(directory, "reports"), "dir");
  const reportsIo = createIo();
  assert.equal(
    await runCli({
      args: validArguments(directory),
      env: { DATABASE_URL: createDatabaseUrl() },
      ...reportsIo,
      createClient: async () => createReadOnlyFakeClient(),
    }),
    1,
  );
  assert.deepEqual(await listPackageFiles(outside), []);
});

async function createPackage(t, { pending = false } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "v4-preflight-package-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  for (const relativeDirectory of ["mapping", "pending-mapping", "quarantine"]) {
    await mkdir(path.join(directory, relativeDirectory), { recursive: true });
  }
  const pendingTables = pending
    ? [
        {
          sourceTable: "legacy.pending",
          status: "pending",
          sourceRowCount: 1,
          reasonCode: "NO_CURRENT_CONTRACT",
          reason: "Contrato atual não confirmado.",
          evidence: {
            sourceTable: "legacy.pending",
            legacyModule: "legacy",
            legacyReferences: ["legacy/pending.php:1"],
            operations: ["select"],
            legacyRelationships: [],
            currentContractEvidence: [],
            finalStatus: "pending",
            reasonCode: "NO_CURRENT_CONTRACT",
            reason: "Contrato atual não confirmado.",
            confidence: "low",
            ruleId: null,
          },
        },
      ]
    : [];
  await Promise.all([
    writeJson(path.join(directory, "mapping", "tables.json"), []),
    writeJson(path.join(directory, "mapping", "destinations.json"), []),
    writeJson(path.join(directory, "mapping", "columns.json"), []),
    writeJson(path.join(directory, "pending-mapping", "tables.json"), pendingTables),
    writeJson(path.join(directory, "quarantine", "summary.json"), { unresolved: 0 }),
  ]);
  return directory;
}

function validArguments(directory) {
  return ["--package", directory, "--prisma", PRISMA_FIXTURE, "--organization-id", ORGANIZATION_ID];
}

function createReadOnlyFakeClient({ connectError } = {}) {
  return {
    async connect() {
      if (connectError !== undefined) throw connectError;
    },
    async query(query) {
      const text = typeof query === "string" ? query : query.text;
      if (text.includes("information_schema.columns")) return { rows: [], rowCount: 0 };
      if (text.includes("information_schema.table_constraints")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
}

function createIo() {
  return { stdout: createSink(), stderr: createSink() };
}

function createSink() {
  return {
    text: "",
    write(chunk) {
      this.text += String(chunk);
      return true;
    },
  };
}

function createDatabaseUrl(password = "") {
  const url = new URL("postgresql://localhost/giro");
  url.username = "readonly";
  url.password = password;
  return url.toString();
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function listPackageFiles(directory, relative = "") {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(path.join(directory, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...(await listPackageFiles(directory, child)));
    else files.push(child);
  }
  return files;
}
