import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ALL_EVIDENCE, EVIDENCE_REGISTRY } from "../evidence/index.mjs";
import { assertSafePackagePath } from "../lib/mapping-engine.mjs";
import {
  comparePreviousMappings,
  loadPreviousMappingArtifacts,
} from "../lib/previous-comparison.mjs";
import {
  ADMIN_BUSINESS_RULES,
  buildRuleRegistry,
  CERTIFICATE_RULES,
  INTEGRACAO_REGULARIZE_RULES,
  PARCELAMENTO_RULES,
  REMAINING_RULES,
  RH_PESSOAL_RULES,
  TECHNOLOGY_RULES,
} from "../rules/index.mjs";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const CLI = path.resolve("docs/migration/v4/scripts/build-mapping.mjs");
const PRISMA = path.resolve("infra/prisma/schema.prisma");
const VALID_V2_SOURCE_ROWS = Object.freeze({
  adminUsers: 10,
  integracaoClients: 11,
  projectPlans: 12,
  projectPlanTasks: 13,
  projects: 14,
  regularizeClients: 15,
  rhCollaborators: 16,
  taskModels: 17,
  tasks: 18,
});
const VALID_V3_MARKDOWN = `# Migração RH e Departamento Pessoal - Dry-run v3

## Resultado do dry-run

Registros lidos no legado:

| Origem | Registros |
| --- | ---: |
| \`tb_rh.solicitacoes\` | 9 |

## Regra corrigida para solicitacoes RH

O texto editorial cita tb_rh.colaboradores.id\`, nao \`tb_admin.usuarios.id e
rh.requests.requester_user_id, mas não é um registro estrutural de decisão.
`;

function table(sourceTable, columns, rowCount, sha256 = SHA_A) {
  return { sourceTable, columns, rowCount, sha256 };
}

function inventory(version, tables) {
  const sourceDigest = crypto
    .createHash("sha256")
    .update(
      [...tables]
        .sort((left, right) => left.sourceTable.localeCompare(right.sourceTable))
        .map(({ rowCount, sha256, sourceTable }) => `${sourceTable}\t${sha256}\t${rowCount}`)
        .join("\n"),
      "utf8",
    )
    .digest("hex");
  return {
    version,
    origin: `backup/${version}`,
    digest: sourceDigest,
    inventory: {
      sourceDirectoryLabel: version,
      sourceDigest,
      tables,
    },
  };
}

function decision(sourceTable, finalStatus, ruleId = null) {
  return {
    sourceTable,
    finalStatus,
    ruleId,
    reasonCode: finalStatus === "confirmed" ? "CURRENT_CONFIRMED" : "CURRENT_PENDING",
    legacyReferences: [`legacy/${sourceTable}.php:1`],
    currentContractEvidence:
      finalStatus === "confirmed" ? [`infra/prisma/schema.prisma:${sourceTable.length}`] : [],
  };
}

function rule(sourceTable, destinationTable, { mode = "insert", columns = [] } = {}) {
  return {
    sourceTable,
    ruleOrigin: `v4:${sourceTable}`,
    evidence: {
      legacy: [`legacy/${sourceTable}.php:1`],
      current: [`infra/prisma/schema.prisma:${sourceTable.length}`],
    },
    destinations: [
      {
        stepId: `${sourceTable}-step`,
        destinationTable,
        mode,
        identity: { kind: "generate", legacyColumn: "id", scope: sourceTable },
        columns,
      },
    ],
  };
}

function previousArtifact(
  decisions,
  {
    version = "v2",
    origin = `${version}/confirmed-table-destinations.csv`,
    format = origin.endsWith(".md") ? "md" : origin.endsWith(".json") ? "json" : "csv",
    inventoryCounts = [],
    digest = SHA_C,
  } = {},
) {
  return {
    version,
    origin,
    digest,
    sizeBytes: 123,
    format,
    semanticAvailability: "available",
    decisions,
    inventoryCounts,
  };
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: path.resolve("."),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal, stderr, stdout }));
  });
}

async function createCompleteSource(directory) {
  const sourceDir = path.join(directory, "03.08.2026");
  const legacyDir = path.join(directory, "legacy");
  await mkdir(sourceDir);
  await mkdir(path.join(legacyDir, "classes"), { recursive: true });
  await writeFile(path.join(legacyDir, "composer.json"), '{"name":"fixture/legacy"}\n');
  await writeFile(path.join(legacyDir, "login.php"), "<?php // marcador legado\n");
  await writeFile(path.join(legacyDir, "classes", "Painel.php"), "<?php class Painel {}\n");
  for (const evidence of ALL_EVIDENCE) {
    const content =
      evidence.finalStatus === "confirmed"
        ? `INSERT INTO \`${evidence.sourceTable}\` (\`id\`) VALUES (1);\n`
        : "-- origem pending não deve ser executada\n";
    await writeFile(path.join(sourceDir, `${evidence.sourceTable}.sql`), content);
  }
  return { legacyDir, sourceDir };
}

async function createPreviousDocsFixture(directory) {
  const docsDir = path.join(directory, "migration");
  await mkdir(path.join(docsDir, "v2", "pending-mapping"), { recursive: true });
  await mkdir(path.join(docsDir, "v3"), { recursive: true });
  await writeFile(
    path.join(docsDir, "v2", "confirmed-table-destinations.csv"),
    '"legacy_table","target_table"\n"legacy.one","current.one"\n',
  );
  await writeFile(
    path.join(docsDir, "v2", "manifest.json"),
    `${JSON.stringify({ sourceRows: VALID_V2_SOURCE_ROWS })}\n`,
  );
  await writeFile(
    path.join(docsDir, "v2", "pending-mapping", "tables-without-confirmed-destination.json"),
    "[]\n",
  );
  await writeFile(path.join(docsDir, "v3", "rh-pessoal-dry-run.md"), VALID_V3_MARKDOWN);
  return docsDir;
}

test("compara regra reutilizada, corrigida, invalidada e nova sem promover delta físico a mudança semântica", () => {
  const currentInventory = {
    sourceDirectoryLabel: "03.08.2026",
    sourceDigest: SHA_B,
    tables: [
      table("legacy.corrected", ["id"], 3),
      table("legacy.invalidated", ["id"], 4),
      table("legacy.new", ["id"], 1),
      table("legacy.reused", ["descrição", "id", "new_column"], 12, SHA_B),
    ],
  };
  const historicalInventories = [
    inventory("06.07.2026", [
      table("legacy.corrected", ["id"], 3),
      table("legacy.invalidated", ["id"], 4),
      table("legacy.removed", ["id"], 9),
      table("legacy.reused", ["descrição", "id", "removed_column"], 10, SHA_A),
    ]),
  ];
  const evidenceRegistry = new Map([
    ["legacy.corrected", decision("legacy.corrected", "confirmed", "v4:legacy.corrected")],
    ["legacy.invalidated", decision("legacy.invalidated", "pending")],
    ["legacy.new", decision("legacy.new", "confirmed", "v4:legacy.new")],
    ["legacy.reused", decision("legacy.reused", "confirmed", "v4:legacy.reused")],
  ]);
  const ruleRegistry = new Map([
    ["legacy.corrected", rule("legacy.corrected", "current.corrected")],
    ["legacy.new", rule("legacy.new", "current.new")],
    ["legacy.reused", rule("legacy.reused", "current.reused")],
  ]);
  const previousArtifacts = [
    previousArtifact([
      {
        sourceTable: "legacy.corrected",
        status: "confirmed",
        destinations: [{ destinationTable: "old.corrected" }],
      },
      {
        sourceTable: "legacy.invalidated",
        status: "confirmed",
        destinations: [{ destinationTable: "old.invalidated" }],
      },
      {
        sourceTable: "legacy.reused",
        status: "confirmed",
        destinations: [{ destinationTable: "current.reused" }],
      },
    ]),
  ];

  const comparison = comparePreviousMappings({
    currentInventory,
    historicalInventories,
    evidenceRegistry,
    ruleRegistry,
    previousArtifacts,
  });

  assert.deepEqual(
    comparison.tables.map(({ sourceTable }) => sourceTable),
    ["legacy.corrected", "legacy.invalidated", "legacy.new", "legacy.removed", "legacy.reused"],
  );
  assert.deepEqual(comparison.summary.byDecisionStatus, {
    conflict: 0,
    corrected: 1,
    invalidated: 1,
    missing: 1,
    new: 1,
    reused: 1,
  });
  assert.equal(comparison.summary.totalTables, 5);
  assert.equal(
    Object.values(comparison.summary.byDecisionStatus).reduce((sum, count) => sum + count, 0),
    comparison.summary.totalTables,
  );

  const bySource = new Map(comparison.tables.map((entry) => [entry.sourceTable, entry]));
  assert.equal(bySource.get("legacy.corrected").decision.status, "corrected");
  assert.equal(bySource.get("legacy.invalidated").decision.status, "invalidated");
  assert.equal(bySource.get("legacy.new").decision.status, "new");
  assert.equal(bySource.get("legacy.removed").decision.status, "missing");
  assert.equal(bySource.get("legacy.removed").currentDecision, null);
  assert.equal(bySource.get("legacy.reused").decision.status, "reused");

  const physical = bySource.get("legacy.reused").inventoryComparisons[0];
  assert.deepEqual(physical.addedColumns, ["new_column"]);
  assert.deepEqual(physical.removedColumns, ["removed_column"]);
  assert.deepEqual(physical.rowCount, { current: 12, delta: 2, historical: 10 });
  assert.equal(physical.hashChanged, true);
  assert.deepEqual(physical.reasonCodes, [
    "BACKUP_COLUMNS_ADDED",
    "BACKUP_COLUMNS_REMOVED",
    "BACKUP_CONTENT_HASH_CHANGED",
    "BACKUP_ROW_COUNT_CHANGED",
  ]);
  assert.equal(bySource.get("legacy.reused").decision.reasonCode, "PREVIOUS_RULE_REVALIDATED");

  for (const entry of comparison.tables.filter(({ currentDecision }) => currentDecision !== null)) {
    assert.ok(entry.decision.reasonCode.length > 0);
    assert.ok(entry.decision.evidenceRefs.length > 0);
    assert.equal(entry.decision.provenance.length > 0, true);
    assert.equal(
      entry.decision.provenance.every(
        ({ digest, origin, version }) =>
          /^[a-f0-9]{64}$/.test(digest) && origin.length > 0 && version.length > 0,
      ),
      true,
    );
    for (const physicalComparison of entry.inventoryComparisons) {
      assert.match(physicalComparison.version, /^\d{2}\.\d{2}\.\d{4}$/);
      assert.match(physicalComparison.origin, /^backup\//);
      assert.match(physicalComparison.digest, /^[a-f0-9]{64}$/);
      assert.equal(physicalComparison.reasonCodes.length > 0, true);
      assert.equal(physicalComparison.evidenceRefs.length > 0, true);
    }
  }
});

test("resultado é determinístico, reconcilia duplicatas idênticas e materializa conflito histórico", () => {
  const currentInventory = {
    sourceDirectoryLabel: "03.08.2026",
    sourceDigest: SHA_A,
    tables: [table("legacy.one", ["id"], 1)],
  };
  const currentEvidence = decision("legacy.one", "confirmed", "v4:legacy.one");
  const currentRule = rule("legacy.one", "current.one");
  const repeatedDecision = {
    sourceTable: "legacy.one",
    status: "confirmed",
    destinations: [{ destinationTable: "current.one" }],
  };
  const artifact = previousArtifact([repeatedDecision, { ...repeatedDecision }]);
  const input = {
    currentInventory,
    historicalInventories: [
      inventory("10.07.2026", [table("legacy.one", ["id"], 1)]),
      inventory("06.07.2026", [table("legacy.one", ["id"], 1)]),
    ],
    evidenceRegistry: new Map([["legacy.one", currentEvidence]]),
    ruleRegistry: new Map([["legacy.one", currentRule]]),
    previousArtifacts: [artifact],
  };

  const first = comparePreviousMappings(input);
  const second = comparePreviousMappings({
    ...input,
    historicalInventories: [...input.historicalInventories].reverse(),
    previousArtifacts: [...input.previousArtifacts].reverse(),
  });

  assert.deepEqual(first, second);
  assert.equal(first.tables[0].previousDecisions.length, 1);
  assert.deepEqual(
    first.tables[0].inventoryComparisons.map(({ version }) => version),
    ["06.07.2026", "10.07.2026"],
  );

  const conflict = comparePreviousMappings({
    ...input,
    previousArtifacts: [
      previousArtifact([
        repeatedDecision,
        {
          ...repeatedDecision,
          destinations: [{ destinationTable: "other.destination" }],
        },
      ]),
    ],
  });
  assert.equal(conflict.tables[0].currentDecision.destinationTables[0], "current.one");
  assert.equal(conflict.tables[0].decision.status, "conflict");
  assert.equal(conflict.tables[0].decision.reasonCode, "HISTORICAL_DECISION_CONFLICT");
  assert.equal(conflict.tables[0].previousDecisions.length, 2);
  assert.deepEqual(conflict.summary.byDecisionStatus, {
    conflict: 1,
    corrected: 0,
    invalidated: 0,
    missing: 0,
    new: 0,
    reused: 0,
  });
  assert.deepEqual(
    conflict.issues.map(({ reasonCode }) => reasonCode),
    ["HISTORICAL_DECISION_CONFLICT"],
  );
});

test("progressão v2 pending para v3 confirmed igual à V4 é reused sem conflito", () => {
  const sourceTable = "legacy.temporal";
  const input = {
    currentInventory: {
      sourceDirectoryLabel: "03.08.2026",
      sourceDigest: SHA_A,
      tables: [table(sourceTable, ["id"], 1)],
    },
    historicalInventories: [],
    evidenceRegistry: new Map([
      [sourceTable, decision(sourceTable, "confirmed", `v4:${sourceTable}`)],
    ]),
    ruleRegistry: new Map([[sourceTable, rule(sourceTable, "current.temporal")]]),
    previousArtifacts: [
      previousArtifact([{ sourceTable, status: "pending", destinations: [] }], {
        origin: "v2/pending-mapping/tables-without-confirmed-destination.json",
      }),
      previousArtifact(
        [
          {
            sourceTable,
            status: "confirmed",
            destinations: [{ destinationTable: "current.temporal" }],
          },
        ],
        { origin: "v3/rh-pessoal-dry-run.md", version: "v3" },
      ),
    ],
  };

  const comparison = comparePreviousMappings(input);

  assert.equal(comparison.tables[0].decision.status, "reused");
  assert.equal(comparison.tables[0].previousDecisions.length, 2);
  assert.equal(comparison.summary.byDecisionStatus.conflict, 0);
  assert.equal(
    comparison.issues.some(({ reasonCode }) => reasonCode === "HISTORICAL_DECISION_CONFLICT"),
    false,
  );
});

test("decisão equivalente em versões distintas preserva as duas provenances", () => {
  const sourceTable = "legacy.provenance";
  const historicalDecision = {
    sourceTable,
    status: "confirmed",
    destinations: [{ destinationTable: "current.provenance" }],
  };
  const comparison = comparePreviousMappings({
    currentInventory: {
      sourceDirectoryLabel: "03.08.2026",
      sourceDigest: SHA_A,
      tables: [table(sourceTable, ["id"], 1)],
    },
    historicalInventories: [],
    evidenceRegistry: new Map([
      [sourceTable, decision(sourceTable, "confirmed", `v4:${sourceTable}`)],
    ]),
    ruleRegistry: new Map([[sourceTable, rule(sourceTable, "current.provenance")]]),
    previousArtifacts: [
      previousArtifact([historicalDecision]),
      previousArtifact([historicalDecision], {
        origin: "v3/rh-pessoal-dry-run.md",
        version: "v3",
      }),
    ],
  });

  assert.deepEqual(
    comparison.tables[0].previousDecisions.map(({ version }) => version),
    ["v2", "v3"],
  );
  assert.deepEqual(
    comparison.tables[0].decision.provenance
      .filter(({ version }) => version !== "v4")
      .map(({ version }) => version),
    ["v2", "v3"],
  );
});

test("conflito de contagem física gera issue sem promover conflito semântico", () => {
  const sourceTable = "legacy.count";
  const historicalDecision = {
    sourceTable,
    status: "confirmed",
    destinations: [{ destinationTable: "current.count" }],
  };
  const comparison = comparePreviousMappings({
    currentInventory: {
      sourceDirectoryLabel: "03.08.2026",
      sourceDigest: SHA_A,
      tables: [table(sourceTable, ["id"], 1)],
    },
    historicalInventories: [],
    evidenceRegistry: new Map([
      [sourceTable, decision(sourceTable, "confirmed", `v4:${sourceTable}`)],
    ]),
    ruleRegistry: new Map([[sourceTable, rule(sourceTable, "current.count")]]),
    previousArtifacts: [
      previousArtifact([historicalDecision], {
        inventoryCounts: [{ sourceTable, rowCount: 1 }],
      }),
      previousArtifact([], {
        origin: "v2/manifest.json",
        inventoryCounts: [{ sourceTable, rowCount: 2 }],
      }),
    ],
  });

  assert.equal(comparison.tables[0].decision.status, "reused");
  assert.equal(comparison.summary.byDecisionStatus.conflict, 0);
  assert.equal(
    comparison.issues.some(({ reasonCode }) => reasonCode === "HISTORICAL_COUNT_CONFLICT"),
    true,
  );
});

test("provenance histórica incoerente vira issue sanitizada sem descartar inventário válido", () => {
  const currentInventory = {
    sourceDirectoryLabel: "03.08.2026",
    sourceDigest: SHA_A,
    tables: [table("legacy.one", ["id"], 2)],
  };
  const valid = inventory("06.07.2026", [table("legacy.one", ["id"], 1)]);
  const invalid = {
    ...inventory("10.07.2026", [table("legacy.one", ["id"], 3)]),
    origin: "backup/versao-errada",
  };

  const comparison = comparePreviousMappings({
    currentInventory,
    historicalInventories: [invalid, valid],
    evidenceRegistry: new Map([
      ["legacy.one", decision("legacy.one", "confirmed", "v4:legacy.one")],
    ]),
    ruleRegistry: new Map([["legacy.one", rule("legacy.one", "current.one")]]),
    previousArtifacts: [
      previousArtifact([]),
      {
        ...previousArtifact([]),
        origin: "v3/arquivo-forjado.csv",
      },
    ],
  });

  assert.deepEqual(
    comparison.historicalSources.map(({ version }) => version),
    ["06.07.2026"],
  );
  assert.deepEqual(comparison.issues, [
    {
      reasonCode: "HISTORICAL_ARTIFACT_PROVENANCE_CONFLICT",
      scope: "historical-artifact-2",
    },
    {
      reasonCode: "HISTORICAL_INVENTORY_PROVENANCE_CONFLICT",
      scope: "historical-inventory-1",
    },
  ]);
  assert.equal(comparison.artifactSources.length, 1);
  assert.doesNotMatch(JSON.stringify(comparison.issues), /versao-errada|arquivo-forjado|\/home\//i);
});

test("invalida as três decisões históricas comprovadamente incompatíveis com a semântica V4", async () => {
  const ruleRegistry = buildRuleRegistry(
    RH_PESSOAL_RULES,
    TECHNOLOGY_RULES,
    CERTIFICATE_RULES,
    PARCELAMENTO_RULES,
    ADMIN_BUSINESS_RULES,
    INTEGRACAO_REGULARIZE_RULES,
    REMAINING_RULES,
  );
  const selected = [
    "tb_admin.usuarios",
    "tb_regularize.clientes",
    "tb_regularize.orientaoes_processual.socios",
  ];
  const currentInventory = {
    sourceDirectoryLabel: "03.08.2026",
    sourceDigest: SHA_A,
    tables: selected.map((sourceTable) => table(sourceTable, ["id"], 1)),
  };
  const loaded = await loadPreviousMappingArtifacts({
    previousDocsDir: path.resolve("docs/migration"),
  });

  const comparison = comparePreviousMappings({
    currentInventory,
    historicalInventories: [],
    evidenceRegistry: EVIDENCE_REGISTRY,
    ruleRegistry,
    previousArtifacts: loaded.artifacts,
  });
  const bySource = new Map(comparison.tables.map((entry) => [entry.sourceTable, entry]));

  const partners = bySource.get("tb_regularize.orientaoes_processual.socios");
  assert.equal(partners.decision.status, "corrected");
  assert.equal(partners.decision.reasonCode, "ORIENTATION_PARTNERS_MUST_BE_AGGREGATED");
  assert.deepEqual(partners.currentDecision.destinationTables, ["regularize.proceduralGuidances"]);
  assert.doesNotMatch(
    JSON.stringify(partners.currentDecision),
    /regularize\.partners|clients\.pf/i,
  );

  const user = bySource.get("tb_admin.usuarios");
  assert.equal(user.decision.status, "corrected");
  assert.equal(user.decision.reasonCode, "LEGACY_PASSWORD_REQUIRES_CURRENT_BCRYPT_STRATEGY");
  assert.deepEqual(user.currentDecision.securityDecisions, [
    {
      destinationColumn: "password",
      sourceColumn: "password",
      transformation: "select_bcrypt_migration_strategy",
    },
  ]);
  assert.doesNotMatch(JSON.stringify(user), /\$2[aby]\$|plaintext_password|target_id|legacy_id/);
  assert.deepEqual(
    user.artifactCountComparisons.map(({ historicalRowCount, reasonCode, version }) => ({
      historicalRowCount,
      reasonCode,
      version,
    })),
    [
      {
        historicalRowCount: 297,
        reasonCode: "ARTIFACT_ROW_COUNT_CHANGED",
        version: "v2",
      },
      {
        historicalRowCount: 297,
        reasonCode: "ARTIFACT_ROW_COUNT_CHANGED",
        version: "v3",
      },
    ],
  );
  assert.deepEqual(user.artifactCountComparisons[0].evidenceRefs, [
    "v2/manifest.json#tb_admin.usuarios",
  ]);

  const regularizeClient = bySource.get("tb_regularize.clientes");
  assert.equal(regularizeClient.decision.status, "corrected");
  assert.equal(
    regularizeClient.decision.reasonCode,
    "REGULARIZE_CLIENT_REQUIRES_EXPLICIT_CLIENT_ID_CHAIN",
  );
  assert.deepEqual(regularizeClient.currentDecision.identityDecisions, [
    {
      kind: "resolve",
      legacyColumn: "cliente_id",
      sourceTable: "tb_integracao.clientes",
      stepId: "regularize-client-merge",
      targetLegacyColumn: "id",
    },
    {
      kind: "generate",
      legacyColumn: "codigo",
      sourceTable: "tb_regularize.clientes",
      stepId: "regularize-client-insert",
    },
  ]);
});

test("ausência histórica não autoriza hash ou plaintext legado na senha atual", () => {
  const currentRuleRegistry = buildRuleRegistry(
    RH_PESSOAL_RULES,
    TECHNOLOGY_RULES,
    CERTIFICATE_RULES,
    PARCELAMENTO_RULES,
    ADMIN_BUSINESS_RULES,
    INTEGRACAO_REGULARIZE_RULES,
    REMAINING_RULES,
  );
  const original = currentRuleRegistry.get("tb_admin.usuarios");
  const unsafeRule = {
    ...original,
    destinations: original.destinations.map((step) => ({
      ...step,
      columns: step.columns.map((column) =>
        column.sourceColumn === "password"
          ? { ...column, transformation: "reuse_legacy_password_hash" }
          : column,
      ),
    })),
  };

  assert.throws(
    () =>
      comparePreviousMappings({
        currentInventory: {
          sourceDirectoryLabel: "03.08.2026",
          sourceDigest: SHA_A,
          tables: [table("tb_admin.usuarios", ["id", "password"], 1)],
        },
        historicalInventories: [],
        evidenceRegistry: EVIDENCE_REGISTRY,
        ruleRegistry: new Map([["tb_admin.usuarios", unsafeRule]]),
        previousArtifacts: [],
      }),
    /bcrypt segura/i,
  );
});

test("loader lê somente artefatos V2/V3 estáticos allow-listed e retorna provenance sem payload", async () => {
  const loaded = await loadPreviousMappingArtifacts({
    previousDocsDir: path.resolve("docs/migration"),
  });

  assert.deepEqual(
    loaded.artifacts.map(({ origin }) => origin),
    [
      "v2/confirmed-table-destinations.csv",
      "v2/manifest.json",
      "v2/pending-mapping/tables-without-confirmed-destination.json",
      "v3/rh-pessoal-dry-run.md",
    ],
  );
  assert.equal(
    loaded.artifacts.every(({ digest }) => /^[a-f0-9]{64}$/.test(digest)),
    true,
  );
  assert.equal(
    loaded.artifacts.every(({ sizeBytes }) => Number.isSafeInteger(sizeBytes) && sizeBytes > 0),
    true,
  );
  assert.equal(
    loaded.artifacts.every(({ format }) => ["csv", "json", "md"].includes(format)),
    true,
  );
  const v2Rules = loaded.artifacts.find(({ origin }) =>
    origin.endsWith("confirmed-table-destinations.csv"),
  );
  assert.deepEqual(
    v2Rules.decisions.find(
      ({ sourceTable }) => sourceTable === "tb_regularize.orientaoes_processual.socios",
    ).destinations,
    [{ destinationTable: "regularize.partners" }],
  );
  const v3 = loaded.artifacts.find(({ version }) => version === "v3");
  assert.deepEqual(
    v3.inventoryCounts.find(({ sourceTable }) => sourceTable === "tb_rh.solicitacoes"),
    { rowCount: 905, sourceTable: "tb_rh.solicitacoes" },
  );

  const serialized = JSON.stringify({ artifacts: loaded.artifacts, issues: loaded.issues });
  assert.doesNotMatch(
    serialized,
    /transformations\.json|legacy_id|target_id|INSERT INTO|\/home\//i,
  );
  assert.equal(loaded.issues.length, 0);
  assert.deepEqual(
    loaded.protectedPaths.map((filePath) =>
      path.relative(path.resolve("docs/migration"), filePath),
    ),
    [
      "v2/confirmed-table-destinations.csv",
      "v2/manifest.json",
      "v2/pending-mapping/tables-without-confirmed-destination.json",
      "v3/rh-pessoal-dry-run.md",
    ],
  );
});

test("layout oficial protege arquivos históricos exatos sem bloquear package v4", async () => {
  const migrationRoot = path.resolve("docs/migration");
  const loaded = await loadPreviousMappingArtifacts({ previousDocsDir: migrationRoot });

  await assert.doesNotReject(() =>
    assertSafePackagePath({
      packageDir: path.join(migrationRoot, "v4"),
      protectedPaths: loaded.protectedPaths,
    }),
  );
  for (const unsafePackage of [
    migrationRoot,
    path.join(migrationRoot, "v2"),
    path.join(migrationRoot, "v3"),
    loaded.protectedPaths[0],
  ]) {
    await assert.rejects(
      () =>
        assertSafePackagePath({
          packageDir: unsafePackage,
          protectedPaths: loaded.protectedPaths,
        }),
      /package.*origens|coincidir|conter/i,
    );
  }
});

test("loader mantém artefatos válidos diante de UTF-8 fatal, JSON profundo e V3 editorial", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "migration-v4-previous-"));
  try {
    const docsDir = await createPreviousDocsFixture(directory);
    await writeFile(
      path.join(docsDir, "v2", "confirmed-table-destinations.csv"),
      Buffer.from([0xc3, 0x28]),
    );
    let nested = { sourceRows: VALID_V2_SOURCE_ROWS };
    for (let depth = 0; depth < 40; depth += 1) nested = { nested };
    await writeFile(path.join(docsDir, "v2", "manifest.json"), JSON.stringify(nested));
    await writeFile(path.join(docsDir, "v2", "apply.mjs"), "throw new Error('não executar');\n");
    await writeFile(path.join(docsDir, "v2", "dump.sql"), "INSERT INTO secrets VALUES ('x');\n");

    const loaded = await loadPreviousMappingArtifacts({ previousDocsDir: docsDir });

    assert.deepEqual(
      loaded.artifacts.map(({ origin }) => origin),
      ["v2/pending-mapping/tables-without-confirmed-destination.json", "v3/rh-pessoal-dry-run.md"],
    );
    assert.deepEqual(loaded.issues.map(({ reasonCode }) => reasonCode).sort(), [
      "ARTIFACT_INVALID_UTF8",
      "ARTIFACT_JSON_LIMIT_EXCEEDED",
      "ARTIFACT_SEMANTIC_METRICS_ONLY",
    ]);
    const v3 = loaded.artifacts.find(({ version }) => version === "v3");
    assert.deepEqual(v3.decisions, []);
    assert.equal(v3.semanticAvailability, "metrics_only");
    assert.match(await readFile(path.join(docsDir, "v2", "apply.mjs"), "utf8"), /não executar/);
    assert.doesNotMatch(JSON.stringify(loaded), /INSERT INTO|apply\.mjs|dump\.sql|\/home\//i);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("loader limita bytes, nós, chaves, strings, linhas e células por artefato", async () => {
  const oversizedKeys = Object.fromEntries(
    Array.from({ length: 10_001 }, (_, index) => [`key${index}`, index]),
  );
  const cases = [
    {
      origin: "v2/confirmed-table-destinations.csv",
      content: `legacy_table,target_table\n${"x".repeat(513)},current.one\n`,
      reasonCode: "ARTIFACT_CSV_LIMIT_EXCEEDED",
    },
    {
      origin: "v2/manifest.json",
      content: `${JSON.stringify({ sourceRows: VALID_V2_SOURCE_ROWS })}${" ".repeat(300_000)}`,
      reasonCode: "ARTIFACT_MAX_BYTES_EXCEEDED",
    },
    {
      origin: "v2/manifest.json",
      content: JSON.stringify({ sourceRows: VALID_V2_SOURCE_ROWS, value: "x".repeat(4_097) }),
      reasonCode: "ARTIFACT_JSON_LIMIT_EXCEEDED",
    },
    {
      origin: "v2/manifest.json",
      content: JSON.stringify({ extra: oversizedKeys, sourceRows: VALID_V2_SOURCE_ROWS }),
      reasonCode: "ARTIFACT_JSON_LIMIT_EXCEEDED",
    },
    {
      origin: "v2/pending-mapping/tables-without-confirmed-destination.json",
      content: JSON.stringify(Array.from({ length: 20_001 }, () => null)),
      reasonCode: "ARTIFACT_JSON_LIMIT_EXCEEDED",
    },
    {
      origin: "v3/rh-pessoal-dry-run.md",
      content: `${VALID_V3_MARKDOWN}\n${"x".repeat(2_049)}\n`,
      reasonCode: "ARTIFACT_MARKDOWN_LIMIT_EXCEEDED",
    },
    {
      origin: "v3/rh-pessoal-dry-run.md",
      content: `${VALID_V3_MARKDOWN}${"\n".repeat(5_001)}`,
      reasonCode: "ARTIFACT_MARKDOWN_LIMIT_EXCEEDED",
    },
  ];

  for (const [index, fixture] of cases.entries()) {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), `migration-v4-previous-limit-${index}-`),
    );
    try {
      const docsDir = await createPreviousDocsFixture(directory);
      await writeFile(path.join(docsDir, ...fixture.origin.split("/")), fixture.content);
      const loaded = await loadPreviousMappingArtifacts({ previousDocsDir: docsDir });
      assert.equal(
        loaded.issues.some(
          ({ reasonCode, scope }) => reasonCode === fixture.reasonCode && scope === fixture.origin,
        ),
        true,
        fixture.origin,
      );
      assert.equal(loaded.artifacts.length, 3, fixture.origin);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  }
});

test("loader rejeita symlink intermediário por artefato e symlink da raiz integralmente", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "migration-v4-previous-link-"));
  try {
    const docsDir = await createPreviousDocsFixture(directory);
    const external = path.join(directory, "external-pending");
    await mkdir(external);
    await writeFile(path.join(external, "tables-without-confirmed-destination.json"), "[]\n");
    await rm(path.join(docsDir, "v2", "pending-mapping"), { recursive: true });
    await symlink(external, path.join(docsDir, "v2", "pending-mapping"));

    const loaded = await loadPreviousMappingArtifacts({ previousDocsDir: docsDir });
    assert.equal(
      loaded.artifacts.some(({ origin }) => origin.includes("pending-mapping")),
      false,
    );
    assert.equal(
      loaded.issues.some(
        ({ reasonCode, scope }) =>
          reasonCode === "ARTIFACT_PATH_SYMLINK" && scope.includes("pending-mapping"),
      ),
      true,
    );

    const alias = path.join(directory, "migration-alias");
    await symlink(docsDir, alias);
    await assert.rejects(
      () => loadPreviousMappingArtifacts({ previousDocsDir: alias }),
      /diretório real|symlink|confinado/i,
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("CLI gera comparação metadata-only e não bloqueia o pacote quando histórico fica indisponível", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "migration-v4-previous-cli-"));
  try {
    const { legacyDir, sourceDir } = await createCompleteSource(directory);
    const previousSource = path.join(directory, "06.07.2026");
    const packageDir = path.join(directory, "package");
    await mkdir(previousSource);
    await writeFile(
      path.join(previousSource, "tb_admin.departamentos.sql"),
      "INSERT INTO `tb_admin.departamentos` (`id`) VALUES (1);\n",
    );
    const baseArguments = [
      "--source",
      sourceDir,
      "--legacy-source",
      legacyDir,
      "--package",
      packageDir,
      "--prisma",
      PRISMA,
      "--expected-tables",
      "312",
    ];

    const valid = await runCli([
      ...baseArguments,
      "--previous-source",
      previousSource,
      "--previous-docs",
      path.resolve("docs/migration"),
    ]);
    assert.equal(valid.code, 0, valid.stderr);
    assert.equal(valid.stdout, "");
    assert.equal(valid.stderr, "");
    const validReport = JSON.parse(
      await readFile(path.join(packageDir, "reports/previous-mapping-comparison.json"), "utf8"),
    );
    assert.equal(validReport.availability, "available");
    assert.deepEqual(validReport.issues, []);
    assert.equal(validReport.tables.length, 312);
    assert.deepEqual(
      validReport.historicalSources.map(({ version }) => version),
      ["06.07.2026"],
    );
    assert.equal(
      validReport.tables.find(
        ({ sourceTable }) => sourceTable === "tb_regularize.orientaoes_processual.socios",
      ).decision.reasonCode,
      "ORIENTATION_PARTNERS_MUST_BE_AGGREGATED",
    );
    assert.doesNotMatch(JSON.stringify(validReport), /INSERT INTO|legacy_id|target_id|\/home\//i);

    const unavailablePackage = path.join(directory, "package-unavailable-history");
    const unavailable = await runCli([
      ...baseArguments.slice(0, 5),
      unavailablePackage,
      ...baseArguments.slice(6),
      "--previous-source",
      path.join(directory, "backup-ausente"),
      "--previous-docs",
      path.join(directory, "docs-ausentes"),
    ]);
    assert.equal(unavailable.code, 0, unavailable.stderr);
    const unavailableReport = JSON.parse(
      await readFile(
        path.join(unavailablePackage, "reports/previous-mapping-comparison.json"),
        "utf8",
      ),
    );
    assert.equal(unavailableReport.availability, "unavailable");
    assert.deepEqual(unavailableReport.issues.map(({ reasonCode }) => reasonCode).sort(), [
      "HISTORICAL_SOURCE_UNAVAILABLE",
      "PREVIOUS_ARTIFACTS_UNAVAILABLE",
    ]);
    assert.equal(unavailableReport.tables.length, 312);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
