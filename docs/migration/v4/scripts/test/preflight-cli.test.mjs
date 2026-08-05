import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../preflight.mjs";

const ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const PRISMA_FIXTURE = new URL("./fixtures/schema-catalog.prisma", import.meta.url).pathname;
const SYNTHETIC_SOURCE_COUNT = 312;

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
      expectedPrismaPath: PRISMA_FIXTURE,
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
    expectedPrismaPath: PRISMA_FIXTURE,
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
  assert.equal(
    report.blockers.some(({ reasonCode }) => reasonCode === "PENDING_MAPPING_EXISTS"),
    true,
  );
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
    "reports/source-inventory.json",
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
    expectedPrismaPath: PRISMA_FIXTURE,
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
    expectedPrismaPath: PRISMA_FIXTURE,
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
      expectedPrismaPath: PRISMA_FIXTURE,
      ...aliasIo,
      createClient: async () => createReadOnlyFakeClient(),
    }),
    1,
  );

  const outside = await mkdtemp(path.join(os.tmpdir(), "v4-preflight-outside-"));
  t.after(() => rm(outside, { force: true, recursive: true }));
  await rm(path.join(directory, "reports"), { force: true, recursive: true });
  await symlink(outside, path.join(directory, "reports"), "dir");
  const reportsIo = createIo();
  assert.equal(
    await runCli({
      args: validArguments(directory),
      env: { DATABASE_URL: createDatabaseUrl() },
      expectedPrismaPath: PRISMA_FIXTURE,
      ...reportsIo,
      createClient: async () => createReadOnlyFakeClient(),
    }),
    1,
  );
  assert.deepEqual(await listPackageFiles(outside), []);
});

test("CLI autentica inventário sintético de 312 origens antes de criar cliente", async (t) => {
  const cases = [
    {
      name: "pacote sem estados finais",
      mutate: async (directory) => {
        await writeJson(path.join(directory, "mapping", "tables.json"), []);
        await writeJson(path.join(directory, "mapping", "destinations.json"), []);
        await writeJson(path.join(directory, "mapping", "columns.json"), []);
        await writeJson(path.join(directory, "pending-mapping", "tables.json"), []);
      },
    },
    {
      name: "origem diferente de 03.08.2026",
      mutate: (directory) =>
        mutateJson(directory, "reports/source-inventory.json", (inventory) => {
          inventory.sourceDirectoryLabel = "backup-incorreto";
        }),
    },
    {
      name: "somente 311 entradas",
      mutate: (directory) =>
        mutateJson(directory, "reports/source-inventory.json", (inventory) => {
          inventory.tables.pop();
          inventory.actualTableCount = 311;
          inventory.expectedTableCount = 311;
          inventory.sourceDigest = sourceDigest(inventory.tables);
        }),
    },
    {
      name: "digest adulterado",
      mutate: (directory) =>
        mutateJson(directory, "reports/source-inventory.json", (inventory) => {
          inventory.sourceDigest = "f".repeat(64);
        }),
    },
    {
      name: "origem ausente da união confirmed mais pending",
      mutate: (directory) =>
        mutateJson(directory, "pending-mapping/tables.json", (pending) => {
          pending.pop();
        }),
    },
    {
      name: "confirmed sem destination step",
      mutate: async (directory) => {
        await writeJson(path.join(directory, "mapping", "destinations.json"), []);
        await writeJson(path.join(directory, "mapping", "columns.json"), []);
      },
    },
  ];

  for (const fixture of cases) {
    const directory = await createPackage(t);
    await fixture.mutate(directory);
    let createCount = 0;
    const io = createIo();
    const exitCode = await runCli({
      args: validArguments(directory),
      env: { DATABASE_URL: createDatabaseUrl() },
      expectedPrismaPath: PRISMA_FIXTURE,
      ...io,
      createClient: async () => {
        createCount += 1;
        return createReadOnlyFakeClient();
      },
    });
    assert.equal(exitCode, 1, fixture.name);
    assert.equal(createCount, 0, fixture.name);
  }
});

test("CLI limita estrutura JSON e confina Prisma mesmo com loader injetado", async (t) => {
  const deepDirectory = await createPackage(t);
  await mutateJson(deepDirectory, "reports/source-inventory.json", (inventory) => {
    let cursor = inventory;
    for (let index = 0; index < 80; index += 1) {
      cursor.extra = {};
      cursor = cursor.extra;
    }
  });
  let createCount = 0;
  assert.equal(
    await runCli({
      args: validArguments(deepDirectory),
      env: { DATABASE_URL: createDatabaseUrl() },
      expectedPrismaPath: PRISMA_FIXTURE,
      ...createIo(),
      createClient: async () => {
        createCount += 1;
        return createReadOnlyFakeClient();
      },
    }),
    1,
  );

  const longStringDirectory = await createPackage(t);
  await mutateJson(longStringDirectory, "reports/source-inventory.json", (inventory) => {
    inventory.extra = "x".repeat(1024 * 1024 + 1);
  });
  let oversizedPayloadScanned = false;
  assert.equal(
    await runCli({
      args: validArguments(longStringDirectory),
      env: { DATABASE_URL: createDatabaseUrl() },
      expectedPrismaPath: PRISMA_FIXTURE,
      inspectSerializedContent(content) {
        if (content.length > 1024 * 1024) oversizedPayloadScanned = true;
      },
      ...createIo(),
      createClient: async () => {
        createCount += 1;
        return createReadOnlyFakeClient();
      },
    }),
    1,
  );
  assert.equal(oversizedPayloadScanned, false);

  const confinedDirectory = await createPackage(t);
  assert.equal(
    await runCli({
      args: validArguments(confinedDirectory),
      env: { DATABASE_URL: createDatabaseUrl() },
      ...createIo(),
      loadCatalog: async () => ({ models: [] }),
      createClient: async () => {
        createCount += 1;
        return createReadOnlyFakeClient();
      },
    }),
    1,
  );
  assert.equal(createCount, 0);
});

test("CLI rejeita symlink de artefato e troca antes do writer sem escrever fora", async (t) => {
  const outside = await mkdtemp(path.join(os.tmpdir(), "v4-preflight-artifact-outside-"));
  t.after(() => rm(outside, { force: true, recursive: true }));
  const externalArtifact = path.join(outside, "external.json");
  await writeJson(externalArtifact, []);

  const linkedDirectory = await createPackage(t);
  const tablesPath = path.join(linkedDirectory, "mapping", "tables.json");
  await rm(tablesPath);
  await symlink(externalArtifact, tablesPath, "file");
  let createCount = 0;
  assert.equal(
    await runCli({
      args: validArguments(linkedDirectory),
      env: { DATABASE_URL: createDatabaseUrl() },
      expectedPrismaPath: PRISMA_FIXTURE,
      ...createIo(),
      createClient: async () => {
        createCount += 1;
        return createReadOnlyFakeClient();
      },
    }),
    1,
  );
  assert.equal(createCount, 0);

  const swappedDirectory = await createPackage(t);
  const swappedPath = path.join(swappedDirectory, "mapping", "tables.json");
  const before = await readFile(externalArtifact, "utf8");
  assert.equal(
    await runCli({
      args: validArguments(swappedDirectory),
      env: { DATABASE_URL: createDatabaseUrl() },
      expectedPrismaPath: PRISMA_FIXTURE,
      ...createIo(),
      createClient: async () => createReadOnlyFakeClient(),
      executePreflight: async () => {
        await rm(swappedPath);
        await symlink(externalArtifact, swappedPath, "file");
        return {
          blockers: [],
          readyForMigration: false,
          transactionMode: "READ ONLY",
          writesPerformed: false,
        };
      },
    }),
    1,
  );
  assert.equal(await readFile(externalArtifact, "utf8"), before);
  await assert.rejects(readFile(path.join(outside, "supabase-preflight.json"), "utf8"), /ENOENT/);
});

async function createPackage(t, { pending = false } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "v4-preflight-package-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  for (const relativeDirectory of ["mapping", "pending-mapping", "quarantine"]) {
    await mkdir(path.join(directory, relativeDirectory), { recursive: true });
  }
  const inventory = createSyntheticInventory();
  const confirmedSource = inventory.tables[0];
  const confirmedMappings = [createConfirmedMapping(confirmedSource)];
  const destinationMappings = [createDestinationMapping(confirmedSource)];
  const pendingTables = inventory.tables.slice(1).map(createPendingMapping);
  if (pending) pendingTables[0].reason = "Contrato atual pendente confirmado pelo fixture.";
  await Promise.all([
    writeJson(path.join(directory, "mapping", "tables.json"), confirmedMappings),
    writeJson(path.join(directory, "mapping", "destinations.json"), destinationMappings),
    writeJson(
      path.join(directory, "mapping", "columns.json"),
      destinationMappings.flatMap(flattenDestinationColumns),
    ),
    writeJson(path.join(directory, "pending-mapping", "tables.json"), pendingTables),
    writeJson(path.join(directory, "quarantine", "summary.json"), { unresolved: 0 }),
    mkdir(path.join(directory, "reports"), { recursive: true }).then(() =>
      writeJson(path.join(directory, "reports", "source-inventory.json"), inventory),
    ),
  ]);
  return directory;
}

function createSyntheticInventory() {
  const tables = Array.from({ length: SYNTHETIC_SOURCE_COUNT }, (_, index) => {
    const sourceTable = `synthetic.source_${String(index).padStart(3, "0")}`;
    return {
      sourceTable,
      fileName: `${sourceTable}.sql`,
      relativePath: `${sourceTable}.sql`,
      fileSizeBytes: index + 1,
      sha256: createHash("sha256").update(`synthetic-${index}`).digest("hex"),
      columns: ["id"],
      rowCount: 1,
      insertStatementCount: 1,
      legacyIdColumn: "id",
      sensitiveColumns: [],
    };
  });
  return {
    sourceDirectoryLabel: "03.08.2026",
    expectedTableCount: SYNTHETIC_SOURCE_COUNT,
    actualTableCount: SYNTHETIC_SOURCE_COUNT,
    sourceDigest: sourceDigest(tables),
    tables,
  };
}

function sourceDigest(tables) {
  const canonical = [...tables]
    .sort((left, right) => left.sourceTable.localeCompare(right.sourceTable))
    .map(({ sourceTable, sha256, rowCount }) => `${sourceTable}\t${sha256}\t${rowCount}`)
    .join("\n");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function createConfirmedMapping(source) {
  return {
    sourceTable: source.sourceTable,
    sourceRowCount: source.rowCount,
    status: "confirmed",
    dependencies: [],
    ruleOrigin: "synthetic-rule",
    reasonCode: "CONTRACT_CONFIRMED",
    reason: "Contrato sintético confirmado.",
    evidence: { current: ["Prisma: projects"], legacy: ["synthetic/legacy.php:1"] },
  };
}

function createDestinationMapping(source) {
  return {
    sourceTable: source.sourceTable,
    stepId: "synthetic-insert",
    destinationTable: "projects",
    mode: "insert",
    identity: { kind: "generate" },
    identityKind: "generate",
    dependencies: [],
    columns: [{ sourceColumn: "id", destinationColumn: "id", status: "mapped" }],
    constants: { organization_id: ORGANIZATION_ID },
    defaults: {},
    readRows: source.rowCount,
    prepared: source.rowCount,
    quarantine: 0,
    notEmitted: 0,
    blockedRows: 0,
  };
}

function flattenDestinationColumns(step) {
  return step.columns.map((column) => ({
    sourceTable: step.sourceTable,
    stepId: step.stepId,
    destinationTable: step.destinationTable,
    ...column,
  }));
}

function createPendingMapping(source) {
  return {
    sourceTable: source.sourceTable,
    status: "pending",
    sourceRowCount: source.rowCount,
    reasonCode: "NO_CURRENT_CONTRACT",
    reason: "Contrato atual não confirmado.",
    evidence: {
      sourceTable: source.sourceTable,
      legacyModule: "synthetic",
      legacyReferences: ["synthetic/pending.php:1"],
      operations: ["select"],
      legacyRelationships: [],
      currentContractEvidence: [],
      finalStatus: "pending",
      reasonCode: "NO_CURRENT_CONTRACT",
      reason: "Contrato atual não confirmado.",
      confidence: "low",
      ruleId: null,
    },
  };
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

async function mutateJson(directory, relativePath, mutate) {
  const filePath = path.join(directory, relativePath);
  const value = JSON.parse(await readFile(filePath, "utf8"));
  mutate(value);
  await writeJson(filePath, value);
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
