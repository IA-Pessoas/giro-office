import {
  assertRuleMatchesPrisma,
  getFieldByDatabaseName,
  getModelByDatabaseName,
} from "./prisma-catalog.mjs";

export const REQUIRED_IDENTITY_NAMESPACE = "3f68d246-0b54-4a10-9415-a8845a767fb5";

const CARDINALITIES = new Set(["1:1", "N:1", "1:N"]);
const COLUMN_STATUSES = new Set(["mapped", "not_preserved"]);
const DESTINATION_MODES = new Set(["insert", "merge", "lookup", "derived", "aggregate"]);
const EVIDENCE_CONFIDENCES = new Set(["high", "medium", "low"]);
const EVIDENCE_OPERATIONS = new Set(["delete", "dynamic", "insert", "select", "update"]);
const EMISSION_STATUSES = new Set(["prepared", "quarantine", "not_emitted"]);
const SENSITIVITIES = new Set(["none", "personal", "credential", "secret"]);
const UNSAFE_SENSITIVE_TRANSFORMATIONS = new Set(["plain", "copy", "preserve_raw"]);
const RULE_FIELDS = new Set([
  "sourceTable",
  "status",
  "domain",
  "ruleOrigin",
  "evidence",
  "cardinality",
  "dependencies",
  "executionContract",
  "destinations",
  "classifySourceRow",
  "emitRows",
]);
const STEP_FIELDS = new Set([
  "stepId",
  "destinationTable",
  "mode",
  "identity",
  "columns",
  "constants",
  "defaults",
  "precedence",
  "dependencies",
]);
const COLUMN_FIELDS = new Set([
  "sourceColumn",
  "destinationColumn",
  "status",
  "transformation",
  "nullHandling",
  "referenceRole",
  "sensitivity",
  "reason",
]);
const EMISSION_FIELDS = new Set([
  "stepId",
  "destinationTable",
  "status",
  "identityRef",
  "field",
  "reasonCode",
]);
const RAW_EMITTERS = new WeakMap();

export function validateMappingRule(rule, prismaCatalog) {
  validateMappingRuleStructure(rule, prismaCatalog);
  const stepsById = new Map(rule.destinations.map((step) => [step.stepId, step]));
  const emitRows = wrapEmissionBoundary(rule, stepsById);
  emitRows(Object.freeze({}), Object.freeze({}));
  return true;
}

export function validateMappingRuleStructure(rule, prismaCatalog) {
  assertKnownFields(rule, RULE_FIELDS, "MappingRule");
  assertNonEmptyString(rule?.sourceTable, "sourceTable");
  if (rule?.status !== "confirmed") {
    throw new Error("Status da regra registrada deve ser confirmed");
  }
  assertNonEmptyString(rule?.domain, "domain");
  assertNonEmptyString(rule?.ruleOrigin, "ruleOrigin");
  validateEvidence(rule?.evidence);
  if (!CARDINALITIES.has(rule?.cardinality)) {
    throw new Error(`Cardinality inválida: ${String(rule?.cardinality)}`);
  }
  validateDependencies(rule?.dependencies);
  if (!Array.isArray(rule?.destinations) || rule.destinations.length === 0) {
    throw new Error("destinations deve ser um array não vazio");
  }
  if (typeof rule.classifySourceRow !== "function") {
    throw new Error("classifySourceRow deve ser uma função pura de classificação");
  }
  if (typeof rule.emitRows !== "function") {
    throw new Error("emitRows deve ser uma função pura de emissão");
  }

  const stepsById = new Map();
  for (const step of rule.destinations) {
    assertNonEmptyString(step?.stepId, "stepId");
    if (stepsById.has(step.stepId)) {
      throw new Error(`stepId duplicado na regra: ${step.stepId}`);
    }
    validateDestinationStep(step, prismaCatalog);
    stepsById.set(step.stepId, step);
  }
  validateExecutionContract(rule.executionContract, stepsById);

  return true;
}

export function validateMappingEmissions(rule, emissions) {
  const stepsById = new Map(rule.destinations.map((step) => [step.stepId, step]));
  return validateEmissionDecisions(emissions, stepsById);
}

function validateExecutionContract(contract, stepsById) {
  if (contract === undefined) return;
  assertExactFields(contract, ["contextMode", "steps"], "ExecutionContract");
  if (contract.contextMode !== "context_free") {
    throw new Error("ExecutionContract desta fase aceita somente context_free explícito");
  }
  if (!isPlainObject(contract.steps)) {
    throw new TypeError("ExecutionContract.steps deve ser um objeto por stepId");
  }

  for (const stepId of stepsById.keys()) {
    if (!Object.hasOwn(contract.steps, stepId)) {
      throw new Error(`ExecutionContract possui cobertura ausente para ${stepId}`);
    }
  }
  const conditionIds = new Set();
  for (const stepId of Object.keys(contract.steps)) {
    if (!stepsById.has(stepId)) {
      throw new Error(`ExecutionContract possui stepId extra ou desconhecido: ${stepId}`);
    }
    validateStepExecutionContract(contract.steps[stepId], stepId, conditionIds);
  }
}

function validateStepExecutionContract(contract, stepId, conditionIds) {
  const label = `ExecutionContract.steps.${stepId}`;
  assertExactFields(
    contract,
    ["contextRequirements", "decisionSource", "preparedWhen", "quarantineWhen", "notEmittedWhen"],
    label,
  );
  validateStringArray(contract.contextRequirements, `${label}.contextRequirements`, {
    allowEmpty: true,
  });
  if (contract.contextRequirements.length !== 0) {
    throw new Error(`${label} context_free não aceita contextRequirements`);
  }
  if (contract.decisionSource !== "emit_rows") {
    throw new Error(`${label}.decisionSource deve ser emit_rows`);
  }
  for (const [field, outcome] of [
    ["preparedWhen", "prepared"],
    ["quarantineWhen", "quarantine"],
    ["notEmittedWhen", "not_emitted"],
  ]) {
    validateExecutionCondition(contract[field], {
      conditionIds,
      field: `${label}.${field}`,
      outcome,
      stepId,
    });
  }
}

function validateExecutionCondition(condition, { conditionIds, field, outcome, stepId }) {
  assertExactFields(condition, ["stepId", "outcome", "conditionId", "predicate"], field);
  if (condition.stepId !== stepId) {
    throw new Error(`${field}.stepId deve coincidir com ${stepId}`);
  }
  if (condition.outcome !== outcome) {
    throw new Error(`${field}.outcome deve coincidir com ${outcome}`);
  }
  assertSafeReference(condition.conditionId, `${field}.conditionId`);
  if (conditionIds.has(condition.conditionId)) {
    throw new Error(`${field}.conditionId duplicado`);
  }
  conditionIds.add(condition.conditionId);
  assertExactFields(condition.predicate, ["kind", "source", "value"], `${field}.predicate`);
  if (
    condition.predicate.kind !== "decision_outcome_equals" ||
    condition.predicate.source !== "emit_rows" ||
    condition.predicate.value !== outcome
  ) {
    throw new Error(`${field}.predicate deve vincular emit_rows ao outcome ${outcome}`);
  }
}

export function validateDestinationStep(step, prismaCatalog) {
  assertKnownFields(step, STEP_FIELDS, "DestinationStep");
  assertNonEmptyString(step?.stepId, "stepId");
  assertNonEmptyString(step?.destinationTable, "destinationTable");
  if (!DESTINATION_MODES.has(step?.mode)) {
    throw new Error(`Mode de DestinationStep inválido: ${String(step?.mode)}`);
  }
  validateIdentity(step.identity);
  validateModeIdentity(step);
  validateColumns(step.columns);
  validateScalarRecord(step.constants, "constants");
  validateScalarRecord(step.defaults, "defaults");
  validatePrecedence(step.precedence);
  validateDependencies(step.dependencies);

  assertRuleMatchesPrisma(
    {
      destinationTable: step.destinationTable,
      columns: step.columns.filter(({ status }) => status === "mapped"),
    },
    prismaCatalog,
  );
  const destinationModel = getModelByDatabaseName(prismaCatalog, step.destinationTable);
  validateLookupDestinationColumns(step.identity, destinationModel);
  validateDestinationRecordKeys(step, destinationModel);
  return true;
}

export function buildRuleRegistry(ruleGroups) {
  if (!Array.isArray(ruleGroups)) {
    throw new TypeError("ruleGroups deve ser um array de grupos de regras");
  }

  const registry = new Map();
  const normalizedSources = new Set();
  for (const group of ruleGroups) {
    if (!Array.isArray(group)) {
      throw new TypeError("Cada grupo do registro deve ser um array de regras");
    }
    for (const rule of group) {
      assertNonEmptyString(rule?.sourceTable, "sourceTable");
      if (rule.status !== "confirmed") {
        throw new Error("Status da regra registrada deve ser confirmed");
      }
      const normalizedSource = rule.sourceTable.toLocaleLowerCase("en-US");
      if (normalizedSources.has(normalizedSource)) {
        throw new Error(`sourceTable duplicada no registro: ${rule.sourceTable}`);
      }
      normalizedSources.add(normalizedSource);
      registry.set(rule.sourceTable, rule);
    }
  }
  return registry;
}

export function createPendingMapping(sourceInspection, evidenceDecision) {
  assertNonEmptyString(sourceInspection?.sourceTable, "sourceInspection.sourceTable");
  if (!Number.isSafeInteger(sourceInspection?.rowCount) || sourceInspection.rowCount < 0) {
    throw new TypeError("sourceInspection.rowCount deve ser um inteiro não negativo");
  }
  validatePendingEvidenceDecision(evidenceDecision);
  if (evidenceDecision.sourceTable !== sourceInspection.sourceTable) {
    throw new Error("sourceTable da EvidenceDecision deve corresponder à sourceInspection");
  }

  return {
    sourceTable: sourceInspection.sourceTable,
    sourceRowCount: sourceInspection.rowCount,
    status: "pending",
    reasonCode: evidenceDecision.reasonCode,
    reason: evidenceDecision.reason,
    evidence: copyEvidenceDecision(evidenceDecision),
  };
}

function validateModeIdentity(step) {
  if (step.mode === "merge") {
    if (step.identity.kind !== "resolve") {
      throw new Error("DestinationStep merge exige IdentitySpec resolve");
    }
    const explicitLink = step.precedence.indexOf("explicit_legacy_link");
    const naturalLookup = step.precedence.indexOf("natural_lookup");
    if (explicitLink === -1 || (naturalLookup !== -1 && explicitLink > naturalLookup)) {
      throw new Error("DestinationStep merge exige explicit_legacy_link antes de natural_lookup");
    }
  }
  if (step.mode === "lookup" && step.identity.kind !== "lookup") {
    throw new Error("DestinationStep lookup exige IdentitySpec lookup com onMany quarantine");
  }
  if (step.mode === "aggregate" && step.identity.kind !== "aggregate") {
    throw new Error("DestinationStep aggregate exige IdentitySpec aggregate");
  }
}

function validateIdentity(identity) {
  if (!isPlainObject(identity)) {
    throw new TypeError("identity deve ser um IdentitySpec");
  }
  if (identity.kind === "generate") {
    assertExactFields(
      identity,
      ["kind", "legacyColumn", "scope", "namespace"],
      "IdentitySpec generate",
    );
    assertNonEmptyString(identity.legacyColumn, "identidade.legacyColumn");
    assertNonEmptyString(identity.scope, "identidade.scope");
    if (identity.namespace !== REQUIRED_IDENTITY_NAMESPACE) {
      throw new Error(`Namespace de identidade deve ser ${REQUIRED_IDENTITY_NAMESPACE}`);
    }
    return;
  }
  if (identity.kind === "resolve") {
    assertExactFields(
      identity,
      ["kind", "sourceTable", "sourceColumn", "targetLegacyColumn"],
      "IdentitySpec resolve",
    );
    assertNonEmptyString(identity.sourceTable, "resolve.sourceTable");
    assertNonEmptyString(identity.sourceColumn, "resolve.sourceColumn");
    assertNonEmptyString(identity.targetLegacyColumn, "resolve.targetLegacyColumn");
    return;
  }
  if (identity.kind === "lookup") {
    assertExactFields(identity, ["kind", "criteria", "onZero", "onMany"], "IdentitySpec lookup");
    validateLookupCriteria(identity.criteria);
    if (!["quarantine", "null"].includes(identity.onZero)) {
      throw new Error("IdentitySpec lookup exige onZero quarantine ou null");
    }
    if (identity.onMany !== "quarantine") {
      throw new Error("IdentitySpec lookup exige onMany quarantine");
    }
    return;
  }
  if (identity.kind === "aggregate") {
    assertExactFields(
      identity,
      ["kind", "parentSourceTable", "parentLegacyColumn", "childForeignKey"],
      "IdentitySpec aggregate",
    );
    assertNonEmptyString(identity.parentSourceTable, "aggregate.parentSourceTable");
    assertNonEmptyString(identity.parentLegacyColumn, "aggregate.parentLegacyColumn");
    assertNonEmptyString(identity.childForeignKey, "aggregate.childForeignKey");
    return;
  }
  throw new Error(`Kind de IdentitySpec inválido: ${String(identity.kind)}`);
}

function validateLookupCriteria(criteria) {
  if (!Array.isArray(criteria) || criteria.length === 0) {
    throw new Error("IdentitySpec lookup exige criteria não vazio");
  }
  for (const criterion of criteria) {
    assertExactFields(criterion, ["sourceColumn", "destinationColumn"], "LookupCriterion");
    assertNonEmptyString(criterion?.sourceColumn, "LookupCriterion.sourceColumn");
    assertNonEmptyString(criterion?.destinationColumn, "LookupCriterion.destinationColumn");
  }
}

function validateColumns(columns) {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error("columns deve ser um array não vazio");
  }
  for (const column of columns) {
    assertKnownFields(column, COLUMN_FIELDS, "ColumnRule");
    if (!(typeof column?.sourceColumn === "string" || column?.sourceColumn === null)) {
      throw new TypeError("sourceColumn deve ser string ou null");
    }
    if (!(typeof column?.destinationColumn === "string" || column?.destinationColumn === null)) {
      throw new TypeError("destinationColumn deve ser string ou null");
    }
    if (!COLUMN_STATUSES.has(column?.status)) {
      throw new Error(`Status de ColumnRule inválido: ${String(column?.status)}`);
    }
    if (column.status === "mapped") {
      assertNonEmptyString(column.destinationColumn, "destinationColumn");
    } else if (column.destinationColumn !== null) {
      throw new Error("destinationColumn deve ser null quando status é not_preserved");
    }
    assertNonEmptyString(column?.transformation, "transformation");
    assertNonEmptyString(column?.nullHandling, "nullHandling");
    assertNonEmptyString(column?.referenceRole, "referenceRole");
    if (!SENSITIVITIES.has(column?.sensitivity)) {
      throw new Error(`Sensitivity inválida: ${String(column?.sensitivity)}`);
    }
    assertNonEmptyString(column?.reason, "reason");
    if (
      (column.sensitivity === "credential" || column.sensitivity === "secret") &&
      UNSAFE_SENSITIVE_TRANSFORMATIONS.has(column.transformation.toLocaleLowerCase("en-US"))
    ) {
      throw new Error(
        `Transformação sensível inválida para ${column.sensitivity}: ${column.transformation}`,
      );
    }
  }
}

function validateLookupDestinationColumns(identity, destinationModel) {
  if (identity.kind !== "lookup") {
    return;
  }
  for (const { destinationColumn } of identity.criteria) {
    if (getFieldByDatabaseName(destinationModel, destinationColumn) === null) {
      throw new Error(`Coluna de destino inexistente: ${destinationColumn}`);
    }
  }
}

function validateDestinationRecordKeys(step, destinationModel) {
  for (const destinationColumn of [...Object.keys(step.constants), ...Object.keys(step.defaults)]) {
    if (getFieldByDatabaseName(destinationModel, destinationColumn) === null) {
      throw new Error(`Coluna de destino inexistente: ${destinationColumn}`);
    }
  }
}

function validateScalarRecord(record, field) {
  if (!isPlainObject(record)) {
    throw new TypeError(`${field} deve ser um record`);
  }
  for (const value of Object.values(record)) {
    if (
      !(
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null
      )
    ) {
      throw new TypeError(`${field} aceita somente string, number, boolean ou null`);
    }
  }
}

function validatePrecedence(precedence) {
  validateStringArray(precedence, "precedence", { allowEmpty: true });
}

function validateDependencies(dependencies) {
  validateStringArray(dependencies, "dependencies", { allowEmpty: true });
}

function wrapEmissionBoundary(rule, stepsById) {
  const rawEmitRows = RAW_EMITTERS.get(rule) ?? rule.emitRows;
  const boundary = (row, context) =>
    validateEmissionDecisions(rawEmitRows(row, context), stepsById);
  RAW_EMITTERS.set(rule, rawEmitRows);
  rule.emitRows = boundary;
  return boundary;
}

function validateEmissionDecisions(emissions, stepsById) {
  if (!Array.isArray(emissions)) {
    throw new TypeError("emitRows deve retornar um array de EmissionDecision");
  }
  return emissions.map((emission) => {
    assertKnownFields(emission, EMISSION_FIELDS, "EmissionDecision");
    assertNonEmptyString(emission?.stepId, "EmissionDecision.stepId");
    const step = stepsById.get(emission.stepId);
    if (step === undefined) {
      throw new Error(`EmissionDecision referencia stepId desconhecido: ${emission.stepId}`);
    }
    if (emission.destinationTable !== step.destinationTable) {
      throw new Error(`EmissionDecision.destinationTable diverge do passo: ${emission.stepId}`);
    }
    if (!EMISSION_STATUSES.has(emission.status)) {
      throw new Error(`Status de EmissionDecision inválido: ${String(emission.status)}`);
    }
    assertSafeReference(emission.identityRef, "EmissionDecision.identityRef");
    if (emission.status === "prepared") {
      if (emission.field !== null || emission.reasonCode !== null) {
        throw new Error("EmissionDecision prepared exige field e reasonCode nulos");
      }
    } else if (emission.status === "quarantine") {
      assertIdentifier(emission.field, "EmissionDecision.field");
      assertIdentifier(emission.reasonCode, "EmissionDecision.reasonCode");
    } else {
      if (emission.field !== null) {
        throw new Error("EmissionDecision not_emitted exige field nulo");
      }
      assertIdentifier(emission.reasonCode, "EmissionDecision.reasonCode");
    }
    return {
      stepId: emission.stepId,
      destinationTable: emission.destinationTable,
      status: emission.status,
      identityRef: emission.identityRef,
      field: emission.field,
      reasonCode: emission.reasonCode,
    };
  });
}

function validateEvidence(evidence) {
  if (!isPlainObject(evidence)) {
    throw new TypeError("evidence deve conter evidências legada e atual");
  }
  assertExactFields(evidence, ["legacy", "current"], "evidence");
  validateStringArray(evidence.legacy, "evidence.legacy");
  validateStringArray(evidence.current, "evidence.current");
}

function validatePendingEvidenceDecision(decision) {
  if (decision?.finalStatus !== "pending") {
    throw new Error("createPendingMapping exige uma EvidenceDecision pending");
  }
  assertNonEmptyString(decision?.sourceTable, "evidenceDecision.sourceTable");
  assertNonEmptyString(decision?.legacyModule, "evidenceDecision.legacyModule");
  validateStringArray(decision?.legacyReferences, "evidenceDecision.legacyReferences", {
    allowEmpty: true,
  });
  validateEnumArray(decision?.operations, "evidenceDecision.operations", EVIDENCE_OPERATIONS);
  validateStringArray(decision?.legacyRelationships, "evidenceDecision.legacyRelationships", {
    allowEmpty: true,
  });
  validateStringArray(
    decision?.currentContractEvidence,
    "evidenceDecision.currentContractEvidence",
    {
      allowEmpty: true,
    },
  );
  assertNonEmptyString(decision?.reasonCode, "evidenceDecision.reasonCode");
  assertNonEmptyString(decision?.reason, "evidenceDecision.reason");
  if (!EVIDENCE_CONFIDENCES.has(decision?.confidence)) {
    throw new Error(`evidenceDecision.confidence inválida: ${String(decision?.confidence)}`);
  }
  if (!(decision?.ruleId === null || typeof decision?.ruleId === "string")) {
    throw new TypeError("evidenceDecision.ruleId deve ser string ou null");
  }
  if (typeof decision.ruleId === "string") {
    assertNonEmptyString(decision.ruleId, "evidenceDecision.ruleId");
  }
}

function copyEvidenceDecision(decision) {
  return {
    sourceTable: decision.sourceTable,
    legacyModule: decision.legacyModule,
    legacyReferences: [...decision.legacyReferences],
    operations: [...decision.operations],
    legacyRelationships: [...decision.legacyRelationships],
    currentContractEvidence: [...decision.currentContractEvidence],
    finalStatus: decision.finalStatus,
    reasonCode: decision.reasonCode,
    reason: decision.reason,
    confidence: decision.confidence,
    ruleId: decision.ruleId,
  };
}

function validateStringArray(value, field, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new TypeError(`${field} deve ser um array${allowEmpty ? "" : " não vazio"}`);
  }
  for (const item of value) {
    assertNonEmptyString(item, field);
  }
}

function validateEnumArray(value, field, allowedValues) {
  validateStringArray(value, field, { allowEmpty: true });
  for (const item of value) {
    if (!allowedValues.has(item)) {
      throw new Error(`${field} contém valor inválido: ${item}`);
    }
  }
}

function assertKnownFields(value, allowedFields, label) {
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} deve ser um objeto`);
  }
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) {
      throw new Error(`${label} contém campo incompatível: ${field}`);
    }
  }
}

function assertExactFields(value, fields, label) {
  assertKnownFields(value, new Set(fields), label);
  for (const field of fields) {
    if (!(field in value)) {
      throw new Error(`${label} exige ${field}`);
    }
  }
}

function assertSafeReference(value, field) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.:-]+$/.test(value)) {
    throw new TypeError(`${field} deve ser uma referência sanitizada`);
  }
}

function assertIdentifier(value, field) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.-]+$/.test(value)) {
    throw new TypeError(`${field} deve ser um identificador sanitizado`);
  }
}

function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} deve ser uma string não vazia`);
  }
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
