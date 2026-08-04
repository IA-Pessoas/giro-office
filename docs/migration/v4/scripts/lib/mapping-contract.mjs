import { assertRuleMatchesPrisma } from "./prisma-catalog.mjs";

export const REQUIRED_IDENTITY_NAMESPACE = "3f68d246-0b54-4a10-9415-a8845a767fb5";

const CARDINALITIES = new Set(["1:1", "N:1", "1:N"]);
const COLUMN_STATUSES = new Set(["mapped", "not_preserved"]);
const DESTINATION_MODES = new Set(["insert", "merge", "lookup", "derived", "aggregate"]);
const EVIDENCE_CONFIDENCES = new Set(["high", "medium", "low"]);
const EVIDENCE_OPERATIONS = new Set(["delete", "dynamic", "insert", "select", "update"]);
const SENSITIVITIES = new Set(["none", "personal", "credential", "secret"]);
const UNSAFE_SENSITIVE_TRANSFORMATIONS = new Set(["plain", "copy", "preserve_raw"]);

export function validateMappingRule(rule, prismaCatalog) {
  assertNonEmptyString(rule?.sourceTable, "sourceTable");
  if (rule?.status !== "confirmed") {
    throw new Error("Status da regra registrada deve ser confirmed");
  }
  assertNonEmptyString(rule?.domain, "domain");
  assertNonEmptyString(rule?.reason, "reason");
  assertNonEmptyString(rule?.ruleOrigin, "ruleOrigin");
  validateEvidence(rule?.evidence);
  if (!CARDINALITIES.has(rule?.cardinality)) {
    throw new Error(`Cardinality inválida: ${String(rule?.cardinality)}`);
  }
  assertNoLegacyRootFields(rule);
  if (!Array.isArray(rule?.destinations) || rule.destinations.length === 0) {
    throw new Error("destinations deve ser um array não vazio");
  }
  if (typeof rule.emitRows !== "function") {
    throw new Error("emitRows deve ser uma função pura de emissão");
  }

  const stepIds = new Set();
  for (const step of rule.destinations) {
    assertNonEmptyString(step?.stepId, "stepId");
    if (stepIds.has(step.stepId)) {
      throw new Error(`stepId duplicado na regra: ${step.stepId}`);
    }
    stepIds.add(step.stepId);
    validateDestinationStep(step, prismaCatalog);
  }
  validateEmissionDecisions(rule.emitRows(Object.freeze({}), Object.freeze({})), stepIds);

  return true;
}

export function validateDestinationStep(step, prismaCatalog) {
  assertNonEmptyString(step?.stepId, "stepId");
  assertNonEmptyString(step?.destinationTable, "destinationTable");
  if (!DESTINATION_MODES.has(step?.mode)) {
    throw new Error(`Mode de DestinationStep inválido: ${String(step?.mode)}`);
  }
  validateIdentity(step.identity);
  if (step.mode === "lookup" && step.onMany !== "quarantine") {
    throw new Error("DestinationStep lookup exige onMany igual a quarantine");
  }
  validateDependencies(step.dependencies);
  validateColumns(step.columns);

  assertRuleMatchesPrisma(
    {
      destinationTable: step.destinationTable,
      columns: step.columns.filter(({ status }) => status === "mapped"),
    },
    prismaCatalog,
  );

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

function assertNoLegacyRootFields(rule) {
  for (const field of ["destinationTable", "identity", "columns", "classifyRow", "dependencies"]) {
    if (field in rule) {
      throw new Error(`${field} pertence a DestinationStep, não a MappingRule`);
    }
  }
}

function validateEvidence(evidence) {
  if (typeof evidence !== "object" || evidence === null) {
    throw new TypeError("evidence deve conter evidências legada e atual");
  }
  validateStringArray(evidence.legacy, "evidence.legacy");
  validateStringArray(evidence.current, "evidence.current");
}

function validateIdentity(identity) {
  if (identity?.strategy === "create") {
    assertNonEmptyString(identity.legacyColumn, "identidade.legacyColumn");
    assertNonEmptyString(identity.scope, "identidade.scope");
    if (identity.namespace !== REQUIRED_IDENTITY_NAMESPACE) {
      throw new Error(`Namespace de identidade deve ser ${REQUIRED_IDENTITY_NAMESPACE}`);
    }
    return;
  }
  if (identity?.strategy === "resolve") {
    assertNonEmptyString(identity?.source?.sourceTable, "origem de resolve.sourceTable");
    assertNonEmptyString(identity?.source?.stepId, "origem de resolve.stepId");
    return;
  }
  throw new Error(`Estratégia de identidade inválida: ${String(identity?.strategy)}`);
}

function validateDependencies(dependencies) {
  if (!Array.isArray(dependencies)) {
    throw new TypeError("dependencies deve ser um array");
  }
  for (const dependency of dependencies) {
    assertNonEmptyString(dependency, "dependency");
  }
}

function validateColumns(columns) {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error("columns deve ser um array não vazio");
  }

  for (const column of columns) {
    assertNonEmptyString(column?.sourceColumn, "sourceColumn");
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

function validatePendingEvidenceDecision(decision) {
  if (decision?.finalStatus !== "pending") {
    throw new Error("createPendingMapping exige uma EvidenceDecision pending");
  }
  assertNonEmptyString(decision?.sourceTable, "evidenceDecision.sourceTable");
  assertNonEmptyString(decision?.legacyModule, "evidenceDecision.legacyModule");
  assertNonEmptyString(decision?.reasonCode, "evidenceDecision.reasonCode");
  assertNonEmptyString(decision?.reason, "evidenceDecision.reason");
  validateStringArray(decision?.legacyReferences, "evidenceDecision.legacyReferences", {
    allowEmpty: true,
  });
  validateStringArray(
    decision?.currentContractEvidence,
    "evidenceDecision.currentContractEvidence",
    {
      allowEmpty: true,
    },
  );
  validateEnumArray(decision?.operations, "evidenceDecision.operations", EVIDENCE_OPERATIONS);
  validateStringArray(decision?.legacyRelationships, "evidenceDecision.legacyRelationships", {
    allowEmpty: true,
  });
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
    ...decision,
    legacyReferences: [...decision.legacyReferences],
    operations: [...decision.operations],
    legacyRelationships: [...decision.legacyRelationships],
    currentContractEvidence: [...decision.currentContractEvidence],
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

function validateEmissionDecisions(emissions, stepIds) {
  if (!Array.isArray(emissions)) {
    throw new TypeError("emitRows deve retornar um array de EmissionDecision");
  }
  for (const emission of emissions) {
    if (typeof emission !== "object" || emission === null || Array.isArray(emission)) {
      throw new TypeError("EmissionDecision deve ser um objeto sanitizado");
    }
    for (const key of Object.keys(emission)) {
      if (!["stepId", "status", "field", "reasonCode"].includes(key)) {
        throw new Error(`EmissionDecision contém campo não sanitizado: ${key}`);
      }
    }
    assertNonEmptyString(emission.stepId, "EmissionDecision.stepId");
    if (!stepIds.has(emission.stepId)) {
      throw new Error(`EmissionDecision referencia stepId desconhecido: ${emission.stepId}`);
    }
    if (emission.status === "prepared") {
      if (Object.keys(emission).length !== 2) {
        throw new Error("EmissionDecision prepared não pode conter dados adicionais");
      }
      continue;
    }
    if (emission.status !== "quarantine") {
      throw new Error(`Status de EmissionDecision inválido: ${String(emission.status)}`);
    }
    assertIdentifier(emission.field, "EmissionDecision.field");
    assertIdentifier(emission.reasonCode, "EmissionDecision.reasonCode");
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
