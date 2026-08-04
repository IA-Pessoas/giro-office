import { ADMIN_BUSINESS_EVIDENCE } from "../evidence/admin-business.mjs";
import { REQUIRED_IDENTITY_NAMESPACE } from "../lib/mapping-contract.mjs";

const ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const EVIDENCE_BY_SOURCE = new Map(
  ADMIN_BUSINESS_EVIDENCE.map((decision) => [decision.sourceTable, decision]),
);

export const ADMIN_BUSINESS_TRANSFORMATIONS = Object.freeze({
  normalize_legacy_permission_level_plus_one: normalizeLegacyPermissionLevelPlusOne,
});

const PERMISSION_MODULES = [
  "certificado",
  "comercial",
  "contabil",
  "financeiro",
  "fiscal",
  "integracao",
  "marketing",
  "parcelamento",
  "pessoal",
  "regularize",
  "rh",
  "triagem",
];

const rules = [
  directRule({
    sourceTable: "tb_admin.logs",
    domain: "administration",
    stepId: "admin-log-insert",
    destinationTable: "logs",
    dependencies: ["tb_admin.usuarios"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("tipo", "action", "normalize_required_text"),
      mapped("referente", "referring", "normalize_required_text"),
      mapped("referente_id", "referring_id", "normalize_reference_text"),
      mapped("usuario_id", "user_id", "resolve_user_reference", referenceOptions()),
      mapped("data", "date", "normalize_required_datetime"),
      notPreserved(
        "local",
        "O local legado é metadado de rede/contexto sem campo equivalente; não é comprimido no JSON changes.",
        { sensitivity: "personal" },
      ),
    ],
    defaults: { changes: "{}" },
    classifySourceRow(row) {
      return firstQuarantine([
        classifyRequiredReference(row?.usuario_id, "usuario_id", "LOG_USER_LINK_INVALID"),
        classifyRequiredValue(row?.tipo, "tipo", "LOG_ACTION_EMPTY"),
        classifyRequiredValue(row?.referente, "referente", "LOG_REFERRING_EMPTY"),
      ]);
    },
  }),
  ...PERMISSION_MODULES.map(createPermissionRule),
  directRule({
    sourceTable: "tb_contabil.clientes_mov",
    domain: "accounting",
    stepId: "contabil-client-movement-insert",
    destinationTable: "contabil.responsibles",
    dependencies: ["tb_integracao.clientes", "tb_regularize.clientes"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("cliente_id", "client_id", "resolve_client_reference", referenceOptions()),
      mapped("mov", "customer_with_movement", "normalize_boolean"),
    ],
    defaults: { person_responsible_id: null, posted_by_id: null },
    classifySourceRow: classifyClientReference,
  }),
  directRule({
    sourceTable: "tb_contabil.clientes_observacao",
    domain: "accounting",
    stepId: "contabil-client-history-insert",
    destinationTable: "clients.history",
    dependencies: ["tb_integracao.clientes", "tb_regularize.clientes", "tb_admin.usuarios"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("cliente_id", "client_id", "resolve_client_reference", referenceOptions()),
      mapped("user_id", "user_id", "resolve_user_reference", referenceOptions()),
      mapped("data", "date", "normalize_required_datetime"),
      notPreserved(
        "departamento_id",
        "A autoria departamental não possui coluna equivalente e não é misturada ao conteúdo integral da observação.",
      ),
      mapped("observacao", "history", "preserve_full_history_text", {
        sensitivity: "personal",
        reason:
          "O contrato ClientHistory preserva o conteúdo integral da observação, sem sumarização ou concatenação.",
      }),
    ],
    defaults: { file: null },
    classifySourceRow(row) {
      return firstQuarantine([
        classifyClientReference(row),
        classifyRequiredReference(row?.user_id, "user_id", "HISTORY_USER_LINK_INVALID"),
        classifyRequiredValue(row?.observacao, "observacao", "HISTORY_TEXT_EMPTY"),
      ]);
    },
  }),
  directRule({
    sourceTable: "tb_contabil.controle",
    domain: "accounting",
    stepId: "contabil-control-insert",
    destinationTable: "contabil.control",
    dependencies: ["tb_integracao.clientes", "tb_regularize.clientes"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("cliente_id", "client_id", "resolve_client_reference", referenceOptions()),
      mapped("competencia", "competence", "normalize_competence"),
      mapped("lancamentos_contabil", "regenerate_accounting_entries", "normalize_boolean"),
      mapped("resumo_acumulador", "check_summary_by_accumulator", "normalize_boolean"),
      mapped("movimento_contabil", "post_accounting_transaction", "normalize_boolean"),
      mapped("importacao_extratos", "import_bank_statements", "normalize_boolean"),
      mapped("conciliar_extratos", "reconcile_bank_statements", "normalize_boolean"),
      mapped("fornecedores", "reconcile_vendors", "normalize_boolean"),
      mapped("integracao_impostos", "integrate_taxes", "normalize_boolean"),
      mapped("impostos_federais", "settle_federal_taxes_via_ecac", "normalize_boolean"),
      mapped("impostos_estaduais", "settle_state_taxes_via_sefaz_ba", "normalize_boolean"),
      mapped("pagamento", "integrate_payroll", "normalize_boolean", {
        reason:
          "A tela e o dicionário legados nomeiam pagamento como Integração folha de pagamento.",
      }),
      mapped("inss", "suspense_accounts", "normalize_boolean", {
        reason:
          "Apesar do nome físico inss, a tela e os relatórios legados o rotulam Contas transitórias.",
      }),
      mapped("contas_estouradas", "check_overdrawn_accounts", "normalize_boolean"),
      mapped("conciliacao_geral", "general_account_reconciliation", "normalize_boolean"),
      mapped("emprestimos_juros", "check_loan_and_interest_accounts", "normalize_boolean"),
      mapped("apuracao", "monthly_closing", "normalize_boolean"),
      mapped("icms_pis_cofins", "reconcile_icms_pis_cofins", "normalize_boolean"),
      mapped("depreciacao", "depreciation", "normalize_boolean"),
      mapped("obs", "notes", "normalize_text", { sensitivity: "personal" }),
    ],
    defaults: {},
    classifySourceRow(row) {
      return firstQuarantine([
        classifyClientReference(row),
        classifyRequiredValue(row?.competencia, "competencia", "CONTROL_COMPETENCE_EMPTY"),
      ]);
    },
  }),
  directRule({
    sourceTable: "tb_contabil.relacoes",
    domain: "accounting",
    stepId: "contabil-relationship-insert",
    destinationTable: "contabil.relationship",
    dependencies: ["tb_integracao.clientes", "tb_regularize.clientes"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("cliente_id", "client_id", "resolve_client_reference", referenceOptions()),
      mapped("licitacao", "bidding", "normalize_boolean"),
      mapped("plano_de_contas", "chart_accounts", "normalize_text"),
      mapped("ferramenta", "tool", "normalize_text"),
      mapped("obs", "note", "normalize_text", { sensitivity: "personal" }),
      mapped("sistema", "system", "normalize_text"),
    ],
    defaults: {},
    classifySourceRow: classifyClientReference,
  }),
  directRule({
    sourceTable: "tb_fiscal.icms",
    domain: "fiscal",
    stepId: "fiscal-icms-insert",
    destinationTable: "fiscal.icms",
    dependencies: [],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("estado", "state", "normalize_required_text"),
      mapped("item", "item_number", "normalize_text"),
      mapped("cest", "cest_code", "normalize_text"),
      mapped("descricao", "description", "normalize_required_text"),
      mapped("acordo", "interstate_agreement", "normalize_text"),
      mapped("mva_original_aplicada", "applied_original_mva", "normalize_text"),
      mapped("mva_ajustado", "adjusted_mva", "normalize_text"),
      mapped("mva_original", "original_mva", "normalize_text"),
    ],
    defaults: {},
    precedence: ["natural_key", "lowest_legacy_id_owner", "source", "defaults"],
    classifySourceRow(row, context) {
      if (context?.icmsNaturalKeyResolution === "duplicate") {
        return notEmitted("ICMS_NATURAL_DUPLICATE");
      }
      return firstQuarantine([
        classifyRequiredValue(row?.estado, "estado", "ICMS_STATE_EMPTY"),
        classifyRequiredValue(row?.descricao, "descricao", "ICMS_DESCRIPTION_EMPTY"),
      ]);
    },
  }),
  directRule({
    sourceTable: "tb_fiscal.ipi",
    domain: "fiscal",
    stepId: "fiscal-ipi-insert",
    destinationTable: "fiscal.ipi",
    dependencies: [],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("ncm", "ncm", "normalize_required_text"),
      mapped("ex", "ex", "normalize_text"),
      mapped("descricao", "description", "normalize_text"),
      mapped("aliquota", "aliquot", "normalize_text"),
    ],
    defaults: {},
  }),
  directRule({
    sourceTable: "tb_fiscal.tributacao_pis_cofins",
    domain: "fiscal",
    stepId: "fiscal-ncm-insert",
    destinationTable: "fiscal.ncm",
    dependencies: [],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("regime", "tax_regime", "normalize_required_text"),
      mapped("ncm", "ncm_code", "normalize_required_text"),
      mapped("tributacao_federal", "federal_taxation_type", "normalize_required_text"),
      mapped("obs_ncm", "ncm_notes", "normalize_text"),
      mapped("cst_pis_saida", "cst_pis_outgoing", "normalize_text"),
      mapped("cts_cofins_saida", "cst_cofins_outgoing", "normalize_text", {
        reason:
          "O nome legado contém o typo cts, mas o formulário fiscal comprova que o valor é CST COFINS de saída.",
      }),
      mapped("grupo", "product_group", "normalize_text"),
      mapped("descricao", "description", "normalize_required_text"),
      mapped("inicio_virgencia", "validity_start_date", "normalize_required_datetime"),
      mapped("origem_info", "information_source", "normalize_text"),
      mapped("legislacao_ref", "reference_legislation", "normalize_text"),
      mapped("fim_virgencia", "validity_end_date", "normalize_datetime"),
    ],
    defaults: {},
  }),
];

export const ADMIN_BUSINESS_RULES = Object.freeze(rules);
export const adminBusinessRules = ADMIN_BUSINESS_RULES;

function createPermissionRule(module) {
  const sourceTable = `tb_admin.permissoes_${module}`;
  const stepId = `permission-${module}-merge`;
  return createRule({
    sourceTable,
    domain: "administration",
    cardinality: "N:1",
    dependencies: ["tb_admin.usuarios"],
    destinations: [
      {
        stepId,
        destinationTable: "permissions",
        mode: "merge",
        identity: {
          kind: "resolve",
          sourceTable: "tb_admin.usuarios",
          sourceColumn: "user_id",
          targetLegacyColumn: "id",
        },
        columns: [
          notPreserved(
            "id",
            "A identidade da linha modular é consolidada na linha única de Permission por usuário e organização.",
          ),
          mapped("user_id", "user_id", "resolve_user_reference", referenceOptions()),
          mapped("permissao", module, "normalize_legacy_permission_level_plus_one", {
            reason:
              "A normalização atual converte o sentinela legado -1 em 0 e os cargos legados 0, 1 e 2 nos níveis atuais 1, 2 e 3.",
          }),
        ],
        constants: { organization_id: ORGANIZATION_ID },
        defaults: {},
        precedence: [
          "explicit_legacy_link",
          "current_user_organization_unique",
          "lowest_legacy_id_owner",
          "source_module_level",
        ],
        dependencies: ["tb_admin.usuarios"],
      },
    ],
    classifySourceRow: classifyPermissionRow,
    emitRows(row, context) {
      const classification = classifyPermissionRow(row, context);
      return [
        emission({
          stepId,
          destinationTable: "permissions",
          identityRef: isValidLegacyReference(row?.user_id)
            ? `permissions:tb_admin.usuarios:${safePart(row.user_id)}:${ORGANIZATION_ID}`
            : `quarantine:${sourceTable}:user_id:invalid`,
          classification,
        }),
      ];
    },
  });
}

function directRule({
  sourceTable,
  domain,
  stepId,
  destinationTable,
  dependencies,
  columns,
  defaults,
  precedence = ["source", "defaults"],
  classifySourceRow = prepared,
}) {
  const classify = (row, context) => {
    const identity = classifyRequiredReference(row?.id, "id", "SOURCE_IDENTITY_INVALID");
    return identity.status === "prepared" ? classifySourceRow(row, context) : identity;
  };
  return createRule({
    sourceTable,
    domain,
    cardinality: "1:1",
    dependencies,
    destinations: [
      {
        stepId,
        destinationTable,
        mode: "insert",
        identity: {
          kind: "generate",
          legacyColumn: "id",
          scope: sourceTable,
          namespace: REQUIRED_IDENTITY_NAMESPACE,
        },
        columns,
        constants: { organization_id: ORGANIZATION_ID },
        defaults,
        precedence,
        dependencies,
      },
    ],
    classifySourceRow: classify,
    emitRows(row, context) {
      const classification = classify(row, context);
      return [
        emission({
          stepId,
          destinationTable,
          identityRef: isValidLegacyReference(row?.id)
            ? `${sourceTable}:${safePart(row.id)}`
            : `quarantine:${sourceTable}:id:invalid`,
          classification,
        }),
      ];
    },
  });
}

function createRule({
  sourceTable,
  domain,
  cardinality,
  dependencies,
  destinations,
  classifySourceRow,
  emitRows,
}) {
  const evidenceDecision = EVIDENCE_BY_SOURCE.get(sourceTable);
  if (evidenceDecision?.finalStatus !== "confirmed") {
    throw new Error(`EvidenceDecision confirmed ausente para ${sourceTable}`);
  }
  return {
    sourceTable,
    status: "confirmed",
    domain,
    ruleOrigin: evidenceDecision.ruleId,
    evidence: {
      legacy: evidenceDecision.legacyReferences,
      current: evidenceDecision.currentContractEvidence,
    },
    cardinality,
    dependencies,
    destinations,
    classifySourceRow,
    emitRows,
  };
}

function mapped(sourceColumn, destinationColumn, transformation, options = {}) {
  return {
    sourceColumn,
    destinationColumn,
    status: "mapped",
    transformation,
    nullHandling: options.nullHandling ?? "normalize_empty_to_null_or_quarantine_when_required",
    referenceRole: options.referenceRole ?? "none",
    sensitivity: options.sensitivity ?? "none",
    reason:
      options.reason ??
      "Comportamento legado e contrato atual comprovam este mapeamento de coluna.",
  };
}

function notPreserved(sourceColumn, reason, options = {}) {
  return {
    sourceColumn,
    destinationColumn: null,
    status: "not_preserved",
    transformation: "discard_without_persisting_value",
    nullHandling: "not_applicable",
    referenceRole: "none",
    sensitivity: options.sensitivity ?? "none",
    reason,
  };
}

function referenceOptions() {
  return {
    referenceRole: "foreign_key",
    nullHandling: "quarantine_when_reference_is_missing_or_ambiguous",
  };
}

function normalizeLegacyPermissionLevelPlusOne(value) {
  return Number.isInteger(value) && value >= -1 && value <= 2 ? value + 1 : null;
}

function classifyPermissionRow(row, context) {
  if (!isValidLegacyReference(row?.user_id)) {
    return quarantine("user_id", "PERMISSION_USER_LINK_INVALID");
  }
  if (normalizeLegacyPermissionLevelPlusOne(row?.permissao) === null) {
    return quarantine("permissao", "PERMISSION_LEVEL_INVALID");
  }
  if (context?.permissionUserModuleResolution === "conflict") {
    return quarantine("permissao", "PERMISSION_MODULE_LEVEL_CONFLICT");
  }
  if (context?.permissionUserModuleResolution === "duplicate") {
    return notEmitted("PERMISSION_MODULE_DUPLICATE");
  }
  return prepared();
}

function classifyClientReference(row) {
  return classifyRequiredReference(row?.cliente_id, "cliente_id", "CLIENT_LINK_INVALID");
}

function classifyRequiredReference(value, field, reasonCode) {
  return isValidLegacyReference(value) ? prepared() : quarantine(field, reasonCode);
}

function classifyRequiredValue(value, field, reasonCode) {
  return typeof value === "string" && value.trim().length > 0
    ? prepared()
    : quarantine(field, reasonCode);
}

function firstQuarantine(classifications) {
  return classifications.find(({ status }) => status !== "prepared") ?? prepared();
}

function isValidLegacyReference(value) {
  return (
    (Number.isSafeInteger(value) && value > 0) ||
    (typeof value === "string" && /^[1-9]\d*$/.test(value))
  );
}

function safePart(value) {
  return isValidLegacyReference(value) ? String(value) : "invalid";
}

function prepared() {
  return { status: "prepared" };
}

function quarantine(field, reasonCode) {
  return { status: "quarantine", field, reasonCode };
}

function notEmitted(reasonCode) {
  return { status: "not_emitted", reasonCode };
}

function emission({ stepId, destinationTable, identityRef, classification }) {
  return {
    stepId,
    destinationTable,
    status: classification.status,
    identityRef,
    field: classification.status === "quarantine" ? classification.field : null,
    reasonCode: classification.status === "prepared" ? null : classification.reasonCode,
  };
}
