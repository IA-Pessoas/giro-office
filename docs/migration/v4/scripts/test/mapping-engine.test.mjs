import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildMapping,
  validateMappingCompleteness,
  writeMappingPackage,
} from "../lib/mapping-engine.mjs";

const NAMESPACE = "3f68d246-0b54-4a10-9415-a8845a767fb5";

async function withSandbox(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "migration-v4-engine-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function catalogFor(...tables) {
  return {
    models: tables.map((databaseName) => ({
      prismaName: databaseName.replaceAll(".", "_"),
      databaseName,
      fields: [
        {
          model: databaseName,
          prismaName: "id",
          databaseName: "id",
          prismaType: "String",
          nullable: false,
          list: false,
          id: true,
          unique: true,
          relationModel: null,
          relationFields: [],
          relationReferences: [],
        },
      ],
      compoundUnique: [],
      indexes: [],
    })),
  };
}

function columnRule() {
  return {
    sourceColumn: "id",
    destinationColumn: "id",
    status: "mapped",
    transformation: "uuid_v5",
    nullHandling: "quarantine_when_missing",
    referenceRole: "identity",
    sensitivity: "none",
    reason: "Identidade determinística comprovada pela chave legada.",
  };
}

function generateIdentity(scope) {
  return { kind: "generate", legacyColumn: "id", scope, namespace: NAMESPACE };
}

function step({ stepId, destinationTable, mode, identity, precedence = [] }) {
  return {
    stepId,
    destinationTable,
    mode,
    identity,
    columns: [columnRule()],
    constants: {},
    defaults: {},
    precedence,
    dependencies: [],
  };
}

function emission(stepId, destinationTable, status, identityRef, reasonCode = null) {
  return {
    stepId,
    destinationTable,
    status,
    identityRef,
    field: status === "quarantine" ? "id" : null,
    reasonCode,
  };
}

function confirmedEvidence(sourceTable, ruleId) {
  return {
    sourceTable,
    legacyModule: "fixture",
    legacyReferences: ["fixture.php:10"],
    operations: ["select"],
    legacyRelationships: ["id explícito"],
    currentContractEvidence: ["fixture.prisma:1"],
    finalStatus: "confirmed",
    reasonCode: "CURRENT_CONTRACT_CONFIRMED",
    reason: "Contrato atual comprovado pela fixture.",
    confidence: "high",
    ruleId,
  };
}

function pendingEvidence(sourceTable) {
  return {
    sourceTable,
    legacyModule: "fixture",
    legacyReferences: ["fixture.php:20"],
    operations: ["select"],
    legacyRelationships: [],
    currentContractEvidence: [],
    finalStatus: "pending",
    reasonCode: "NO_CURRENT_CONTRACT",
    reason: "Não há contrato atual fiel para esta origem.",
    confidence: "high",
    ruleId: null,
  };
}

async function createFixture(directory) {
  const sourceDir = path.join(directory, "source");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(
    path.join(sourceDir, "legacy.multi.sql"),
    "INSERT INTO `legacy.multi` (`id`, `password`) VALUES (1, 'SENTINEL_RAW_SECRET'), (2, 'SENTINEL_RAW_SECRET_2');\n",
  );
  await writeFile(
    path.join(sourceDir, "legacy.pending.sql"),
    "CONTEUDO INVALIDO QUE NAO DEVE SER LIDO;\n",
  );

  const destinations = [
    step({
      stepId: "insert",
      destinationTable: "target.insert",
      mode: "insert",
      identity: generateIdentity("insert"),
    }),
    step({
      stepId: "merge",
      destinationTable: "target.merge",
      mode: "merge",
      identity: {
        kind: "resolve",
        sourceTable: "legacy.parent",
        sourceColumn: "id",
        targetLegacyColumn: "id",
      },
      precedence: ["explicit_legacy_link"],
    }),
    step({
      stepId: "derived",
      destinationTable: "target.derived",
      mode: "derived",
      identity: generateIdentity("derived"),
    }),
    step({
      stepId: "aggregate",
      destinationTable: "target.aggregate",
      mode: "aggregate",
      identity: {
        kind: "aggregate",
        parentSourceTable: "legacy.parent",
        parentLegacyColumn: "id",
        childForeignKey: "id",
      },
    }),
  ];
  const rule = {
    sourceTable: "legacy.multi",
    status: "confirmed",
    domain: "fixture",
    ruleOrigin: "fixture:legacy.multi",
    evidence: { legacy: ["fixture.php:10"], current: ["fixture.prisma:1"] },
    cardinality: "1:N",
    dependencies: [],
    destinations,
    classifySourceRow() {
      return { status: "prepared" };
    },
    emitRows(row) {
      const id = String(row.id);
      return [
        emission("insert", "target.insert", "prepared", `legacy.multi:${id}`),
        emission("merge", "target.merge", "prepared", `legacy.parent:${id}`),
        emission(
          "derived",
          "target.derived",
          id === "1" ? "quarantine" : "prepared",
          `legacy.multi:${id}:derived`,
          id === "1" ? "DERIVED_REFERENCE_MISSING" : null,
        ),
        emission("aggregate", "target.aggregate", "prepared", `legacy.parent:${id}`),
      ];
    },
  };
  const inventory = {
    sourceDirectoryLabel: "source",
    expectedTableCount: 2,
    actualTableCount: 2,
    sourceDigest: "fixture-digest",
    tables: [
      {
        sourceTable: "legacy.multi",
        fileName: "legacy.multi.sql",
        relativePath: "legacy.multi.sql",
        fileSizeBytes: 120,
        sha256: "a".repeat(64),
        columns: ["id", "password"],
        rowCount: 2,
        insertStatementCount: 1,
        legacyIdColumn: "id",
        sensitiveColumns: ["password"],
      },
      {
        sourceTable: "legacy.pending",
        fileName: "legacy.pending.sql",
        relativePath: "legacy.pending.sql",
        fileSizeBytes: 40,
        sha256: "b".repeat(64),
        columns: [],
        rowCount: 7,
        insertStatementCount: 0,
        legacyIdColumn: null,
        sensitiveColumns: [],
      },
    ],
  };

  return {
    sourceDir,
    inventory,
    evidenceRegistry: new Map([
      ["legacy.multi", confirmedEvidence("legacy.multi", rule.ruleOrigin)],
      ["legacy.pending", pendingEvidence("legacy.pending")],
    ]),
    ruleRegistry: new Map([["legacy.multi", rule]]),
    prismaCatalog: catalogFor(...destinations.map(({ destinationTable }) => destinationTable)),
  };
}

async function readPackageFiles(packageDir) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolutePath);
      else files.push(path.relative(packageDir, absolutePath));
    }
  }
  await visit(packageDir);
  files.sort();
  return new Map(
    await Promise.all(
      files.map(async (relativePath) => [
        relativePath,
        await readFile(path.join(packageDir, relativePath), "utf8"),
      ]),
    ),
  );
}

test("buildMapping fecha insert, merge, derived e aggregate por linha sem reter payload", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);

    const result = await buildMapping({ ...fixture, capabilities: {} });

    assert.equal(validateMappingCompleteness(result, fixture.inventory), true);
    assert.equal(result.tableMappings.length, 1);
    assert.equal(result.pendingTables.length, 1);
    assert.equal(result.destinationMappings.length, 4);
    assert.deepEqual(
      result.destinationMappings.map(({ stepId, mode, prepared, quarantine, notEmitted }) => ({
        stepId,
        mode,
        prepared,
        quarantine,
        notEmitted,
      })),
      [
        { stepId: "aggregate", mode: "aggregate", prepared: 2, quarantine: 0, notEmitted: 0 },
        { stepId: "derived", mode: "derived", prepared: 1, quarantine: 1, notEmitted: 0 },
        { stepId: "insert", mode: "insert", prepared: 2, quarantine: 0, notEmitted: 0 },
        { stepId: "merge", mode: "merge", prepared: 2, quarantine: 0, notEmitted: 0 },
      ],
    );
    assert.deepEqual(result.quarantineItems, [
      {
        sourceTable: "legacy.multi",
        legacyIdRef: "1",
        stepId: "derived",
        field: "id",
        reasonCode: "DERIVED_REFERENCE_MISSING",
        destinationTable: "target.derived",
        decisionStatus: "unresolved",
      },
    ]);
    assert.doesNotMatch(JSON.stringify(result), /SENTINEL_RAW_SECRET|password/i);
  });
});

test("buildMapping fecha emissão ausente como not_emitted e rejeita passo duplicado", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const originalEmitRows = fixture.ruleRegistry.get("legacy.multi").emitRows;
    fixture.ruleRegistry.get("legacy.multi").emitRows = (row, context) =>
      originalEmitRows(row, context).filter(({ stepId }) => stepId !== "aggregate");

    const result = await buildMapping({ ...fixture, capabilities: {} });
    const aggregate = result.destinationMappings.find(({ stepId }) => stepId === "aggregate");
    assert.deepEqual(
      {
        prepared: aggregate.prepared,
        quarantine: aggregate.quarantine,
        notEmitted: aggregate.notEmitted,
      },
      { prepared: 0, quarantine: 0, notEmitted: 2 },
    );

    const duplicateFixture = await createFixture(path.join(directory, "duplicate"));
    const duplicateRule = duplicateFixture.ruleRegistry.get("legacy.multi");
    const emitRows = duplicateRule.emitRows;
    duplicateRule.emitRows = (row, context) => {
      const emissions = emitRows(row, context);
      return [...emissions, emissions[0]];
    };
    await assert.rejects(
      () => buildMapping({ ...duplicateFixture, capabilities: {} }),
      /emissão duplicada/i,
    );
  });
});

test("buildMapping rejeita EvidenceDecision confirmed incompleta antes de ler o dump", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const evidence = fixture.evidenceRegistry.get("legacy.multi");
    fixture.evidenceRegistry.set("legacy.multi", {
      ...evidence,
      currentContractEvidence: [],
    });

    await assert.rejects(
      () => buildMapping({ ...fixture, capabilities: {} }),
      /confirmed.*evidências/i,
    );
  });
});

test("buildMapping rejeita tenant diferente ou ausente em insert tenant-scoped", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const rule = fixture.ruleRegistry.get("legacy.multi");
    rule.destinations[0].constants.organization_id = "11111111-1111-4111-8111-111111111111";
    fixture.prismaCatalog.models[0].fields.push({
      model: "target.insert",
      prismaName: "organization_id",
      databaseName: "organization_id",
      prismaType: "String",
      nullable: false,
      list: false,
      id: false,
      unique: false,
      relationModel: null,
      relationFields: [],
      relationReferences: [],
    });

    await assert.rejects(
      () => buildMapping({ ...fixture, capabilities: {} }),
      /tenant divergente/i,
    );

    const missingFixture = await createFixture(path.join(directory, "missing"));
    missingFixture.prismaCatalog.models[0].fields.push({
      model: "target.insert",
      prismaName: "organization_id",
      databaseName: "organization_id",
      prismaType: "String",
      nullable: false,
      list: false,
      id: false,
      unique: false,
      relationModel: null,
      relationFields: [],
      relationReferences: [],
    });
    await assert.rejects(
      () => buildMapping({ ...missingFixture, capabilities: {} }),
      /tenant.*ausente/i,
    );
  });
});

test("writeMappingPackage gera artefatos determinísticos e sem linha ou payload legado", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const result = await buildMapping({ ...fixture, capabilities: {} });
    const first = path.join(directory, "package-a");
    const second = path.join(directory, "package-b");

    await writeMappingPackage(first, result);
    await writeMappingPackage(second, result);

    const firstFiles = await readPackageFiles(first);
    const secondFiles = await readPackageFiles(second);
    assert.deepEqual(firstFiles, secondFiles);
    assert.deepEqual(
      [...firstFiles.keys()],
      [
        "mapping/columns.csv",
        "mapping/columns.json",
        "mapping/destinations.csv",
        "mapping/destinations.json",
        "mapping/tables.csv",
        "mapping/tables.json",
        "pending-mapping/tables.csv",
        "pending-mapping/tables.json",
        "quarantine/reasons.csv",
        "quarantine/summary.json",
      ],
    );
    const serialized = [...firstFiles.values()].join("\n");
    assert.doesNotMatch(serialized, /SENTINEL_RAW_SECRET|rawValue|payload|INSERT INTO/i);
    assert.match(firstFiles.get("quarantine/reasons.csv"), /legacy\.multi,1,derived/);
  });
});

test("writeMappingPackage aborta conteúdo sensível, preserva pacote anterior e limpa só o temporário", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const result = await buildMapping({ ...fixture, capabilities: {} });
    const packageDir = path.join(directory, "package");
    await mkdir(packageDir);
    await writeFile(path.join(packageDir, "sentinel.txt"), "PACKAGE_ANTERIOR\n");
    for (const secret of [
      ["postgresql", "://usuario:", "SUPER_SECRET_VALUE", "@db.example/base"].join(""),
      '{"password":"SUPER_SECRET_VALUE"}',
      "INSERT INTO clients (id) VALUES (1)",
    ]) {
      const unsafe = {
        ...result,
        tableMappings: result.tableMappings.map((mapping, index) =>
          index === 0 ? { ...mapping, reason: secret } : mapping,
        ),
      };

      await assert.rejects(
        () => writeMappingPackage(packageDir, unsafe),
        (error) => {
          assert.match(error.message, /sensivel/i);
          assert.equal(error.message.includes("SUPER_SECRET_VALUE"), false);
          return true;
        },
      );
    }

    assert.equal(
      await readFile(path.join(packageDir, "sentinel.txt"), "utf8"),
      "PACKAGE_ANTERIOR\n",
    );
    assert.deepEqual(await readdir(directory), ["package", "source"]);
  });
});
