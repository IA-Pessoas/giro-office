import assert from "node:assert/strict";
import test from "node:test";

import { runPreflight } from "../lib/preflight-engine.mjs";

const ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const OTHER_ORGANIZATION_ID = "45337d55-bb0c-48eb-8ee5-9657c4e5f7df";
const PLANNED_ID = "4e6ae95e-4d73-4e6d-8954-10be339a7cc8";
const SECOND_PLANNED_ID = "e614f8cf-2b4b-48ee-87df-302c25483956";

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
  assert.deepEqual(report.steps[0].conflictChecks, {
    candidateLimitExceeded: false,
    complete: true,
    deterministicIdCandidateCount: 1,
    mergeCandidateCount: 0,
    preparedRowCount: 1,
    uniqueCandidateCount: 1,
    uniqueConstraintCount: 1,
  });
  assert.deepEqual(
    client.history.map((query) => (typeof query === "string" ? query : query.text)),
    [
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
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
  const uniqueIndexesQuery = client.history.find((query) =>
    (typeof query === "string" ? query : query.text).includes("pg_catalog.pg_index"),
  );
  assert.ok(uniqueIndexesQuery);
  assert.match(
    typeof uniqueIndexesQuery === "string" ? uniqueIndexesQuery : uniqueIndexesQuery.text,
    /pg_catalog\.generate_series\(0, index_metadata\.indnkeyatts - 1\) AS key_position/,
  );
  assert.doesNotMatch(
    typeof uniqueIndexesQuery === "string" ? uniqueIndexesQuery : uniqueIndexesQuery.text,
    /key_column\.unnest|key_position\.generate_series/,
  );
});

test("runPreflight aceita coluna usada anulável quando Prisma e banco concordam", async () => {
  const prismaCatalog = createPrismaCatalog();
  const ownerField = prismaCatalog.models[0].fields.find(
    ({ databaseName }) => databaseName === "owner_id",
  );
  ownerField.nullable = true;

  const catalogRows = createCatalogRows();
  const ownerColumn = catalogRows.find(
    ({ table_name, column_name }) => table_name === "projects" && column_name === "owner_id",
  );
  ownerColumn.is_nullable = "YES";

  const report = await runPreflight({
    client: createCatalogClient({ catalogRows }),
    mappingPackage: createMappingPackage(),
    prismaCatalog,
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });
  const codes = new Set(report.blockers.map(({ reasonCode }) => reasonCode));

  assert.equal(codes.has("DESTINATION_NULLABILITY_MISMATCH"), false);
  assert.equal(codes.has("PRISMA_DATABASE_DRIFT"), false);
  assert.equal(report.readyForMigration, true);
  assert.equal(report.transactionMode, "READ ONLY");
  assert.equal(report.writesPerformed, false);
});

test("runPreflight aceita QueryResult real com rows próprio e prototype do pg", async () => {
  const client = createCatalogClient();
  const query = client.query.bind(client);
  client.query = async (...args) => {
    const result = await query(...args);
    return new PgResultFixture(result);
  };

  const report = await runPreflight({
    client,
    mappingPackage: createMappingPackage(),
    prismaCatalog: createPrismaCatalog(),
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });

  assert.equal(report.transactionMode, "READ ONLY");
  assert.equal(report.writesPerformed, false);
});

class PgResultFixture {
  constructor(result) {
    Object.assign(this, result);
  }
}

test("runPreflight aceita pontuação segura em nomes de constraint que não entram em SQL", async () => {
  const constraintRows = createConstraintRows().map((row) => ({
    ...row,
    constraint_name: row.constraint_name.replaceAll("_", "-"),
  }));
  const report = await runPreflight({
    client: createCatalogClient({ constraintRows }),
    mappingPackage: createMappingPackage(),
    prismaCatalog: createPrismaCatalog(),
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });

  assert.equal(report.transactionMode, "READ ONLY");
  assert.equal(report.writesPerformed, false);
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
    preparedRowCount: 1,
    uniqueCandidates: [{ columns: ["slug"], values: ["alpha"] }],
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
  mappingPackage.evidenceRegistry.set(
    "legacy.pending",
    createEvidence("legacy.pending", null, "pending"),
  );
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

test("runPreflight mantém pending autenticado fora do escopo confirmado sem bloquear", async () => {
  const mappingPackage = createMappingPackage();
  const evidence = createEvidence("legacy.pending", null, "pending");
  mappingPackage.pendingTables.push({
    sourceTable: "legacy.pending",
    status: "pending",
    evidence,
  });
  mappingPackage.evidenceRegistry.set("legacy.pending", evidence);

  const report = await runPreflight({
    client: createCatalogClient(),
    mappingPackage,
    prismaCatalog: createPrismaCatalog(),
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });

  assert.equal(report.readyForMigration, true);
  assert.equal(
    report.blockers.some(({ reasonCode }) => reasonCode === "PENDING_MAPPING_EXISTS"),
    false,
  );
  assert.equal(report.summary.pendingTableCount, 1);
  assert.equal(report.summary.excludedPendingTableCount, 1);
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

test("runPreflight exige contrato executável para substituir diagnóstico local bloqueado", async () => {
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

  addRuntimeCoverage(mappingPackage, mappingPackage.destinationMappings[0]);
  const coveredReport = await runPreflight({
    client: createCatalogClient(),
    mappingPackage,
    prismaCatalog: createPrismaCatalog(),
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });

  assert.equal(coveredReport.readyForMigration, true);
  assert.equal(coveredReport.steps[0].blockerCodes.includes("SEMANTIC_EVIDENCE_MISSING"), false);
});

test("runPreflight prova tenant pelo contrato executável e consulta merge dentro da Castelo", async () => {
  const mappingPackage = createMappingPackage();
  const step = mappingPackage.destinationMappings[0];
  Object.assign(step, {
    constants: {},
    identity: { kind: "resolve" },
    identityKind: "resolve",
    mode: "merge",
  });
  mappingPackage.preflightInputs["legacy.projects\0project-insert"] = {
    preparedRowCount: 1,
    uniqueCandidates: [{ columns: ["slug"], values: ["alpha"] }],
    mergeCandidates: [{ columns: ["slug"], values: ["alpha"] }],
  };
  addRuntimeCoverage(mappingPackage, step, { identityColumns: ["slug"] });
  const client = createCatalogClient();

  const report = await runPreflight({
    client,
    mappingPackage,
    prismaCatalog: createPrismaCatalog(),
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });

  assert.equal(report.readyForMigration, true);
  assert.equal(report.steps[0].tenant.scopeProven, true);
  const mergeQuery = client.history.find(
    (query) => typeof query !== "string" && query.text.includes("AS merge_match_count"),
  );
  assert.ok(mergeQuery);
  assert.match(mergeQuery.text, /"slug" = \$1 AND "organization_id" = \$2/);
  assert.deepEqual(mergeQuery.values, ["alpha", ORGANIZATION_ID]);
});

test("runPreflight não fabrica conflito de merge sem linhas preparadas", async () => {
  const mappingPackage = createMappingPackage();
  const step = mappingPackage.destinationMappings[0];
  Object.assign(step, {
    constants: {},
    identity: { kind: "resolve" },
    identityKind: "resolve",
    mode: "merge",
    prepared: 0,
    blockedRows: 1,
    preflightState: "preflight_blocked",
  });
  mappingPackage.preflightInputs = {};
  addRuntimeCoverage(mappingPackage, step, { identityColumns: ["slug"] });

  const report = await runPreflight({
    client: createCatalogClient(),
    mappingPackage,
    prismaCatalog: createPrismaCatalog(),
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });

  assert.equal(
    report.blockers.some(({ reasonCode }) => reasonCode === "MERGE_IDENTITY_CONFLICT"),
    false,
  );
  assert.equal(report.readyForMigration, true);
});

test("runPreflight reconhece CREATE UNIQUE INDEX simples e composto sem INCLUDE ou índice parcial", async () => {
  const mappingPackage = createMappingPackage();
  const prismaCatalog = createPrismaCatalog();
  prismaCatalog.models[0].compoundUnique.push(["organization_id", "slug"]);
  const constraintRows = createConstraintRows().filter(
    ({ constraint_name }) => constraint_name !== "projects_slug_key",
  );
  const uniqueIndexRows = [
    uniqueIndex("projects", "projects_org_slug_idx", "slug", 2),
    uniqueIndex("projects", "projects_slug_idx", "slug", 1),
    uniqueIndex("projects", "projects_org_slug_idx", "organization_id", 1),
  ];
  mappingPackage.preflightInputs["legacy.projects\0project-insert"].uniqueCandidates.push({
    columns: ["organization_id", "slug"],
    values: [ORGANIZATION_ID, "alpha"],
  });

  const client = createCatalogClient({ constraintRows, uniqueIndexRows });
  const report = await runPreflight({
    client,
    mappingPackage,
    prismaCatalog,
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });

  assert.equal(report.readyForMigration, true);
  const indexQuery = client.history.find(
    (query) => typeof query !== "string" && query.text.includes("pg_index"),
  );
  assert.ok(indexQuery);
  assert.match(indexQuery.text, /indisunique/);
  assert.match(indexQuery.text, /indpred IS NULL/);
  assert.match(indexQuery.text, /indexprs IS NULL/);
  assert.match(indexQuery.text, /indisvalid/);
  assert.match(indexQuery.text, /indisready/);
  assert.match(indexQuery.text, /indnullsnotdistinct/);
  assert.match(
    indexQuery.text,
    /pg_catalog\.generate_series\(0, index_metadata\.indnkeyatts - 1\)/,
  );
  assert.match(indexQuery.text, /key_position\.key_position/);
  const conflictQueries = client.history.filter(
    (query) =>
      typeof query !== "string" && query.text.includes("intra_batch_unique_conflict_count"),
  );
  assert.equal(conflictQueries.length, 2);
  const compoundQuery = conflictQueries.find((query) =>
    query.text.includes('SELECT "organization_id", "slug" FROM "public"."projects" WHERE FALSE'),
  );
  assert.ok(compoundQuery);
  assert.deepEqual(compoundQuery.values, [ORGANIZATION_ID, "alpha"]);
  assert.match(
    compoundQuery.text,
    /SELECT "organization_id", "slug" FROM "public"\."projects" WHERE FALSE UNION ALL SELECT \$1, \$2/,
  );
  assert.doesNotMatch(compoundQuery.text, /VALUES|candidate_values/);
});

test("runPreflight bloqueia cobertura ausente ou incompleta para todo passo preparado", async () => {
  const absent = createMappingPackage();
  absent.destinationMappings[0].identity = { kind: "resolve" };
  absent.destinationMappings[0].identityKind = "resolve";
  absent.preflightInputs = {};
  const absentReport = await runPreflight({
    client: createCatalogClient(),
    mappingPackage: absent,
    prismaCatalog: createPrismaCatalog(),
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });
  assert.equal(absentReport.readyForMigration, false);
  assert.equal(absentReport.steps[0].blockerCodes.includes("SEMANTIC_EVIDENCE_MISSING"), true);

  const incomplete = createMappingPackage();
  incomplete.destinationMappings[0].prepared = 2;
  incomplete.preflightInputs["legacy.projects\0project-insert"].preparedRowCount = 2;
  const incompleteReport = await runPreflight({
    client: createCatalogClient(),
    mappingPackage: incomplete,
    prismaCatalog: createPrismaCatalog(),
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });
  assert.equal(incompleteReport.readyForMigration, false);
  assert.equal(incompleteReport.steps[0].conflictChecks.complete, false);
  assert.equal(incompleteReport.steps[0].conflictChecks.preparedRowCount, 2);
  assert.doesNotMatch(JSON.stringify(incompleteReport), /alpha|4e6ae95e/i);

  const merge = createMappingPackage();
  merge.destinationMappings[0].mode = "merge";
  merge.destinationMappings[0].identity = { kind: "resolve" };
  merge.destinationMappings[0].identityKind = "resolve";
  merge.destinationMappings[0].prepared = 2;
  merge.preflightInputs["legacy.projects\0project-insert"] = {
    preparedRowCount: 2,
    uniqueCandidates: [
      { columns: ["slug"], values: ["first"] },
      { columns: ["slug"], values: ["second"] },
    ],
    mergeCandidates: [{ columns: ["slug"], values: ["first"] }],
  };
  const mergeReport = await runPreflight({
    client: createCatalogClient(),
    mappingPackage: merge,
    prismaCatalog: createPrismaCatalog(),
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });
  assert.equal(mergeReport.readyForMigration, false);
  assert.equal(mergeReport.steps[0].conflictChecks.complete, false);
});

test("runPreflight minimiza tenant e conflito determinístico para contagens agregadas", async () => {
  const client = createCatalogClient();
  await runPreflight({
    client,
    mappingPackage: createMappingPackage(),
    prismaCatalog: createPrismaCatalog(),
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });
  const tenantQuery = client.history.find(
    (query) => typeof query !== "string" && query.text.includes("castelo_row_count"),
  );
  assert.ok(tenantQuery);
  assert.deepEqual(tenantQuery.values, [ORGANIZATION_ID]);
  assert.doesNotMatch(tenantQuery.text, /GROUP BY/);
  assert.equal(JSON.stringify(client.history).includes(OTHER_ORGANIZATION_ID), false);

  const idQuery = client.history.find(
    (query) => typeof query !== "string" && query.text.includes("deterministic_id_conflict_count"),
  );
  assert.ok(idQuery);
  assert.match(idQuery.text, /^SELECT COUNT\(\*\)/);
  assert.doesNotMatch(idQuery.text, /^SELECT\s+"id"/);

  await assert.rejects(
    runPreflight({
      client: createCatalogClient({ rawTenantRows: true }),
      mappingPackage: createMappingPackage(),
      prismaCatalog: createPrismaCatalog(),
      organizationId: ORGANIZATION_ID,
      requiredSecretNames: [],
    }),
    /contagem|cardinalidade/i,
  );
  await assert.rejects(
    runPreflight({
      client: createCatalogClient({ rawDeterministicRows: true }),
      mappingPackage: createMappingPackage(),
      prismaCatalog: createPrismaCatalog(),
      organizationId: ORGANIZATION_ID,
      requiredSecretNames: [],
    }),
    /contagem|cardinalidade/i,
  );
});

test("runPreflight não impõe teto de mapeamento e pagina IDs somente em memória", async () => {
  const prepared = 1_001;
  const mappingPackage = createMappingPackage();
  mappingPackage.destinationMappings[0].prepared = prepared;
  mappingPackage.preflightInputs["legacy.projects\0project-insert"] = {
    preparedRowCount: prepared,
    deterministicIds: Array.from(
      { length: prepared },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    ),
    uniqueCandidates: [],
    mergeCandidates: [],
  };
  const prismaCatalog = createPrismaCatalog();
  prismaCatalog.models[0].fields.find(({ databaseName }) => databaseName === "slug").unique = false;
  const constraintRows = createConstraintRows().filter(
    ({ constraint_name }) => constraint_name !== "projects_slug_key",
  );
  const client = createCatalogClient({ constraintRows });

  const report = await runPreflight({
    client,
    mappingPackage,
    prismaCatalog,
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });

  assert.equal(report.readyForMigration, true);
  assert.equal(report.steps[0].conflictChecks.deterministicIdCandidateCount, prepared);
  assert.equal(
    client.history.filter(
      (query) =>
        typeof query !== "string" && query.text.includes("deterministic_id_conflict_count"),
    ).length,
    2,
  );
});

test("runPreflight detecta unique duplicado no próprio lote com SELECT tipado agregado", async () => {
  const mappingPackage = createMappingPackage();
  const step = mappingPackage.destinationMappings[0];
  Object.assign(step, { readRows: 2, prepared: 2 });
  mappingPackage.preflightInputs["legacy.projects\0project-insert"] = {
    preparedRowCount: 2,
    deterministicIds: [PLANNED_ID, SECOND_PLANNED_ID],
    uniqueCandidates: [
      { columns: ["slug"], values: ["duplicado-no-lote"] },
      { columns: ["slug"], values: ["duplicado-no-lote"] },
    ],
    mergeCandidates: [],
  };
  const client = createCatalogClient({ intraBatchUniqueConflicts: 1 });

  const report = await runPreflight({
    client,
    mappingPackage,
    prismaCatalog: createPrismaCatalog(),
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });

  assert.equal(report.readyForMigration, false);
  assert.equal(
    report.blockers.some(
      ({ field, reasonCode }) => reasonCode === "UNIQUE_VALUE_CONFLICT" && field === "slug",
    ),
    true,
  );
  const queries = client.history.filter(
    (query) =>
      typeof query !== "string" && query.text.includes("intra_batch_unique_conflict_count"),
  );
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].values, ["duplicado-no-lote", "duplicado-no-lote"]);
  assert.match(
    queries[0].text,
    /SELECT "slug" FROM "public"\."projects" WHERE FALSE UNION ALL SELECT \$1 UNION ALL SELECT \$2/,
  );
  assert.doesNotMatch(queries[0].text, /VALUES|candidate_values/);
  assert.doesNotMatch(queries[0].text, /duplicado-no-lote/);
  assert.doesNotMatch(JSON.stringify(report), /duplicado-no-lote/);
});

test("runPreflight respeita NULL distinto padrão e NULLS NOT DISTINCT do índice", async () => {
  const createNullBatch = () => {
    const mappingPackage = createMappingPackage();
    Object.assign(mappingPackage.destinationMappings[0], { readRows: 2, prepared: 2 });
    mappingPackage.preflightInputs["legacy.projects\0project-insert"] = {
      preparedRowCount: 2,
      deterministicIds: [PLANNED_ID, SECOND_PLANNED_ID],
      uniqueCandidates: [
        { columns: ["slug"], values: [null] },
        { columns: ["slug"], values: [null] },
      ],
      mergeCandidates: [],
    };
    return mappingPackage;
  };

  const standardClient = createCatalogClient();
  const standardReport = await runPreflight({
    client: standardClient,
    mappingPackage: createNullBatch(),
    prismaCatalog: createPrismaCatalog(),
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });
  assert.equal(standardReport.readyForMigration, true);
  const standardQuery = standardClient.history.find(
    (query) =>
      typeof query !== "string" && query.text.includes("intra_batch_unique_conflict_count"),
  );
  assert.ok(standardQuery);
  assert.match(standardQuery.text, /"slug" IS NOT NULL/);
  assert.match(standardQuery.text, /destination\."slug" = candidates\."slug"/);

  const notDistinctClient = createCatalogClient({
    intraBatchUniqueConflicts: 1,
    uniqueIndexRows: [
      uniqueIndex("projects", "projects_slug_nulls_idx", "slug", 1, {
        nullsNotDistinct: true,
      }),
    ],
  });
  const notDistinctReport = await runPreflight({
    client: notDistinctClient,
    mappingPackage: createNullBatch(),
    prismaCatalog: createPrismaCatalog(),
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });
  assert.equal(notDistinctReport.readyForMigration, false);
  const notDistinctQuery = notDistinctClient.history.find(
    (query) =>
      typeof query !== "string" && query.text.includes("intra_batch_unique_conflict_count"),
  );
  assert.ok(notDistinctQuery);
  assert.doesNotMatch(notDistinctQuery.text, /"slug" IS NOT NULL/);
  assert.match(
    notDistinctQuery.text,
    /destination\."slug" IS NOT DISTINCT FROM candidates\."slug"/,
  );
});

test("runPreflight bloqueia candidatos acima do limite sem consultar conflitos", async () => {
  const prepared = 501;
  const mappingPackage = createMappingPackage();
  Object.assign(mappingPackage.destinationMappings[0], {
    identity: { kind: "resolve" },
    identityKind: "resolve",
    mode: "merge",
    readRows: prepared,
    prepared,
  });
  mappingPackage.preflightInputs["legacy.projects\0project-insert"] = {
    preparedRowCount: prepared,
    uniqueCandidates: Array.from({ length: prepared }, (_, index) => ({
      columns: ["slug"],
      values: [`candidate-${index}`],
    })),
    mergeCandidates: Array.from({ length: prepared }, (_, index) => ({
      columns: ["slug"],
      values: [`candidate-${index}`],
    })),
  };
  const client = createCatalogClient();

  const report = await runPreflight({
    client,
    mappingPackage,
    prismaCatalog: createPrismaCatalog(),
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });

  assert.equal(report.readyForMigration, false);
  assert.equal(report.steps[0].conflictChecks.complete, false);
  assert.equal(report.steps[0].conflictChecks.candidateLimitExceeded, true);
  assert.equal(report.steps[0].blockerCodes.includes("SEMANTIC_EVIDENCE_MISSING"), true);
  assert.equal(
    client.history.some(
      (query) =>
        typeof query !== "string" &&
        (query.text.includes("unique_match_count") ||
          query.text.includes("intra_batch_unique_conflict_count") ||
          query.text.includes("merge_match_count")),
    ),
    false,
  );
});

test("runPreflight bloqueia mais de 4.000 valores de conflito antes de consultar", async () => {
  const scenario = createWideUniqueScenario({ candidateCount: 251, columnCount: 16 });
  const client = createCatalogClient(scenario.catalog);

  const report = await runPreflight({
    client,
    mappingPackage: scenario.mappingPackage,
    prismaCatalog: scenario.prismaCatalog,
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });

  assert.equal(report.readyForMigration, false);
  assert.equal(report.steps[0].conflictChecks.complete, false);
  assert.equal(report.steps[0].conflictChecks.candidateLimitExceeded, true);
  assert.equal(report.steps[0].blockerCodes.includes("SEMANTIC_EVIDENCE_MISSING"), true);
  assert.equal(
    client.history.some(
      (query) =>
        typeof query !== "string" && query.text.includes("intra_batch_unique_conflict_count"),
    ),
    false,
  );
  assert.equal(client.history.at(-1), "COMMIT");
});

test("runPreflight bloqueia SQL unique estimado acima de 32 KiB antes do guard", async () => {
  const scenario = createWideUniqueScenario({ candidateCount: 1_000, columnCount: 3 });
  const client = createCatalogClient(scenario.catalog);

  const report = await runPreflight({
    client,
    mappingPackage: scenario.mappingPackage,
    prismaCatalog: scenario.prismaCatalog,
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });

  assert.equal(report.readyForMigration, false);
  assert.equal(report.steps[0].conflictChecks.complete, false);
  assert.equal(report.steps[0].conflictChecks.candidateLimitExceeded, true);
  assert.equal(report.steps[0].blockerCodes.includes("SEMANTIC_EVIDENCE_MISSING"), true);
  assert.equal(
    client.history.some(
      (query) =>
        typeof query !== "string" && query.text.includes("intra_batch_unique_conflict_count"),
    ),
    false,
  );
  assert.equal(client.history.at(-1), "COMMIT");
});

test("runPreflight exige todas as contagens finais inteiras e não negativas", async () => {
  for (const [field, invalid] of [
    ["readRows", undefined],
    ["prepared", -1],
    ["quarantine", 0.5],
    ["notEmitted", "0"],
    ["blockedRows", undefined],
  ]) {
    const mappingPackage = createMappingPackage();
    if (invalid === undefined) delete mappingPackage.destinationMappings[0][field];
    else mappingPackage.destinationMappings[0][field] = invalid;
    const client = createCatalogClient();
    await assert.rejects(
      runPreflight({
        client,
        mappingPackage,
        prismaCatalog: createPrismaCatalog(),
        organizationId: ORGANIZATION_ID,
        requiredSecretNames: [],
      }),
      /destination step.*contagem|readRows|prepared|quarantine|notEmitted|blockedRows/i,
      field,
    );
    assert.equal(client.history.at(-1), "ROLLBACK", field);
  }
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
        preparedRowCount: 1,
        deterministicIds: [PLANNED_ID],
        uniqueCandidates: [{ columns: ["slug"], values: ["alpha"] }],
        mergeCandidates: [],
      },
    },
  };
}

function addRuntimeCoverage(mappingPackage, step, { identityColumns = [] } = {}) {
  mappingPackage.runtimeCoverage ??= {};
  mappingPackage.runtimeCoverage[`${step.sourceTable}\0${step.stepId}`] = {
    destinationTable: step.destinationTable,
    contract: {
      tenantScope: {
        kind: "organization_column",
        column: "organization_id",
        organizationId: ORGANIZATION_ID,
      },
      write: {
        kind: step.mode === "merge" ? "update_exactly_one" : "insert",
      },
      cleanup:
        step.mode === "merge"
          ? {
              kind: "reset_owned_columns",
              identityColumns,
              ownedColumns: ["slug"],
              resetValues: { slug: null },
            }
          : { kind: "none" },
    },
  };
}

function createWideUniqueScenario({ candidateCount, columnCount }) {
  const mappingPackage = createMappingPackage();
  const prismaCatalog = createPrismaCatalog();
  const columns = Array.from(
    { length: columnCount },
    (_, index) => `unique_key_${String(index + 1).padStart(2, "0")}`,
  );
  const step = mappingPackage.destinationMappings[0];
  Object.assign(step, {
    identity: { kind: "resolve" },
    identityKind: "resolve",
    prepared: candidateCount,
    readRows: candidateCount,
  });
  step.columns.push(
    ...columns.map((columnName) => ({
      destinationColumn: columnName,
      sourceColumn: columnName,
      status: "mapped",
    })),
  );
  mappingPackage.columnMappings = mappingPackage.destinationMappings.flatMap(flattenColumns);
  mappingPackage.preflightInputs["legacy.projects\0project-insert"] = {
    preparedRowCount: candidateCount,
    uniqueCandidates: Array.from({ length: candidateCount }, (_, candidateIndex) => ({
      columns,
      values: columns.map((_, columnIndex) => candidateIndex * columnCount + columnIndex),
    })),
    mergeCandidates: [],
  };

  const projectModel = prismaCatalog.models[0];
  projectModel.fields.find(({ databaseName }) => databaseName === "slug").unique = false;
  projectModel.fields.push(
    ...columns.map((columnName) => createField("Project", columnName, columnName, "Int")),
  );
  projectModel.compoundUnique.push(columns);

  return {
    catalog: {
      catalogRows: [
        ...createCatalogRows(),
        ...columns.map((columnName) => column("projects", columnName, "integer", "int4", "NO")),
      ],
      constraintRows: createConstraintRows().filter(
        ({ constraint_name }) => constraint_name !== "projects_slug_key",
      ),
      uniqueIndexRows: columns.map((columnName, index) =>
        uniqueIndex("projects", "projects_wide_unique_idx", columnName, index + 1),
      ),
    },
    mappingPackage,
    prismaCatalog,
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
    readRows: 1,
    prepared: 1,
    quarantine: 0,
    notEmitted: 0,
    blockedRows: 0,
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

function uniqueIndex(table, name, columnName, ordinalPosition, { nullsNotDistinct = false } = {}) {
  return {
    table_schema: "public",
    table_name: table,
    index_name: name,
    column_name: columnName,
    ordinal_position: ordinalPosition,
    nulls_not_distinct: nullsNotDistinct,
  };
}

function createCatalogClient({
  catalogRows = createCatalogRows(),
  constraintRows = createConstraintRows(),
  uniqueIndexRows = [],
  deterministicMatches = 0,
  intraBatchUniqueConflicts = 0,
  uniqueMatches = 0,
  mergeMatchCount = 1,
  failCatalog = false,
  rawTenantRows = false,
  rawDeterministicRows = false,
} = {}) {
  return {
    history: [],
    async connect() {},
    async query(query, values) {
      this.history.push(values === undefined ? query : { text: query, values });
      const text = typeof query === "string" ? query : query.text;
      if (
        text === "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY" ||
        text === "COMMIT" ||
        text === "ROLLBACK"
      ) {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes("information_schema.columns")) {
        if (failCatalog) throw new Error("catálogo indisponível");
        return { rows: structuredClone(catalogRows), rowCount: catalogRows.length };
      }
      if (text.includes("information_schema.table_constraints")) {
        return { rows: structuredClone(constraintRows), rowCount: constraintRows.length };
      }
      if (text.includes("pg_index")) {
        return { rows: structuredClone(uniqueIndexRows), rowCount: uniqueIndexRows.length };
      }
      if (text.includes("intra_batch_unique_conflict_count")) {
        return {
          rows: [
            {
              intra_batch_unique_conflict_count: String(intraBatchUniqueConflicts),
              unique_match_count: String(uniqueMatches),
            },
          ],
          rowCount: 1,
        };
      }
      if (text.includes("castelo_row_count")) {
        if (rawTenantRows) {
          return {
            rows: [{ organization_id: OTHER_ORGANIZATION_ID, row_count: "2" }],
            rowCount: 1,
          };
        }
        return {
          rows: [
            {
              castelo_row_count: "3",
              distinct_organization_count: "2",
              other_tenant_row_count: "2",
            },
          ],
          rowCount: 1,
        };
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
        if (text.includes("deterministic_id_conflict_count")) {
          if (rawDeterministicRows) {
            return { rows: [{ id: PLANNED_ID }], rowCount: 1 };
          }
          return {
            rows: [{ deterministic_id_conflict_count: String(deterministicMatches) }],
            rowCount: 1,
          };
        }
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
