import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildMapping,
  createMappingContextProvider,
  validateMappingCompleteness,
  writeMappingPackage,
} from "../lib/mapping-engine.mjs";
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

function contextProviderFor(fixture) {
  return createMappingContextProvider({
    inventory: fixture.inventory,
    ruleRegistry: fixture.ruleRegistry,
    sourcePreparers: new Map([
      [
        "legacy.multi",
        async () => ({
          preflightComplete: true,
          contextForRow() {
            return {};
          },
        }),
      ],
    ]),
  });
}

function buildFixtureMapping(fixture) {
  return buildMapping({ ...fixture, capabilities: contextProviderFor(fixture) });
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

test("buildMapping aceita somente provider opaco vinculado a inventário e regras", async () => {
  await withSandbox(async (directory) => {
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
    const changedFixture = { ...fixture, ruleRegistry: new Map(fixture.ruleRegistry) };
    changedFixture.ruleRegistry.get("legacy.multi").ruleOrigin = "fixture:mutated";
    await assert.rejects(
      () => buildMapping({ ...changedFixture, capabilities: provider }),
      /provider.*registry/i,
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
        "quarantine/reasons.csv",
        "quarantine/summary.json",
      ],
    );
    const serialized = [...firstFiles.values()].join("\n");
    assert.doesNotMatch(serialized, /SENTINEL_RAW_SECRET|rawValue|payload|INSERT INTO/i);
    assert.match(firstFiles.get("quarantine/reasons.csv"), /legacy\.multi,derived/);
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
    assert.deepEqual(merge.emissionContract, {
      decisionRequiredPerSourceRow: true,
      omissionPolicy: "error",
      preflightReasonCode: "SEMANTIC_CONTEXT_PREFLIGHT_REQUIRED",
    });
  });
});

test("writeMappingPackage aborta conteúdo sensível, preserva pacote anterior e limpa só o temporário", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const result = await buildFixtureMapping(fixture);
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
        () =>
          writeMappingPackage(packageDir, unsafe, {
            protectedPaths: [fixture.sourceDir],
          }),
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

test("validateMappingCompleteness rejeita adulterações cruzadas de métricas e quarentena", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const result = await buildFixtureMapping(fixture);
    const mutations = [
      (copy) => {
        copy.destinationMappings[0].readRows -= 1;
      },
      (copy) => {
        copy.destinationMappings.push({ ...copy.destinationMappings[0] });
      },
      (copy) => {
        copy.destinationMappings[0].identityKind = "generate";
      },
      (copy) => {
        copy.columnMappings.pop();
      },
      (copy) => {
        copy.tableMappings[0].prepared += 1;
      },
      (copy) => {
        copy.emissionCounts["legacy.multi"].insert.prepared += 1;
      },
      (copy) => {
        copy.quarantineSummary.total += 1;
      },
      (copy) => {
        copy.quarantineReasons[0].count += 1;
      },
      (copy) => {
        copy.preflightComplete = true;
      },
    ];
    for (const mutate of mutations) {
      const copy = structuredClone(result);
      mutate(copy);
      assert.throws(
        () => validateMappingCompleteness(copy, fixture.inventory),
        /diverge|inválid|incomplet|duplicad/i,
      );
    }
  });
});

test("quarentena permanece bounded e não retém um objeto por linha", async () => {
  await withSandbox(async (directory) => {
    const fixture = await createFixture(directory);
    const rows = Array.from({ length: 400 }, (_, index) => `(${index + 1}, 'S${index + 1}')`).join(
      ",",
    );
    await writeFile(
      path.join(fixture.sourceDir, "legacy.multi.sql"),
      `INSERT INTO \`legacy.multi\` (\`id\`, \`password\`) VALUES ${rows};\n`,
    );
    fixture.inventory.tables[0].rowCount = 400;
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
