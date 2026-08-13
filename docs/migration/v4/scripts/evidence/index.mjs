import { ADMIN_BUSINESS_EVIDENCE } from "./admin-business.mjs";
import { INTEGRACAO_REGULARIZE_EVIDENCE } from "./integracao-regularize.mjs";
import {
  REMAINING_EVIDENCE,
  REMAINING_PENDING_COLUMN_DECISIONS,
  REMAINING_SOURCE_TABLES,
} from "./remaining.mjs";
import { RH_PESSOAL_EVIDENCE } from "./rh-pessoal.mjs";
import { SPECIALIZED_EVIDENCE } from "./technology-certificates-parcelamento.mjs";
import { V2_EVIDENCE } from "./v2.mjs";

export const NO_LEGACY_RUNTIME_REFERENCE_SOURCES = Object.freeze([
  "tb_atendimento.motoboy",
  "tb_contabil.bancos",
  "tb_contabil.clientes_bancos_temp",
  "tb_contabil.documentos_bancos",
  "tb_fiscal.sn_completo_sn",
  "tb_historico",
  "tb_integracao.admin_tarefas",
  "tb_integracao.cobrancas_solucoes",
]);

const NO_RUNTIME = new Set(NO_LEGACY_RUNTIME_REFERENCE_SOURCES);

export function buildEvidenceRegistry(groups) {
  if (!Array.isArray(groups)) {
    throw new TypeError("groups deve ser um array de grupos de EvidenceDecision");
  }
  const registry = new Map();
  const normalizedSources = new Set();

  for (const group of groups) {
    if (!Array.isArray(group)) {
      throw new TypeError("Cada grupo de evidência deve ser um array");
    }
    for (const original of group) {
      const decision = canonicalizeNoRuntimeDecision(original);
      validateDecision(decision);
      const normalized = decision.sourceTable.toLocaleLowerCase("en-US");
      if (normalizedSources.has(normalized)) {
        throw new Error(`sourceTable duplicada no registro de evidências: ${decision.sourceTable}`);
      }
      normalizedSources.add(normalized);
      registry.set(decision.sourceTable, decision);
    }
  }

  return registry;
}

const EVIDENCE_GROUPS = Object.freeze([
  V2_EVIDENCE,
  RH_PESSOAL_EVIDENCE,
  SPECIALIZED_EVIDENCE,
  ADMIN_BUSINESS_EVIDENCE,
  INTEGRACAO_REGULARIZE_EVIDENCE,
  REMAINING_EVIDENCE,
]);

export const EVIDENCE_REGISTRY = buildEvidenceRegistry(EVIDENCE_GROUPS);
export const ALL_EVIDENCE = Object.freeze(
  [...EVIDENCE_REGISTRY.values()].sort(compareSourceTables),
);

export {
  ADMIN_BUSINESS_EVIDENCE,
  INTEGRACAO_REGULARIZE_EVIDENCE,
  REMAINING_EVIDENCE,
  REMAINING_PENDING_COLUMN_DECISIONS,
  REMAINING_SOURCE_TABLES,
  RH_PESSOAL_EVIDENCE,
  SPECIALIZED_EVIDENCE,
  V2_EVIDENCE,
};

function canonicalizeNoRuntimeDecision(decision) {
  if (!NO_RUNTIME.has(decision?.sourceTable)) return decision;
  if (decision.finalStatus !== "pending" || decision.ruleId !== null) {
    throw new Error(`${decision.sourceTable} sem runtime deve permanecer pending`);
  }
  return Object.freeze({
    ...decision,
    legacyRelationships: Object.freeze([
      ...(decision.legacyRelationships ?? []),
      "Auditoria do código fora de backend confirmou ausência de referência executável em runtime.",
    ]),
    finalStatus: "pending",
    reasonCode: "NO_LEGACY_RUNTIME_REFERENCE",
    reason:
      "Nenhuma referência de runtime foi localizada fora dos artefatos DDL do diretório backend; coincidência nominal não comprova uso seguro.",
    confidence: "low",
    ruleId: null,
  });
}

function validateDecision(decision) {
  if (
    typeof decision?.sourceTable !== "string" ||
    decision.sourceTable.length === 0 ||
    !["confirmed", "pending"].includes(decision.finalStatus) ||
    typeof decision.reasonCode !== "string" ||
    decision.reasonCode.length === 0 ||
    typeof decision.reason !== "string" ||
    decision.reason.length === 0
  ) {
    throw new Error("EvidenceDecision sem motivo ou estado final válido");
  }
  if (
    !Array.isArray(decision.legacyReferences) ||
    !Array.isArray(decision.legacyRelationships) ||
    !Array.isArray(decision.currentContractEvidence)
  ) {
    throw new Error("EvidenceDecision sem evidência estruturada");
  }
  if (
    decision.finalStatus === "pending" &&
    decision.reasonCode !== "NO_LEGACY_RUNTIME_REFERENCE" &&
    decision.legacyReferences.length === 0
  ) {
    throw new Error(
      "EvidenceDecision pending exige evidência legada ou ausência de runtime auditada",
    );
  }
  if (
    decision.finalStatus === "confirmed" &&
    (decision.legacyReferences.length === 0 ||
      decision.currentContractEvidence.length === 0 ||
      typeof decision.ruleId !== "string" ||
      decision.ruleId.length === 0)
  ) {
    throw new Error("EvidenceDecision confirmed exige evidências e ruleId");
  }
}

function compareSourceTables(left, right) {
  return left.sourceTable < right.sourceTable ? -1 : left.sourceTable > right.sourceTable ? 1 : 0;
}
