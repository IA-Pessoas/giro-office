import assert from "node:assert/strict";
import test from "node:test";

import { runPreflight } from "../lib/preflight-engine.mjs";

const ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const OTHER_ORGANIZATION_ID = "45337d55-bb0c-48eb-8ee5-9657c4e5f7df";
const PLANNED_ID = "4e6ae95e-4d73-4e6d-8954-10be339a7cc8";

test("runPreflight valida cenário limpo por destination step em transação READ ONLY", async () => {
  const client = createCatalogClient();
  const report = await runPreflight({
    client,
    mappingPackage: createMappingPackage(),
    prismaCatalog: createPrismaCatalog(),
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [{ name: "CREDENTIAL_ENCRYPTION_KEY", configured: true }],
  });

  assert.equal(report.readyForMigration, true);
  assert.equal(report.transactionMode, "READ ONLY");
  assert.equal(report.writesPerformed, false);
  assert.equal(report.organizationId, ORGANIZATION_ID);
  assert.deepEqual(report.blockers, []);
  assert.deepEqual(report.dependencyOrder, ["legacy.projects:project-insert"]);
  assert.deepEqual(report.configurationChecks, [
    { configured: true, name: "CREDENTIAL_ENCRYPTION_KEY" },
  ]);
  assert.deepEqual(report.steps[0].tenant, {
    casteloRowCount: 3,
    distinctOrganizationCount: 2,
    otherTenantRowCount: 2,
    scopeProven: true,
  });
  assert.equal(report.steps[0].status, "ready");
  assert.deepEqual(
    client.history.map((query) => (typeof query === "string" ? query : query.text)),
    [
      "BEGIN TRANSACTION READ ONLY",
      ...client.history
        .slice(1, -1)
        .map((query) => (typeof query === "string" ? query : query.text)),
      "COMMIT",
    ],
  );
  for (const query of client.history.slice(1, -1)) {
    const text = typeof query === "string" ? query : query.text;
    assert.match(text, /^(?:SELECT|WITH)\b/);
    assert.equal(query?.name, undefined);
  }
});

test("runPreflight bloqueia divergências de tabela, coluna, tipo, nulo, unique, FK e Prisma", async () => {
  const catalogRows = createCatalogRows().filter(
    (row) => !(row.table_name === "projects" && row.column_name === "owner_id"),
  );
  const slug = catalogRows.find(
    (row) => row.table_name === "projects" && row.column_name === "slug",
  );
  slug.data_type = "integer";
  slug.udt_name = "int4";
  slug.is_nullable = "YES";
  const packageWithMissingTable = createMappingPackage();
  packageWithMissingTable.tableMappings.push({
    sourceTable: "legacy.missing",
    status: "confirmed",
    dependencies: [],
    evidence: { current: ["Prisma: missing_table"], legacy: ["legacy/missing.php:1"] },
  });
  const missingDestination = createDestination({
    sourceTable: "legacy.missing",
    stepId: "missing-insert",
    destinationTable: "missing_table",
  });
  packageWithMissingTable.destinationMappings.push(missingDestination);
  packageWithMissingTable.columnMappings.push(...flattenColumns(missingDestination));
  packageWithMissingTable.evidenceRegistry.set(
    "legacy.missing",
    createEvidence("legacy.missing", "missing-rule"),
  );
  const prismaCatalog = createPrismaCatalog();
  prismaCatalog.models.push(
    createModel("Missing", "missing_table", [
      createField("Missing", "id", "id", "String", { id: true }),
      createField("Missing", "organizationId", "organization_id", "String"),
    ]),
  );

  const report = await runPreflight({
    client: createCatalogClient({ catalogRows, constraintRows: [] }),
    mappingPackage: packageWithMissingTable,
    prismaCatalog,
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });
  const codes = new Set(report.blockers.map(({ reasonCode }) => reasonCode));

  for (const reasonCode of [
    "DESTINATION_TABLE_MISSING",
    "DESTINATION_COLUMN_MISSING",
    "DESTINATION_TYPE_MISMATCH",
    "DESTINATION_NULLABILITY_MISMATCH",
    "DESTINATION_UNIQUE_MISMATCH",
    "DESTINATION_FK_MISMATCH",
    "PRISMA_DATABASE_DRIFT",
  ]) {
    assert.equal(codes.has(reasonCode), true, reasonCode);
  }
  assert.equal(report.readyForMigration, false);
});

test("runPreflight detecta escopo, ID determinístico, unique e identidade merge conflitantes", async () => {
  const mappingPackage = createMappingPackage();
  mappingPackage.destinationMappings[0].constants = {};
  mappingPackage.tableMappings.push({
    sourceTable: "legacy.project_details",
    status: "confirmed",
    dependencies: ["legacy.projects"],
    evidence: { current: ["Prisma: projects"], legacy: ["legacy/details.php:1"] },
  });
  const mergeDestination = createDestination({
    sourceTable: "legacy.project_details",
    stepId: "project-merge",
    mode: "merge",
    identity: {
      kind: "resolve",
      sourceColumn: "project_id",
      sourceTable: "legacy.projects",
      targetLegacyColumn: "id",
    },
    dependencies: ["legacy.projects"],
  });
  mappingPackage.destinationMappings.push(mergeDestination);
  mappingPackage.columnMappings.push(...flattenColumns(mergeDestination));
  mappingPackage.evidenceRegistry.set(
    "legacy.project_details",
    createEvidence("legacy.project_details", "details-rule"),
  );
  mappingPackage.preflightInputs["legacy.project_details\0project-merge"] = {
    mergeCandidates: [{ columns: ["slug"], values: ["alpha"] }],
  };

  const report = await runPreflight({
    client: createCatalogClient({ deterministicMatches: 1, uniqueMatches: 1, mergeMatchCount: 2 }),
    mappingPackage,
    prismaCatalog: createPrismaCatalog(),
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });
  const codes = new Set(report.blockers.map(({ reasonCode }) => reasonCode));

  assert.equal(codes.has("TENANT_SCOPE_UNPROVEN"), true);
  assert.equal(codes.has("DETERMINISTIC_ID_CONFLICT"), true);
  assert.equal(codes.has("UNIQUE_VALUE_CONFLICT"), true);
  assert.equal(codes.has("MERGE_IDENTITY_CONFLICT"), true);
  assert.equal(report.readyForMigration, false);
});

test("runPreflight agrega pending, quarantine, evidência, configuração e ciclo como blockers", async () => {
  const mappingPackage = createMappingPackage();
  mappingPackage.pendingTables.push({
    sourceTable: "legacy.pending",
    status: "pending",
    evidence: createEvidence("legacy.pending", null, "pending"),
  });
  mappingPackage.quarantineSummary.unresolved = 2;
  mappingPackage.tableMappings.push({
    sourceTable: "legacy.cycle",
    status: "confirmed",
    dependencies: ["legacy.projects"],
    evidence: { current: [], legacy: [] },
  });
  mappingPackage.tableMappings[0].dependencies = ["legacy.cycle"];
  mappingPackage.destinationMappings[0].columns[1].transformation = "encrypt_credential";
  const cycleDestination = createDestination({
    sourceTable: "legacy.cycle",
    stepId: "cycle-insert",
    dependencies: ["legacy.projects"],
  });
  mappingPackage.destinationMappings.push(cycleDestination);
  mappingPackage.columnMappings.push(...flattenColumns(cycleDestination));

  const report = await runPreflight({
    client: createCatalogClient(),
    mappingPackage,
    prismaCatalog: createPrismaCatalog(),
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [{ name: "CREDENTIAL_ENCRYPTION_KEY", configured: false }],
  });
  const codes = new Set(report.blockers.map(({ reasonCode }) => reasonCode));

  for (const reasonCode of [
    "PENDING_MAPPING_EXISTS",
    "UNRESOLVED_QUARANTINE_EXISTS",
    "SEMANTIC_EVIDENCE_MISSING",
    "ENCRYPTION_CONFIGURATION_MISSING",
    "DEPENDENCY_CYCLE",
  ]) {
    assert.equal(codes.has(reasonCode), true, reasonCode);
  }
  assert.deepEqual(report.dependencyOrder, []);
  assert.equal(report.readyForMigration, false);
  assert.equal(
    report.steps
      .find(({ stepId }) => stepId === "project-insert")
      .blockerCodes.includes("ENCRYPTION_CONFIGURATION_MISSING"),
    true,
  );
  assert.doesNotMatch(JSON.stringify(report), /valor-super-secreto/i);
});

test("runPreflight é determinístico e faz ROLLBACK quando a leitura técnica falha", async () => {
  const inputs = {
    mappingPackage: createMappingPackage(),
    prismaCatalog: createPrismaCatalog(),
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  };
  const first = await runPreflight({ client: createCatalogClient(), ...inputs });
  const second = await runPreflight({ client: createCatalogClient(), ...inputs });
  assert.deepEqual(first, second);

  const failingClient = createCatalogClient({ failCatalog: true });
  await assert.rejects(
    runPreflight({ client: failingClient, ...inputs }),
    /catálogo indisponível/i,
  );
  assert.equal(failingClient.history.at(-1), "ROLLBACK");
});

test("runPreflight preserva ponto literal em nome físico de tabela Prisma", async () => {
  const mappingPackage = createMappingPackage();
  mappingPackage.destinationMappings[0].destinationTable = "certificate.pf";
  for (const column of mappingPackage.columnMappings) {
    column.destinationTable = "certificate.pf";
  }
  const prismaCatalog = createPrismaCatalog();
  prismaCatalog.models[0].databaseName = "certificate.pf";
  const catalogRows = createCatalogRows().map((row) =>
    row.table_name === "projects" ? { ...row, table_name: "certificate.pf" } : row,
  );
  const constraintRows = createConstraintRows().map((row) =>
    row.table_name === "projects"
      ? {
          ...row,
          constraint_name: row.constraint_name.replace("projects", "certificate.pf"),
          table_name: "certificate.pf",
        }
      : row,
  );

  const report = await runPreflight({
    client: createCatalogClient({ catalogRows, constraintRows }),
    mappingPackage,
    prismaCatalog,
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });

  assert.equal(report.readyForMigration, true);
  assert.equal(report.steps[0].destinationTable, "certificate.pf");
});

test("runPreflight detecta coluna escalar array ausente sem confundir com relação Prisma", async () => {
  const mappingPackage = createMappingPackage();
  mappingPackage.destinationMappings[0].columns.push({
    destinationColumn: "tags",
    sourceColumn: "tags",
    status: "mapped",
  });
  mappingPackage.columnMappings.push(
    ...flattenColumns(mappingPackage.destinationMappings[0]).filter(
      ({ destinationColumn }) => destinationColumn === "tags",
    ),
  );
  const prismaCatalog = createPrismaCatalog();
  prismaCatalog.models[0].fields.push(
    createField("Project", "tags", "tags", "String", { list: true }),
  );
  const report = await runPreflight({
    client: createCatalogClient(),
    mappingPackage,
    prismaCatalog,
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });

  assert.equal(report.readyForMigration, false);
  assert.equal(
    report.blockers.some(
      ({ field, reasonCode }) => field === "tags" && reasonCode === "DESTINATION_COLUMN_MISSING",
    ),
    true,
  );

  const catalogRows = [...createCatalogRows(), column("projects", "tags", "ARRAY", "_text", "NO")];
  const cleanReport = await runPreflight({
    client: createCatalogClient({ catalogRows }),
    mappingPackage,
    prismaCatalog,
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });
  assert.equal(cleanReport.readyForMigration, true);
});

test("runPreflight rejeita binding incompleta entre destination e column mappings", async () => {
  const mappingPackage = createMappingPackage();
  mappingPackage.columnMappings.pop();
  const client = createCatalogClient();

  await assert.rejects(
    runPreflight({
      client,
      mappingPackage,
      prismaCatalog: createPrismaCatalog(),
      organizationId: ORGANIZATION_ID,
      requiredSecretNames: [],
    }),
    /columnMappings.*destination/i,
  );
  assert.equal(client.history.at(-1), "ROLLBACK");
});

test("runPreflight mantém runtime classifier não executado como blocker do passo", async () => {
  const mappingPackage = createMappingPackage();
  mappingPackage.destinationMappings[0].blockedRows = 1;
  mappingPackage.destinationMappings[0].preflightState = "preflight_blocked";

  const report = await runPreflight({
    client: createCatalogClient(),
    mappingPackage,
    prismaCatalog: createPrismaCatalog(),
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });

  assert.equal(report.readyForMigration, false);
  assert.equal(report.steps[0].blockerCodes.includes("SEMANTIC_EVIDENCE_MISSING"), true);
});

function createMappingPackage() {
  const destinationMappings = [createDestination()];
  return {
    tableMappings: [
      {
        sourceTable: "legacy.projects",
        status: "confirmed",
        dependencies: [],
        evidence: { current: ["Prisma: projects"], legacy: ["legacy/projects.php:1"] },
      },
    ],
    destinationMappings,
    columnMappings: destinationMappings.flatMap(flattenColumns),
    pendingTables: [],
    quarantineSummary: { unresolved: 0 },
    evidenceRegistry: new Map([
      ["legacy.projects", createEvidence("legacy.projects", "project-rule")],
    ]),
    preflightInputs: {
      "legacy.projects\0project-insert": {
        deterministicIds: [PLANNED_ID],
        uniqueCandidates: [{ columns: ["slug"], values: ["alpha"] }],
      },
    },
  };
}

function flattenColumns(step) {
  return step.columns.map((column) => ({
    sourceTable: step.sourceTable,
    stepId: step.stepId,
    destinationTable: step.destinationTable,
    sourceColumn: column.sourceColumn,
    destinationColumn: column.destinationColumn,
    status: column.status,
  }));
}

function createDestination({
  sourceTable = "legacy.projects",
  stepId = "project-insert",
  destinationTable = "projects",
  mode = "insert",
  identity = {
    kind: "generate",
    legacyColumn: "id",
    namespace: "3f68d246-0b54-4a10-9415-a8845a767fb5",
    scope: "legacy.projects",
  },
  dependencies = [],
} = {}) {
  return {
    sourceTable,
    stepId,
    destinationTable,
    mode,
    identity,
    identityKind: identity.kind,
    dependencies,
    columns: [
      { destinationColumn: "id", sourceColumn: "id", status: "mapped" },
      { destinationColumn: "slug", sourceColumn: "slug", status: "mapped" },
      { destinationColumn: "owner_id", sourceColumn: "owner_id", status: "mapped" },
    ],
    constants: { organization_id: ORGANIZATION_ID },
    defaults: {},
  };
}

function createEvidence(sourceTable, ruleId, finalStatus = "confirmed") {
  return {
    sourceTable,
    legacyModule: "projects",
    legacyReferences: ["legacy/projects.php:1"],
    operations: ["select"],
    legacyRelationships: [],
    currentContractEvidence: ["Prisma: projects"],
    finalStatus,
    reasonCode: finalStatus === "confirmed" ? "CONTRACT_CONFIRMED" : "NO_CURRENT_CONTRACT",
    reason: "Contrato revisado.",
    confidence: "high",
    ruleId,
  };
}

function createPrismaCatalog() {
  return {
    models: [
      createModel("Project", "projects", [
        createField("Project", "id", "id", "String", { id: true }),
        createField("Project", "organizationId", "organization_id", "String"),
        createField("Project", "slug", "slug", "String", { unique: true }),
        createField("Project", "ownerId", "owner_id", "String"),
        createField("Project", "note", "note", "String", { nullable: true }),
        createField("Project", "owner", "owner", "User", {
          relationModel: "User",
          relationFields: ["ownerId"],
          relationReferences: ["id"],
        }),
      ]),
      createModel("User", "users", [
        createField("User", "id", "id", "String", { id: true }),
        createField("User", "organizationId", "organization_id", "String"),
      ]),
    ],
  };
}

function createModel(prismaName, databaseName, fields) {
  return { prismaName, databaseName, fields, compoundUnique: [], indexes: [] };
}

function createField(
  model,
  prismaName,
  databaseName,
  prismaType,
  {
    nullable = false,
    list = false,
    id = false,
    unique = false,
    relationModel = null,
    relationFields = [],
    relationReferences = [],
  } = {},
) {
  return {
    model,
    prismaName,
    databaseName,
    prismaType,
    nullable,
    list,
    id,
    unique,
    relationModel,
    relationFields,
    relationReferences,
  };
}

function createCatalogRows() {
  return [
    column("projects", "id", "text", "text", "NO"),
    column("projects", "organization_id", "text", "text", "NO"),
    column("projects", "slug", "text", "text", "NO"),
    column("projects", "owner_id", "text", "text", "NO"),
    column("projects", "note", "text", "text", "YES"),
    column("users", "id", "text", "text", "NO"),
    column("users", "organization_id", "text", "text", "NO"),
  ];
}

function createConstraintRows() {
  return [
    constraint("projects", "projects_pkey", "PRIMARY KEY", "id"),
    constraint("projects", "projects_slug_key", "UNIQUE", "slug"),
    constraint("users", "users_pkey", "PRIMARY KEY", "id"),
    constraint("projects", "projects_owner_fkey", "FOREIGN KEY", "owner_id", {
      foreignTable: "users",
      foreignColumn: "id",
    }),
  ];
}

function column(table, name, dataType, udtName, nullable) {
  return {
    table_schema: "public",
    table_name: table,
    column_name: name,
    data_type: dataType,
    udt_name: udtName,
    is_nullable: nullable,
  };
}

function constraint(table, name, type, columnName, options = {}) {
  return {
    table_schema: "public",
    table_name: table,
    constraint_name: name,
    constraint_type: type,
    column_name: columnName,
    ordinal_position: 1,
    foreign_table_schema: options.foreignTable === undefined ? null : "public",
    foreign_table_name: options.foreignTable ?? null,
    foreign_column_name: options.foreignColumn ?? null,
  };
}

function createCatalogClient({
  catalogRows = createCatalogRows(),
  constraintRows = createConstraintRows(),
  deterministicMatches = 0,
  uniqueMatches = 0,
  mergeMatchCount = 1,
  failCatalog = false,
} = {}) {
  return {
    history: [],
    async connect() {},
    async query(query, values) {
      this.history.push(values === undefined ? query : { text: query, values });
      const text = typeof query === "string" ? query : query.text;
      if (text === "BEGIN TRANSACTION READ ONLY" || text === "COMMIT" || text === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes("information_schema.columns")) {
        if (failCatalog) throw new Error("catálogo indisponível");
        return { rows: structuredClone(catalogRows), rowCount: catalogRows.length };
      }
      if (text.includes("information_schema.table_constraints")) {
        return { rows: structuredClone(constraintRows), rowCount: constraintRows.length };
      }
      if (text.includes('GROUP BY "organization_id"')) {
        return {
          rows: [
            { organization_id: ORGANIZATION_ID, row_count: "3" },
            { organization_id: OTHER_ORGANIZATION_ID, row_count: "2" },
          ],
          rowCount: 2,
        };
      }
      if (text.includes("= ANY($1)")) {
        return {
          rows: Array.from({ length: deterministicMatches }, () => ({ id: PLANNED_ID })),
          rowCount: deterministicMatches,
        };
      }
      if (text.includes("AS merge_match_count")) {
        return { rows: [{ merge_match_count: String(mergeMatchCount) }], rowCount: 1 };
      }
      if (text.includes("AS unique_match_count")) {
        return { rows: [{ unique_match_count: String(uniqueMatches) }], rowCount: 1 };
      }
      throw new Error(`Query falsa não reconhecida: ${text.slice(0, 80)}`);
    },
    release() {},
  };
}
