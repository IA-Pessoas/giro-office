import { assertRuleMatchesPrisma } from "./prisma-catalog.mjs";

export const REQUIRED_IDENTITY_NAMESPACE = "3f68d246-0b54-4a10-9415-a8845a767fb5";

export const PENDING_REASON_CODES = Object.freeze({
  NO_CONFIRMED_DESTINATION: "NO_CONFIRMED_DESTINATION",
  AMBIGUOUS_DESTINATION: "AMBIGUOUS_DESTINATION",
  DESTINATION_CONTRACT_MISMATCH: "DESTINATION_CONTRACT_MISMATCH",
  PREVIOUS_RULE_INVALIDATED: "PREVIOUS_RULE_INVALIDATED",
  BUSINESS_DECISION_REQUIRED: "BUSINESS_DECISION_REQUIRED",
});

const COLUMN_STATUSES = new Set(["mapped", "not_preserved"]);
const SENSITIVITIES = new Set(["none", "personal", "credential", "secret"]);
const UNSAFE_SENSITIVE_TRANSFORMATIONS = new Set(["plain", "copy", "preserve_raw"]);
const VERSIONED_RULE_ORIGIN = /^(?:docs\/migration\/v2\/[^/].*|scripts\/migration-v2-[^/]+\.mjs)$/;

export function validateMappingRule(rule, prismaCatalog) {
  assertNonEmptyString(rule?.sourceTable, "sourceTable");
  assertNonEmptyString(rule?.destinationTable, "destinationTable");
  if (rule?.status !== "confirmed") {
    throw new Error("Status da regra registrada deve ser confirmed");
  }
  assertNonEmptyString(rule?.domain, "domain");
  assertNonEmptyString(rule?.reason, "reason");
  assertNonEmptyString(rule?.ruleOrigin, "ruleOrigin");
  if (!VERSIONED_RULE_ORIGIN.test(rule.ruleOrigin)) {
    throw new Error("ruleOrigin deve apontar para um artefato versionado da migração V2");
  }

  validateIdentity(rule.identity);
  validateDependencies(rule.dependencies);
  validateColumns(rule.columns);
  if (typeof rule.classifyRow !== "function") {
    throw new Error("classifyRow deve ser uma função pura de classificação");
  }

  assertRuleMatchesPrisma(
    {
      destinationTable: rule.destinationTable,
      columns: rule.columns.filter(({ status }) => status === "mapped"),
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

export function createPendingMapping(sourceInspection, reasonCode, evidence) {
  assertNonEmptyString(sourceInspection?.sourceTable, "sourceInspection.sourceTable");
  if (!Number.isSafeInteger(sourceInspection?.rowCount) || sourceInspection.rowCount < 0) {
    throw new TypeError("sourceInspection.rowCount deve ser um inteiro não negativo");
  }
  if (!Object.values(PENDING_REASON_CODES).includes(reasonCode)) {
    throw new Error(`reasonCode de pending desconhecido: ${String(reasonCode)}`);
  }
  if (!Array.isArray(evidence) || evidence.length === 0) {
    throw new Error("evidence deve ser um array não vazio");
  }
  for (const item of evidence) {
    assertNonEmptyString(item, "evidence");
  }

  const copiedEvidence = [...evidence];
  return {
    sourceTable: sourceInspection.sourceTable,
    sourceRowCount: sourceInspection.rowCount,
    destinationTable: null,
    status: "pending",
    reasonCode,
    reason: copiedEvidence.join(" "),
    domain: "unclassified",
    ruleOrigin: "docs/migration/v4/scripts/lib/mapping-contract.mjs",
    identityStrategy: null,
    dependencies: [],
    preparedRowCount: 0,
    quarantineRowCount: 0,
    evidence: copiedEvidence,
  };
}

function validateIdentity(identity) {
  assertNonEmptyString(identity?.legacyColumn, "identidade.legacyColumn");
  assertNonEmptyString(identity?.scope, "identidade.scope");
  if (identity?.namespace !== REQUIRED_IDENTITY_NAMESPACE) {
    throw new Error(`Namespace de identidade deve ser ${REQUIRED_IDENTITY_NAMESPACE}`);
  }
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

function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} deve ser uma string não vazia`);
  }
}
