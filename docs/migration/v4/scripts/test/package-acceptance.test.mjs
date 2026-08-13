import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { ALL_EVIDENCE } from "../evidence/index.mjs";
import {
  getFieldByDatabaseName,
  getModelByDatabaseName,
  loadPrismaCatalog,
} from "../lib/prisma-catalog.mjs";
import { assertNoSensitiveSerializedContent } from "../lib/sensitivity.mjs";
import { ALL_MAPPING_RULES } from "../runtime/index.mjs";

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "../..");
const PRISMA_PATH = path.resolve(PACKAGE_DIRECTORY, "../../../infra/prisma/schema.prisma");
const CASTELO_ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const EXPECTED_TABLES = 312;
const AUDITABLE_ARTIFACTS = Object.freeze([
  ".gitattributes",
  "README.md",
  "mapping/columns.csv",
  "mapping/columns.json",
  "mapping/destinations.csv",
  "mapping/destinations.json",
  "mapping/tables.csv",
  "mapping/tables.json",
  "pending-mapping/tables.csv",
  "pending-mapping/tables.json",
  "preflight/blocked.csv",
  "preflight/summary.json",
  "quarantine/reasons.csv",
  "quarantine/summary.json",
  "reports/legacy-behavior-analysis.json",
  "reports/legacy-behavior-analysis.md",
  "reports/previous-mapping-comparison.json",
  "reports/semantic-decisions.json",
  "reports/source-inventory.json",
  "reports/supabase-preflight.json",
]);

test("pacote V4 contém todos os artefatos auditáveis obrigatórios", async () => {
  const required = ["manifest.json", ...AUDITABLE_ARTIFACTS];
  for (const relativePath of required) {
    const content = await readArtifact(relativePath);
    assert.notEqual(content.length, 0, `${relativePath} vazio`);
  }
});

test("inventário, decisões e estados finais cobrem exatamente 312 origens únicas", async () => {
  const [inventory, decisions, confirmed, pending] = await Promise.all([
    readJson("reports/source-inventory.json"),
    readJson("reports/semantic-decisions.json"),
    readJson("mapping/tables.json"),
    readJson("pending-mapping/tables.json"),
  ]);

  assert.equal(inventory.actualTableCount, EXPECTED_TABLES);
  assert.equal(inventory.tables.length, EXPECTED_TABLES);
  assertUniqueSources(inventory.tables, "inventário");
  assert.equal(decisions.length, EXPECTED_TABLES);
  assertUniqueSources(decisions, "decisões semânticas");
  assert.deepEqual(decisions, ALL_EVIDENCE);

  const finalStates = [...confirmed, ...pending];
  assert.equal(finalStates.length, EXPECTED_TABLES);
  assertUniqueSources(finalStates, "estados finais");
  assert.deepEqual(
    sortedSources(finalStates),
    sortedSources(inventory.tables),
    "estados finais divergem do inventário",
  );
  assert.equal(
    confirmed.every(({ status }) => status === "confirmed"),
    true,
  );
  assert.equal(
    pending.every(({ status }) => status === "pending"),
    true,
  );

  const decisionBySource = new Map(decisions.map((decision) => [decision.sourceTable, decision]));
  for (const state of finalStates) {
    const evidence = decisionBySource.get(state.sourceTable);
    assert.ok(evidence, `origem sem EvidenceDecision: ${state.sourceTable}`);
    assert.equal(evidence.finalStatus, state.status, state.sourceTable);
    assert.equal(Array.isArray(evidence.legacyReferences), true, state.sourceTable);
    assert.equal(Array.isArray(evidence.currentContractEvidence), true, state.sourceTable);
    assert.equal(typeof evidence.reasonCode, "string", state.sourceTable);
    assert.notEqual(evidence.reasonCode.length, 0, state.sourceTable);
    if (state.status === "confirmed") {
      assert.notEqual(evidence.legacyReferences.length, 0, state.sourceTable);
      assert.notEqual(evidence.currentContractEvidence.length, 0, state.sourceTable);
      assert.equal(typeof evidence.ruleId, "string", state.sourceTable);
    }
  }
});

test("destinos e colunas existem no contrato físico Prisma", async () => {
  const [destinations, columns, prismaCatalog] = await Promise.all([
    readJson("mapping/destinations.json"),
    readJson("mapping/columns.json"),
    loadPrismaCatalog(PRISMA_PATH),
  ]);
  assert.notEqual(destinations.length, 0);
  assert.notEqual(columns.length, 0);

  const destinationKeys = new Set();
  for (const destination of destinations) {
    const key = destinationKey(destination);
    assert.equal(destinationKeys.has(key), false, `destination step duplicado: ${key}`);
    destinationKeys.add(key);
    const model = getModelByDatabaseName(prismaCatalog, destination.destinationTable);
    assert.ok(model, `tabela Prisma ausente: ${destination.destinationTable}`);
    for (const column of destination.columns) {
      if (column.destinationColumn === null) {
        assert.equal(column.status, "not_preserved", destinationKey(destination));
        assert.notEqual(column.reason.length, 0, destinationKey(destination));
        continue;
      }
      assert.ok(
        getFieldByDatabaseName(model, column.destinationColumn),
        `coluna Prisma ausente: ${destination.destinationTable}.${column.destinationColumn}`,
      );
    }
    for (const columnName of [
      ...Object.keys(destination.constants),
      ...Object.keys(destination.defaults),
    ]) {
      assert.ok(
        getFieldByDatabaseName(model, columnName),
        `constante/default Prisma ausente: ${destination.destinationTable}.${columnName}`,
      );
    }
  }

  for (const column of columns) {
    assert.equal(destinationKeys.has(destinationKey(column)), true, "coluna sem destination step");
    const model = getModelByDatabaseName(prismaCatalog, column.destinationTable);
    assert.ok(model, `tabela Prisma ausente: ${column.destinationTable}`);
    if (column.destinationColumn === null) {
      assert.equal(column.status, "not_preserved", destinationKey(column));
      assert.notEqual(column.reason.length, 0, destinationKey(column));
      continue;
    }
    assert.ok(
      getFieldByDatabaseName(model, column.destinationColumn),
      `coluna Prisma ausente: ${column.destinationTable}.${column.destinationColumn}`,
    );
  }
});

test("artefatos gerados são exatamente iguais aos modos do runtime completo", async () => {
  const destinations = await readJson("mapping/destinations.json");
  const generatedModes = Object.fromEntries(
    destinations.map(({ sourceTable, stepId, mode }) => [`${sourceTable}\0${stepId}`, mode]),
  );
  const runtimeModes = Object.fromEntries(
    ALL_MAPPING_RULES.flatMap((rule) =>
      rule.destinations.map(({ stepId, mode }) => [`${rule.sourceTable}\0${stepId}`, mode]),
    ),
  );

  assert.deepEqual(generatedModes, runtimeModes);
});

test("cada destination step fecha todas as linhas lidas em um estado final", async () => {
  const [inventory, confirmed, destinations] = await Promise.all([
    readJson("reports/source-inventory.json"),
    readJson("mapping/tables.json"),
    readJson("mapping/destinations.json"),
  ]);
  const rowCountBySource = new Map(
    inventory.tables.map(({ rowCount, sourceTable }) => [sourceTable, rowCount]),
  );
  const destinationsBySource = Map.groupBy(destinations, ({ sourceTable }) => sourceTable);

  for (const destination of destinations) {
    const expectedRows = rowCountBySource.get(destination.sourceTable);
    assert.equal(destination.readRows, expectedRows, destinationKey(destination));
    assert.equal(
      destination.prepared +
        destination.quarantine +
        destination.notEmitted +
        destination.blockedRows,
      destination.readRows,
      destinationKey(destination),
    );
  }

  for (const table of confirmed) {
    const sourceSteps = destinationsBySource.get(table.sourceTable) ?? [];
    assert.equal(sourceSteps.length, table.destinationStepCount, table.sourceTable);
    assert.equal(table.readRows, rowCountBySource.get(table.sourceTable), table.sourceTable);
    for (const field of ["prepared", "quarantine", "notEmitted", "blockedRows"]) {
      assert.equal(
        table[field],
        sourceSteps.reduce((total, step) => total + step[field], 0),
        `${table.sourceTable}:${field}`,
      );
    }
  }
});

test("preflight real é somente leitura, não escreve e registra o tenant Castelo", async () => {
  const report = await readJson("reports/supabase-preflight.json");
  assert.equal(report.organizationId, CASTELO_ORGANIZATION_ID);
  assert.equal(report.transactionMode, "READ ONLY");
  assert.equal(report.writesPerformed, false);
  assert.equal(typeof report.readyForMigration, "boolean");
});

test("manifesto recompõe identidade, métricas e hashes do pacote", async () => {
  const [manifest, inventory, confirmed, pending, destinations, preflight] = await Promise.all([
    readJson("manifest.json"),
    readJson("reports/source-inventory.json"),
    readJson("mapping/tables.json"),
    readJson("pending-mapping/tables.json"),
    readJson("mapping/destinations.json"),
    readJson("reports/supabase-preflight.json"),
  ]);

  assert.equal(manifest.packageVersion, 4);
  assert.equal(manifest.mode, "dry-run");
  assert.equal(manifest.sourceBackup, "03.08.2026");
  assert.equal(manifest.legacySourceLabel, "workspace2");
  assert.equal(manifest.tenant.organizationId, CASTELO_ORGANIZATION_ID);
  assert.equal(manifest.namespace, "3f68d246-0b54-4a10-9415-a8845a767fb5");
  assert.equal(manifest.sourceDigest, inventory.sourceDigest);
  assert.equal(manifest.sourceTables, EXPECTED_TABLES);
  assert.equal(manifest.preflightExecuted, true);
  assert.equal(manifest.readyForMigration, preflight.readyForMigration);
  assert.equal(manifest.writesPerformed, false);
  assert.deepEqual(
    manifest.counts,
    expectedCounts({ confirmed, destinations, inventory, pending }),
  );
  assert.deepEqual(Object.keys(manifest.hashes).sort(), [...AUDITABLE_ARTIFACTS].sort());

  for (const relativePath of AUDITABLE_ARTIFACTS) {
    assert.match(manifest.hashes[relativePath], /^[a-f0-9]{64}$/);
    assert.equal(
      manifest.hashes[relativePath],
      sha256(await readArtifact(relativePath)),
      relativePath,
    );
  }
});

test("artefatos auditáveis não contêm segredo, dado pessoal bruto nem comandos SQL", async () => {
  for (const relativePath of ["manifest.json", ...AUDITABLE_ARTIFACTS]) {
    const content = await readArtifact(relativePath);
    assertNoSensitiveSerializedContent(content);
    assert.doesNotMatch(
      content,
      /\b(?:rawValue|rawRow|sourcePayload|INSERT\s+INTO)\b/i,
      relativePath,
    );
  }
});

function expectedCounts({ confirmed, destinations, inventory, pending }) {
  const modes = {};
  for (const { mode } of destinations) modes[mode] = (modes[mode] ?? 0) + 1;
  const sums = Object.fromEntries(
    ["prepared", "quarantine", "notEmitted", "blockedRows"].map((field) => [
      field,
      destinations.reduce((total, destination) => total + destination[field], 0),
    ]),
  );
  return {
    origins: inventory.tables.length,
    confirmed: confirmed.length,
    pending: pending.length,
    destinations: destinations.length,
    sourceRows: inventory.tables.reduce((total, table) => total + table.rowCount, 0),
    ...sums,
    modes: Object.fromEntries(
      Object.entries(modes).sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}

function destinationKey({ destinationTable, sourceTable, stepId }) {
  return `${sourceTable}\0${stepId}\0${destinationTable}`;
}

function assertUniqueSources(rows, label) {
  assert.equal(new Set(rows.map(({ sourceTable }) => sourceTable)).size, rows.length, label);
}

function sortedSources(rows) {
  return rows.map(({ sourceTable }) => sourceTable).sort();
}

async function readArtifact(relativePath) {
  return readFile(path.join(PACKAGE_DIRECTORY, relativePath), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await readArtifact(relativePath));
}

function sha256(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
