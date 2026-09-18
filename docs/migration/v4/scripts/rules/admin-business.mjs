import { createHash } from "node:crypto";

import { ADMIN_BUSINESS_EVIDENCE } from "../evidence/admin-business.mjs";
import { V2_CLIENT_AUDITED_CORPORA } from "../evidence/v2.mjs";
import { normalizeRequiredScalarText } from "../lib/empty-scalar-policy.mjs";
import { REQUIRED_IDENTITY_NAMESPACE } from "../lib/mapping-contract.mjs";
import { uuidV5 } from "../lib/uuid-v5.mjs";

const ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const EVIDENCE_BY_SOURCE = new Map(
  ADMIN_BUSINESS_EVIDENCE.map((decision) => [decision.sourceTable, decision]),
);
const REFERENCE_RESOLUTION_STATES = new Set(["one", "zero", "many"]);
const DEDUP_RESOLUTION_STATES = new Set(["owner", "duplicate", "conflict"]);
const EMPTY_COLUMN_SET = new Set();
const LEGACY_REFERENCE_ISSUANCE = new WeakMap();
const V2_CLIENT_IDENTITY_ISSUANCE = new WeakMap();
const NULLABLE_MAPPED_COLUMNS_BY_DESTINATION = new Map([
  ["contabil.responsibles", new Set(["customer_with_movement"])],
  [
    "fiscal.icms",
    new Set([
      "item_number",
      "cest_code",
      "interstate_agreement",
      "applied_original_mva",
      "adjusted_mva",
      "original_mva",
    ]),
  ],
  ["fiscal.ipi", new Set(["ex", "description", "aliquot"])],
  [
    "fiscal.ncm",
    new Set([
      "ncm_notes",
      "cst_pis_outgoing",
      "cst_cofins_outgoing",
      "product_group",
      "information_source",
      "reference_legislation",
      "validity_end_date",
    ]),
  ],
]);

export const ADMIN_BUSINESS_TRANSFORMATIONS = Object.freeze({
  normalize_boolean: normalizeBoolean,
  normalize_dynamic_permission_boolean: normalizeDynamicPermissionBoolean,
  normalize_competence: normalizeCompetence,
  normalize_datetime: normalizeDateTime,
  normalize_legacy_permission_level_plus_one: normalizeLegacyPermissionLevelPlusOne,
  normalize_reference_text: normalizeReferenceText,
  normalize_required_datetime: normalizeRequiredDateTime,
  normalize_required_text: normalizeRequiredText,
  normalize_text: normalizeText,
  preserve_full_history_text: preserveFullHistoryText,
  resolve_client_reference: resolveClientReference,
  resolve_user_reference: resolveUserReference,
  uuid_v5_from_full_source_table_and_legacy_id: uuidV5FromFullSourceTableAndLegacyId,
});

export function createLegacyReferenceResolver({ sourceTable, legacyColumn, rows }) {
  if (typeof sourceTable !== "string" || !/^[A-Za-z0-9_.]+$/.test(sourceTable)) {
    throw new TypeError("sourceTable de referência deve ser um identificador sanitizado");
  }
  if (typeof legacyColumn !== "string" || legacyColumn.length === 0) {
    throw new TypeError("legacyColumn de referência deve ser informado");
  }
  if (!Array.isArray(rows)) {
    throw new TypeError("rows de referência deve ser um array");
  }
  const rowsByKey = new Map();
  for (const row of rows) {
    const key = strictPositiveIntegerLiteral(row?.[legacyColumn]);
    if (key === null) continue;
    const candidates = rowsByKey.get(key) ?? [];
    candidates.push(row);
    rowsByKey.set(key, candidates);
  }

  return Object.freeze({
    resolve(value) {
      const key = strictPositiveIntegerLiteral(value);
      const candidates = key === null ? [] : (rowsByKey.get(key) ?? []);
      if (candidates.length === 0) return referenceResolution("zero", sourceTable, key);
      if (candidates.length > 1) return referenceResolution("many", sourceTable, key);
      return referenceResolution("one", sourceTable, key, `${sourceTable}:${key}`);
    },
  });
}

export function createV2ClientIdentityResolver({ regularizeRows, integrationRows }) {
  if (!Array.isArray(regularizeRows) || !Array.isArray(integrationRows)) {
    throw new TypeError("regularizeRows e integrationRows devem ser arrays");
  }
  const regularizeSnapshot = snapshotLegacyRows(regularizeRows);
  const integrationSnapshot = snapshotLegacyRows(integrationRows);
  const authoritative =
    isAuditedV2ClientCorpus("tb_regularize.clientes", regularizeSnapshot) &&
    isAuditedV2ClientCorpus("tb_integracao.clientes", integrationSnapshot);
  const regularizeByCode = new Map();
  for (const row of regularizeSnapshot) {
    const code = strictPositiveIntegerLiteral(row?.codigo);
    if (code === null) continue;
    const candidates = regularizeByCode.get(code) ?? [];
    candidates.push(row);
    regularizeByCode.set(code, candidates);
  }
  const integrationResolver = createLegacyReferenceResolver({
    sourceTable: "tb_integracao.clientes",
    legacyColumn: "id",
    rows: integrationSnapshot,
  });

  return Object.freeze({
    resolve(value) {
      const code = strictPositiveIntegerLiteral(value);
      const candidates = code === null ? [] : (regularizeByCode.get(code) ?? []);
      if (candidates.length === 0)
        return clientResolution("zero", "zero", code, null, authoritative);
      if (candidates.length > 1) return clientResolution("many", "many", code, null, authoritative);
      const regularizeRow = candidates[0];
      if (!hasExplicitV2ClientLink(regularizeRow?.cliente_id)) {
        return clientResolution(
          "one",
          "one",
          code,
          `tb_regularize.clientes:${code}`,
          authoritative,
        );
      }
      const integration = integrationResolver.resolve(regularizeRow.cliente_id);
      return clientResolution(
        "one",
        integration.state,
        code,
        integration.identityRef,
        authoritative,
      );
    },
  });
}

function snapshotLegacyRows(rows) {
  return Object.freeze(rows.map((row) => Object.freeze({ ...row })));
}

export function isAuthenticLegacyReferenceResolution(
  resolution,
  expectedSourceTable,
  expectedSourceKey,
) {
  const snapshot = LEGACY_REFERENCE_ISSUANCE.get(resolution);
  return (
    snapshot !== undefined &&
    snapshot.sourceTable === expectedSourceTable &&
    snapshot.sourceKey === strictPositiveIntegerLiteral(expectedSourceKey) &&
    matchesIssuedResolution(resolution, snapshot, false)
  );
}

export function isIssuedV2ClientIdentityResolution(resolution, expectedSourceKey) {
  const issuance = V2_CLIENT_IDENTITY_ISSUANCE.get(resolution);
  return (
    issuance !== undefined &&
    issuance.snapshot.sourceTable === "tb_regularize.clientes" &&
    issuance.snapshot.sourceKey === strictPositiveIntegerLiteral(expectedSourceKey) &&
    matchesIssuedResolution(resolution, issuance.snapshot, true)
  );
}

export function isAuthoritativeV2ClientIdentityResolution(resolution, expectedSourceKey) {
  const issuance = V2_CLIENT_IDENTITY_ISSUANCE.get(resolution);
  return (
    issuance?.authoritative === true &&
    isIssuedV2ClientIdentityResolution(resolution, expectedSourceKey)
  );
}

export function buildPermissionResolutionContexts({ sourceTable, rows, userResolver }) {
  if (
    typeof sourceTable !== "string" ||
    (sourceTable !== "tb_admin.permissoes" && !sourceTable.startsWith("tb_admin.permissoes_"))
  ) {
    throw new TypeError("sourceTable deve identificar uma tabela fixa de permissões");
  }
  if (!Array.isArray(rows)) throw new TypeError("rows de permissões deve ser um array");
  const dynamic = sourceTable === "tb_admin.permissoes";
  const groups = new Map();
  for (const [index, row] of rows.entries()) {
    const userKey = strictPositiveIntegerLiteral(row?.user_id);
    const groupKey =
      userKey === null
        ? `invalid:${index}`
        : dynamic
          ? JSON.stringify([row?.modulo, row?.referencia, userKey])
          : userKey;
    const entries = groups.get(groupKey) ?? [];
    entries.push({ index, row });
    groups.set(groupKey, entries);
  }
  const dedupStates = new Array(rows.length);
  for (const entries of groups.values()) {
    const levels = new Set(
      entries.map(({ row }) =>
        dynamic
          ? normalizeDynamicPermissionBoolean(row?.nivel)
          : normalizeLegacyPermissionLevelPlusOne(row?.permissao),
      ),
    );
    if (levels.size > 1) {
      for (const { index } of entries) dedupStates[index] = "conflict";
      continue;
    }
    const [owner, ...duplicates] = [...entries].sort(compareEntriesByLegacyId);
    dedupStates[owner.index] = "owner";
    for (const { index } of duplicates) dedupStates[index] = "duplicate";
  }

  return Object.freeze(
    rows.map((row, index) => {
      const user =
        typeof userResolver?.resolve === "function"
          ? userResolver.resolve(row?.user_id)
          : referenceResolution(
              "not_executed",
              "tb_admin.usuarios",
              strictPositiveIntegerLiteral(row?.user_id),
            );
      return Object.freeze({
        userResolution: user.state,
        userIdentityRef: user.identityRef,
        userResolutionFingerprint: user.fingerprint,
        userLookupSourceTable: user.sourceTable,
        userLookupSourceKey: user.sourceKey,
        permissionUserModuleResolution: dedupStates[index],
        ...permissionContextBinding(sourceTable, row, dedupStates[index]),
      });
    }),
  );
}

export function buildIcmsResolutionContexts(rows) {
  if (!Array.isArray(rows)) throw new TypeError("rows de ICMS deve ser um array");
  const groups = new Map();
  for (const [index, row] of rows.entries()) {
    const naturalKey = JSON.stringify(
      ["estado", "item", "cest", "descricao"].map((column) => canonicalLegacyText(row?.[column])),
    );
    const entries = groups.get(naturalKey) ?? [];
    entries.push({ index, row });
    groups.set(naturalKey, entries);
  }
  const states = new Array(rows.length);
  for (const entries of groups.values()) {
    const fiscalPayloads = new Set(
      entries.map(({ row }) =>
        JSON.stringify(
          ["acordo", "mva_original_aplicada", "mva_ajustado", "mva_original"].map((column) =>
            canonicalLegacyText(row?.[column]),
          ),
        ),
      ),
    );
    if (fiscalPayloads.size > 1) {
      for (const { index } of entries) states[index] = "conflict";
      continue;
    }
    const [owner, ...duplicates] = [...entries].sort(compareEntriesByLegacyId);
    states[owner.index] = "owner";
    for (const { index } of duplicates) states[index] = "duplicate";
  }
  return Object.freeze(
    states.map((icmsNaturalKeyResolution, index) =>
      Object.freeze({
        icmsNaturalKeyResolution,
        ...icmsContextBinding(rows[index], icmsNaturalKeyResolution),
      }),
    ),
  );
}

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
    classifySourceRow(row, context) {
      return firstQuarantine([
        classifyResolvedReference(row?.usuario_id, context, {
          stateKey: "userResolution",
          identityKey: "userIdentityRef",
          fingerprintKey: "userResolutionFingerprint",
          allowedSources: ["tb_admin.usuarios"],
          sourceTableKey: "userLookupSourceTable",
          sourceKeyKey: "userLookupSourceKey",
          allowedLookupSources: ["tb_admin.usuarios"],
          identityMustMatchLookup: true,
          field: "usuario_id",
          invalidReason: "LOG_USER_LINK_INVALID",
          notFoundReason: "LOG_USER_NOT_FOUND",
          ambiguousReason: "LOG_USER_AMBIGUOUS",
          notExecutedReason: "LOG_USER_LOOKUP_NOT_EXECUTED",
          invalidStateReason: "LOG_USER_LOOKUP_STATE_INVALID",
          invalidIdentityReason: "LOG_USER_IDENTITY_INVALID",
          contextMismatchReason: "LOG_USER_CONTEXT_MISMATCH",
        }),
        classifyRequiredValue(row?.tipo, "tipo", "LOG_ACTION_EMPTY"),
        classifyRequiredValue(row?.referente, "referente", "LOG_REFERRING_EMPTY"),
      ]);
    },
  }),
  createDynamicPermissionRule(),
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
    classifySourceRow(row, context) {
      return firstQuarantine([
        classifyClientReference(row, context),
        classifyResolvedReference(row?.user_id, context, {
          stateKey: "userResolution",
          identityKey: "userIdentityRef",
          fingerprintKey: "userResolutionFingerprint",
          allowedSources: ["tb_admin.usuarios"],
          sourceTableKey: "userLookupSourceTable",
          sourceKeyKey: "userLookupSourceKey",
          allowedLookupSources: ["tb_admin.usuarios"],
          identityMustMatchLookup: true,
          field: "user_id",
          invalidReason: "HISTORY_USER_LINK_INVALID",
          notFoundReason: "HISTORY_USER_NOT_FOUND",
          ambiguousReason: "HISTORY_USER_AMBIGUOUS",
          notExecutedReason: "HISTORY_USER_LOOKUP_NOT_EXECUTED",
          invalidStateReason: "HISTORY_USER_LOOKUP_STATE_INVALID",
          invalidIdentityReason: "HISTORY_USER_IDENTITY_INVALID",
          contextMismatchReason: "HISTORY_USER_CONTEXT_MISMATCH",
        }),
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
    classifySourceRow(row, context) {
      return firstQuarantine([
        classifyClientReference(row, context),
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
      return firstQuarantine([
        classifyIcmsNaturalKeyResolution(row, context),
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
    classifySourceRow(row) {
      return firstQuarantine([
        classifyRequiredValue(
          row?.tributacao_federal,
          "tributacao_federal",
          "NCM_FEDERAL_TAXATION_EMPTY",
        ),
        isExactCivilDate(row?.inicio_virgencia)
          ? prepared()
          : quarantine("inicio_virgencia", "NCM_VALIDITY_START_DATE_INVALID"),
      ]);
    },
  }),
];

export const ADMIN_BUSINESS_RULES = Object.freeze(rules);
export const adminBusinessRules = ADMIN_BUSINESS_RULES;

function createDynamicPermissionRule() {
  const sourceTable = "tb_admin.permissoes";
  const stepId = "permission-specific-task-completion-merge";
  return createRule({
    sourceTable,
    domain: "administration",
    cardinality: "N:1",
    dependencies: ["tb_admin.usuarios"],
    destinations: [
      {
        stepId,
        destinationTable: "permissions.specific",
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
            "A identidade específica atual é o user_id único por usuário e organização.",
          ),
          notPreserved(
            "modulo",
            "O módulo é usado para selecionar a única combinação dinâmica com contrato atual.",
          ),
          notPreserved(
            "referencia",
            "A referência é usada para selecionar task_completion e não possui coluna própria.",
          ),
          mapped("user_id", "user_id", "resolve_user_reference", referenceOptions()),
          mapped("nivel", "task_completion", "normalize_dynamic_permission_boolean", {
            reason:
              "A presença dinâmica integracao/ref=0 controla a conclusão de tarefas no contrato atual.",
          }),
        ],
        constants: { organization_id: ORGANIZATION_ID },
        defaults: {},
        precedence: ["explicit_legacy_link", "current_user_organization_unique", "source_level"],
        dependencies: ["tb_admin.usuarios"],
      },
    ],
    classifySourceRow(row, context) {
      return classifyDynamicPermissionRow(row, context);
    },
    emitRows(row, context) {
      const classification = classifyDynamicPermissionRow(row, context);
      const userIdentityRef = resolvedPermissionUserIdentity(row, context);
      return [
        emission({
          stepId,
          destinationTable: "permissions.specific",
          identityRef:
            userIdentityRef === null
              ? "quarantine:permissions.specific:user_id:invalid"
              : `permissions.specific:${userIdentityRef}:${ORGANIZATION_ID}`,
          classification,
        }),
      ];
    },
  });
}

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
    classifySourceRow(row, context) {
      return classifyPermissionRow(row, context, sourceTable);
    },
    emitRows(row, context) {
      const classification = classifyPermissionRow(row, context, sourceTable);
      const userIdentityRef =
        isSafeResolvedIdentity(context?.userIdentityRef, ["tb_admin.usuarios"]) &&
        isResolvedReferenceContextBound(row?.user_id, context, {
          stateKey: "userResolution",
          identityKey: "userIdentityRef",
          fingerprintKey: "userResolutionFingerprint",
          sourceTableKey: "userLookupSourceTable",
          sourceKeyKey: "userLookupSourceKey",
          allowedLookupSources: ["tb_admin.usuarios"],
          identityMustMatchLookup: true,
        }) &&
        isResolvedReferenceFingerprintValid(context, {
          stateKey: "userResolution",
          identityKey: "userIdentityRef",
          fingerprintKey: "userResolutionFingerprint",
          sourceTableKey: "userLookupSourceTable",
          sourceKeyKey: "userLookupSourceKey",
        }) &&
        isResolvedIdentityMatchingLookup(context, {
          identityKey: "userIdentityRef",
          sourceTableKey: "userLookupSourceTable",
          sourceKeyKey: "userLookupSourceKey",
        })
          ? context.userIdentityRef
          : null;
      return [
        emission({
          stepId,
          destinationTable: "permissions",
          identityRef:
            userIdentityRef === null
              ? "quarantine:permissions:user_id:invalid"
              : `permissions:${userIdentityRef}:${ORGANIZATION_ID}`,
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
    if (identity.status !== "prepared") return identity;
    const sourceClassification = classifySourceRow(row, context);
    if (sourceClassification.status !== "prepared") return sourceClassification;
    return classifyRequiredDestinationTransformations({
      sourceTable,
      destinationTable,
      columns,
      row,
      context,
    });
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

function classifyRequiredDestinationTransformations({
  sourceTable,
  destinationTable,
  columns,
  row,
  context,
}) {
  const nullableColumns =
    NULLABLE_MAPPED_COLUMNS_BY_DESTINATION.get(destinationTable) ?? EMPTY_COLUMN_SET;
  for (const column of columns) {
    if (
      column.status !== "mapped" ||
      column.referenceRole === "foreign_key" ||
      nullableColumns.has(column.destinationColumn)
    ) {
      continue;
    }
    const transformer = ADMIN_BUSINESS_TRANSFORMATIONS[column.transformation];
    if (
      transformer(row[column.sourceColumn], {
        sourceTable,
        row,
        context,
        column,
      }) === null
    ) {
      return quarantine(column.sourceColumn, "REQUIRED_DESTINATION_TRANSFORMATION_NULL");
    }
  }
  return prepared();
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
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= -1 && value <= 2 ? value + 1 : null;
  }
  if (typeof value !== "string" || !/^(?:-1|0|1|2)$/.test(value)) return null;
  return Number(value) + 1;
}

function normalizeDynamicPermissionBoolean(value) {
  return normalizeBoolean(value);
}

function uuidV5FromFullSourceTableAndLegacyId(value, options = {}) {
  if (typeof options.sourceTable !== "string" || !/^[A-Za-z0-9_.]+$/.test(options.sourceTable)) {
    return null;
  }
  const legacyId = strictPositiveIntegerLiteral(value);
  return legacyId === null
    ? null
    : uuidV5(REQUIRED_IDENTITY_NAMESPACE, `${options.sourceTable}:${legacyId}`);
}

function normalizeBoolean(value) {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  return null;
}

function normalizeCompetence(value) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim();
  const match = normalized.match(/^(\d{4})-(\d{2})$/);
  if (match === null) return null;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? normalized : null;
}

function normalizeDateTime(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim();
  const match = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?Z?)?$/,
  );
  if (match === null) return null;
  const [, yearText, monthText, dayText, hourText = "00", minuteText = "00", secondText = "00"] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }
  const milliseconds = Number((match[7] ?? "").padEnd(3, "0").slice(0, 3));
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second, milliseconds));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return null;
  }
  return date.toISOString();
}

function normalizeRequiredDateTime(value) {
  return normalizeDateTime(value);
}

function normalizeText(value) {
  if (value === null || value === undefined) return null;
  return String(value).normalize("NFKC").trim();
}

function normalizeRequiredText(value) {
  return normalizeRequiredScalarText(normalizeText(value));
}

function normalizeReferenceText(value) {
  return normalizeText(value);
}

function preserveFullHistoryText(value) {
  return value === null || value === undefined ? null : String(value);
}

function resolveUserReference(_value, options = {}) {
  return typeof options.context?.resolvedUserId === "string"
    ? options.context.resolvedUserId
    : null;
}

function resolveClientReference(_value, options = {}) {
  return typeof options.context?.resolvedClientId === "string"
    ? options.context.resolvedClientId
    : null;
}

function classifyPermissionRow(row, context, sourceTable) {
  if (!isValidLegacyReference(row?.user_id)) {
    return quarantine("user_id", "PERMISSION_USER_LINK_INVALID");
  }
  if (normalizeLegacyPermissionLevelPlusOne(row?.permissao) === null) {
    return quarantine("permissao", "PERMISSION_LEVEL_INVALID");
  }
  const user = classifyResolvedReference(row.user_id, context, {
    stateKey: "userResolution",
    identityKey: "userIdentityRef",
    fingerprintKey: "userResolutionFingerprint",
    allowedSources: ["tb_admin.usuarios"],
    sourceTableKey: "userLookupSourceTable",
    sourceKeyKey: "userLookupSourceKey",
    allowedLookupSources: ["tb_admin.usuarios"],
    identityMustMatchLookup: true,
    field: "user_id",
    invalidReason: "PERMISSION_USER_LINK_INVALID",
    notFoundReason: "PERMISSION_USER_NOT_FOUND",
    ambiguousReason: "PERMISSION_USER_AMBIGUOUS",
    notExecutedReason: "PERMISSION_USER_LOOKUP_NOT_EXECUTED",
    invalidStateReason: "PERMISSION_USER_LOOKUP_STATE_INVALID",
    invalidIdentityReason: "PERMISSION_USER_IDENTITY_INVALID",
    contextMismatchReason: "PERMISSION_USER_CONTEXT_MISMATCH",
  });
  if (user.status !== "prepared") return user;
  const dedupState = context?.permissionUserModuleResolution;
  if (dedupState === undefined || dedupState === "not_executed") {
    return quarantine("user_id", "PERMISSION_DEDUP_NOT_EXECUTED");
  }
  if (!DEDUP_RESOLUTION_STATES.has(dedupState)) {
    return quarantine("user_id", "PERMISSION_DEDUP_STATE_INVALID");
  }
  if (!isPermissionContextBound(row, context, sourceTable)) {
    return quarantine("id", "PERMISSION_DEDUP_CONTEXT_MISMATCH");
  }
  switch (dedupState) {
    case "owner":
      return prepared();
    case "duplicate":
      return notEmitted("PERMISSION_MODULE_DUPLICATE");
    case "conflict":
      return quarantine("permissao", "PERMISSION_MODULE_LEVEL_CONFLICT");
  }
}

function classifyDynamicPermissionRow(row, context) {
  const identity = classifyRequiredReference(row?.id, "id", "DYNAMIC_PERMISSION_ID_INVALID");
  if (identity.status !== "prepared") return identity;
  if (String(row?.modulo ?? "") !== "integracao") {
    return quarantine("modulo", "DYNAMIC_PERMISSION_NO_CURRENT_CONTRACT");
  }
  if (String(row?.referencia ?? "") !== "0") {
    return quarantine("referencia", "DYNAMIC_PERMISSION_NO_CURRENT_CONTRACT");
  }
  if (normalizeDynamicPermissionBoolean(row?.nivel) === null) {
    return quarantine("nivel", "DYNAMIC_PERMISSION_LEVEL_INVALID");
  }
  return classifyResolvedReference(row?.user_id, context, {
    stateKey: "userResolution",
    identityKey: "userIdentityRef",
    fingerprintKey: "userResolutionFingerprint",
    allowedSources: ["tb_admin.usuarios"],
    sourceTableKey: "userLookupSourceTable",
    sourceKeyKey: "userLookupSourceKey",
    allowedLookupSources: ["tb_admin.usuarios"],
    identityMustMatchLookup: true,
    field: "user_id",
    invalidReason: "PERMISSION_USER_LINK_INVALID",
    notFoundReason: "PERMISSION_USER_NOT_FOUND",
    ambiguousReason: "PERMISSION_USER_AMBIGUOUS",
    notExecutedReason: "PERMISSION_USER_LOOKUP_NOT_EXECUTED",
    invalidStateReason: "PERMISSION_USER_LOOKUP_STATE_INVALID",
    invalidIdentityReason: "PERMISSION_USER_IDENTITY_INVALID",
    contextMismatchReason: "PERMISSION_USER_CONTEXT_MISMATCH",
  });
}

function resolvedPermissionUserIdentity(row, context) {
  return isSafeResolvedIdentity(context?.userIdentityRef, ["tb_admin.usuarios"]) &&
    isResolvedReferenceContextBound(row?.user_id, context, {
      stateKey: "userResolution",
      identityKey: "userIdentityRef",
      fingerprintKey: "userResolutionFingerprint",
      sourceTableKey: "userLookupSourceTable",
      sourceKeyKey: "userLookupSourceKey",
      allowedLookupSources: ["tb_admin.usuarios"],
      identityMustMatchLookup: true,
    }) &&
    isResolvedReferenceFingerprintValid(context, {
      stateKey: "userResolution",
      identityKey: "userIdentityRef",
      fingerprintKey: "userResolutionFingerprint",
      sourceTableKey: "userLookupSourceTable",
      sourceKeyKey: "userLookupSourceKey",
    }) &&
    isResolvedIdentityMatchingLookup(context, {
      identityKey: "userIdentityRef",
      sourceTableKey: "userLookupSourceTable",
      sourceKeyKey: "userLookupSourceKey",
    })
    ? context.userIdentityRef
    : null;
}

function classifyClientReference(row, context) {
  return classifyResolvedReference(row?.cliente_id, context, {
    stateKey: "clientResolution",
    identityKey: "clientIdentityRef",
    fingerprintKey: "clientResolutionFingerprint",
    allowedSources: ["tb_integracao.clientes", "tb_regularize.clientes"],
    sourceTableKey: "clientLookupSourceTable",
    sourceKeyKey: "clientLookupSourceKey",
    allowedLookupSources: ["tb_regularize.clientes"],
    identityMustMatchLookup: false,
    field: "cliente_id",
    invalidReason: "CLIENT_LINK_INVALID",
    notFoundReason: "CLIENT_REFERENCE_NOT_FOUND",
    ambiguousReason: "CLIENT_REFERENCE_AMBIGUOUS",
    notExecutedReason: "CLIENT_LOOKUP_NOT_EXECUTED",
    invalidStateReason: "CLIENT_LOOKUP_STATE_INVALID",
    invalidIdentityReason: "CLIENT_IDENTITY_INVALID",
    contextMismatchReason: "CLIENT_CONTEXT_MISMATCH",
  });
}

function classifyIcmsNaturalKeyResolution(row, context) {
  const dedupState = context?.icmsNaturalKeyResolution;
  if (dedupState === undefined || dedupState === "not_executed") {
    return quarantine("natural_key", "ICMS_DEDUP_NOT_EXECUTED");
  }
  if (!DEDUP_RESOLUTION_STATES.has(dedupState)) {
    return quarantine("natural_key", "ICMS_DEDUP_STATE_INVALID");
  }
  if (!isIcmsContextBound(row, context)) {
    return quarantine("natural_key", "ICMS_DEDUP_CONTEXT_MISMATCH");
  }
  switch (dedupState) {
    case "owner":
      return prepared();
    case "duplicate":
      return notEmitted("ICMS_NATURAL_DUPLICATE");
    case "conflict":
      return quarantine("natural_key", "ICMS_NATURAL_KEY_CONFLICT");
  }
}

function classifyResolvedReference(
  value,
  context,
  {
    stateKey,
    identityKey,
    fingerprintKey,
    allowedSources,
    sourceTableKey,
    sourceKeyKey,
    allowedLookupSources,
    identityMustMatchLookup,
    field,
    invalidReason,
    notFoundReason,
    ambiguousReason,
    notExecutedReason,
    invalidStateReason,
    invalidIdentityReason,
    contextMismatchReason,
  },
) {
  if (!isValidLegacyReference(value)) return quarantine(field, invalidReason);
  const resolutionState = context?.[stateKey];
  if (resolutionState === undefined || resolutionState === "not_executed") {
    return quarantine(field, notExecutedReason);
  }
  if (!REFERENCE_RESOLUTION_STATES.has(resolutionState)) {
    return quarantine(field, invalidStateReason);
  }
  if (
    !isResolvedReferenceContextBound(value, context, {
      stateKey,
      identityKey,
      sourceTableKey,
      sourceKeyKey,
      allowedLookupSources,
      identityMustMatchLookup,
    })
  ) {
    return quarantine(field, contextMismatchReason);
  }
  if (
    resolutionState !== "one" &&
    !isResolvedReferenceFingerprintValid(context, {
      stateKey,
      identityKey,
      fingerprintKey,
      sourceTableKey,
      sourceKeyKey,
    })
  ) {
    return quarantine(field, contextMismatchReason);
  }
  switch (resolutionState) {
    case "one": {
      if (!isSafeResolvedIdentity(context?.[identityKey], allowedSources)) {
        return quarantine(field, invalidIdentityReason);
      }
      if (
        !isResolvedReferenceFingerprintValid(context, {
          stateKey,
          identityKey,
          fingerprintKey,
          sourceTableKey,
          sourceKeyKey,
        })
      ) {
        return quarantine(field, contextMismatchReason);
      }
      if (
        identityMustMatchLookup &&
        !isResolvedIdentityMatchingLookup(context, {
          identityKey,
          sourceTableKey,
          sourceKeyKey,
        })
      ) {
        return quarantine(field, contextMismatchReason);
      }
      return prepared();
    }
    case "zero":
      return quarantine(field, notFoundReason);
    case "many":
      return quarantine(field, ambiguousReason);
  }
}

function classifyRequiredReference(value, field, reasonCode) {
  return isValidLegacyReference(value) ? prepared() : quarantine(field, reasonCode);
}

function classifyRequiredValue(_value, _field, _reasonCode) {
  return prepared();
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

function strictPositiveIntegerLiteral(value) {
  if (Number.isSafeInteger(value) && value > 0) return String(value);
  return typeof value === "string" && /^[1-9]\d*$/.test(value) ? value : null;
}

function isSafeResolvedIdentity(identityRef, allowedSources) {
  if (typeof identityRef !== "string") return false;
  return allowedSources.some(
    (sourceTable) =>
      identityRef.startsWith(`${sourceTable}:`) &&
      strictPositiveIntegerLiteral(identityRef.slice(sourceTable.length + 1)) !== null,
  );
}

function isResolvedReferenceContextBound(
  value,
  context,
  { sourceTableKey, sourceKeyKey, allowedLookupSources },
) {
  const expectedSourceKey = strictPositiveIntegerLiteral(value);
  const contextSourceTable = context?.[sourceTableKey];
  const contextSourceKey = strictPositiveIntegerLiteral(context?.[sourceKeyKey]);
  if (
    expectedSourceKey === null ||
    contextSourceKey !== expectedSourceKey ||
    !allowedLookupSources.includes(contextSourceTable)
  ) {
    return false;
  }
  return true;
}

function isResolvedIdentityMatchingLookup(context, { identityKey, sourceTableKey, sourceKeyKey }) {
  return context?.[identityKey] === `${context?.[sourceTableKey]}:${context?.[sourceKeyKey]}`;
}

function isResolvedReferenceFingerprintValid(
  context,
  { stateKey, identityKey, fingerprintKey, sourceTableKey, sourceKeyKey },
) {
  return (
    context?.[fingerprintKey] ===
    referenceResolutionFingerprint(
      context?.[stateKey],
      context?.[identityKey],
      context?.[sourceTableKey],
      context?.[sourceKeyKey],
    )
  );
}

function referenceResolution(state, sourceTable, sourceKey, identityRef = null) {
  const resolution = Object.freeze({
    state,
    identityRef,
    sourceTable,
    sourceKey,
    fingerprint: referenceResolutionFingerprint(state, identityRef, sourceTable, sourceKey),
  });
  LEGACY_REFERENCE_ISSUANCE.set(resolution, resolutionSnapshot(resolution, false));
  return resolution;
}

function clientResolution(sourceState, state, sourceKey, identityRef, authoritative) {
  const resolution = Object.freeze({
    sourceState,
    state,
    identityRef,
    sourceTable: "tb_regularize.clientes",
    sourceKey,
    fingerprint: referenceResolutionFingerprint(
      state,
      identityRef,
      "tb_regularize.clientes",
      sourceKey,
    ),
  });
  V2_CLIENT_IDENTITY_ISSUANCE.set(
    resolution,
    Object.freeze({
      authoritative,
      snapshot: resolutionSnapshot(resolution, true),
    }),
  );
  return resolution;
}

function resolutionSnapshot(resolution, includeSourceState) {
  return Object.freeze({
    ...(includeSourceState ? { sourceState: resolution.sourceState } : {}),
    state: resolution.state,
    identityRef: resolution.identityRef,
    sourceTable: resolution.sourceTable,
    sourceKey: resolution.sourceKey,
    fingerprint: resolution.fingerprint,
  });
}

function matchesIssuedResolution(resolution, snapshot, includeSourceState) {
  return (
    Object.isFrozen(resolution) &&
    (!includeSourceState || resolution.sourceState === snapshot.sourceState) &&
    resolution.state === snapshot.state &&
    resolution.identityRef === snapshot.identityRef &&
    resolution.sourceTable === snapshot.sourceTable &&
    resolution.sourceKey === snapshot.sourceKey &&
    resolution.fingerprint === snapshot.fingerprint
  );
}

function referenceResolutionFingerprint(state, identityRef, sourceTable, sourceKey) {
  return stableFingerprint(["reference-resolution-v1", state, identityRef, sourceTable, sourceKey]);
}

function isAuditedV2ClientCorpus(sourceTable, rows) {
  const manifest = V2_CLIENT_AUDITED_CORPORA[sourceTable];
  return (
    manifest !== undefined &&
    rows.length === manifest.rowCount &&
    v2ClientCorpusFingerprint(sourceTable, manifest.identityColumn, rows) === manifest.digest
  );
}

function v2ClientCorpusFingerprint(sourceTable, identityColumn, rows) {
  return stableFingerprint([
    "v2-client-authoritative-corpus-v1",
    ...rows
      .map((row) =>
        canonicalCorpusValue({
          sourceTable,
          sourceIdentityRef: `${sourceTable}:${row?.[identityColumn]}`,
          row,
        }),
      )
      .sort(),
  ]);
}

function canonicalCorpusValue(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalCorpusValue).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalCorpusValue(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function permissionContextBinding(sourceTable, row, dedupState) {
  const binding = {
    permissionSourceTable: sourceTable,
    permissionSourceRowId: strictPositiveIntegerLiteral(row?.id),
    permissionNaturalKeyFingerprint: permissionNaturalKeyFingerprint(sourceTable, row),
    permissionRowFingerprint: stableFingerprint([
      "permission-row-v1",
      sourceTable,
      strictPositiveIntegerLiteral(row?.id),
      strictPositiveIntegerLiteral(row?.user_id),
      canonicalLegacyText(sourceTable === "tb_admin.permissoes" ? row?.nivel : row?.permissao),
    ]),
  };
  return {
    ...binding,
    permissionDedupSignature: dedupDecisionSignature(
      "permission-dedup-v1",
      dedupState,
      binding.permissionSourceTable,
      binding.permissionSourceRowId,
      binding.permissionNaturalKeyFingerprint,
      binding.permissionRowFingerprint,
    ),
  };
}

function permissionNaturalKeyFingerprint(sourceTable, row) {
  return stableFingerprint([
    "permission-natural-key-v1",
    sourceTable,
    ...(sourceTable === "tb_admin.permissoes" ? [row?.modulo, row?.referencia] : []),
    strictPositiveIntegerLiteral(row?.user_id),
  ]);
}

function isPermissionContextBound(row, context, sourceTable) {
  const sourceRowId = strictPositiveIntegerLiteral(row?.id);
  if (sourceRowId === null) return false;
  const expected = permissionContextBinding(
    sourceTable,
    row,
    context?.permissionUserModuleResolution,
  );
  return (
    context?.permissionSourceTable === expected.permissionSourceTable &&
    context?.permissionSourceRowId === sourceRowId &&
    context?.permissionNaturalKeyFingerprint === expected.permissionNaturalKeyFingerprint &&
    context?.permissionRowFingerprint === expected.permissionRowFingerprint &&
    context?.permissionDedupSignature === expected.permissionDedupSignature
  );
}

function icmsContextBinding(row, dedupState) {
  const binding = {
    icmsSourceTable: "tb_fiscal.icms",
    icmsSourceRowId: strictPositiveIntegerLiteral(row?.id),
    icmsNaturalKeyFingerprint: stableFingerprint([
      "icms-natural-key-v1",
      ...icmsNaturalKeyValues(row),
    ]),
    icmsRowFingerprint: stableFingerprint([
      "icms-row-v1",
      strictPositiveIntegerLiteral(row?.id),
      ...icmsNaturalKeyValues(row),
      ...icmsFiscalPayloadValues(row),
    ]),
  };
  return {
    ...binding,
    icmsDedupSignature: dedupDecisionSignature(
      "icms-dedup-v1",
      dedupState,
      binding.icmsSourceTable,
      binding.icmsSourceRowId,
      binding.icmsNaturalKeyFingerprint,
      binding.icmsRowFingerprint,
    ),
  };
}

function isIcmsContextBound(row, context) {
  const sourceRowId = strictPositiveIntegerLiteral(row?.id);
  if (sourceRowId === null) return false;
  const expected = icmsContextBinding(row, context?.icmsNaturalKeyResolution);
  return (
    context?.icmsSourceTable === expected.icmsSourceTable &&
    context?.icmsSourceRowId === sourceRowId &&
    context?.icmsNaturalKeyFingerprint === expected.icmsNaturalKeyFingerprint &&
    context?.icmsRowFingerprint === expected.icmsRowFingerprint &&
    context?.icmsDedupSignature === expected.icmsDedupSignature
  );
}

function dedupDecisionSignature(
  scope,
  state,
  sourceTable,
  sourceRowId,
  naturalKeyFingerprint,
  rowFingerprint,
) {
  return stableFingerprint([
    scope,
    state,
    sourceTable,
    sourceRowId,
    naturalKeyFingerprint,
    rowFingerprint,
  ]);
}

function icmsNaturalKeyValues(row) {
  return ["estado", "item", "cest", "descricao"].map((column) =>
    canonicalLegacyText(row?.[column]),
  );
}

function icmsFiscalPayloadValues(row) {
  return ["acordo", "mva_original_aplicada", "mva_ajustado", "mva_original"].map((column) =>
    canonicalLegacyText(row?.[column]),
  );
}

function stableFingerprint(parts) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function hasExplicitV2ClientLink(value) {
  if (value === null || value === undefined) return false;
  const normalized = String(value).trim();
  return normalized.length > 0 && normalized !== "0";
}

function compareEntriesByLegacyId(left, right) {
  const leftId = strictPositiveIntegerLiteral(left.row?.id);
  const rightId = strictPositiveIntegerLiteral(right.row?.id);
  if (leftId === null && rightId === null) return left.index - right.index;
  if (leftId === null) return 1;
  if (rightId === null) return -1;
  const order = BigInt(leftId) - BigInt(rightId);
  return order < 0n ? -1 : order > 0n ? 1 : left.index - right.index;
}

function canonicalLegacyText(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length === 0 ? null : normalized;
}

function isExactCivilDate(value) {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year === 0 || month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
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
