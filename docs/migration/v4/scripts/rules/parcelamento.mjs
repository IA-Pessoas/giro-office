import { PARCELAMENTO_EVIDENCE } from "../evidence/technology-certificates-parcelamento.mjs";
import { REQUIRED_IDENTITY_NAMESPACE } from "../lib/mapping-contract.mjs";

const ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const EVIDENCE_BY_SOURCE = new Map(PARCELAMENTO_EVIDENCE.map((item) => [item.sourceTable, item]));

export const PARCELAMENTO_RULES = [
  createClientLookupRule(),
  createInstallmentRule(),
  createCompetencyRule(),
  createPanoramaRule(),
];

export const PARCELAMENTO_RUNTIME_SOURCE_TABLES = Object.freeze(
  PARCELAMENTO_RULES.map(({ sourceTable }) => sourceTable),
);

function createClientLookupRule() {
  const sourceTable = "tb_parcelamento.clientes";
  const stepId = "parcelamento-client-lookup";
  const destinationTable = "clients";

  return createRule({
    sourceTable,
    domain: "parcelamento",
    stepId,
    destinationTable,
    mode: "lookup",
    identity: {
      kind: "lookup",
      criteria: [
        { sourceColumn: "cpf_cnpj", destinationColumn: "cpf_cnpj" },
        { sourceColumn: "nome", destinationColumn: "name" },
      ],
      onZero: "quarantine",
      onMany: "quarantine",
    },
    columns: [
      notPreserved(
        "id",
        "O identificador inteiro é usado apenas como chave legada do lookup e não substitui o UUID de Client.",
      ),
      mapped("nome", "name", "normalize_lookup_name", personalOptions()),
      mapped("razao_social", "company_name", "normalize_lookup_company_name", personalOptions()),
      mapped("nome_fantasia", "fantasy_name", "normalize_lookup_fantasy_name", personalOptions()),
      mapped("cpf_cnpj", "cpf_cnpj", "normalize_lookup_document", personalOptions()),
      mapped("regime", "regime", "normalize_lookup_regime", personalOptions()),
    ],
    constants: { organization_id: ORGANIZATION_ID },
    precedence: ["organization_id", "normalized_document", "normalized_name_cross_check"],
    classify(row, context) {
      const base = firstQuarantine([
        classifyIdentity(row, "PARCELAMENTO_CLIENT_LEGACY_IDENTITY_INVALID"),
        classifyRequiredText(row, "nome", "PARCELAMENTO_CLIENT_NAME_REQUIRED"),
        classifyRequiredText(row, "cpf_cnpj", "PARCELAMENTO_CLIENT_DOCUMENT_REQUIRED"),
      ]);
      if (base.status === "quarantine") return base;
      return classifyResolution(context?.clientLookupResolution, "cpf_cnpj", "PARCELAMENTO_CLIENT");
    },
  });
}

function createInstallmentRule() {
  const sourceTable = "tb_parcelamento.parcelamentos";
  return createRule({
    sourceTable,
    domain: "parcelamento",
    stepId: "parcelamento-installment-insert",
    destinationTable: "parcelamento.installments",
    dependencies: ["tb_parcelamento.clientes", "tb_regularize.clientes"],
    identity: generateIdentity("id", sourceTable),
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("cliente_id", "client_id", "resolve_client_by_externo", referenceOptions()),
      mapped("natureza", "legal_nature", "normalize_required_text"),
      mapped("tipo", "type", "normalize_required_text"),
      mapped("estancia", "jurisdiction", "normalize_required_text"),
      mapped("caminho", "document_url", "normalize_legacy_document_path_fallback"),
      mapped("debito_automatico", "is_automatic_debit", "normalize_boolean_code"),
      mapped("total_consolidado", "consolidated_total_amount", "normalize_non_negative_number"),
      mapped("primeira_parcela", "first_installment_amount", "normalize_non_negative_number"),
      mapped(
        "parcela_mes_vigente",
        "current_month_installment_amount",
        "normalize_non_negative_number",
      ),
      mapped("saldo_devedor", "outstanding_balance", "normalize_non_negative_number"),
      mapped("parcelas_pagas", "paid_installments_count", "normalize_non_negative_integer"),
      mapped("parcelas_acordadas", "agreed_installments_count", "normalize_positive_integer"),
      mapped(
        "parcelas_restantes",
        "remaining_installments_count",
        "normalize_non_negative_integer",
      ),
      mapped("parcelas_vencidas", "overdue_installments_count", "normalize_non_negative_integer"),
      mapped("data_adesao", "enrollment_date", "normalize_zero_date_to_null"),
      mapped("documento", "document_url", "normalize_legacy_document_url_preferred"),
      notPreserved(
        "externo",
        "O discriminador seleciona o catálogo de cliente para resolução, mas não possui coluna própria no acordo atual.",
      ),
      mapped("situacao", "status", "map_installment_status_explicitly"),
      mapped("data_finalizacao", "completion_date", "normalize_zero_date_to_null"),
      mapped(
        "parcelas_entradas",
        "down_payment_installments_count",
        "normalize_non_negative_integer",
      ),
      mapped("tipo_paralisacao", "situation_shutdown", "map_shutdown_reason_explicitly"),
    ],
    constants: { organization_id: ORGANIZATION_ID },
    defaults: { agreement_number: null },
    precedence: [
      "legacy_identity",
      "agreement_number",
      "fallback_operational_identity",
      "documento_before_caminho",
    ],
    classify(row, context) {
      const base = firstQuarantine([
        classifyIdentity(row, "INSTALLMENT_LEGACY_IDENTITY_INVALID"),
        classifyRequiredText(row, "natureza", "INSTALLMENT_LEGAL_NATURE_REQUIRED"),
        classifyRequiredText(row, "tipo", "INSTALLMENT_TYPE_REQUIRED"),
        classifyRequiredText(row, "estancia", "INSTALLMENT_JURISDICTION_REQUIRED"),
        classifyBooleanCode(row, "debito_automatico", "INSTALLMENT_AUTOMATIC_DEBIT_UNMAPPED"),
        classifyOptionalDate(row, "data_adesao", "INSTALLMENT_ENROLLMENT_DATE_INVALID"),
        classifyOptionalDate(row, "data_finalizacao", "INSTALLMENT_COMPLETION_DATE_INVALID"),
        ...["total_consolidado", "primeira_parcela", "parcela_mes_vigente", "saldo_devedor"].map(
          (field) => classifyNonNegativeNumber(row, field, "INSTALLMENT_AMOUNT_INVALID"),
        ),
        ...["parcelas_pagas", "parcelas_restantes", "parcelas_vencidas", "parcelas_entradas"].map(
          (field) => classifyNonNegativeInteger(row, field, "INSTALLMENT_COUNT_INVALID"),
        ),
        classifyPositiveInteger(row, "parcelas_acordadas", "INSTALLMENT_AGREED_COUNT_INVALID"),
      ]);
      if (base.status === "quarantine") return base;

      if (![0, 1].includes(Number(row?.externo))) {
        return quarantine("externo", "INSTALLMENT_CLIENT_CATALOG_UNMAPPED");
      }
      const clientResolution =
        Number(row.externo) === 1
          ? context?.externalClientResolution
          : context?.integrationClientResolution;
      const client = classifyResolution(clientResolution, "cliente_id", "INSTALLMENT_CLIENT");
      if (client.status === "quarantine") return client;

      if (![0, 1, 2].includes(Number(row?.situacao))) {
        return quarantine("situacao", "INSTALLMENT_STATUS_UNMAPPED");
      }
      if (![0, 1, 2, 3, 4, 5].includes(Number(row?.tipo_paralisacao))) {
        return quarantine("tipo_paralisacao", "INSTALLMENT_SHUTDOWN_REASON_UNMAPPED");
      }
      return classifyUniqueness(context?.agreementIdentityResolution, "id", "INSTALLMENT_IDENTITY");
    },
  });
}

function createCompetencyRule() {
  const sourceTable = "tb_parcelamento.competencia";
  return createRule({
    sourceTable,
    domain: "parcelamento",
    stepId: "parcelamento-installment-competency-insert",
    destinationTable: "parcelamento.installmentsCompetencies",
    dependencies: ["tb_parcelamento.parcelamentos"],
    identity: generateIdentity("id", sourceTable),
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped(
        "id_parcelamento",
        "installment_id",
        "resolve_installment_reference",
        referenceOptions(),
      ),
      mapped("data", "competence", "normalize_year_month"),
      mapped("pagas", "how_many_paid", "normalize_non_negative_integer"),
      mapped("vencida", "how_many_overdue", "normalize_non_negative_integer"),
      mapped("download", "download", "normalize_boolean_code"),
      mapped("download_obs", "download_notes", "normalize_optional_text"),
      mapped("upload", "upload_file", "normalize_nullable_boolean_code"),
      mapped("envio", "is_sent", "normalize_nullable_boolean_code"),
      mapped("tipo_envio", "submission_type", "map_submission_type_explicitly"),
      mapped("obs", "notes", "normalize_optional_text"),
      notPreserved(
        "recibo",
        "O contrato atual da competência não possui storage ou referência de recibo; arquivo presente exige quarentena por emissão.",
        { sensitivity: "secret" },
      ),
      mapped("parcela", "installment_amount", "normalize_non_negative_number"),
    ],
    constants: { organization_id: ORGANIZATION_ID },
    precedence: ["legacy_identity", "organization_installment_competence_unique"],
    classify(row, context) {
      const base = firstQuarantine([
        classifyIdentity(row, "INSTALLMENT_COMPETENCE_LEGACY_IDENTITY_INVALID"),
        classifyCompetence(row?.data, "data", "INSTALLMENT_COMPETENCE_INVALID"),
        classifyNonNegativeInteger(row, "pagas", "INSTALLMENT_COMPETENCE_PAID_INVALID"),
        classifyNonNegativeInteger(row, "vencida", "INSTALLMENT_COMPETENCE_OVERDUE_INVALID"),
        classifyBooleanCode(row, "download", "INSTALLMENT_DOWNLOAD_STATE_UNMAPPED"),
        classifyNullableBooleanCode(row, "upload", "INSTALLMENT_UPLOAD_STATE_UNMAPPED"),
        classifyNullableBooleanCode(row, "envio", "INSTALLMENT_SENT_STATE_UNMAPPED"),
        classifySubmissionType(row?.tipo_envio),
        classifyNonNegativeNumber(row, "parcela", "INSTALLMENT_COMPETENCE_AMOUNT_INVALID"),
      ]);
      if (base.status === "quarantine") return base;
      if (hasValue(row?.recibo)) {
        return quarantine("recibo", "INSTALLMENT_RECEIPT_STORAGE_UNSUPPORTED");
      }
      const parent = classifyResolution(
        context?.installmentResolution,
        "id_parcelamento",
        "INSTALLMENT_PARENT",
      );
      if (parent.status === "quarantine") return parent;
      return classifyUniqueness(
        context?.competenceIdentityResolution,
        "data",
        "INSTALLMENT_COMPETENCE_IDENTITY",
      );
    },
  });
}

function createPanoramaRule() {
  const sourceTable = "tb_cbc.panorama_parcelamentos";
  return createRule({
    sourceTable,
    domain: "parcelamento",
    stepId: "parcelamento-panorama-insert",
    destinationTable: "parcelamento.panorama",
    dependencies: ["tb_regularize.clientes", "tb_admin.usuarios"],
    identity: generateIdentity("id", sourceTable),
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("comp", "competence", "normalize_year_month"),
      mapped("cliente_id", "client_id", "resolve_client_reference", referenceOptions()),
      mapped("cnd_municipal", "cnd_municipal", "normalize_boolean_code"),
      mapped("cnd_estadual", "cnd_state", "normalize_boolean_code"),
      mapped("cnd_federal", "cnd_federal", "normalize_boolean_code"),
      mapped("cnd_fgts", "cnd_fgts", "normalize_boolean_code"),
      mapped("cnd_trabalhista", "cnd_labor", "normalize_boolean_code"),
      mapped("protestos", "protests", "normalize_boolean_code"),
      mapped("situacao_fiscal_estadual", "state_tax_situation", "normalize_boolean_code"),
      mapped("situacao_fiscal_federal", "federal_tax_situation", "normalize_boolean_code"),
      mapped("responsavel_id", "responsavel_id", "resolve_user_reference", referenceOptions()),
    ],
    constants: { organization_id: ORGANIZATION_ID },
    precedence: ["legacy_identity", "organization_client_competence_unique"],
    classify(row, context) {
      const base = firstQuarantine([
        classifyIdentity(row, "PANORAMA_LEGACY_IDENTITY_INVALID"),
        classifyCompetence(row?.comp, "comp", "PANORAMA_COMPETENCE_INVALID"),
        ...[
          "cnd_municipal",
          "cnd_estadual",
          "cnd_federal",
          "cnd_fgts",
          "cnd_trabalhista",
          "protestos",
          "situacao_fiscal_estadual",
          "situacao_fiscal_federal",
        ].map((field) => classifyBooleanCode(row, field, "PANORAMA_BOOLEAN_STATE_UNMAPPED")),
      ]);
      if (base.status === "quarantine") return base;

      const client = classifyResolution(context?.clientResolution, "cliente_id", "PANORAMA_CLIENT");
      if (client.status === "quarantine") return client;
      const responsible = classifyResolution(
        context?.responsibleResolution,
        "responsavel_id",
        "PANORAMA_RESPONSIBLE",
      );
      if (responsible.status === "quarantine") return responsible;
      return classifyUniqueness(context?.panoramaIdentityResolution, "comp", "PANORAMA_IDENTITY");
    },
  });
}

function createRule({
  sourceTable,
  domain,
  stepId,
  destinationTable,
  mode = "insert",
  dependencies = [],
  identity,
  columns,
  constants = { organization_id: ORGANIZATION_ID },
  defaults = {},
  precedence,
  classify,
}) {
  const evidenceDecision = requireConfirmedEvidence(sourceTable);
  return {
    sourceTable,
    status: "confirmed",
    domain,
    ruleOrigin: evidenceDecision.ruleId,
    evidence: evidenceForRule(evidenceDecision),
    cardinality: "1:1",
    dependencies,
    destinations: [
      {
        stepId,
        destinationTable,
        mode,
        identity,
        columns,
        constants,
        defaults,
        precedence,
        dependencies,
      },
    ],
    classifySourceRow(row, context) {
      return classify(row, context);
    },
    emitRows(row, context) {
      const classification = classify(row, context);
      return [
        emission({
          stepId,
          destinationTable,
          identityRef: rowIdentity(sourceTable, row?.id),
          classification,
        }),
      ];
    },
  };
}

function classifyResolution(value, field, prefix) {
  if (value === "one") return prepared();
  if (value === "zero") return quarantine(field, `${prefix}_NOT_FOUND`);
  if (value === "many") return quarantine(field, `${prefix}_AMBIGUOUS`);
  return quarantine(field, `${prefix}_LOOKUP_NOT_EXECUTED`);
}

function classifyUniqueness(value, field, prefix) {
  if (value === "zero") return prepared();
  if (value === "one" || value === "many" || value === "duplicate") {
    return quarantine(field, `${prefix}_DUPLICATE`);
  }
  return quarantine(field, `${prefix}_LOOKUP_NOT_EXECUTED`);
}

function classifyIdentity(row, reasonCode) {
  return isLegacyIdentity(row?.id) ? prepared() : quarantine("id", reasonCode);
}

function classifyRequiredText(row, field, reasonCode) {
  if (field === "cpf_cnpj") {
    return String(row?.[field] ?? "").replace(/\D/g, "").length > 0
      ? prepared()
      : quarantine(field, reasonCode);
  }
  return prepared();
}

function classifyBooleanCode(row, field, reasonCode) {
  return [0, 1].includes(Number(row?.[field])) ? prepared() : quarantine(field, reasonCode);
}

function classifyNullableBooleanCode(row, field, reasonCode) {
  return [0, 1].includes(Number(row?.[field])) ? prepared() : quarantine(field, reasonCode);
}

function classifyOptionalDate(row, field, reasonCode) {
  const value = row?.[field];
  if (!hasValue(value) || String(value).trim().startsWith("0000-00-00")) return prepared();
  return isValidDate(value) ? prepared() : quarantine(field, reasonCode);
}

function classifyCompetence(value, field, reasonCode) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(value ?? "").trim())) {
    return quarantine(field, reasonCode);
  }
  return prepared();
}

function classifyNonNegativeNumber(row, field, reasonCode) {
  const value = Number(row?.[field]);
  return Number.isFinite(value) && value >= 0 ? prepared() : quarantine(field, reasonCode);
}

function classifyNonNegativeInteger(row, field, reasonCode) {
  const value = Number(row?.[field]);
  return Number.isSafeInteger(value) && value >= 0 ? prepared() : quarantine(field, reasonCode);
}

function classifyPositiveInteger(row, field, reasonCode) {
  const value = Number(row?.[field]);
  return Number.isSafeInteger(value) && value > 0 ? prepared() : quarantine(field, reasonCode);
}

function classifySubmissionType(value) {
  return [0, 1, 2, 3].includes(Number(value))
    ? prepared()
    : quarantine("tipo_envio", "INSTALLMENT_SUBMISSION_TYPE_UNMAPPED");
}

function isValidDate(value) {
  if (!hasValue(value)) return false;
  const text = String(value).trim();
  if (text.startsWith("0000-00-00") || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}

function firstQuarantine(classifications) {
  return classifications.find(({ status }) => status === "quarantine") ?? prepared();
}

function prepared() {
  return { status: "prepared" };
}

function quarantine(field, reasonCode) {
  return { status: "quarantine", field, reasonCode };
}

function emission({ stepId, destinationTable, identityRef, classification }) {
  return {
    stepId,
    destinationTable,
    status: classification.status,
    identityRef,
    field: classification.status === "prepared" ? null : classification.field,
    reasonCode: classification.status === "prepared" ? null : classification.reasonCode,
  };
}

function generateIdentity(legacyColumn, scope) {
  return {
    kind: "generate",
    legacyColumn,
    scope,
    namespace: REQUIRED_IDENTITY_NAMESPACE,
  };
}

function rowIdentity(sourceTable, legacyId) {
  return isLegacyIdentity(legacyId) ? `${sourceTable}:${legacyId}` : `${sourceTable}:invalid-id`;
}

function isLegacyIdentity(value) {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0;
  return typeof value === "string" && /^[1-9]\d*$/.test(value.trim());
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim().length > 0;
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
      `A coluna legada ${sourceColumn} alimenta ${destinationColumn} pelo contrato atual comprovado.`,
  };
}

function notPreserved(sourceColumn, reason, options = {}) {
  return {
    sourceColumn,
    destinationColumn: null,
    status: "not_preserved",
    transformation: "not_preserved",
    nullHandling: "not_applicable",
    referenceRole: "none",
    sensitivity: options.sensitivity ?? "none",
    reason,
  };
}

function referenceOptions() {
  return { referenceRole: "foreign_key", nullHandling: "resolve_unique_or_quarantine" };
}

function personalOptions() {
  return { sensitivity: "personal" };
}

function evidenceForRule(decision) {
  return { legacy: [...decision.legacyReferences], current: [...decision.currentContractEvidence] };
}

function requireConfirmedEvidence(sourceTable) {
  const decision = EVIDENCE_BY_SOURCE.get(sourceTable);
  if (decision?.finalStatus !== "confirmed" || decision.ruleId === null) {
    throw new Error(`EvidenceDecision confirmed ausente para ${sourceTable}.`);
  }
  return decision;
}
