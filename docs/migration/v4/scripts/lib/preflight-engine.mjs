import { withReadOnlyTransaction } from "./pg-readonly.mjs";
import { getFieldByDatabaseName, getModelByDatabaseName } from "./prisma-catalog.mjs";
import { assertNoSensitiveSerializedContent, assertNoSensitiveValues } from "./sensitivity.mjs";
import { serializeStableJson } from "./stable-output.mjs";

const CASTELO_ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const DATABASE_SCHEMA = "public";
const MAX_CATALOG_ROWS = 100_000;
const MAX_CONFLICT_CANDIDATES_PER_STEP = 1_000;
const MAX_CONFLICT_PARAMETER_VALUES_PER_STEP = 4_000;
const MAX_UNIQUE_CONFLICT_QUERY_LENGTH = 32 * 1024;
const ID_QUERY_BATCH_SIZE = 1_000;
const BLOCKER_CODES = new Set([
  "DEPENDENCY_CYCLE",
  "DESTINATION_COLUMN_MISSING",
  "DESTINATION_FK_MISMATCH",
  "DESTINATION_NULLABILITY_MISMATCH",
  "DESTINATION_TABLE_MISSING",
  "DESTINATION_TYPE_MISMATCH",
  "DESTINATION_UNIQUE_MISMATCH",
  "DETERMINISTIC_ID_CONFLICT",
  "ENCRYPTION_CONFIGURATION_MISSING",
  "MERGE_IDENTITY_CONFLICT",
  "PENDING_MAPPING_EXISTS",
  "PRISMA_DATABASE_DRIFT",
  "SEMANTIC_EVIDENCE_MISSING",
  "TENANT_SCOPE_UNPROVEN",
  "UNIQUE_VALUE_CONFLICT",
  "UNRESOLVED_QUARANTINE_EXISTS",
]);

export async function runPreflight({
  client,
  mappingPackage,
  prismaCatalog,
  organizationId,
  requiredSecretNames = [],
}) {
  return withReadOnlyTransaction(client, async (transaction) => {
    assertCasteloOrganization(organizationId);
    const packageData = normalizeMappingPackage(mappingPackage);
    validatePrismaCatalog(prismaCatalog);
    const configurationChecks = normalizeConfigurationChecks(requiredSecretNames);
    const databaseCatalog = await loadDatabaseCatalog(transaction);
    const blockers = [];
    const addBlocker = createBlockerCollector(blockers);

    validateEvidence(packageData, addBlocker);
    validatePendingAndQuarantine(packageData, addBlocker);
    for (const check of configurationChecks) {
      if (!check.configured) {
        addBlocker({
          reasonCode: "ENCRYPTION_CONFIGURATION_MISSING",
          scope: "configuration",
          configurationName: check.name,
        });
        for (const step of packageData.destinationMappings.filter((candidate) =>
          configurationAppliesToStep(check.name, candidate),
        )) {
          addBlocker({
            ...stepBlockerBase(step),
            reasonCode: "ENCRYPTION_CONFIGURATION_MISSING",
            configurationName: check.name,
          });
        }
      }
    }

    const dependency = buildDependencyOrder(packageData, addBlocker);
    const distributionCache = new Map();
    const steps = [];
    for (const sourceTable of dependency.sourceOrder) {
      const sourceSteps = packageData.destinationMappings
        .filter((step) => step.sourceTable === sourceTable)
        .sort(compareSteps);
      for (const step of sourceSteps) {
        const result = await validateStep({
          addBlocker,
          databaseCatalog,
          distributionCache,
          mappingPackage: packageData,
          organizationId,
          prismaCatalog,
          step,
          transaction,
        });
        steps.push(result);
      }
    }
    for (const step of packageData.destinationMappings
      .filter((candidate) => !dependency.sourceOrder.includes(candidate.sourceTable))
      .sort(compareSteps)) {
      const result = await validateStep({
        addBlocker,
        databaseCatalog,
        distributionCache,
        mappingPackage: packageData,
        organizationId,
        prismaCatalog,
        step,
        transaction,
      });
      steps.push(result);
    }

    blockers.sort(compareBlockers);
    for (const step of steps) {
      step.blockerCodes = blockers
        .filter(
          (blocker) => blocker.sourceTable === step.sourceTable && blocker.stepId === step.stepId,
        )
        .map(({ reasonCode }) => reasonCode)
        .filter((reasonCode, index, values) => values.indexOf(reasonCode) === index)
        .sort(compareText);
      step.status = step.blockerCodes.length === 0 ? "ready" : "blocked";
    }

    const dependencyOrder = dependency.sourceOrder.flatMap((sourceTable) =>
      packageData.destinationMappings
        .filter((step) => step.sourceTable === sourceTable)
        .sort(compareSteps)
        .map((step) => `${step.sourceTable}:${step.stepId}`),
    );
    const report = {
      blockers,
      configurationChecks,
      databaseSummary: {
        catalogTableCount: databaseCatalog.tables.size,
        schema: DATABASE_SCHEMA,
      },
      dependencyOrder,
      organizationId,
      readyForMigration:
        blockers.length === 0 &&
        packageData.quarantineSummary.unresolved === 0 &&
        steps.every(({ status }) => status === "ready"),
      steps: steps.sort(compareSteps),
      summary: {
        blockedStepCount: steps.filter(({ status }) => status === "blocked").length,
        blockerCount: blockers.length,
        excludedPendingTableCount: packageData.pendingTables.length,
        pendingTableCount: packageData.pendingTables.length,
        stepCount: steps.length,
        unresolvedQuarantineCount: packageData.quarantineSummary.unresolved,
      },
      transactionMode: "READ ONLY",
      writesPerformed: false,
    };
    assertNoSensitiveValues(report);
    assertNoSensitiveSerializedContent(serializeStableJson(report));
    return report;
  });
}

function configurationAppliesToStep(name, step) {
  const encryptionRequired = step.columns.some(
    ({ transformation }) =>
      typeof transformation === "string" && /encrypt|credential/i.test(transformation),
  );
  if (!encryptionRequired) return false;
  if (name.startsWith("CERTIFICATE_FILE_")) {
    return /^certificate\.(?:pf|pj)$/.test(step.destinationTable);
  }
  if (name.startsWith("PESSOAL_PASSWORD_")) {
    return step.destinationTable === "pessoal.passwords";
  }
  if (name === "MTK_ENCRYPTION_KEY") {
    return (
      step.destinationTable !== "pessoal.passwords" &&
      !/^certificate\.(?:pf|pj)$/.test(step.destinationTable)
    );
  }
  return true;
}

async function loadDatabaseCatalog(transaction) {
  const columnsResult = await transaction.query({
    text: [
      "SELECT table_schema, table_name, column_name, data_type, udt_name, is_nullable",
      "FROM information_schema.columns",
      "WHERE table_schema = $1",
      "ORDER BY table_name, ordinal_position",
    ].join(" "),
    values: [DATABASE_SCHEMA],
  });
  const constraintsResult = await transaction.query({
    text: [
      "SELECT tc.table_schema, tc.table_name, tc.constraint_name, tc.constraint_type,",
      "kcu.column_name, kcu.ordinal_position,",
      "ccu.table_schema AS foreign_table_schema,",
      "ccu.table_name AS foreign_table_name,",
      "ccu.column_name AS foreign_column_name",
      "FROM information_schema.table_constraints tc",
      "LEFT JOIN information_schema.key_column_usage kcu",
      "ON kcu.constraint_schema = tc.constraint_schema",
      "AND kcu.constraint_name = tc.constraint_name",
      "LEFT JOIN information_schema.referential_constraints rc",
      "ON rc.constraint_schema = tc.constraint_schema",
      "AND rc.constraint_name = tc.constraint_name",
      "LEFT JOIN information_schema.key_column_usage ccu",
      "ON ccu.constraint_schema = rc.unique_constraint_schema",
      "AND ccu.constraint_name = rc.unique_constraint_name",
      "AND ccu.ordinal_position = kcu.position_in_unique_constraint",
      "WHERE tc.table_schema = $1",
      "ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position",
    ].join(" "),
    values: [DATABASE_SCHEMA],
  });
  const uniqueIndexesResult = await transaction.query({
    text: [
      "SELECT namespace.nspname AS table_schema, table_class.relname AS table_name,",
      "index_class.relname AS index_name, attribute.attname AS column_name,",
      "index_metadata.indnullsnotdistinct AS nulls_not_distinct,",
      "key_position.key_position + 1 AS ordinal_position",
      "FROM pg_catalog.pg_index index_metadata",
      "JOIN pg_catalog.pg_class table_class",
      "ON table_class.oid = index_metadata.indrelid",
      "JOIN pg_catalog.pg_class index_class",
      "ON index_class.oid = index_metadata.indexrelid",
      "JOIN pg_catalog.pg_namespace namespace",
      "ON namespace.oid = table_class.relnamespace",
      "CROSS JOIN LATERAL pg_catalog.generate_series(0, index_metadata.indnkeyatts - 1) AS key_position",
      "JOIN pg_catalog.pg_attribute attribute",
      "ON attribute.attrelid = index_metadata.indrelid",
      "AND attribute.attnum = index_metadata.indkey[key_position.key_position]",
      "WHERE namespace.nspname = $1",
      "AND index_metadata.indisunique",
      "AND index_metadata.indisvalid",
      "AND index_metadata.indisready",
      "AND index_metadata.indpred IS NULL",
      "AND index_metadata.indexprs IS NULL",
      "AND index_metadata.indkey[key_position.key_position] > 0",
      "ORDER BY table_class.relname, index_class.relname, key_position.key_position",
    ].join(" "),
    values: [DATABASE_SCHEMA],
  });
  const columnRows = requireRows(columnsResult, "catálogo de colunas");
  const constraintRows = requireRows(constraintsResult, "catálogo de constraints");
  const uniqueIndexRows = requireRows(uniqueIndexesResult, "catálogo de índices unique");
  if (columnRows.length + constraintRows.length + uniqueIndexRows.length > MAX_CATALOG_ROWS) {
    throw new Error("Catálogo PostgreSQL excede o limite seguro do preflight.");
  }

  const tables = new Map();
  for (const row of columnRows) {
    const tableName = requireDatabaseName(row.table_name, "table_name");
    const columnName = requireIdentifier(row.column_name, "column_name");
    if (row.table_schema !== DATABASE_SCHEMA) {
      throw new Error("Catálogo PostgreSQL retornou schema inesperado.");
    }
    const table = getOrCreateTable(tables, tableName);
    if (table.columns.has(columnName)) {
      throw new Error("Catálogo PostgreSQL contém coluna duplicada.");
    }
    table.columns.set(columnName, {
      dataType: requireNonEmptyText(row.data_type, "data_type"),
      nullable: parseNullable(row.is_nullable),
      udtName: requireNonEmptyText(row.udt_name, "udt_name"),
    });
  }

  const constraints = new Map();
  for (const row of constraintRows) {
    if (row.table_schema !== DATABASE_SCHEMA) {
      throw new Error("Catálogo PostgreSQL retornou constraint de schema inesperado.");
    }
    const tableName = requireDatabaseName(row.table_name, "table_name");
    const constraintName = requireCatalogObjectName(row.constraint_name, "constraint_name");
    const key = `${tableName}\0${constraintName}`;
    const entry = constraints.get(key) ?? {
      columns: [],
      foreignColumns: [],
      foreignTable: row.foreign_table_name ?? null,
      tableName,
      type: requireNonEmptyText(row.constraint_type, "constraint_type"),
    };
    if (row.column_name !== null && row.column_name !== undefined) {
      entry.columns.push({
        name: requireIdentifier(row.column_name, "column_name"),
        ordinal: parseOrdinal(row.ordinal_position),
      });
    }
    if (row.foreign_column_name !== null && row.foreign_column_name !== undefined) {
      entry.foreignColumns.push({
        name: requireIdentifier(row.foreign_column_name, "foreign_column_name"),
        ordinal: parseOrdinal(row.ordinal_position),
      });
      entry.foreignTable = requireDatabaseName(row.foreign_table_name, "foreign_table_name");
      if (row.foreign_table_schema !== DATABASE_SCHEMA) {
        throw new Error("Catálogo PostgreSQL retornou FK fora do schema permitido.");
      }
    }
    constraints.set(key, entry);
  }
  for (const constraint of constraints.values()) {
    const table = getOrCreateTable(tables, constraint.tableName);
    const columns = orderedNames(constraint.columns);
    if (constraint.type === "PRIMARY KEY" || constraint.type === "UNIQUE") {
      table.uniqueSets.push({ columns, nullsNotDistinct: false });
    }
    if (constraint.type === "FOREIGN KEY") {
      table.foreignKeys.push({
        columns,
        foreignColumns: orderedNames(constraint.foreignColumns),
        foreignTable: constraint.foreignTable,
      });
    }
  }
  const uniqueIndexes = new Map();
  for (const row of uniqueIndexRows) {
    if (row.table_schema !== DATABASE_SCHEMA) {
      throw new Error("Catálogo PostgreSQL retornou índice unique de schema inesperado.");
    }
    const tableName = requireDatabaseName(row.table_name, "table_name");
    const indexName = requireCatalogObjectName(row.index_name, "index_name");
    const key = `${tableName}\0${indexName}`;
    const nullsNotDistinct = parseBoolean(row.nulls_not_distinct, "nulls_not_distinct");
    const index = uniqueIndexes.get(key) ?? { columns: [], nullsNotDistinct, tableName };
    if (index.nullsNotDistinct !== nullsNotDistinct) {
      throw new Error("Catálogo PostgreSQL retornou metadata unique inconsistente.");
    }
    index.columns.push({
      name: requireIdentifier(row.column_name, "column_name"),
      ordinal: parseOrdinal(row.ordinal_position),
    });
    uniqueIndexes.set(key, index);
  }
  for (const index of uniqueIndexes.values()) {
    getOrCreateTable(tables, index.tableName).uniqueSets.push({
      columns: orderedNames(index.columns),
      nullsNotDistinct: index.nullsNotDistinct,
    });
  }
  for (const table of tables.values()) {
    const uniqueSets = new Map();
    for (const uniqueSet of table.uniqueSets) {
      const signature = uniqueSet.columns.join("\0");
      const previous = uniqueSets.get(signature);
      uniqueSets.set(signature, {
        columns: uniqueSet.columns,
        nullsNotDistinct: uniqueSet.nullsNotDistinct || previous?.nullsNotDistinct === true,
      });
    }
    table.uniqueSets = [...uniqueSets.values()].sort((left, right) =>
      compareArrays(left.columns, right.columns),
    );
    table.foreignKeys.sort((left, right) => compareArrays(left.columns, right.columns));
  }
  return { tables };
}

async function validateStep({
  addBlocker,
  databaseCatalog,
  distributionCache,
  mappingPackage,
  organizationId,
  prismaCatalog,
  step,
  transaction,
}) {
  const prismaModel = getModelByDatabaseName(prismaCatalog, step.destinationTable);
  const databaseTable = databaseCatalog.tables.get(step.destinationTable);
  const base = stepBlockerBase(step);
  const runtimeCoverage = getRuntimeCoverage(mappingPackage, step, organizationId);
  if (
    (step.preflightState === "preflight_blocked" || step.blockedRows > 0) &&
    runtimeCoverage === null
  ) {
    addBlocker({
      ...base,
      reasonCode: "SEMANTIC_EVIDENCE_MISSING",
      field: "runtime_classifier",
    });
  }
  if (prismaModel === null) {
    addBlocker({ ...base, reasonCode: "PRISMA_DATABASE_DRIFT", field: null });
  }
  if (databaseTable === undefined) {
    addBlocker({ ...base, reasonCode: "DESTINATION_TABLE_MISSING", field: null });
    addBlocker({ ...base, reasonCode: "PRISMA_DATABASE_DRIFT", field: null });
    const conflictInput = validateConflictInputCoverage({
      addBlocker,
      databaseTable: { uniqueSets: [] },
      mappingPackage,
      prismaModel,
      step,
    });
    return emptyStepResult(step, conflictInput.summary);
  }
  if (prismaModel !== null) {
    validatePhysicalContract({ addBlocker, databaseTable, prismaCatalog, prismaModel, step });
  }

  const organizationColumn =
    prismaModel === null ? null : getFieldByDatabaseName(prismaModel, "organization_id");
  let tenant = {
    casteloRowCount: 0,
    distinctOrganizationCount: 0,
    otherTenantRowCount: 0,
    scopeProven: false,
  };
  if (organizationColumn !== null && databaseTable.columns.has(organizationColumn.databaseName)) {
    tenant = await getTenantDistribution({
      column: organizationColumn.databaseName,
      distributionCache,
      organizationId,
      table: step.destinationTable,
      transaction,
    });
    tenant.scopeProven =
      step.constants?.[organizationColumn.databaseName] === organizationId ||
      runtimeCoverage?.contract.tenantScope.column === organizationColumn.databaseName;
  }
  if (!tenant.scopeProven) {
    addBlocker({ ...base, reasonCode: "TENANT_SCOPE_UNPROVEN", field: "organization_id" });
  }

  const conflictInput = validateConflictInputCoverage({
    addBlocker,
    databaseTable,
    mappingPackage,
    prismaModel,
    step,
  });
  const { inputs } = conflictInput;
  await validateDeterministicIds({
    addBlocker,
    databaseTable,
    inputs,
    prismaModel,
    step,
    transaction,
  });
  if (conflictInput.uniqueCheckAllowed) {
    await validateUniqueCandidates({ addBlocker, databaseTable, inputs, step, transaction });
  }
  if (conflictInput.mergeCheckAllowed) {
    await validateMergeCandidates({
      addBlocker,
      databaseTable,
      inputs,
      organizationId,
      runtimeCoverage,
      step,
      transaction,
    });
  }
  return {
    blockerCodes: [],
    conflictChecks: conflictInput.summary,
    destinationTable: step.destinationTable,
    sourceTable: step.sourceTable,
    status: "ready",
    stepId: step.stepId,
    tenant,
  };
}

function validateConflictInputCoverage({
  addBlocker,
  databaseTable,
  mappingPackage,
  prismaModel,
  step,
}) {
  const key = stepKey(step);
  const provided = Object.hasOwn(mappingPackage.preflightInputs, key);
  const inputs =
    provided && isPlainObject(mappingPackage.preflightInputs[key])
      ? mappingPackage.preflightInputs[key]
      : {};
  const preparedRowCount = step.prepared;
  const deterministicRequired = step.identity?.kind === "generate";
  const mergeRequired = step.mode === "merge";
  const applicableUniqueSets = getApplicableUniqueSets(databaseTable, prismaModel, step);
  const deterministicCount = Array.isArray(inputs.deterministicIds)
    ? inputs.deterministicIds.length
    : 0;
  const uniqueCount = Array.isArray(inputs.uniqueCandidates) ? inputs.uniqueCandidates.length : 0;
  const mergeCount = Array.isArray(inputs.mergeCandidates) ? inputs.mergeCandidates.length : 0;
  const candidateCountExceeded = uniqueCount + mergeCount > MAX_CONFLICT_CANDIDATES_PER_STEP;
  const conflictValueCount =
    countCandidateValues(inputs.uniqueCandidates) + countCandidateValues(inputs.mergeCandidates);
  const parameterValueLimitExceeded = conflictValueCount > MAX_CONFLICT_PARAMETER_VALUES_PER_STEP;
  const uniqueQueryLengthExceeded =
    !candidateCountExceeded &&
    !parameterValueLimitExceeded &&
    hasOversizedUniqueConflictQuery({
      candidates: inputs.uniqueCandidates,
      databaseTable,
      table: step.destinationTable,
    });
  const candidateLimitExceeded =
    candidateCountExceeded || parameterValueLimitExceeded || uniqueQueryLengthExceeded;
  let complete = true;
  const markIncomplete = (field) => {
    complete = false;
    addBlocker({
      ...stepBlockerBase(step),
      reasonCode: "SEMANTIC_EVIDENCE_MISSING",
      field,
    });
  };

  if (candidateLimitExceeded) markIncomplete("preflight_inputs.candidate_limit");
  if (preparedRowCount > 0 && !provided) markIncomplete("preflight_inputs");
  if (preparedRowCount > 0 && inputs.preparedRowCount !== preparedRowCount) {
    markIncomplete("preflight_inputs.prepared_row_count");
  }
  if (
    preparedRowCount > 0 &&
    deterministicRequired &&
    (!Array.isArray(inputs.deterministicIds) ||
      deterministicCount !== preparedRowCount ||
      new Set(inputs.deterministicIds).size !== preparedRowCount)
  ) {
    markIncomplete("preflight_inputs.deterministic_ids");
  }
  if (preparedRowCount > 0 && applicableUniqueSets.length > 0) {
    if (!Array.isArray(inputs.uniqueCandidates)) {
      markIncomplete("preflight_inputs.unique_candidates");
    } else {
      const counts = new Map();
      for (const candidate of inputs.uniqueCandidates) {
        if (!isPlainObject(candidate) || !Array.isArray(candidate.columns)) {
          markIncomplete("preflight_inputs.unique_candidates");
          continue;
        }
        const signature = candidate.columns.join("\0");
        counts.set(signature, (counts.get(signature) ?? 0) + 1);
      }
      const expected = new Set(applicableUniqueSets.map(({ columns }) => columns.join("\0")));
      if (
        counts.size !== expected.size ||
        [...expected].some((signature) => counts.get(signature) !== preparedRowCount) ||
        [...counts].some(([signature]) => !expected.has(signature))
      ) {
        markIncomplete("preflight_inputs.unique_candidates");
      }
    }
  }
  if (
    preparedRowCount > 0 &&
    mergeRequired &&
    (!Array.isArray(inputs.mergeCandidates) || mergeCount !== preparedRowCount)
  ) {
    markIncomplete("preflight_inputs.merge_candidates");
  }

  return {
    inputs,
    mergeCheckAllowed: !candidateLimitExceeded,
    summary: {
      candidateLimitExceeded,
      complete,
      deterministicIdCandidateCount: deterministicCount,
      mergeCandidateCount: mergeCount,
      preparedRowCount,
      uniqueCandidateCount: uniqueCount,
      uniqueConstraintCount: applicableUniqueSets.length,
    },
    uniqueCheckAllowed: !candidateLimitExceeded,
  };
}

function countCandidateValues(candidates) {
  if (!Array.isArray(candidates)) return 0;
  let count = 0;
  for (const candidate of candidates) {
    if (!isPlainObject(candidate) || !Array.isArray(candidate.values)) continue;
    count += candidate.values.length;
    if (count > MAX_CONFLICT_PARAMETER_VALUES_PER_STEP) return count;
  }
  return count;
}

function hasOversizedUniqueConflictQuery({ candidates, databaseTable, table }) {
  if (!Array.isArray(candidates)) return false;
  const candidateCountBySignature = new Map();
  for (const candidate of candidates) {
    if (!isPlainObject(candidate) || !Array.isArray(candidate.columns)) continue;
    const uniqueSet = databaseTable.uniqueSets.find(({ columns }) =>
      sameArray(columns, candidate.columns),
    );
    if (uniqueSet === undefined) continue;
    const signature = uniqueSet.columns.join("\0");
    candidateCountBySignature.set(signature, {
      candidateCount: (candidateCountBySignature.get(signature)?.candidateCount ?? 0) + 1,
      uniqueSet,
    });
  }
  return [...candidateCountBySignature.values()].some(
    ({ candidateCount, uniqueSet }) =>
      buildUniqueBatchConflictQuery(table, uniqueSet, candidateCount).length >
      MAX_UNIQUE_CONFLICT_QUERY_LENGTH,
  );
}

function getApplicableUniqueSets(databaseTable, prismaModel, step) {
  const emittedColumns = new Set([
    ...step.columns
      .filter(({ status }) => status === "mapped")
      .map(({ destinationColumn }) => destinationColumn),
    ...Object.keys(step.constants),
    ...Object.keys(step.defaults),
  ]);
  const idColumn = prismaModel?.fields.find(({ id }) => id)?.databaseName ?? null;
  return databaseTable.uniqueSets.filter(
    ({ columns }) =>
      columns.every((column) => emittedColumns.has(column)) &&
      !(columns.length === 1 && columns[0] === idColumn),
  );
}

function validatePhysicalContract({ addBlocker, databaseTable, prismaCatalog, prismaModel, step }) {
  const base = stepBlockerBase(step);
  const usedColumns = new Set([
    ...step.columns
      .filter(({ status }) => status === "mapped")
      .map(({ destinationColumn }) => destinationColumn),
    ...Object.keys(step.constants),
    ...Object.keys(step.defaults),
  ]);
  for (const field of prismaModel.fields.filter(({ relationModel }) => relationModel === null)) {
    const actual = databaseTable.columns.get(field.databaseName);
    if (actual === undefined) {
      if (usedColumns.has(field.databaseName)) {
        addBlocker({
          ...base,
          reasonCode: "DESTINATION_COLUMN_MISSING",
          field: field.databaseName,
        });
      }
      addBlocker({ ...base, reasonCode: "PRISMA_DATABASE_DRIFT", field: field.databaseName });
      continue;
    }
    if (!isCompatibleType(field, actual)) {
      if (usedColumns.has(field.databaseName)) {
        addBlocker({
          ...base,
          reasonCode: "DESTINATION_TYPE_MISMATCH",
          field: field.databaseName,
        });
      }
      addBlocker({ ...base, reasonCode: "PRISMA_DATABASE_DRIFT", field: field.databaseName });
    }
    if (field.nullable !== actual.nullable) {
      if (usedColumns.has(field.databaseName)) {
        addBlocker({
          ...base,
          reasonCode: "DESTINATION_NULLABILITY_MISMATCH",
          field: field.databaseName,
        });
      }
      addBlocker({ ...base, reasonCode: "PRISMA_DATABASE_DRIFT", field: field.databaseName });
    }
  }

  const expectedUniqueSets = [
    ...prismaModel.fields
      .filter(({ id, unique }) => id || unique)
      .map(({ databaseName }) => [databaseName]),
    ...prismaModel.compoundUnique,
  ];
  for (const columns of expectedUniqueSets) {
    if (!databaseTable.uniqueSets.some((actual) => sameArray(actual.columns, columns))) {
      addBlocker({
        ...base,
        reasonCode: "DESTINATION_UNIQUE_MISMATCH",
        field: columns.join(","),
      });
      addBlocker({
        ...base,
        reasonCode: "PRISMA_DATABASE_DRIFT",
        field: columns.join(","),
      });
    }
  }

  for (const relation of prismaModel.fields.filter(
    ({ relationModel, relationFields }) => relationModel !== null && relationFields.length > 0,
  )) {
    const relatedModel = prismaCatalog.models.find(
      ({ prismaName }) => prismaName === relation.relationModel,
    );
    const columns = relation.relationFields.map(
      (name) => prismaModel.fields.find(({ prismaName }) => prismaName === name)?.databaseName,
    );
    const foreignColumns = relation.relationReferences.map(
      (name) => relatedModel?.fields.find(({ prismaName }) => prismaName === name)?.databaseName,
    );
    const matches = databaseTable.foreignKeys.some(
      (foreignKey) =>
        foreignKey.foreignTable === relatedModel?.databaseName &&
        sameArray(foreignKey.columns, columns) &&
        sameArray(foreignKey.foreignColumns, foreignColumns),
    );
    if (!matches) {
      addBlocker({
        ...base,
        reasonCode: "DESTINATION_FK_MISMATCH",
        field: columns.join(","),
      });
      addBlocker({
        ...base,
        reasonCode: "PRISMA_DATABASE_DRIFT",
        field: columns.join(","),
      });
    }
  }
}

async function getTenantDistribution({
  column,
  distributionCache,
  organizationId,
  table,
  transaction,
}) {
  const key = `${table}\0${column}`;
  if (distributionCache.has(key)) return { ...distributionCache.get(key) };
  const quotedColumn = quoteIdentifier(column);
  const result = await transaction.query({
    text: [
      `SELECT COUNT(*) FILTER (WHERE ${quotedColumn} = $1)::bigint AS castelo_row_count,`,
      `COUNT(*) FILTER (WHERE ${quotedColumn} IS DISTINCT FROM $1)::bigint`,
      "AS other_tenant_row_count,",
      `COUNT(DISTINCT ${quotedColumn})::bigint AS distinct_organization_count`,
      `FROM ${quoteQualified(table)}`,
    ].join(" "),
    values: [organizationId],
  });
  const distribution = {
    casteloRowCount: singleCount(result, "castelo_row_count"),
    distinctOrganizationCount: singleCount(result, "distinct_organization_count"),
    otherTenantRowCount: singleCount(result, "other_tenant_row_count"),
    scopeProven: false,
  };
  distributionCache.set(key, distribution);
  return { ...distribution };
}

async function validateDeterministicIds({
  addBlocker,
  databaseTable,
  inputs,
  prismaModel,
  step,
  transaction,
}) {
  if (!Array.isArray(inputs.deterministicIds) || inputs.deterministicIds.length === 0) return;
  const ids = [...new Set(inputs.deterministicIds)].sort(compareText);
  if (!ids.every(isUuid)) throw new Error("ID determinístico inválido no preflight.");
  const idField = prismaModel?.fields.find(({ id }) => id) ?? null;
  if (idField === null || !databaseTable.columns.has(idField.databaseName)) return;
  for (let offset = 0; offset < ids.length; offset += ID_QUERY_BATCH_SIZE) {
    const result = await transaction.query({
      text: `SELECT COUNT(*)::bigint AS deterministic_id_conflict_count FROM ${quoteQualified(
        step.destinationTable,
      )} WHERE ${quoteIdentifier(idField.databaseName)} = ANY($1)`,
      values: [ids.slice(offset, offset + ID_QUERY_BATCH_SIZE)],
    });
    if (singleCount(result, "deterministic_id_conflict_count") > 0) {
      addBlocker({
        ...stepBlockerBase(step),
        reasonCode: "DETERMINISTIC_ID_CONFLICT",
        field: idField.databaseName,
      });
      break;
    }
  }
}

async function validateUniqueCandidates({ addBlocker, databaseTable, inputs, step, transaction }) {
  if (!Array.isArray(inputs.uniqueCandidates) || inputs.uniqueCandidates.length === 0) return;
  const candidatesByUniqueSet = new Map();
  for (const candidate of inputs.uniqueCandidates) {
    const normalized = normalizeCandidate(candidate, databaseTable);
    const uniqueSet = databaseTable.uniqueSets.find(({ columns }) =>
      sameArray(columns, normalized.columns),
    );
    if (uniqueSet === undefined) continue;
    const signature = uniqueSet.columns.join("\0");
    const group = candidatesByUniqueSet.get(signature) ?? { candidates: [], uniqueSet };
    group.candidates.push(normalized);
    candidatesByUniqueSet.set(signature, group);
  }
  for (const { candidates, uniqueSet } of [...candidatesByUniqueSet.values()].sort((left, right) =>
    compareArrays(left.uniqueSet.columns, right.uniqueSet.columns),
  )) {
    const result = await transaction.query({
      text: buildUniqueBatchConflictQuery(step.destinationTable, uniqueSet, candidates.length),
      values: candidates.flatMap(({ values }) => values),
    });
    const hasIntraBatchConflict = singleCount(result, "intra_batch_unique_conflict_count") > 0;
    const hasDestinationConflict = singleCount(result, "unique_match_count") > 0;
    if (hasIntraBatchConflict || hasDestinationConflict) {
      addBlocker({
        ...stepBlockerBase(step),
        reasonCode: "UNIQUE_VALUE_CONFLICT",
        field: uniqueSet.columns.join(","),
      });
    }
  }
}

function buildUniqueBatchConflictQuery(table, uniqueSet, candidateCount) {
  const quotedColumns = uniqueSet.columns.map(quoteIdentifier);
  const anchorProjection = quotedColumns.join(", ");
  const candidateArms = Array.from({ length: candidateCount }, (_, candidateIndex) => {
    const placeholders = quotedColumns.map(
      (_, columnIndex) => `$${candidateIndex * quotedColumns.length + columnIndex + 1}`,
    );
    return `UNION ALL SELECT ${placeholders.join(", ")}`;
  }).join(" ");
  const eligibleFilter = uniqueSet.nullsNotDistinct
    ? ""
    : ` WHERE ${quotedColumns.map((column) => `${column} IS NOT NULL`).join(" AND ")}`;
  const destinationJoin = quotedColumns
    .map((column) => {
      const operator = uniqueSet.nullsNotDistinct ? "IS NOT DISTINCT FROM" : "=";
      return `destination.${column} ${operator} candidates.${column}`;
    })
    .join(" AND ");
  return [
    "WITH typed_candidates AS (",
    `SELECT ${anchorProjection} FROM ${quoteQualified(table)} WHERE FALSE`,
    candidateArms,
    "), eligible_candidates AS (",
    `SELECT ${anchorProjection} FROM typed_candidates${eligibleFilter}`,
    "), intra_batch_conflicts AS (",
    `SELECT 1 FROM eligible_candidates GROUP BY ${anchorProjection} HAVING COUNT(*) > 1`,
    "), destination_conflicts AS (",
    `SELECT 1 FROM eligible_candidates AS candidates JOIN ${quoteQualified(
      table,
    )} AS destination ON ${destinationJoin}`,
    "), intra_batch_conflict_count AS (",
    "SELECT COUNT(*)::bigint AS intra_batch_unique_conflict_count FROM intra_batch_conflicts",
    "), destination_conflict_count AS (",
    "SELECT COUNT(*)::bigint AS unique_match_count FROM destination_conflicts",
    ") SELECT intra_batch_unique_conflict_count, unique_match_count",
    "FROM intra_batch_conflict_count CROSS JOIN destination_conflict_count",
  ].join(" ");
}

async function validateMergeCandidates({
  addBlocker,
  databaseTable,
  inputs,
  organizationId,
  runtimeCoverage,
  step,
  transaction,
}) {
  if (step.mode !== "merge") return;
  if (!Array.isArray(inputs.mergeCandidates) || inputs.mergeCandidates.length === 0) {
    return;
  }
  const tenantColumn = runtimeCoverage?.contract.tenantScope.column ?? "organization_id";
  const identityColumns = runtimeCoverage?.contract.cleanup?.identityColumns?.filter(
    (column) => column !== tenantColumn,
  );
  for (const candidate of inputs.mergeCandidates) {
    const normalized = normalizeCandidate(candidate, databaseTable);
    if (
      Array.isArray(identityColumns) &&
      identityColumns.length > 0 &&
      !sameArray(normalized.columns, identityColumns)
    ) {
      addBlocker({
        ...stepBlockerBase(step),
        reasonCode: "MERGE_IDENTITY_CONFLICT",
        field: normalized.columns.join(","),
      });
      continue;
    }
    const tenantIndex = normalized.columns.indexOf(tenantColumn);
    if (tenantIndex >= 0 && normalized.values[tenantIndex] !== organizationId) {
      addBlocker({
        ...stepBlockerBase(step),
        reasonCode: "MERGE_IDENTITY_CONFLICT",
        field: tenantColumn,
      });
      continue;
    }
    const columns = tenantIndex >= 0 ? normalized.columns : [...normalized.columns, tenantColumn];
    const values = tenantIndex >= 0 ? normalized.values : [...normalized.values, organizationId];
    const result = await transaction.query({
      text: buildCandidateCountQuery(step.destinationTable, columns, "merge_match_count"),
      values,
    });
    if (singleCount(result, "merge_match_count") !== 1) {
      addBlocker({
        ...stepBlockerBase(step),
        reasonCode: "MERGE_IDENTITY_CONFLICT",
        field: normalized.columns.join(","),
      });
    }
  }
}

function buildCandidateCountQuery(table, columns, alias) {
  const predicates = columns.map((column, index) => `${quoteIdentifier(column)} = $${index + 1}`);
  return `SELECT COUNT(*)::bigint AS ${alias} FROM ${quoteQualified(table)} WHERE ${predicates.join(
    " AND ",
  )}`;
}

function normalizeCandidate(candidate, databaseTable) {
  if (
    !isPlainObject(candidate) ||
    !Array.isArray(candidate.columns) ||
    !Array.isArray(candidate.values)
  ) {
    throw new TypeError("Candidato de preflight inválido.");
  }
  if (
    candidate.columns.length === 0 ||
    candidate.columns.length !== candidate.values.length ||
    candidate.columns.length > 16
  ) {
    throw new Error("Candidato de preflight possui cardinalidade inválida.");
  }
  const columns = candidate.columns.map((column) => requireIdentifier(column, "candidate.column"));
  if (new Set(columns).size !== columns.length) {
    throw new Error("Candidato de preflight possui coluna duplicada.");
  }
  if (!columns.every((column) => databaseTable.columns.has(column))) {
    throw new Error("Candidato de preflight referencia coluna inexistente.");
  }
  if (!candidate.values.every(isSafeQueryScalar)) {
    throw new TypeError("Candidato de preflight possui valor inválido.");
  }
  return { columns, values: [...candidate.values] };
}

function validateEvidence(mappingPackage, addBlocker) {
  for (const mapping of [...mappingPackage.tableMappings, ...mappingPackage.pendingTables]) {
    const decision = mappingPackage.evidenceRegistry.get(mapping.sourceTable);
    const expectedStatus = mapping.status;
    const hasLegacyEvidence =
      Array.isArray(decision?.legacyReferences) && decision.legacyReferences.length > 0;
    const hasProvenAbsence =
      expectedStatus === "pending" &&
      decision?.reasonCode === "NO_LEGACY_RUNTIME_REFERENCE" &&
      Array.isArray(decision?.legacyRelationships) &&
      decision.legacyRelationships.length > 0;
    const valid =
      isPlainObject(decision) &&
      decision.sourceTable === mapping.sourceTable &&
      decision.finalStatus === expectedStatus &&
      (hasLegacyEvidence || hasProvenAbsence) &&
      (expectedStatus === "pending" ||
        (Array.isArray(decision.currentContractEvidence) &&
          decision.currentContractEvidence.length > 0 &&
          typeof decision.ruleId === "string" &&
          decision.ruleId.length > 0));
    if (!valid) {
      addBlocker({
        reasonCode: "SEMANTIC_EVIDENCE_MISSING",
        scope: "source",
        sourceTable: mapping.sourceTable,
      });
    }
  }
}

function validatePendingAndQuarantine(mappingPackage, addBlocker) {
  if (mappingPackage.quarantineSummary.unresolved > 0) {
    addBlocker({
      count: mappingPackage.quarantineSummary.unresolved,
      reasonCode: "UNRESOLVED_QUARANTINE_EXISTS",
      scope: "quarantine",
    });
  }
}

function buildDependencyOrder(mappingPackage, addBlocker) {
  const nodes = new Set(mappingPackage.tableMappings.map(({ sourceTable }) => sourceTable));
  const dependencies = new Map([...nodes].map((sourceTable) => [sourceTable, new Set()]));
  for (const table of mappingPackage.tableMappings) {
    for (const dependency of table.dependencies) {
      if (nodes.has(dependency)) dependencies.get(table.sourceTable).add(dependency);
      else if (
        !mappingPackage.pendingTables.some(({ sourceTable }) => sourceTable === dependency)
      ) {
        addBlocker({
          reasonCode: "SEMANTIC_EVIDENCE_MISSING",
          scope: "dependency",
          sourceTable: table.sourceTable,
        });
      }
    }
  }
  for (const step of mappingPackage.destinationMappings) {
    for (const dependency of step.dependencies) {
      if (nodes.has(dependency)) dependencies.get(step.sourceTable).add(dependency);
      else if (
        !mappingPackage.pendingTables.some(({ sourceTable }) => sourceTable === dependency)
      ) {
        addBlocker({ ...stepBlockerBase(step), reasonCode: "SEMANTIC_EVIDENCE_MISSING" });
      }
    }
  }

  const sourceOrder = [];
  const remaining = new Map([...dependencies].map(([source, values]) => [source, new Set(values)]));
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter(([, values]) => [...values].every((dependency) => !remaining.has(dependency)))
      .map(([source]) => source)
      .sort(compareText);
    if (ready.length === 0) break;
    for (const source of ready) {
      sourceOrder.push(source);
      remaining.delete(source);
    }
  }
  if (remaining.size > 0) {
    addBlocker({
      count: remaining.size,
      reasonCode: "DEPENDENCY_CYCLE",
      scope: "dependencies",
    });
  }
  return { sourceOrder };
}

function normalizeMappingPackage(value) {
  if (!isPlainObject(value)) throw new TypeError("Mapping package inválido.");
  const tableMappings = requireArray(value.tableMappings, "tableMappings").map(normalizeTable);
  const destinationMappings = requireArray(value.destinationMappings, "destinationMappings").map(
    normalizeStep,
  );
  const columnMappings = requireArray(value.columnMappings, "columnMappings").map(
    normalizeColumnMapping,
  );
  const pendingTables = requireArray(value.pendingTables, "pendingTables").map(normalizePending);
  if (!isPlainObject(value.quarantineSummary)) {
    throw new TypeError("quarantineSummary inválido.");
  }
  const unresolved = value.quarantineSummary.unresolved;
  if (!Number.isSafeInteger(unresolved) || unresolved < 0) {
    throw new TypeError("quarantineSummary.unresolved inválido.");
  }
  const evidenceRegistry = normalizeEvidenceRegistry(value.evidenceRegistry);
  const preflightInputs = value.preflightInputs ?? {};
  if (!isPlainObject(preflightInputs)) throw new TypeError("preflightInputs inválido.");
  const runtimeCoverage = normalizeRuntimeCoverage(value.runtimeCoverage ?? {});

  const sources = new Set();
  for (const mapping of [...tableMappings, ...pendingTables]) {
    if (sources.has(mapping.sourceTable))
      throw new Error("sourceTable duplicada no mapping package.");
    sources.add(mapping.sourceTable);
  }
  const stepKeys = new Set();
  for (const step of destinationMappings) {
    if (!sources.has(step.sourceTable)) {
      throw new Error("Destination step sem sourceTable classificada.");
    }
    const key = stepKey(step);
    if (stepKeys.has(key)) throw new Error("Destination step duplicado.");
    stepKeys.add(key);
  }
  for (const key of runtimeCoverage.keys()) {
    if (!stepKeys.has(key)) throw new Error("Cobertura executável possui step extra.");
  }
  validateColumnBindings(destinationMappings, columnMappings);
  return {
    columnMappings,
    destinationMappings,
    evidenceRegistry,
    pendingTables,
    preflightInputs,
    quarantineSummary: { unresolved },
    runtimeCoverage,
    tableMappings,
  };
}

function normalizeRuntimeCoverage(value) {
  const entries =
    value instanceof Map ? [...value] : isPlainObject(value) ? Object.entries(value) : null;
  if (entries === null) throw new TypeError("runtimeCoverage inválido.");
  const coverage = new Map();
  for (const [key, entry] of entries) {
    if (typeof key !== "string" || !key.includes("\0") || !isPlainObject(entry?.contract)) {
      throw new TypeError("runtimeCoverage contém contrato inválido.");
    }
    const destinationTable = requireDatabaseName(
      entry.destinationTable,
      "runtimeCoverage.destinationTable",
    );
    const tenantScope = entry.contract.tenantScope;
    if (
      !isPlainObject(tenantScope) ||
      tenantScope.kind !== "organization_column" ||
      tenantScope.column !== "organization_id" ||
      typeof tenantScope.organizationId !== "string"
    ) {
      throw new TypeError("runtimeCoverage.tenantScope inválido.");
    }
    coverage.set(key, {
      destinationTable,
      contract: {
        ...entry.contract,
        tenantScope: { ...tenantScope },
      },
    });
  }
  return coverage;
}

function getRuntimeCoverage(mappingPackage, step, organizationId) {
  const coverage = mappingPackage.runtimeCoverage.get(stepKey(step));
  if (
    coverage?.destinationTable !== step.destinationTable ||
    coverage.contract.tenantScope.kind !== "organization_column" ||
    coverage.contract.tenantScope.column !== "organization_id" ||
    coverage.contract.tenantScope.organizationId !== organizationId ||
    coverage.contract.write?.kind !== expectedWriteKind(step.mode)
  ) {
    return null;
  }
  return coverage;
}

function expectedWriteKind(mode) {
  if (["insert", "derived"].includes(mode)) return "insert";
  if (mode === "lookup") return "none";
  if (mode === "merge") return "update_exactly_one";
  if (mode === "aggregate") return "replace_owned_aggregate";
  return null;
}

function normalizeColumnMapping(column) {
  if (!isPlainObject(column) || !new Set(["mapped", "not_preserved"]).has(column.status)) {
    throw new TypeError("columnMappings contém contrato inválido.");
  }
  return {
    ...column,
    destinationColumn:
      column.destinationColumn === null
        ? null
        : requireIdentifier(column.destinationColumn, "columnMappings.destinationColumn"),
    destinationTable: requireDatabaseName(
      column.destinationTable,
      "columnMappings.destinationTable",
    ),
    sourceColumn:
      column.sourceColumn === null
        ? null
        : requireIdentifier(column.sourceColumn, "columnMappings.sourceColumn"),
    sourceTable: requireTechnicalName(column.sourceTable, "columnMappings.sourceTable"),
    stepId: requireTechnicalName(column.stepId, "columnMappings.stepId"),
  };
}

function validateColumnBindings(destinationMappings, columnMappings) {
  const expected = destinationMappings.flatMap((step) =>
    step.columns.map((column) => columnBindingSignature(step, column)),
  );
  const actual = columnMappings.map((column) => columnBindingSignature(column, column));
  expected.sort(compareText);
  actual.sort(compareText);
  if (!sameArray(expected, actual) || new Set(actual).size !== actual.length) {
    throw new Error("columnMappings diverge dos destination mappings.");
  }
}

function columnBindingSignature(step, column) {
  return [
    step.sourceTable,
    step.stepId,
    step.destinationTable,
    column.sourceColumn,
    column.destinationColumn ?? "",
    column.status,
  ].join("\0");
}

function normalizeTable(table) {
  if (!isPlainObject(table) || table.status !== "confirmed") {
    throw new TypeError("Table mapping confirmed inválido.");
  }
  return {
    ...table,
    dependencies: normalizeStringArray(table.dependencies, "table.dependencies"),
    sourceTable: requireTechnicalName(table.sourceTable, "table.sourceTable"),
  };
}

function normalizePending(table) {
  if (!isPlainObject(table) || table.status !== "pending") {
    throw new TypeError("Pending mapping inválido.");
  }
  return { ...table, sourceTable: requireTechnicalName(table.sourceTable, "pending.sourceTable") };
}

function normalizeStep(step) {
  if (!isPlainObject(step)) throw new TypeError("Destination step inválido.");
  for (const field of ["readRows", "prepared", "quarantine", "notEmitted", "blockedRows"]) {
    if (!Number.isSafeInteger(step[field]) || step[field] < 0) {
      throw new TypeError(`Destination step possui contagem ${field} inválida.`);
    }
  }
  const columns = requireArray(step.columns, "step.columns").map((column) => {
    if (!isPlainObject(column) || !new Set(["mapped", "not_preserved"]).has(column.status)) {
      throw new TypeError("Column mapping inválido.");
    }
    return {
      ...column,
      destinationColumn:
        column.destinationColumn === null
          ? null
          : requireIdentifier(column.destinationColumn, "column.destinationColumn"),
    };
  });
  const constants = normalizeScalarRecord(step.constants, "step.constants");
  const defaults = normalizeScalarRecord(step.defaults, "step.defaults");
  return {
    ...step,
    columns,
    constants,
    defaults,
    dependencies: normalizeStringArray(step.dependencies, "step.dependencies"),
    destinationTable: requireDatabaseName(step.destinationTable, "step.destinationTable"),
    sourceTable: requireTechnicalName(step.sourceTable, "step.sourceTable"),
    stepId: requireTechnicalName(step.stepId, "step.stepId"),
  };
}

function normalizeEvidenceRegistry(value) {
  if (value instanceof Map) return new Map(value);
  if (Array.isArray(value)) {
    return new Map(value.map((decision) => [decision.sourceTable, decision]));
  }
  throw new TypeError("EvidenceRegistry inválido.");
}

function normalizeConfigurationChecks(values) {
  if (!Array.isArray(values)) throw new TypeError("Configurações requeridas devem ser array.");
  const byName = new Map();
  for (const value of values) {
    const name = typeof value === "string" ? value : value?.name;
    if (typeof name !== "string" || !/^[A-Z][A-Z0-9_]{2,99}$/.test(name)) {
      throw new TypeError("Nome de configuração requerido inválido.");
    }
    const configured =
      typeof value === "string" ? hasConfiguredEnvironmentValue(name) : value.configured === true;
    byName.set(name, { configured, name });
  }
  return [...byName.values()].sort((left, right) => compareText(left.name, right.name));
}

function createBlockerCollector(blockers) {
  const signatures = new Set();
  return (blocker) => {
    if (!BLOCKER_CODES.has(blocker.reasonCode)) {
      throw new Error("Código de blocker de preflight inválido.");
    }
    const normalized = Object.fromEntries(
      Object.entries(blocker).filter(([, value]) => value !== undefined),
    );
    const signature = JSON.stringify(normalized, Object.keys(normalized).sort());
    if (!signatures.has(signature)) {
      signatures.add(signature);
      blockers.push(normalized);
    }
  };
}

function stepBlockerBase(step) {
  return {
    destinationTable: step.destinationTable,
    scope: "step",
    sourceTable: step.sourceTable,
    stepId: step.stepId,
  };
}

function emptyStepResult(step, conflictChecks) {
  return {
    blockerCodes: [],
    conflictChecks: conflictChecks ?? {
      candidateLimitExceeded: false,
      complete: step.prepared === 0,
      deterministicIdCandidateCount: 0,
      mergeCandidateCount: 0,
      preparedRowCount: step.prepared,
      uniqueCandidateCount: 0,
      uniqueConstraintCount: 0,
    },
    destinationTable: step.destinationTable,
    sourceTable: step.sourceTable,
    status: "blocked",
    stepId: step.stepId,
    tenant: {
      casteloRowCount: 0,
      distinctOrganizationCount: 0,
      otherTenantRowCount: 0,
      scopeProven: false,
    },
  };
}

function isCompatibleType(field, actual) {
  const type = actual.dataType.toLowerCase();
  const udt = actual.udtName.toLowerCase();
  if (field.list) {
    return type === "array" && isCompatibleScalarType(field.prismaType, udt.replace(/^_/, ""));
  }
  return (
    isCompatibleScalarType(field.prismaType, type) || isCompatibleScalarType(field.prismaType, udt)
  );
}

function isCompatibleScalarType(prismaType, databaseType) {
  const accepted = {
    BigInt: new Set(["bigint", "int8"]),
    Boolean: new Set(["boolean", "bool"]),
    Bytes: new Set(["bytea"]),
    DateTime: new Set([
      "date",
      "timestamp",
      "timestamp with time zone",
      "timestamp without time zone",
      "timestamptz",
    ]),
    Decimal: new Set(["decimal", "numeric"]),
    Float: new Set(["double precision", "float4", "float8", "real"]),
    Int: new Set(["int2", "int4", "integer", "smallint"]),
    Json: new Set(["json", "jsonb"]),
    String: new Set([
      "bpchar",
      "character",
      "character varying",
      "citext",
      "text",
      "uuid",
      "varchar",
    ]),
  }[prismaType];
  if (accepted !== undefined) return accepted.has(databaseType);
  return databaseType === "user-defined" || databaseType === prismaType.toLowerCase();
}

function quoteQualified(table) {
  return `${quoteIdentifier(DATABASE_SCHEMA)}.${quoteDatabaseName(table)}`;
}

function quoteIdentifier(value) {
  requireIdentifier(value, "identificador SQL");
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteDatabaseName(value) {
  requireDatabaseName(value, "nome físico SQL");
  return `"${value.replaceAll('"', '""')}"`;
}

function singleCount(result, field) {
  const rows = requireRows(result, field);
  if (rows.length !== 1) throw new Error("Consulta de contagem retornou cardinalidade inválida.");
  return parseCount(rows[0][field], field);
}

function parseCount(value, label) {
  if (!/^(?:0|[1-9]\d*)$/.test(String(value))) {
    throw new Error(`Contagem PostgreSQL inválida em ${label}.`);
  }
  const count = Number(value);
  if (!Number.isSafeInteger(count)) throw new Error(`Contagem PostgreSQL inválida em ${label}.`);
  return count;
}

function parseOrdinal(value) {
  const ordinal = Number(value);
  if (!Number.isSafeInteger(ordinal) || ordinal <= 0) {
    throw new Error("Ordinal de constraint inválido.");
  }
  return ordinal;
}

function parseNullable(value) {
  if (value === "YES") return true;
  if (value === "NO") return false;
  throw new Error("Nulabilidade PostgreSQL inválida.");
}

function parseBoolean(value, label) {
  if (value === true || value === false) return value;
  throw new Error(`Booleano PostgreSQL inválido em ${label}.`);
}

function getOrCreateTable(tables, name) {
  if (!tables.has(name)) {
    tables.set(name, { columns: new Map(), foreignKeys: [], uniqueSets: [] });
  }
  return tables.get(name);
}

function orderedNames(entries) {
  return [...entries].sort((left, right) => left.ordinal - right.ordinal).map(({ name }) => name);
}

function requireRows(result, label) {
  const rowsDescriptor =
    result !== null && typeof result === "object"
      ? Object.getOwnPropertyDescriptor(result, "rows")
      : undefined;
  if (
    rowsDescriptor === undefined ||
    rowsDescriptor.get !== undefined ||
    rowsDescriptor.set !== undefined ||
    !Array.isArray(rowsDescriptor.value) ||
    Object.getPrototypeOf(rowsDescriptor.value) !== Array.prototype
  ) {
    throw new Error(`Resposta PostgreSQL inválida para ${label}.`);
  }
  return rowsDescriptor.value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} deve ser array.`);
  return value;
}

function normalizeStringArray(value, label) {
  return requireArray(value, label).map((entry) => requireTechnicalName(entry, label));
}

function normalizeScalarRecord(value, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} deve ser objeto.`);
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      requireIdentifier(key, label);
      if (!isSafeQueryScalar(entry)) throw new TypeError(`${label} possui valor inválido.`);
      return [key, entry];
    }),
  );
}

function requireIdentifier(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new TypeError(`${label} inválido.`);
  }
  return value;
}

function requireDatabaseName(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(value)) {
    throw new TypeError(`${label} inválido.`);
  }
  return value;
}

function requireCatalogObjectName(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 256 ||
    // biome-ignore lint/suspicious/noControlCharactersInRegex: identificadores SQL rejeitam controles ASCII.
    /[\0-\x1f\x7f]/.test(value)
  ) {
    throw new TypeError(`${label} inválido.`);
  }
  return value;
}

function requireTechnicalName(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 256 ||
    !/^[A-Za-z0-9_.:-]+$/.test(value)
  ) {
    throw new TypeError(`${label} inválido.`);
  }
  return value;
}

function requireNonEmptyText(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw new TypeError(`${label} inválido.`);
  }
  return value;
}

function validatePrismaCatalog(value) {
  if (!isPlainObject(value) || !Array.isArray(value.models)) {
    throw new TypeError("PrismaCatalog inválido.");
  }
}

function assertCasteloOrganization(value) {
  if (value !== CASTELO_ORGANIZATION_ID) {
    throw new Error("organization-id deve identificar a Castelo Contabilidade nesta V4.");
  }
}

function hasConfiguredEnvironmentValue(name) {
  return typeof process.env[name] === "string" && process.env[name].length > 0;
}

function isSafeQueryScalar(value) {
  return (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && value.length <= 4096)
  );
}

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function isPlainObject(value) {
  return (
    value !== null &&
    value !== undefined &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function stepKey(step) {
  return `${step.sourceTable}\0${step.stepId}`;
}

function compareSteps(left, right) {
  return compareText(stepKey(left), stepKey(right));
}

function compareBlockers(left, right) {
  return compareText(
    [
      left.reasonCode,
      left.scope,
      left.sourceTable ?? "",
      left.stepId ?? "",
      left.destinationTable ?? "",
      left.field ?? "",
      left.configurationName ?? "",
    ].join("\0"),
    [
      right.reasonCode,
      right.scope,
      right.sourceTable ?? "",
      right.stepId ?? "",
      right.destinationTable ?? "",
      right.field ?? "",
      right.configurationName ?? "",
    ].join("\0"),
  );
}

function compareArrays(left, right) {
  return compareText(left.join("\0"), right.join("\0"));
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
