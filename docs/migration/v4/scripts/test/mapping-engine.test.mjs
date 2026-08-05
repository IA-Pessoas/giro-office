import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdirSync, renameSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildMapping,
  createConservativeMappingContextProvider,
  validateMappingCompleteness,
  writeMappingPackage,
} from "../lib/mapping-engine.mjs";
import {
  comparePreviousMappings,
  createAuthenticatedPreviousMappingReport,
  validateAuthenticatedPreviousMappingReport,
} from "../lib/previous-comparison.mjs";
import { assertNoSensitiveSerializedContent, toLegacyIdRef } from "../lib/sensitivity.mjs";
import {
  createNodeFileSystemAdapter,
  serializeCsv,
  writeFileSetAtomically,
} from "../lib/stable-output.mjs";

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

function explicitCondition(stepId, outcome) {
  return {
    stepId,
    outcome,
    conditionId: `${stepId}:${outcome}`,
    predicate: {
      kind: "decision_outcome_equals",
      source: "emit_rows",
      value: outcome,
    },
  };
}

function explicitStepContract(stepId) {
  return {
    contextRequirements: [],
    decisionSource: "emit_rows",
    preparedWhen: explicitCondition(stepId, "prepared"),
    quarantineWhen: explicitCondition(stepId, "quarantine"),
    notEmittedWhen: explicitCondition(stepId, "not_emitted"),
  };
}

function explicitContextFreeContract(stepIds = ["insert", "merge", "derived", "aggregate"]) {
  return {
    contextMode: "context_free",
    steps: Object.fromEntries(stepIds.map((stepId) => [stepId, explicitStepContract(stepId)])),
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
  const confirmedDump =
    "INSERT INTO `legacy.multi` (`id`, `password`) VALUES (1, 'SENTINEL_RAW_SECRET'), (2, 'SENTINEL_RAW_SECRET_2');\n";
  const pendingDump = "CONTEUDO INVALIDO QUE NAO DEVE SER LIDO;\n";
  await writeFile(path.join(sourceDir, "legacy.multi.sql"), confirmedDump);
  await writeFile(path.join(sourceDir, "legacy.pending.sql"), pendingDump);

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
    executionContract: explicitContextFreeContract(),
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
          Number(id) % 2 === 1 ? "quarantine" : "prepared",
          `legacy.multi:${id}:derived`,
          Number(id) % 2 === 1 ? "DERIVED_REFERENCE_MISSING" : null,
        ),
        emission("aggregate", "target.aggregate", "prepared", `legacy.parent:${id}`),
      ];
    },
  };
  const inventory = {
    sourceDirectoryLabel: "source",
    expectedTableCount: 2,
    actualTableCount: 2,
    sourceDigest: "a".repeat(64),
    tables: [
      {
        sourceTable: "legacy.multi",
        fileName: "legacy.multi.sql",
        relativePath: "legacy.multi.sql",
        fileSizeBytes: Buffer.byteLength(confirmedDump),
        sha256: crypto.createHash("sha256").update(confirmedDump).digest("hex"),
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
        fileSizeBytes: Buffer.byteLength(pendingDump),
        sha256: crypto.createHash("sha256").update(pendingDump).digest("hex"),
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

function contextProviderFor(fixture) {
  return createConservativeMappingContextProvider({
    inventory: fixture.inventory,
    ruleRegistry: fixture.ruleRegistry,
  });
}

function buildFixtureMapping(fixture) {
  return buildMapping({ ...fixture, capabilities: contextProviderFor(fixture) });
}

function authenticatedReportFor(fixture, overrides = {}) {
  const currentInventory = overrides.currentInventory ?? fixture.inventory;
  const evidenceRegistry = overrides.evidenceRegistry ?? fixture.evidenceRegistry;
  const ruleRegistry = overrides.ruleRegistry ?? fixture.ruleRegistry;
  const comparison = comparePreviousMappings({
    currentInventory,
    historicalInventories: overrides.historicalInventories ?? [],
    evidenceRegistry,
    ruleRegistry,
    prismaCatalog: overrides.prismaCatalog ?? fixture.prismaCatalog,
    previousArtifacts: overrides.previousArtifacts ?? [],
  });
  return createAuthenticatedPreviousMappingReport({
    comparison,
    availability: overrides.availability ?? "not_requested",
    issues: overrides.issues ?? [],
  });
}

function authenticatedBindingsFor(fixture) {
  return {
    inventory: fixture.inventory,
    evidenceRegistry: fixture.evidenceRegistry,
    ruleRegistry: fixture.ruleRegistry,
    prismaCatalog: fixture.prismaCatalog,
  };
}

async function replaceDumpAndInventory(fixture, sourceTable, content, rowCount) {
  const inspection = fixture.inventory.tables.find((table) => table.sourceTable === sourceTable);
  await writeFile(path.join(fixture.sourceDir, inspection.relativePath), content);
  inspection.fileSizeBytes = Buffer.byteLength(content);
  inspection.sha256 = crypto.createHash("sha256").update(content).digest("hex");
  inspection.rowCount = rowCount;
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

    const result = await buildFixtureMapping(fixture);

    assert.equal(validateMappingCompleteness(result, fixture), true);
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
    assert.deepEqual(result.quarantineReasons, [
      {
        sourceTable: "legacy.multi",
        stepId: "derived",
        field: "id",
        reasonCode: "DERIVED_REFERENCE_MISSING",
        destinationTable: "target.derived",
        count: 1,
      },
    ]);
    assert.equal(result.preflightComplete, false);
    assert.equal(result.readyForMigration, false);
    assert.doesNotMatch(JSON.stringify(result), /SENTINEL_RAW_SECRET|password/i);
  });
});

test("buildMapping valida hash e tamanho de todas as origens, inclusive pending", async () => {
  await withSandbox(async (directory) => {
    for (const sourceTable of ["legacy.multi", "legacy.pending"]) {
      const fixture = await createFixture(path.join(directory, sourceTable.replace(".", "-")));
      const inspection = fixture.inventory.tables.find(
        (table) => table.sourceTable === sourceTable,
      );
      const dumpPath = path.join(fixture.sourceDir, inspection.relativePath);
      const original = await readFile(dumpPath, "utf8");
      const altered =
        sourceTable === "legacy.multi"
          ? original.replaceAll("SENTINEL", "REPLACED")
          : `${original}ALTERACAO_SIGILOSA_QUE_NAO_PODE_APARECER_NO_ERRO\n`;
      if (sourceTable === "legacy.multi") {
        assert.equal(Buffer.byteLength(altered), Buffer.byteLength(original));
      }
      await writeFile(dumpPath, altered);
      const sensitiveMarker =
        sourceTable === "legacy.multi" ? "REPLACED_RAW_SECRET" : "ALTERACAO_SIGILOSA";

      await assert.rejects(
        () => buildFixtureMapping(fixture),
        (error) => {
          assert.equal(error.code, "DUMP_INTEGRITY_MISMATCH");
          assert.equal(error.sourceTable, sourceTable);
          assert.equal(error.message.includes(sensitiveMarker), false);
          assert.equal(error.message.includes(fixture.sourceDir), false);
          assert.equal(JSON.stringify(error).includes(sensitiveMarker), false);
          return true;
        },
      );
    }
  });
});

test("buildMapping aborta troca TOCTOU com mesmo número de linhas sem vazar SQL", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const dumpPath = path.join(fixture.sourceDir, "legacy.multi.sql");
    const original = await readFile(dumpPath, "utf8");
    const replacement = original.replaceAll("SENTINEL", "REPLACED");
    assert.equal(Buffer.byteLength(replacement), Buffer.byteLength(original));
    let hookCalls = 0;

    await assert.rejects(
      () =>
        buildMapping({
          ...fixture,
          capabilities: contextProviderFor(fixture),
          integrityHooks: {
            async afterInitialValidation({ sourceTable }) {
              if (sourceTable !== "legacy.multi") return;
              hookCalls += 1;
              await writeFile(dumpPath, replacement);
            },
          },
        }),
      (error) => {
        assert.equal(error.code, "DUMP_INTEGRITY_CHANGED");
        assert.equal(error.sourceTable, "legacy.multi");
        assert.equal(error.message.includes("REPLACED_RAW_SECRET"), false);
        assert.equal(error.message.includes(fixture.sourceDir), false);
        assert.equal(JSON.stringify(error).includes("REPLACED_RAW_SECRET"), false);
        return true;
      },
    );
    assert.equal(hookCalls, 1);
  });
});

test("buildMapping não reabre substituto após rename do diretório pai", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const sourceDir = fixture.sourceDir;
    const displacedDir = path.join(directory, "source-original");
    const replacementDir = path.join(directory, "source-replacement");
    const dumpPath = path.join(sourceDir, "legacy.multi.sql");
    const original = await readFile(dumpPath, "utf8");
    const replacement = original.replace("(1,", "(7,").replace("(2,", "(8,");
    assert.equal(Buffer.byteLength(replacement), Buffer.byteLength(original));
    const observedIds = [];
    let restored = false;
    const rule = fixture.ruleRegistry.get("legacy.multi");
    const originalEmitRows = rule.emitRows;
    rule.emitRows = (row) => {
      observedIds.push(row.id);
      if (!restored) {
        renameSync(sourceDir, replacementDir);
        renameSync(displacedDir, sourceDir);
        restored = true;
      }
      return originalEmitRows(row);
    };

    const result = await buildMapping({
      ...fixture,
      capabilities: contextProviderFor(fixture),
      integrityHooks: {
        async afterInitialValidation({ sourceTable }) {
          if (sourceTable !== "legacy.multi") return;
          renameSync(sourceDir, displacedDir);
          mkdirSync(sourceDir);
          await writeFile(path.join(sourceDir, "legacy.multi.sql"), replacement);
        },
      },
    });

    assert.equal(result.tableMappings[0].readRows, 2);
    assert.deepEqual(observedIds, ["1", "2"]);
  });
});

test("buildMapping detecta modificação tardia de origem confirmed e pending", async () => {
  await withSandbox(async (directory) => {
    for (const sourceTable of ["legacy.multi", "legacy.pending"]) {
      const fixture = await createFixture(path.join(directory, sourceTable.replace(".", "-")));
      const inspection = fixture.inventory.tables.find(
        (table) => table.sourceTable === sourceTable,
      );
      const dumpPath = path.join(fixture.sourceDir, inspection.relativePath);
      const original = await readFile(dumpPath, "utf8");
      const altered =
        sourceTable === "legacy.multi"
          ? original.replaceAll("SENTINEL", "REPLACED")
          : original.replace("INVALIDO", "ALTERADO");
      assert.equal(Buffer.byteLength(altered), Buffer.byteLength(original));

      await assert.rejects(
        () =>
          buildMapping({
            ...fixture,
            capabilities: contextProviderFor(fixture),
            integrityHooks: {
              async beforeFinalValidation() {
                await writeFile(dumpPath, altered);
              },
            },
          }),
        (error) => {
          assert.equal(error.code, "DUMP_INTEGRITY_CHANGED");
          assert.equal(error.sourceTable, sourceTable);
          assert.equal(error.message.includes(fixture.sourceDir), false);
          assert.equal(error.message.includes("REPLACED_RAW_SECRET"), false);
          return true;
        },
      );
    }
  });
});

test("buildMapping exige decisão explícita por step e rejeita passo duplicado", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const originalEmitRows = fixture.ruleRegistry.get("legacy.multi").emitRows;
    fixture.ruleRegistry.get("legacy.multi").emitRows = (row, context) =>
      originalEmitRows(row, context).filter(({ stepId }) => stepId !== "aggregate");

    await assert.rejects(() => buildFixtureMapping(fixture), /decisão explícita.*aggregate/i);

    const duplicateFixture = await createFixture(path.join(directory, "duplicate"));
    const duplicateRule = duplicateFixture.ruleRegistry.get("legacy.multi");
    const emitRows = duplicateRule.emitRows;
    duplicateRule.emitRows = (row, context) => {
      const emissions = emitRows(row, context);
      return [...emissions, emissions[0]];
    };
    await assert.rejects(() => buildFixtureMapping(duplicateFixture), /emissão duplicada/i);
  });
});

test("motor expõe somente provider conservador oficial e rejeita providers forjados", async () => {
  await withSandbox(async (directory) => {
    const engineModule = await import("../lib/mapping-engine.mjs");
    assert.equal("createMappingContextProvider" in engineModule, false);
    assert.equal(typeof engineModule.createConservativeMappingContextProvider, "function");

    const fixture = await createFixture(directory);
    for (const capabilities of [
      undefined,
      {},
      { credentialEncryptionVerified: true },
      { ...contextProviderFor(fixture) },
    ]) {
      await assert.rejects(
        () => buildMapping({ ...fixture, capabilities }),
        /provider.*autenticado/i,
      );
    }

    const provider = contextProviderFor(fixture);
    assert.equal(Object.isFrozen(provider), true);
    assert.equal(Reflect.set(provider, "credentialEncryptionVerified", true), false);

    const mutations = [
      () => fixture.inventory.tables[0].columns.push("adulterada"),
      () => {
        fixture.inventory.tables[0].relativePath = "outro.sql";
      },
      () => {
        fixture.ruleRegistry.get("legacy.multi").destinations[0].identity.scope = "mutated";
      },
      () => {
        fixture.ruleRegistry.get("legacy.multi").classifySourceRow = () => ({ status: "mutated" });
      },
      () => {
        fixture.ruleRegistry.get("legacy.multi").emitRows = () => [];
      },
    ];
    for (const mutate of mutations) {
      const changedFixture = await createFixture(path.join(directory, crypto.randomUUID()));
      const changedProvider = contextProviderFor(changedFixture);
      fixture.inventory = changedFixture.inventory;
      fixture.ruleRegistry = changedFixture.ruleRegistry;
      mutate();
      await assert.rejects(
        () => buildMapping({ ...fixture, capabilities: changedProvider }),
        /provider.*(?:inventário|registry|regra|snapshot)/i,
      );
    }
  });
});

test("regra sem contrato explícito fica preflight_blocked sem chamar callbacks ou quarantine", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const rule = fixture.ruleRegistry.get("legacy.multi");
    delete rule.executionContract;
    let callbackCalls = 0;
    rule.classifySourceRow = () => {
      callbackCalls += 1;
      throw new Error("classificador bloqueado não pode executar");
    };
    rule.emitRows = () => {
      callbackCalls += 1;
      throw new Error("emissor bloqueado não pode executar");
    };

    const result = await buildFixtureMapping(fixture);

    assert.equal(callbackCalls, 0);
    assert.equal(result.quarantineSummary.total, 0);
    assert.deepEqual(result.quarantineReasons, []);
    assert.equal(result.preflightSummary.totalBlockedRows, 8);
    assert.equal(result.preflightSummary.blockedSources, 1);
    assert.equal(result.preflightSummary.blockedSteps, 4);
    assert.equal(result.preflightBlocks.length, 4);
    assert.equal(
      result.destinationMappings.every(
        ({ blockedRows, prepared, quarantine, notEmitted, preflightState }) =>
          blockedRows === 2 &&
          prepared === 0 &&
          quarantine === 0 &&
          notEmitted === 0 &&
          preflightState === "preflight_blocked",
      ),
      true,
    );
    assert.equal(
      result.preflightBlocks.every(
        ({ count, reasonCode }) =>
          count === 2 && reasonCode === "RUNTIME_CLASSIFIER_PREFLIGHT_REQUIRED",
      ),
      true,
    );
  });
});

test("origem confirmed vazia preserva bloqueio por step com contagem zero no pacote", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    await replaceDumpAndInventory(fixture, "legacy.multi", "-- origem confirmada vazia\n", 0);
    delete fixture.ruleRegistry.get("legacy.multi").executionContract;

    const result = await buildFixtureMapping(fixture);
    const packageDir = path.join(directory, "package");
    await writeMappingPackage(packageDir, result, { protectedPaths: [fixture.sourceDir] });

    assert.equal(result.tableMappings[0].preflightState, "preflight_blocked");
    assert.equal(result.tableMappings[0].readRows, 0);
    assert.equal(result.preflightSummary.totalBlockedRows, 0);
    assert.equal(result.preflightSummary.blockedSources, 1);
    assert.equal(result.preflightSummary.blockedSteps, 4);
    assert.equal(result.preflightBlocks.length, 4);
    assert.equal(
      result.preflightBlocks.every(({ count }) => count === 0),
      true,
    );
    assert.equal(
      result.destinationMappings.every(
        ({ readRows, prepared, quarantine, notEmitted, blockedRows, preflightState }) =>
          readRows === 0 &&
          prepared === 0 &&
          quarantine === 0 &&
          notEmitted === 0 &&
          blockedRows === 0 &&
          preflightState === "preflight_blocked",
      ),
      true,
    );
    assert.match(await readFile(path.join(packageDir, "preflight/blocked.csv"), "utf8"), /,0\r?$/m);
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

    await assert.rejects(() => buildFixtureMapping(fixture), /confirmed.*evidências/i);
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

    await assert.rejects(() => buildFixtureMapping(fixture), /tenant divergente/i);

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
    await assert.rejects(() => buildFixtureMapping(missingFixture), /tenant.*ausente/i);
  });
});

test("writeMappingPackage gera artefatos determinísticos e sem linha ou payload legado", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const result = await buildFixtureMapping(fixture);
    const first = path.join(directory, "package-a");
    const second = path.join(directory, "package-b");

    await writeMappingPackage(first, result, { protectedPaths: [fixture.sourceDir] });
    await writeMappingPackage(second, result, { protectedPaths: [fixture.sourceDir] });

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
        "preflight/blocked.csv",
        "preflight/summary.json",
        "quarantine/reasons.csv",
        "quarantine/summary.json",
        "reports/semantic-decisions.json",
      ],
    );
    const serialized = [...firstFiles.values()].join("\n");
    assert.doesNotMatch(serialized, /SENTINEL_RAW_SECRET|rawValue|payload|INSERT INTO/i);
    assert.match(firstFiles.get("quarantine/reasons.csv"), /legacy\.multi,derived/);
    assert.deepEqual(
      JSON.parse(firstFiles.get("reports/semantic-decisions.json")),
      [...fixture.evidenceRegistry.values()].sort((left, right) =>
        left.sourceTable.localeCompare(right.sourceTable),
      ),
    );
    const destinations = JSON.parse(firstFiles.get("mapping/destinations.json"));
    const merge = destinations.find(({ stepId }) => stepId === "merge");
    assert.deepEqual(merge.identity, {
      kind: "resolve",
      sourceTable: "legacy.parent",
      sourceColumn: "id",
      targetLegacyColumn: "id",
    });
    assert.deepEqual(merge.constants, {});
    assert.deepEqual(merge.defaults, {});
    assert.deepEqual(merge.columns, [columnRule()]);
    assert.equal(merge.emissionContract.kind, "declarative");
    assert.equal(merge.emissionContract.decisionSource, "emit_rows");
    assert.equal(merge.emissionContract.decisionRequiredPerSourceRow, true);
    assert.equal(merge.emissionContract.omissionPolicy, "error");
    assert.equal(merge.emissionContract.runtimeClassifierRequired, false);
    for (const [field, outcome] of [
      ["preparedWhen", "prepared"],
      ["quarantineWhen", "quarantine"],
      ["notEmittedWhen", "not_emitted"],
    ]) {
      const { conditionDigest, ...condition } = merge.emissionContract.conditions[field];
      assert.deepEqual(condition, explicitCondition("merge", outcome));
      assert.match(conditionDigest, /^[a-f0-9]{64}$/);
    }
    assert.deepEqual(merge.contextContract, {
      declared: true,
      mode: "context_free",
      requirements: [],
    });
    assert.deepEqual(merge.contractOrigin, {
      ruleOrigin: "fixture:legacy.multi",
      stepId: "merge",
      classifyRef: "fixture:legacy.multi#classifySourceRow",
      emitRef: "fixture:legacy.multi#emitRows",
    });
    assert.match(merge.contractDigest, /^[a-f0-9]{64}$/);
    assert.match(merge.runtimeClassifier.classifyDigest, /^[a-f0-9]{64}$/);
    assert.match(merge.runtimeClassifier.emitDigest, /^[a-f0-9]{64}$/);
    const insert = destinations.find(({ stepId }) => stepId === "insert");
    assert.deepEqual(
      insert.emissionContract.conditions.preparedWhen.predicate,
      merge.emissionContract.conditions.preparedWhen.predicate,
    );
    assert.notEqual(
      insert.emissionContract.conditions.preparedWhen.conditionDigest,
      merge.emissionContract.conditions.preparedWhen.conditionDigest,
    );
    assert.equal(
      new Set(
        destinations.flatMap(({ emissionContract }) =>
          Object.values(emissionContract.conditions).map(({ conditionDigest }) => conditionDigest),
        ),
      ).size,
      12,
    );
    assert.equal(
      new Set(destinations.map(({ emissionContract }) => JSON.stringify(emissionContract))).size,
      4,
    );
    assert.doesNotMatch(serialized, /classifySourceRow\s*\(|emitRows\s*\(|=>/);
  });
});

test("relatório histórico participa do mesmo commit atômico e extra files são allow-listed", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const result = await buildFixtureMapping(fixture);
    const packageDir = path.join(directory, "package");
    const reportPath = "reports/previous-mapping-comparison.json";
    const manualReport = {
      availability: "available",
      issues: [],
      schemaVersion: 1,
      summary: {
        byDecisionStatus: {
          conflict: 0,
          corrected: 0,
          invalidated: 0,
          missing: 0,
          new: 0,
          reused: 1,
        },
        totalTables: 1,
      },
      tables: [],
    };
    const report = authenticatedReportFor(fixture, {
      availability: "available",
      previousArtifacts: [
        {
          version: "v2",
          origin: "v2/pending-mapping/tables-without-confirmed-destination.json",
          digest: "c".repeat(64),
          sizeBytes: 2,
          format: "json",
          semanticAvailability: "available",
          decisions: [
            {
              sourceTable: "legacy.removed",
              status: "pending",
              destinations: [],
            },
          ],
          inventoryCounts: [],
        },
      ],
    });

    await writeMappingPackage(packageDir, result, {
      protectedPaths: [fixture.sourceDir],
      extraArtifacts: { [reportPath]: report },
    });
    assert.deepEqual(JSON.parse(await readFile(path.join(packageDir, reportPath), "utf8")), report);
    assert.equal(
      report.tables.some(
        ({ currentInventory, decision, sourceTable }) =>
          sourceTable === "legacy.removed" &&
          currentInventory === null &&
          decision.status === "missing",
      ),
      true,
    );

    const beforeUnsafe = await readPackageFiles(packageDir);
    await assert.rejects(
      () =>
        writeMappingPackage(packageDir, result, {
          protectedPaths: [fixture.sourceDir],
          extraArtifacts: { [reportPath]: manualReport },
        }),
      /relatório.*autenticado|proveniência.*relatório/i,
    );
    assert.deepEqual(await readPackageFiles(packageDir), beforeUnsafe);

    await assert.rejects(
      () =>
        writeMappingPackage(packageDir, result, {
          protectedPaths: [fixture.sourceDir],
          extraArtifacts: { [reportPath]: structuredClone(report) },
        }),
      /relatório.*autenticado|proveniência.*relatório/i,
    );
    assert.deepEqual(await readPackageFiles(packageDir), beforeUnsafe);

    assert.throws(() => {
      report.summary.totalTables = 1;
    }, TypeError);
    assert.throws(
      () =>
        authenticatedReportFor(fixture, {
          availability: "partial",
          issues: [{ scope: "fixture@example.test", reasonCode: "PREVIOUS_ARTIFACTS_UNAVAILABLE" }],
        }),
      /sensivel/i,
    );

    const singleInventory = {
      ...fixture.inventory,
      expectedTableCount: 1,
      actualTableCount: 1,
      sourceDigest: "b".repeat(64),
      tables: [fixture.inventory.tables[0]],
    };
    const singleReport = authenticatedReportFor(fixture, {
      currentInventory: singleInventory,
      evidenceRegistry: new Map([["legacy.multi", fixture.evidenceRegistry.get("legacy.multi")]]),
      ruleRegistry: new Map([["legacy.multi", fixture.ruleRegistry.get("legacy.multi")]]),
    });
    await assert.rejects(
      () =>
        writeMappingPackage(packageDir, result, {
          protectedPaths: [fixture.sourceDir],
          extraArtifacts: { [reportPath]: singleReport },
        }),
      /inventário.*relatório|cobertura.*relatório|proveniência.*relatório/i,
    );
    assert.deepEqual(await readPackageFiles(packageDir), beforeUnsafe);

    await assert.rejects(
      () =>
        writeMappingPackage(packageDir, result, {
          protectedPaths: [fixture.sourceDir],
          extraArtifacts: { "reports/outro.json": report },
        }),
      /allow-list|artefato extra/i,
    );
    assert.deepEqual(await readPackageFiles(packageDir), beforeUnsafe);

    const baseAdapter = createNodeFileSystemAdapter();
    const reportWriteFailure = {
      ...baseAdapter,
      async writeFile(target, content, encoding) {
        if (target.endsWith(reportPath)) throw new Error("injected-report-write-failure");
        return baseAdapter.writeFile(target, content, encoding);
      },
    };
    const partialReport = authenticatedReportFor(fixture, {
      availability: "unavailable",
      issues: [{ scope: "previous-docs", reasonCode: "PREVIOUS_ARTIFACTS_UNAVAILABLE" }],
    });
    await assert.rejects(
      () =>
        writeMappingPackage(packageDir, result, {
          protectedPaths: [fixture.sourceDir],
          extraArtifacts: { [reportPath]: partialReport },
          fileSystem: reportWriteFailure,
        }),
      /pacote anterior preservado|commit atômico/i,
    );
    assert.deepEqual(await readPackageFiles(packageDir), beforeUnsafe);

    await writeMappingPackage(packageDir, result, { protectedPaths: [fixture.sourceDir] });
    await assert.rejects(() => readFile(path.join(packageDir, reportPath), "utf8"), /ENOENT/);
  });
});

test("relatório autenticado exige as mesmas bindings de evidence, rules e Prisma", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const result = await buildFixtureMapping(fixture);
    const packageDir = path.join(directory, "package");
    const reportPath = "reports/previous-mapping-comparison.json";
    const officialReport = authenticatedReportFor(fixture);
    await writeMappingPackage(packageDir, result, {
      protectedPaths: [fixture.sourceDir],
      extraArtifacts: { [reportPath]: officialReport },
    });
    const beforeRejected = await readPackageFiles(packageDir);

    const alternativeEvidenceRegistry = new Map(fixture.evidenceRegistry);
    alternativeEvidenceRegistry.set("legacy.multi", {
      ...fixture.evidenceRegistry.get("legacy.multi"),
      currentContractEvidence: ["fixture.prisma:2"],
    });
    const alternativeRuleRegistry = new Map(fixture.ruleRegistry);
    const registryReport = authenticatedReportFor(fixture, {
      evidenceRegistry: alternativeEvidenceRegistry,
      ruleRegistry: alternativeRuleRegistry,
    });
    await assert.rejects(
      () =>
        writeMappingPackage(packageDir, result, {
          protectedPaths: [fixture.sourceDir],
          extraArtifacts: { [reportPath]: registryReport },
        }),
      /evidence|rule|registry|bindings|proveniência.*relatório/i,
    );
    assert.deepEqual(await readPackageFiles(packageDir), beforeRejected);

    const prismaReport = authenticatedReportFor(fixture, {
      prismaCatalog: structuredClone(fixture.prismaCatalog),
    });
    await assert.rejects(
      () =>
        writeMappingPackage(packageDir, result, {
          protectedPaths: [fixture.sourceDir],
          extraArtifacts: { [reportPath]: prismaReport },
        }),
      /prisma|bindings|proveniência.*relatório/i,
    );
    assert.deepEqual(await readPackageFiles(packageDir), beforeRejected);

    const originalEmitRows = fixture.ruleRegistry.get("legacy.multi").emitRows;
    fixture.ruleRegistry.get("legacy.multi").emitRows = () => [];
    try {
      assert.throws(
        () =>
          validateAuthenticatedPreviousMappingReport(officialReport, {
            inventory: fixture.inventory,
            evidenceRegistry: fixture.evidenceRegistry,
            ruleRegistry: fixture.ruleRegistry,
            prismaCatalog: fixture.prismaCatalog,
          }),
        /integridade.*(?:rule|registry)|snapshot.*(?:rule|registry)/i,
      );
    } finally {
      fixture.ruleRegistry.get("legacy.multi").emitRows = originalEmitRows;
    }
    assert.doesNotMatch(JSON.stringify(officialReport), /function\s*\(|=>|SENTINEL_RAW_SECRET/);
  });
});

test("snapshot tipado distingue callback de objeto descritor equivalente", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const rule = fixture.ruleRegistry.get("legacy.multi");
    const originalEmitRows = rule.emitRows;
    const report = authenticatedReportFor(fixture);
    rule.emitRows = {
      kind: "function",
      name: originalEmitRows.name,
      digest: crypto
        .createHash("sha256")
        .update(Function.prototype.toString.call(originalEmitRows), "utf8")
        .digest("hex"),
    };
    try {
      assert.throws(
        () => validateAuthenticatedPreviousMappingReport(report, authenticatedBindingsFor(fixture)),
        /integridade|snapshot|tipo|função/i,
      );
    } finally {
      rule.emitRows = originalEmitRows;
    }
    assert.equal(
      validateAuthenticatedPreviousMappingReport(report, authenticatedBindingsFor(fixture)),
      true,
    );
  });
});

test("snapshot tipado distingue Map de array estruturalmente equivalente", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const rule = fixture.ruleRegistry.get("legacy.multi");
    const originalProbe = new Map([["probe", "value"]]);
    rule.provenanceProbe = originalProbe;
    const report = authenticatedReportFor(fixture);
    rule.provenanceProbe = [["probe", "value"]];
    try {
      assert.throws(
        () => validateAuthenticatedPreviousMappingReport(report, authenticatedBindingsFor(fixture)),
        /integridade|snapshot|tipo|map|array/i,
      );
    } finally {
      rule.provenanceProbe = originalProbe;
    }
    assert.equal(
      validateAuthenticatedPreviousMappingReport(report, authenticatedBindingsFor(fixture)),
      true,
    );
    delete rule.provenanceProbe;
  });
});

test("proveniência exige a referência exata de callback mesmo com source idêntico", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const rule = fixture.ruleRegistry.get("legacy.multi");
    const originalEmitRows = rule.emitRows;
    const createCallback = () => function sameSourceCallback() {};
    const authenticatedCallback = createCallback();
    const clonedCallback = createCallback();
    assert.notEqual(authenticatedCallback, clonedCallback);
    assert.equal(
      Function.prototype.toString.call(authenticatedCallback),
      Function.prototype.toString.call(clonedCallback),
    );
    rule.emitRows = authenticatedCallback;
    const report = authenticatedReportFor(fixture);
    rule.emitRows = clonedCallback;
    try {
      assert.throws(
        () => validateAuthenticatedPreviousMappingReport(report, authenticatedBindingsFor(fixture)),
        /integridade|snapshot|referência|função/i,
      );
    } finally {
      rule.emitRows = authenticatedCallback;
    }
    assert.equal(
      validateAuthenticatedPreviousMappingReport(report, authenticatedBindingsFor(fixture)),
      true,
    );
    rule.emitRows = originalEmitRows;
  });
});

test("snapshot detecta alteração do length do callback e aceita estado restaurado", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const callback = fixture.ruleRegistry.get("legacy.multi").emitRows;
    const originalDescriptor = Object.getOwnPropertyDescriptor(callback, "length");
    const report = authenticatedReportFor(fixture);
    Object.defineProperty(callback, "length", { ...originalDescriptor, value: 2 });
    try {
      assert.throws(
        () => validateAuthenticatedPreviousMappingReport(report, authenticatedBindingsFor(fixture)),
        /integridade|snapshot|descriptor|length|função/i,
      );
    } finally {
      Object.defineProperty(callback, "length", originalDescriptor);
    }
    assert.equal(
      validateAuthenticatedPreviousMappingReport(report, authenticatedBindingsFor(fixture)),
      true,
    );
  });
});

test("snapshot rejeita propriedade extra no prototype padrão do callback", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const rule = fixture.ruleRegistry.get("legacy.multi");
    const originalEmitRows = rule.emitRows;
    function callbackWithPrototype(row) {
      return originalEmitRows.call(this, row);
    }
    rule.emitRows = callbackWithPrototype;
    const report = authenticatedReportFor(fixture);
    callbackWithPrototype.prototype.probe = true;
    try {
      assert.throws(
        () => validateAuthenticatedPreviousMappingReport(report, authenticatedBindingsFor(fixture)),
        /integridade|snapshot|prototype|propriedade/i,
      );
    } finally {
      delete callbackWithPrototype.prototype.probe;
    }
    assert.equal(
      validateAuthenticatedPreviousMappingReport(report, authenticatedBindingsFor(fixture)),
      true,
    );
    rule.emitRows = originalEmitRows;
  });
});

test("snapshot exige a referência exata do prototype padrão do callback", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const rule = fixture.ruleRegistry.get("legacy.multi");
    const originalEmitRows = rule.emitRows;
    function callbackWithPrototype(row) {
      return originalEmitRows.call(this, row);
    }
    rule.emitRows = callbackWithPrototype;
    const originalPrototype = callbackWithPrototype.prototype;
    const report = authenticatedReportFor(fixture);
    const clonedPrototype = {};
    Object.defineProperty(
      clonedPrototype,
      "constructor",
      Object.getOwnPropertyDescriptor(originalPrototype, "constructor"),
    );
    callbackWithPrototype.prototype = clonedPrototype;
    try {
      assert.throws(
        () => validateAuthenticatedPreviousMappingReport(report, authenticatedBindingsFor(fixture)),
        /integridade|snapshot|prototype|referência/i,
      );
    } finally {
      callbackWithPrototype.prototype = originalPrototype;
    }
    assert.equal(
      validateAuthenticatedPreviousMappingReport(report, authenticatedBindingsFor(fixture)),
      true,
    );
    rule.emitRows = originalEmitRows;
  });
});

test("snapshot detecta flags completas dos descritores de função", async (context) => {
  await context.test("writable de length", async () => {
    await withSandbox(async (directory) => {
      const fixture = await createFixture(directory);
      const callback = fixture.ruleRegistry.get("legacy.multi").emitRows;
      const descriptor = Object.getOwnPropertyDescriptor(callback, "length");
      const report = authenticatedReportFor(fixture);
      Object.defineProperty(callback, "length", { ...descriptor, writable: true });
      try {
        assert.throws(
          () =>
            validateAuthenticatedPreviousMappingReport(report, authenticatedBindingsFor(fixture)),
          /integridade|snapshot|descriptor|writable|função/i,
        );
      } finally {
        Object.defineProperty(callback, "length", descriptor);
      }
      assert.equal(
        validateAuthenticatedPreviousMappingReport(report, authenticatedBindingsFor(fixture)),
        true,
      );
    });
  });

  await context.test("configurable de name", async () => {
    await withSandbox(async (directory) => {
      const fixture = await createFixture(directory);
      const rule = fixture.ruleRegistry.get("legacy.multi");
      const originalEmitRows = rule.emitRows;
      const officialReport = authenticatedReportFor(fixture);
      function descriptorCallback(row) {
        return originalEmitRows.call(this, row);
      }
      rule.emitRows = descriptorCallback;
      const report = authenticatedReportFor(fixture);
      const descriptor = Object.getOwnPropertyDescriptor(descriptorCallback, "name");
      Object.defineProperty(descriptorCallback, "name", { ...descriptor, configurable: false });
      try {
        assert.throws(
          () =>
            validateAuthenticatedPreviousMappingReport(report, authenticatedBindingsFor(fixture)),
          /integridade|snapshot|descriptor|configurable|função/i,
        );
      } finally {
        rule.emitRows = originalEmitRows;
      }
      assert.equal(
        validateAuthenticatedPreviousMappingReport(
          officialReport,
          authenticatedBindingsFor(fixture),
        ),
        true,
      );
    });
  });

  await context.test("writable do descriptor prototype", async () => {
    await withSandbox(async (directory) => {
      const fixture = await createFixture(directory);
      const rule = fixture.ruleRegistry.get("legacy.multi");
      const originalEmitRows = rule.emitRows;
      const officialReport = authenticatedReportFor(fixture);
      function descriptorCallback(row) {
        return originalEmitRows.call(this, row);
      }
      rule.emitRows = descriptorCallback;
      const report = authenticatedReportFor(fixture);
      const descriptor = Object.getOwnPropertyDescriptor(descriptorCallback, "prototype");
      Object.defineProperty(descriptorCallback, "prototype", { ...descriptor, writable: false });
      try {
        assert.throws(
          () =>
            validateAuthenticatedPreviousMappingReport(report, authenticatedBindingsFor(fixture)),
          /integridade|snapshot|descriptor|prototype|writable/i,
        );
      } finally {
        rule.emitRows = originalEmitRows;
      }
      assert.equal(
        validateAuthenticatedPreviousMappingReport(
          officialReport,
          authenticatedBindingsFor(fixture),
        ),
        true,
      );
    });
  });

  await context.test("writable do constructor do prototype", async () => {
    await withSandbox(async (directory) => {
      const fixture = await createFixture(directory);
      const rule = fixture.ruleRegistry.get("legacy.multi");
      const originalEmitRows = rule.emitRows;
      function descriptorCallback(row) {
        return originalEmitRows.call(this, row);
      }
      rule.emitRows = descriptorCallback;
      const report = authenticatedReportFor(fixture);
      const descriptor = Object.getOwnPropertyDescriptor(
        descriptorCallback.prototype,
        "constructor",
      );
      Object.defineProperty(descriptorCallback.prototype, "constructor", {
        ...descriptor,
        writable: false,
      });
      try {
        assert.throws(
          () =>
            validateAuthenticatedPreviousMappingReport(report, authenticatedBindingsFor(fixture)),
          /integridade|snapshot|constructor|descriptor|writable/i,
        );
      } finally {
        Object.defineProperty(descriptorCallback.prototype, "constructor", descriptor);
      }
      assert.equal(
        validateAuthenticatedPreviousMappingReport(report, authenticatedBindingsFor(fixture)),
        true,
      );
      rule.emitRows = originalEmitRows;
    });
  });
});

test("snapshot detecta preventExtensions em função, prototype e containers", async (context) => {
  for (const target of ["function", "prototype", "plain object", "array", "Map"]) {
    await context.test(target, async () => {
      await withSandbox(async (directory) => {
        const fixture = await createFixture(directory);
        const rule = fixture.ruleRegistry.get("legacy.multi");
        const originalEmitRows = rule.emitRows;
        const officialReport = authenticatedReportFor(fixture);
        let report;
        let restore;

        if (target === "function" || target === "prototype") {
          function extensibilityCallback(row) {
            return originalEmitRows.call(this, row);
          }
          rule.emitRows = extensibilityCallback;
          report = authenticatedReportFor(fixture);
          Object.preventExtensions(
            target === "function" ? extensibilityCallback : extensibilityCallback.prototype,
          );
          restore = () => {
            rule.emitRows = originalEmitRows;
          };
        } else {
          const value =
            target === "plain object"
              ? { nested: { value: "probe" } }
              : target === "array"
                ? ["probe"]
                : new Map([["probe", "value"]]);
          rule.provenanceProbe = value;
          report = authenticatedReportFor(fixture);
          const mutated = target === "plain object" ? value.nested : value;
          Object.preventExtensions(mutated);
          restore = () => {
            rule.provenanceProbe =
              target === "plain object"
                ? { nested: { value: "probe" } }
                : target === "array"
                  ? ["probe"]
                  : new Map([["probe", "value"]]);
          };
        }

        try {
          assert.throws(
            () =>
              validateAuthenticatedPreviousMappingReport(report, authenticatedBindingsFor(fixture)),
            /integridade|snapshot|extens|prototype|função|binding/i,
          );
        } finally {
          restore();
        }
        if (target === "function" || target === "prototype") {
          assert.equal(
            validateAuthenticatedPreviousMappingReport(
              officialReport,
              authenticatedBindingsFor(fixture),
            ),
            true,
          );
        } else {
          assert.equal(
            validateAuthenticatedPreviousMappingReport(report, authenticatedBindingsFor(fixture)),
            true,
          );
          delete rule.provenanceProbe;
        }
      });
    });
  }
});

test("MappingResult rejeita mutação de callback anterior à criação do relatório", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const result = await buildFixtureMapping(fixture);
    const packageDir = path.join(directory, "package");
    const reportPath = "reports/previous-mapping-comparison.json";
    const officialReport = authenticatedReportFor(fixture);
    await writeMappingPackage(packageDir, result, {
      protectedPaths: [fixture.sourceDir],
      extraArtifacts: { [reportPath]: officialReport },
    });
    const previousPackage = await readPackageFiles(packageDir);

    const callback = fixture.ruleRegistry.get("legacy.multi").emitRows;
    const descriptor = Object.getOwnPropertyDescriptor(callback, "length");
    Object.defineProperty(callback, "length", { ...descriptor, value: 2 });
    const mutatedReport = authenticatedReportFor(fixture);
    try {
      await assert.rejects(
        () =>
          writeMappingPackage(packageDir, result, {
            protectedPaths: [fixture.sourceDir],
            extraArtifacts: { [reportPath]: mutatedReport },
          }),
        /proveniência|provider|snapshot|binding|callback|registry/i,
      );
    } finally {
      Object.defineProperty(callback, "length", descriptor);
    }

    assert.deepEqual(await readPackageFiles(packageDir), previousPackage);
    await writeMappingPackage(packageDir, result, {
      protectedPaths: [fixture.sourceDir],
      extraArtifacts: { [reportPath]: officialReport },
    });
    assert.deepEqual(await readPackageFiles(packageDir), previousPackage);
  });
});

test("snapshot rejeita valores sem representação canônica", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const rule = fixture.ruleRegistry.get("legacy.multi");
    class CustomValue {
      constructor() {
        this.value = "custom";
      }
    }
    const cases = [
      ["undefined", undefined],
      ["NaN", Number.NaN],
      ["Infinity", Number.POSITIVE_INFINITY],
      ["Symbol", Symbol("probe")],
      ["Date", new Date(0)],
      ["Set", new Set(["probe"])],
      ["RegExp", /probe/u],
      ["Buffer", Buffer.from("probe")],
      ["custom prototype", new CustomValue()],
    ];
    for (const [label, value] of cases) {
      rule.provenanceProbe = value;
      assert.throws(
        () => authenticatedReportFor(fixture),
        /binding|snapshot|canônic|suportado|tipo|finito|symbol|prototype/i,
        label,
      );
      delete rule.provenanceProbe;
    }
  });
});

test("snapshot rejeita accessors e propriedades inesperadas sem invocar getter", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const rule = fixture.ruleRegistry.get("legacy.multi");
    let getterCalls = 0;
    Object.defineProperty(rule, "provenanceProbe", {
      configurable: true,
      enumerable: true,
      get() {
        getterCalls += 1;
        return "probe";
      },
    });
    try {
      assert.throws(
        () => authenticatedReportFor(fixture),
        /accessor|binding|snapshot|propriedade/i,
      );
    } finally {
      delete rule.provenanceProbe;
    }
    assert.equal(getterCalls, 0);

    const symbolKey = Symbol("probe");
    rule[symbolKey] = "value";
    try {
      assert.throws(() => authenticatedReportFor(fixture), /symbol|binding|snapshot|propriedade/i);
    } finally {
      delete rule[symbolKey];
    }

    Object.defineProperty(rule, "provenanceProbe", {
      configurable: true,
      enumerable: false,
      value: "probe",
    });
    try {
      assert.throws(() => authenticatedReportFor(fixture), /enumer|binding|snapshot|propriedade/i);
    } finally {
      delete rule.provenanceProbe;
    }
  });
});

test("snapshot rejeita propriedades custom e chaves Map canonicamente duplicadas", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const rule = fixture.ruleRegistry.get("legacy.multi");
    const customArray = ["probe"];
    customArray.extra = "value";
    rule.provenanceProbe = customArray;
    assert.throws(() => authenticatedReportFor(fixture), /array|binding|snapshot|propriedade/i);

    const customMap = new Map([["probe", "value"]]);
    customMap.extra = "value";
    rule.provenanceProbe = customMap;
    assert.throws(() => authenticatedReportFor(fixture), /map|binding|snapshot|propriedade/i);

    rule.provenanceProbe = new Map([
      [{ id: 1 }, "first"],
      [{ id: 1 }, "second"],
    ]);
    assert.throws(() => authenticatedReportFor(fixture), /map|chave|duplicad|ambígu/i);
    delete rule.provenanceProbe;
  });
});

test("writer revalida MappingResult depois do último await antes de materializar", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const result = await buildFixtureMapping(fixture);
    const packageDir = path.join(directory, "package");
    const reportPath = "reports/previous-mapping-comparison.json";
    const officialReport = authenticatedReportFor(fixture);
    await writeMappingPackage(packageDir, result, {
      protectedPaths: [fixture.sourceDir],
      extraArtifacts: { [reportPath]: officialReport },
    });
    const beforeRejected = await readPackageFiles(packageDir);

    const originalEvidence = fixture.evidenceRegistry.get("legacy.multi");
    const alternativeEvidence = {
      ...originalEvidence,
      currentContractEvidence: ["fixture.prisma:2"],
    };
    fixture.evidenceRegistry.set("legacy.multi", alternativeEvidence);
    const alternativeReport = authenticatedReportFor(fixture);
    fixture.evidenceRegistry.set("legacy.multi", originalEvidence);

    let rejection;
    const write = writeMappingPackage(packageDir, result, {
      protectedPaths: [fixture.sourceDir],
      extraArtifacts: { [reportPath]: alternativeReport },
    });
    fixture.evidenceRegistry.set("legacy.multi", alternativeEvidence);
    try {
      await write;
    } catch (error) {
      rejection = error;
    } finally {
      fixture.evidenceRegistry.set("legacy.multi", originalEvidence);
    }

    assert.match(rejection?.message ?? "", /proveniência|snapshot|evidência|registry|binding/i);
    assert.deepEqual(await readPackageFiles(packageDir), beforeRejected);
    await writeMappingPackage(packageDir, result, {
      protectedPaths: [fixture.sourceDir],
      extraArtifacts: { [reportPath]: officialReport },
    });
    assert.deepEqual(await readPackageFiles(packageDir), beforeRejected);
  });
});

test("writeMappingPackage rejeita resultado forjado antes de escrever e preserva pacote anterior", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const result = await buildFixtureMapping(fixture);
    const packageDir = path.join(directory, "package");
    await mkdir(packageDir);
    await writeFile(path.join(packageDir, "sentinel.txt"), "PACKAGE_ANTERIOR\n");
    const forged = structuredClone(result);
    forged.destinationMappings[0].identity.scope = "forged";
    forged.destinationMappings[0].columns[0].transformation = "forged";
    forged.destinationMappings[0].emissionContract.conditions.preparedWhen.stepId = "forged";
    forged.columnMappings[0].transformation = "forged";

    await assert.rejects(
      () =>
        writeMappingPackage(packageDir, forged, {
          protectedPaths: [fixture.sourceDir],
        }),
      /resultado.*(?:autenticado|provenance)|proveniência/i,
    );

    assert.equal(
      await readFile(path.join(packageDir, "sentinel.txt"), "utf8"),
      "PACKAGE_ANTERIOR\n",
    );
    assert.deepEqual(await readdir(directory), ["package", "source"]);
  });
});

test("resultado é opaco e completeness exige provenance e registries íntegros", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const result = await buildFixtureMapping(fixture);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.destinationMappings[0].identity), true);
    const forged = structuredClone(result);
    forged.destinationMappings[0].identity.scope = "forged";
    forged.destinationMappings[0].columns[0].transformation = "forged";
    forged.columnMappings[0].transformation = "forged";
    assert.throws(
      () => validateMappingCompleteness(forged, fixture),
      /resultado.*(?:autenticado|provenance)|proveniência/i,
    );

    fixture.ruleRegistry.get(
      "legacy.multi",
    ).executionContract.steps.insert.preparedWhen.conditionId = "forged:prepared";
    assert.throws(
      () => validateMappingCompleteness(result, fixture),
      /proveniência|registry|snapshot|diverge/i,
    );
  });
});

test("quarentena permanece bounded e não retém um objeto por linha", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const rows = Array.from({ length: 400 }, (_, index) => `(${index + 1}, 'S${index + 1}')`).join(
      ",",
    );
    await replaceDumpAndInventory(
      fixture,
      "legacy.multi",
      `INSERT INTO \`legacy.multi\` (\`id\`, \`password\`) VALUES ${rows};\n`,
      400,
    );
    const result = await buildFixtureMapping(fixture);

    assert.equal(result.quarantineSummary.total, 200);
    assert.equal(result.quarantineReasons.length, 1);
    assert.equal(result.quarantineReasons[0].count, 200);
    assert.equal("quarantineItems" in result, false);
    assert.doesNotMatch(JSON.stringify(result.quarantineReasons), /legacyId|S\d+/);
  });
});

test("serializeCsv neutraliza fórmulas sem alterar escaping RFC 4180", () => {
  assert.equal(
    serializeCsv(
      ["value"],
      [
        { value: "=1+1" },
        { value: "+cmd" },
        { value: "-2+3" },
        { value: "@SUM(A1)" },
        { value: "texto,normal" },
      ],
    ),
    "value\r\n'=1+1\r\n'+cmd\r\n'-2+3\r\n'@SUM(A1)\r\n\"texto,normal\"\r\n",
  );
});

test("sensitivity bloqueia credenciais, PII e material criptográfico sem falso positivo de metadado", () => {
  const unsafe = [
    ["ftp", "://user:", "secret", "@example.test/file"].join(""),
    ["fixture", "@example.test"].join(""),
    ["123", ".456.789-", "09"].join(""),
    `MII${"A".repeat(160)}==`,
    '{\\"token\\":\\"opaque-value\\"}',
  ];
  for (const value of unsafe) {
    assert.throws(() => assertNoSensitiveSerializedContent(value), /sensivel/i);
  }
  assert.match(toLegacyIdRef("12345678909"), /^sha256:/);
  assert.doesNotThrow(() =>
    assertNoSensitiveSerializedContent(
      "Campos PFX/PKCS12/DER e token são metadados de mapeamento, sem conteúdo associado.",
    ),
  );
});

test("writeFileSetAtomically restaura pacote em falha de install e separa cleanup pós-commit", async () => {
  await withSandbox(async (directory) => {
    const packageDir = path.join(directory, "package");
    await mkdir(packageDir);
    await writeFile(path.join(packageDir, "sentinel.txt"), "ANTERIOR\n");
    const baseAdapter = createNodeFileSystemAdapter();
    let failedInstall = false;
    const installFailure = {
      ...baseAdapter,
      async rename(from, to) {
        if (!failedInstall && from.endsWith(".tmp") && to === packageDir) {
          failedInstall = true;
          throw new Error("injected-install-failure");
        }
        return baseAdapter.rename(from, to);
      },
    };

    await assert.rejects(
      () =>
        writeFileSetAtomically(packageDir, new Map([["new.txt", "NOVO\n"]]), {
          fileSystem: installFailure,
        }),
      (error) => {
        assert.match(error.message, /instalação.*restaurado/i);
        assert.equal(error.message.includes(directory), false);
        return true;
      },
    );
    assert.equal(await readFile(path.join(packageDir, "sentinel.txt"), "utf8"), "ANTERIOR\n");
    assert.deepEqual(await readdir(directory), ["package"]);

    let cleanupFailed = false;
    const cleanupFailure = {
      ...baseAdapter,
      async rm(target, options) {
        if (!cleanupFailed && target.endsWith(".previous")) {
          cleanupFailed = true;
          throw new Error("injected-cleanup-failure");
        }
        return baseAdapter.rm(target, options);
      },
    };
    const installed = await writeFileSetAtomically(packageDir, new Map([["new.txt", "NOVO\n"]]), {
      fileSystem: cleanupFailure,
    });
    assert.deepEqual(installed, {
      committed: true,
      cleanupPending: true,
      recoveryEntry: installed.recoveryEntry,
    });
    assert.match(installed.recoveryEntry, /^\.package\.[0-9a-f-]+\.previous$/);
    assert.equal(await readFile(path.join(packageDir, "new.txt"), "utf8"), "NOVO\n");
  });
});

test("writeFileSetAtomically rejeita symlink em qualquer nó do pacote existente", async () => {
  await withSandbox(async (directory) => {
    const packageDir = path.join(directory, "package");
    const externalFile = path.join(directory, "external.txt");
    await mkdir(path.join(packageDir, "nested"), { recursive: true });
    await writeFile(externalFile, "EXTERNO\n");
    await writeFile(path.join(packageDir, "sentinel.txt"), "ANTERIOR\n");
    await symlink(externalFile, path.join(packageDir, "nested", "alias.txt"));

    await assert.rejects(
      () => writeFileSetAtomically(packageDir, new Map([["new.txt", "NOVO\n"]])),
      /symlink/i,
    );
    assert.equal(await readFile(path.join(packageDir, "sentinel.txt"), "utf8"), "ANTERIOR\n");
    assert.equal(await readFile(externalFile, "utf8"), "EXTERNO\n");
  });
});

test("rollback informa restauração por cópia e preserva recovery quando todas tentativas falham", async () => {
  await withSandbox(async (directory) => {
    const packageDir = path.join(directory, "package");
    await mkdir(packageDir);
    await writeFile(path.join(packageDir, "sentinel.txt"), "ANTERIOR\n");
    const baseAdapter = createNodeFileSystemAdapter();
    const copyRestore = {
      ...baseAdapter,
      async rename(from, to) {
        if ((from.endsWith(".tmp") || from.endsWith(".previous")) && to === packageDir) {
          throw new Error("injected-rename-failure");
        }
        return baseAdapter.rename(from, to);
      },
    };
    await assert.rejects(
      () =>
        writeFileSetAtomically(packageDir, new Map([["new.txt", "NOVO\n"]]), {
          fileSystem: copyRestore,
        }),
      (error) => {
        assert.equal(error.recovery.packageRestored, true);
        assert.equal(error.recovery.restorationMethod, "copy");
        assert.match(error.recovery.recoveryEntry, /^\.package\.[0-9a-f-]+\.previous$/);
        assert.equal(error.recovery.recoveryPath, error.recovery.recoveryEntry);
        return true;
      },
    );
    assert.equal(await readFile(path.join(packageDir, "sentinel.txt"), "utf8"), "ANTERIOR\n");

    await rm(packageDir, { recursive: true });
    await mkdir(packageDir);
    await writeFile(path.join(packageDir, "sentinel.txt"), "ANTERIOR-2\n");
    const failedRestore = {
      ...baseAdapter,
      async rename(from, to) {
        if ((from.endsWith(".tmp") || from.endsWith(".previous")) && to === packageDir) {
          throw new Error("injected-rename-failure");
        }
        return baseAdapter.rename(from, to);
      },
      async cp(from, to, options) {
        if (from.endsWith(".previous") && to === packageDir) {
          throw new Error("injected-copy-restore-failure");
        }
        return baseAdapter.cp(from, to, options);
      },
    };
    await assert.rejects(
      () =>
        writeFileSetAtomically(packageDir, new Map([["new.txt", "NOVO\n"]]), {
          fileSystem: failedRestore,
        }),
      (error) => {
        assert.equal(error.recovery.packageRestored, false);
        assert.match(error.recovery.recoveryEntry, /^\.package\.[0-9a-f-]+\.previous$/);
        assert.equal(error.recovery.recoveryPath, error.recovery.recoveryEntry);
        return true;
      },
    );
    const recoveryEntries = (await readdir(directory)).filter((entry) =>
      entry.endsWith(".previous"),
    );
    assert.equal(recoveryEntries.length >= 1, true);
    assert.equal(
      (
        await Promise.all(
          recoveryEntries.map((entry) =>
            readFile(path.join(directory, entry, "sentinel.txt"), "utf8"),
          ),
        )
      ).includes("ANTERIOR-2\n"),
      true,
    );
  });
});
