import { createHash } from "node:crypto";

import { REMAINING_EVIDENCE } from "../evidence/remaining.mjs";
import { REQUIRED_IDENTITY_NAMESPACE } from "../lib/mapping-contract.mjs";
import {
  isAuthenticLegacyReferenceResolution,
  isAuthoritativeV2ClientIdentityResolution,
} from "./admin-business.mjs";

const ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const EVIDENCE_BY_SOURCE = new Map(
  REMAINING_EVIDENCE.map((decision) => [decision.sourceTable, decision]),
);
const ISSUED_CONTEXTS = new WeakSet();
const EXTENSION_SLOT_ISSUANCE = new WeakSet();
const CANONICAL_CLIENT_COLUMNS = new Map([
  ["tb_mkt.redes_sociais", "cliente_id"],
  ["tb_pec.notas", "cliente_id"],
  ["tb_triagem.campos", "cliente_id"],
]);
const TRIAGE_AUDITED_CORPUS = Object.freeze({
  rowCount: 553,
  digest: "4e6754d092be5d594a5c90a7d53fe3c507a951354a5eedf0ec306e47675f23ca",
});
const EXTENSION_AUDITED_CORPUS = Object.freeze({
  rowCount: 194,
  digest: "e32a90da960776e2a6d0f619c1ae54dd3cd7b0642e231ac25949c9df55b395c0",
});
const TRIAGE_ACTIVE_COLUMNS = Object.freeze([
  "nfce",
  "sped",
  "spedContribuicoes",
  "nfce_tomados",
  "modelo_21",
  "cte_emitente",
  "prestadas_mei",
]);

export function buildRemainingReferenceContext({
  sourceTable,
  row,
  resolutions = {},
  capabilities = {},
}) {
  if (typeof sourceTable !== "string" || !/^[A-Za-z0-9_.]+$/.test(sourceTable)) {
    throw new TypeError("sourceTable deve ser um identificador legado sanitizado");
  }
  if (!isObject(row) || !isObject(resolutions) || !isObject(capabilities)) {
    throw new TypeError("row, resolutions e capabilities devem ser objetos");
  }
  const canonicalClientColumn = CANONICAL_CLIENT_COLUMNS.get(sourceTable);
  const canonicalClientKey =
    canonicalClientColumn === undefined ? null : row[canonicalClientColumn];
  if (
    canonicalClientColumn !== undefined &&
    validLegacyId(canonicalClientKey) &&
    !isAuthoritativeV2ClientIdentityResolution(resolutions.client, canonicalClientKey)
  ) {
    throw new TypeError("client deve possuir proveniência autoritativa do corpus V2 auditado");
  }
  if (
    sourceTable === "tb_cbs.ramais" &&
    validLegacyId(row?.id) &&
    typeof row?.numero === "string" &&
    row.numero.trim().length > 0 &&
    !EXTENSION_SLOT_ISSUANCE.has(resolutions.numberSlot)
  ) {
    throw new TypeError("numberSlot deve ser emitido pelo preflight autoritativo de ramal");
  }
  const context = Object.freeze({
    sourceTable,
    rowFingerprint: fingerprint(row),
    resolutions: Object.freeze(
      Object.fromEntries(
        Object.entries(resolutions).map(([name, resolution]) => [
          name,
          Object.freeze(normalizeResolution(resolution)),
        ]),
      ),
    ),
    capabilities: Object.freeze(
      Object.fromEntries(
        Object.entries(capabilities).map(([name, value]) => [name, value === true]),
      ),
    ),
  });
  ISSUED_CONTEXTS.add(context);
  return context;
}

export function buildExtensionNumberSlotContexts({ rows, userResolver }) {
  if (!Array.isArray(rows) || typeof userResolver?.resolve !== "function") {
    throw new TypeError("rows e userResolver são obrigatórios para o preflight de ramais");
  }
  if (
    rows.length !== EXTENSION_AUDITED_CORPUS.rowCount ||
    corpusFingerprint(rows) !== EXTENSION_AUDITED_CORPUS.digest
  ) {
    throw new TypeError("O preflight exige o corpus completo auditado de tb_cbs.ramais");
  }

  const groups = Map.groupBy(rows, ({ numero }) => String(numero ?? "").trim());
  return Object.freeze(
    rows.map((row) => {
      const number = String(row?.numero ?? "").trim();
      const group = groups.get(number) ?? [];
      const numberSlot = extensionSlot(
        group.length === 1 ? "one" : "many",
        number,
        group.length === 1 ? row?.id : null,
      );
      const user = userResolver.resolve(row?.usuario_id);
      if (!isAuthenticLegacyReferenceResolution(user, "tb_admin.usuarios", row?.usuario_id)) {
        throw new TypeError("userResolver não produziu resolução autêntica para o ramal");
      }
      return buildRemainingReferenceContext({
        sourceTable: "tb_cbs.ramais",
        row,
        resolutions: { numberSlot, user },
      });
    }),
  );
}

export function buildTriageClientSlotContexts({ rows, clientResolver }) {
  if (!Array.isArray(rows) || typeof clientResolver?.resolve !== "function") {
    throw new TypeError("rows e clientResolver são obrigatórios para o preflight de Triagem");
  }
  if (
    rows.length !== TRIAGE_AUDITED_CORPUS.rowCount ||
    corpusFingerprint(rows) !== TRIAGE_AUDITED_CORPUS.digest
  ) {
    throw new TypeError("O preflight exige o corpus completo auditado de tb_triagem.campos");
  }

  const entries = rows.map((row, index) => {
    const client = clientResolver.resolve(row?.cliente_id);
    if (!isAuthoritativeV2ClientIdentityResolution(client, row?.cliente_id)) {
      throw new TypeError("clientResolver não produziu resolução V2 autoritativa");
    }
    return { row, index, client };
  });
  const groups = Map.groupBy(
    entries.filter(({ client }) => client.state === "one"),
    ({ client }) => client.identityRef,
  );
  const slots = new Array(rows.length);

  for (const [identityRef, group] of groups) {
    if (group.length === 1) {
      const [owner] = group;
      slots[owner.index] = triageSlot("owner", identityRef, owner.row?.id);
      continue;
    }
    const payloads = new Set(group.map(({ row }) => triagePayloadFingerprint(row)));
    if (payloads.size > 1) {
      for (const entry of group) {
        slots[entry.index] = triageSlot("conflict", identityRef, null);
      }
      continue;
    }
    const [owner, ...duplicates] = [...group].sort(compareEntriesByLegacyId);
    slots[owner.index] = triageSlot("owner", identityRef, owner.row?.id);
    for (const duplicate of duplicates) {
      slots[duplicate.index] = triageSlot("duplicate", identityRef, owner.row?.id);
    }
  }

  return Object.freeze(
    entries.map(({ row, index, client }) =>
      buildRemainingReferenceContext({
        sourceTable: "tb_triagem.campos",
        row,
        resolutions: {
          client,
          clientSlot: slots[index] ?? triageSlot("unresolved", null, null),
        },
      }),
    ),
  );
}

export const REMAINING_RULES = Object.freeze(
  [
    createRule({
      sourceTable: "tb_cbc.emails",
      domain: "shared-email",
      stepId: "shared-email-recipient-insert",
      destinationTable: "emails",
      columns: [
        mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
        mapped("email", "email", "normalize_required_email", personal()),
        mapped("responsavel", "responsible", "normalize_required_text", personal()),
        mapped("cliente_novo_integracao", "new_client_sending", "normalize_boolean"),
        mapped("tarefa_paralisada_integracao", "task_stalled_sending", "normalize_boolean"),
      ],
      classify: (row) =>
        firstFailure([
          validId(row?.id, "id", "EMAIL_RECIPIENT_ID_INVALID"),
          requiredText(row?.email, "email", "EMAIL_RECIPIENT_INVALID"),
          requiredText(row?.responsavel, "responsavel", "EMAIL_RESPONSIBLE_EMPTY"),
        ]),
    }),
    createRule({
      sourceTable: "tb_cbs.estoque",
      domain: "stock",
      stepId: "cbs-stock-insert",
      destinationTable: "stock",
      dependencies: [
        "tb_admin.departamentos",
        "tb_cbs.estoque_itens",
        "tb_cbs.estoque_categorias_itens",
        "tb_cbs.estoque_categorias",
        "tb_cbs.estoque_localizacoes",
        "tb_cbs.estoque_andares",
      ],
      columns: [
        mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
        mapped(
          "departamento_id",
          "department_id",
          "resolve_explicit_department_reference",
          reference(),
        ),
        mapped("produto_id", "name", "resolve_stock_item_name", reference()),
        mapped("produto_id", "category_id", "resolve_item_category_join", reference()),
        mapped("quantidade", "quantity", "normalize_non_negative_integer"),
        notPreserved(
          "andar",
          "O andar é validado pela localização e não constitui coluna independente em stock.",
        ),
        mapped(
          "localizacao",
          "location_id",
          "resolve_explicit_stock_location_reference",
          reference(),
        ),
      ],
      defaults: { description: null, status: true },
      classify(row, context) {
        const bound = authenticContext("tb_cbs.estoque", row, context);
        if (bound.status !== "prepared") return bound;
        return firstFailure([
          validId(row?.id, "id", "CBS_STOCK_ID_INVALID"),
          nonNegativeInteger(row?.quantidade, "quantidade", "CBS_STOCK_QUANTITY_INVALID"),
          requiredResolution(
            context,
            "department",
            row?.departamento_id,
            ["tb_admin.departamentos"],
            "departamento_id",
            "CBS_STOCK_DEPARTMENT",
          ),
          requiredResolution(
            context,
            "item",
            row?.produto_id,
            ["tb_cbs.estoque_itens"],
            "produto_id",
            "CBS_STOCK_ITEM",
          ),
          categoryResolution(context, row),
          stockLocationResolution(context, row),
        ]);
      },
    }),
    createRule({
      sourceTable: "tb_cbs.estoque_categorias",
      domain: "stock",
      stepId: "cbs-stock-category-insert",
      destinationTable: "stock.categories",
      dependencies: ["tb_admin.departamentos"],
      columns: [
        mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
        mapped("nome", "name", "normalize_required_text"),
        mapped(
          "departamento_id",
          "department_id",
          "resolve_explicit_department_reference",
          reference(),
        ),
      ],
      defaults: { status: true },
      classify(row, context) {
        const bound = authenticContext("tb_cbs.estoque_categorias", row, context);
        if (bound.status !== "prepared") return bound;
        return firstFailure([
          validId(row?.id, "id", "CBS_STOCK_CATEGORY_ID_INVALID"),
          requiredText(row?.nome, "nome", "CBS_STOCK_CATEGORY_NAME_EMPTY"),
          requiredResolution(
            context,
            "department",
            row?.departamento_id,
            ["tb_admin.departamentos"],
            "departamento_id",
            "CBS_STOCK_CATEGORY_DEPARTMENT",
          ),
        ]);
      },
    }),
    createRule({
      sourceTable: "tb_cbs.estoque_entradas",
      domain: "stock",
      stepId: "cbs-stock-entry-insert",
      destinationTable: "stock.entries",
      dependencies: ["tb_cbs.estoque", "tb_admin.usuarios"],
      columns: [
        mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
        mapped("produto_id", "stock_id", "resolve_explicit_cbs_stock_reference", reference()),
        mapped("quantidade", "quantity", "normalize_positive_integer"),
        mapped("data_entrada", "entry_date", "normalize_required_datetime"),
        mapped("repositor", "entry_by_user_id", "resolve_explicit_user_reference", reference()),
        notPreserved(
          "estoque",
          "O saldo posterior é derivado dos movimentos e não é duplicado no evento atual.",
        ),
      ],
      classify: classifyStockEntry,
    }),
    createRule({
      sourceTable: "tb_cbs.estoque_inventario",
      domain: "technology-inventory",
      stepId: "cbs-inventory-category-insert",
      destinationTable: "tecnologia.inventoryCategories",
      columns: [
        mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
        mapped("tipo_item", "name", "normalize_required_text"),
        mapped("tag", "tag", "normalize_optional_text"),
        mapped("status", "active", "normalize_active_status"),
      ],
      classify: (row) =>
        firstFailure([
          validId(row?.id, "id", "INVENTORY_CATEGORY_ID_INVALID"),
          requiredText(row?.tipo_item, "tipo_item", "INVENTORY_CATEGORY_NAME_EMPTY"),
        ]),
    }),
    createRule({
      sourceTable: "tb_cbs.estoque_localizacoes",
      domain: "stock",
      stepId: "cbs-stock-location-insert",
      destinationTable: "stock.locations",
      dependencies: ["tb_cbs.estoque_andares", "tb_admin.departamentos"],
      columns: [
        mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
        mapped("nome", "name", "normalize_required_text"),
        mapped("andar", "floor", "resolve_and_normalize_legacy_floor", reference()),
        mapped(
          "departamento_id",
          "department_id",
          "resolve_explicit_department_reference",
          reference(),
        ),
      ],
      defaults: { status: true },
      classify: classifyStockLocation,
    }),
    createRule({
      sourceTable: "tb_cbs.estoque_saidas",
      domain: "stock",
      stepId: "cbs-stock-exit-insert",
      destinationTable: "stock.exits",
      dependencies: ["tb_cbs.estoque", "tb_admin.usuarios"],
      columns: [
        mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
        mapped("produto_id", "stock_id", "resolve_explicit_cbs_stock_reference", reference()),
        mapped("quantidade", "quantity", "normalize_positive_integer"),
        mapped("data_saida", "exit_date", "normalize_required_datetime"),
        mapped("destino", "destination", "normalize_optional_text", personal()),
        mapped("solicitante", "requester_id", "resolve_explicit_user_reference", reference()),
        mapped("autorizador", "approver_id", "resolve_optional_user_reference", reference()),
        mapped("operador", "operator_id", "resolve_optional_user_reference", reference()),
        notPreserved(
          "estoque",
          "O saldo posterior é derivado dos movimentos e não é duplicado no evento atual.",
        ),
        notPreserved(
          "obs",
          "stock.exits não possui observação; o texto não é deslocado para destination.",
          personal(),
        ),
      ],
      defaults: { approver_id: null, operator_id: null, location_destination_id: null },
      classify: classifyStockExit,
    }),
    createRule({
      sourceTable: "tb_cbs.ramais",
      domain: "technology-access",
      stepId: "cbs-extension-insert",
      destinationTable: "tecnologia.extensions",
      dependencies: ["tb_admin.usuarios"],
      columns: [
        mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
        notPreserved(
          "tipo",
          "O contrato atual de ramal não possui tipo e não há transformação equivalente comprovada.",
        ),
        mapped("numero", "number", "normalize_required_extension"),
        mapped("usuario_id", "user_id", "resolve_explicit_user_reference", reference()),
      ],
      classify(row, context) {
        const bound = authenticContext("tb_cbs.ramais", row, context);
        if (bound.status !== "prepared") return bound;
        return firstFailure([
          validId(row?.id, "id", "EXTENSION_ID_INVALID"),
          requiredText(row?.numero, "numero", "EXTENSION_NUMBER_EMPTY"),
          extensionNumberSlot(context, row),
          requiredResolution(
            context,
            "user",
            row?.usuario_id,
            ["tb_admin.usuarios"],
            "usuario_id",
            "EXTENSION_USER",
          ),
        ]);
      },
    }),
    createRule({
      sourceTable: "tb_mkt.redes_sociais",
      domain: "marketing",
      stepId: "mkt-client-social-merge",
      destinationTable: "clients",
      mode: "merge",
      identity: resolveIdentity("tb_regularize.clientes", "cliente_id", "codigo"),
      dependencies: ["tb_regularize.clientes"],
      precedence: ["explicit_legacy_link", "source_row"],
      columns: [
        notPreserved(
          "id",
          "A linha complementa o Client explícito e não cria identidade independente.",
        ),
        mapped(
          "cliente_id",
          "id",
          "resolve_authoritative_v2_client_from_regularize_code",
          reference(),
        ),
        mapped("instagram", "instagram", "normalize_optional_instagram", personal()),
      ],
      constants: {},
      classify(row, context) {
        const bound = authenticContext("tb_mkt.redes_sociais", row, context);
        if (bound.status !== "prepared") return bound;
        return firstFailure([
          validId(row?.id, "id", "MKT_SOCIAL_ID_INVALID"),
          requiredResolution(
            context,
            "client",
            row?.cliente_id,
            ["tb_regularize.clientes"],
            "cliente_id",
            "MKT_SOCIAL_CLIENT",
          ),
        ]);
      },
    }),
    createRule({
      sourceTable: "tb_mkt.senhas",
      domain: "marketing",
      stepId: "mkt-password-insert",
      destinationTable: "mtk.passwords",
      columns: [
        mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
        mapped("local", "local", "normalize_required_text"),
        mapped("user", "user", "normalize_required_text", credential()),
        mapped("password", "password", "encrypt_credential", secret()),
        mapped("obs", "notes", "normalize_optional_text", personal()),
      ],
      classify(row, context) {
        const bound = authenticContext("tb_mkt.senhas", row, context);
        if (bound.status !== "prepared") return bound;
        return firstFailure([
          validId(row?.id, "id", "MKT_PASSWORD_ID_INVALID"),
          requiredText(row?.local, "local", "MKT_PASSWORD_LOCAL_EMPTY"),
          requiredText(row?.user, "user", "MKT_PASSWORD_USER_EMPTY"),
          requiredText(row?.password, "password", "MKT_PASSWORD_EMPTY"),
          context.capabilities.encryption === true
            ? prepared()
            : quarantine("password", "ENCRYPTION_CONFIGURATION_MISSING"),
        ]);
      },
    }),
    createRule({
      sourceTable: "tb_pec.notas",
      domain: "pec",
      stepId: "pec-note-insert",
      destinationTable: "notes",
      dependencies: ["tb_admin.usuarios", "tb_regularize.clientes"],
      columns: [
        mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
        mapped("usuario_id", "user_id", "resolve_explicit_user_reference", reference()),
        mapped("numero", "number", "normalize_positive_integer"),
        mapped("tarefa", "note", "normalize_required_text", personal()),
        mapped("cadastro", "created_at", "normalize_required_datetime"),
        mapped("previsao", "due_date", "normalize_nullable_zero_datetime"),
        mapped("conclusao", "completion_date", "normalize_nullable_zero_datetime"),
        mapped("status", "status", "legacy_note_continuation_status_to_boolean"),
        mapped("inicio_semana", "week_start_date", "normalize_required_date"),
        mapped("fim_semana", "week_end_date", "normalize_required_date"),
        mapped("cadastro_original", "original_creation_date", "normalize_required_datetime"),
        mapped("multa", "has_penalty", "normalize_boolean"),
        mapped("urgente", "is_urgent", "normalize_boolean"),
        mapped(
          "cliente_id",
          "client_id",
          "resolve_optional_authoritative_v2_client_from_regularize_code",
          reference(),
        ),
        mapped("cliente_id", "is_internal", "derive_internal_from_empty_regularize_client_code"),
      ],
      classify: classifyPecNote,
    }),
    createRule({
      sourceTable: "tb_triagem.campos",
      domain: "triage",
      stepId: "triage-fiscal-config-insert",
      destinationTable: "triagem.configs",
      dependencies: ["tb_regularize.clientes"],
      columns: [
        mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
        mapped(
          "cliente_id",
          "client_id",
          "resolve_authoritative_v2_client_from_regularize_code",
          reference(),
        ),
        mapped("nfce", "active_items", "aggregate_enabled_fiscal_field_nfce_documents"),
        mapped("sped", "active_items", "aggregate_enabled_fiscal_field_sped_fiscal"),
        mapped(
          "spedContribuicoes",
          "active_items",
          "aggregate_enabled_fiscal_field_sped_contributions",
        ),
        mapped("nfce_tomados", "active_items", "aggregate_enabled_fiscal_field_nfce_received"),
        mapped("modelo_21", "active_items", "aggregate_enabled_fiscal_field_model_21_invoice"),
        mapped("cte_emitente", "active_items", "aggregate_enabled_fiscal_field_cte_as_issuer"),
        mapped(
          "prestadas_mei",
          "active_items",
          "aggregate_enabled_fiscal_field_services_provided_as_mei",
        ),
        notPreserved(
          "faturamento",
          "FISCAL_FIELDS não possui token para faturamento; o valor não é emitido como item inválido.",
        ),
        notPreserved(
          "envio",
          "A preferência legada de envio não integra o checklist fiscal atual.",
        ),
      ],
      constants: { organization_id: ORGANIZATION_ID, type: "FISCAL" },
      classify(row, context) {
        const bound = authenticContext("tb_triagem.campos", row, context);
        if (bound.status !== "prepared") return bound;
        return firstFailure([
          validId(row?.id, "id", "TRIAGE_CONFIG_ID_INVALID"),
          requiredResolution(
            context,
            "client",
            row?.cliente_id,
            ["tb_regularize.clientes"],
            "cliente_id",
            "TRIAGE_CONFIG_CLIENT",
          ),
          triageClientSlot(context, row),
        ]);
      },
    }),
    createRule({
      sourceTable: "tb_workspace.solicitacoes_categorias",
      domain: "technology-request",
      stepId: "workspace-ti-category-insert",
      destinationTable: "tecnologia.request_categories",
      dependencies: ["tb_admin.departamentos"],
      columns: [
        mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
        mapped("nome", "name", "normalize_required_text"),
        notPreserved(
          "departamento_id",
          "O departamento é validado como Tecnologia e não existe no catálogo atual de categorias.",
        ),
        mapped("status", "active", "normalize_boolean"),
      ],
      classify: classifyWorkspaceCategory,
    }),
    createRule({
      sourceTable: "tb_workspace.solicitacoes",
      domain: "technology-request",
      stepId: "workspace-ti-request-insert",
      destinationTable: "tecnologia.requests",
      dependencies: [
        "tb_workspace.solicitacoes_categorias",
        "tb_admin.departamentos",
        "tb_admin.usuarios",
      ],
      columns: [
        mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
        mapped("titulo", "title", "normalize_required_text"),
        mapped("descricao", "description", "normalize_required_text", personal()),
        mapped("status", "status", "map_workspace_status_to_ti_status"),
        mapped("requerente", "requester_id", "resolve_explicit_user_reference", reference()),
        mapped("atribuido", "assigned_to_id", "resolve_optional_ti_user_reference", reference()),
        mapped("categoria", "category_id", "resolve_workspace_ti_category_reference", reference()),
        mapped("urgencia", "urgency", "map_workspace_urgency_to_ti_urgency"),
        mapped("data_cadastro", "created_at", "normalize_required_datetime"),
        mapped("data_atualizacao", "updated_at", "normalize_required_datetime"),
        notPreserved(
          "departamento",
          "O departamento é validado como Tecnologia; o chamado atual é inerentemente TI.",
        ),
      ],
      defaults: { attachment: null },
      classify: classifyWorkspaceRequest,
    }),
    createRule({
      sourceTable: "tb_workspace.solicitacoes_mensagens",
      domain: "technology-request",
      stepId: "workspace-ti-message-insert",
      destinationTable: "tecnologia.request_messages",
      dependencies: ["tb_workspace.solicitacoes", "tb_admin.usuarios"],
      columns: [
        mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
        mapped("solicitacao", "request_id", "resolve_workspace_ti_request_reference", reference()),
        mapped("tipo", "type", "map_workspace_message_type"),
        mapped("remetente", "sender_id", "resolve_explicit_user_reference", reference()),
        notPreserved(
          "destinatario",
          "A leitura atual é controlada por acesso ao chamado e não persiste destinatário por mensagem.",
        ),
        notPreserved(
          "lida",
          "TIMessage não possui recibo de leitura; o indicador não é convertido em estado incompatível.",
        ),
        mapped("data_envio", "created_at", "normalize_required_datetime"),
        mapped("mensagem", "message", "normalize_message_or_attachment_placeholder", personal()),
        mapped("mensagem", "attachment", "migrate_legacy_attachment_reference", personal()),
      ],
      defaults: { attachment: null },
      classify: classifyWorkspaceMessage,
    }),
  ].sort(compareSourceTables),
);

function createRule({
  sourceTable,
  domain,
  stepId,
  destinationTable,
  columns,
  classify,
  dependencies = [],
  constants = { organization_id: ORGANIZATION_ID },
  defaults = {},
  mode = "insert",
  identity = generateIdentity("id", sourceTable),
  precedence = ["legacy_identity"],
}) {
  const evidence = EVIDENCE_BY_SOURCE.get(sourceTable);
  if (evidence?.finalStatus !== "confirmed" || evidence.ruleId === null) {
    throw new Error(`Regra sem EvidenceDecision confirmed: ${sourceTable}`);
  }
  const step = {
    stepId,
    destinationTable,
    mode,
    identity,
    columns,
    constants,
    defaults,
    precedence,
    dependencies,
  };
  return {
    sourceTable,
    status: "confirmed",
    domain,
    ruleOrigin: evidence.ruleId,
    evidence: {
      legacy: [...evidence.legacyReferences, ...evidence.legacyRelationships],
      current: [...evidence.currentContractEvidence],
    },
    cardinality: "1:1",
    dependencies,
    destinations: [step],
    classifySourceRow: classify,
    emitRows(row, context) {
      return [toEmission(step, rowIdentity(sourceTable, row?.id), classify(row, context))];
    },
  };
}

function compareSourceTables(left, right) {
  return left.sourceTable < right.sourceTable ? -1 : left.sourceTable > right.sourceTable ? 1 : 0;
}

function classifyStockEntry(row, context) {
  const bound = authenticContext("tb_cbs.estoque_entradas", row, context);
  if (bound.status !== "prepared") return bound;
  return firstFailure([
    validId(row?.id, "id", "CBS_STOCK_ENTRY_ID_INVALID"),
    positiveInteger(row?.quantidade, "quantidade", "CBS_STOCK_ENTRY_QUANTITY_INVALID"),
    validDate(row?.data_entrada, "data_entrada", "CBS_STOCK_ENTRY_DATE_INVALID"),
    requiredResolution(
      context,
      "stock",
      row?.produto_id,
      ["tb_cbs.estoque"],
      "produto_id",
      "CBS_STOCK_ENTRY_STOCK",
    ),
    requiredResolution(
      context,
      "user",
      row?.repositor,
      ["tb_admin.usuarios"],
      "repositor",
      "CBS_STOCK_ENTRY_USER",
    ),
  ]);
}

function classifyStockLocation(row, context) {
  const bound = authenticContext("tb_cbs.estoque_localizacoes", row, context);
  if (bound.status !== "prepared") return bound;
  const floor = requiredResolution(
    context,
    "floor",
    row?.andar,
    ["tb_cbs.estoque_andares"],
    "andar",
    "CBS_STOCK_FLOOR",
  );
  if (floor.status !== "prepared") return floor;
  if (!/^(?:0|[1-9]\d*)$/.test(String(context.resolutions.floor.floor ?? ""))) {
    return quarantine("andar", "CBS_STOCK_FLOOR_NOT_NUMERIC");
  }
  return firstFailure([
    validId(row?.id, "id", "CBS_STOCK_LOCATION_ID_INVALID"),
    requiredText(row?.nome, "nome", "CBS_STOCK_LOCATION_NAME_EMPTY"),
    requiredResolution(
      context,
      "department",
      row?.departamento_id,
      ["tb_admin.departamentos"],
      "departamento_id",
      "CBS_STOCK_LOCATION_DEPARTMENT",
    ),
  ]);
}

function classifyStockExit(row, context) {
  const bound = authenticContext("tb_cbs.estoque_saidas", row, context);
  if (bound.status !== "prepared") return bound;
  return firstFailure([
    validId(row?.id, "id", "CBS_STOCK_EXIT_ID_INVALID"),
    positiveInteger(row?.quantidade, "quantidade", "CBS_STOCK_EXIT_QUANTITY_INVALID"),
    validDate(row?.data_saida, "data_saida", "CBS_STOCK_EXIT_DATE_INVALID"),
    requiredResolution(
      context,
      "stock",
      row?.produto_id,
      ["tb_cbs.estoque"],
      "produto_id",
      "CBS_STOCK_EXIT_STOCK",
    ),
    requiredResolution(
      context,
      "requester",
      row?.solicitante,
      ["tb_admin.usuarios"],
      "solicitante",
      "CBS_STOCK_EXIT_REQUESTER",
    ),
    optionalResolution(
      context,
      "approver",
      row?.autorizador,
      ["tb_admin.usuarios"],
      "autorizador",
      "CBS_STOCK_EXIT_APPROVER",
    ),
    optionalResolution(
      context,
      "operator",
      row?.operador,
      ["tb_admin.usuarios"],
      "operador",
      "CBS_STOCK_EXIT_OPERATOR",
    ),
  ]);
}

function classifyPecNote(row, context) {
  const bound = authenticContext("tb_pec.notas", row, context);
  if (bound.status !== "prepared") return bound;
  return firstFailure([
    validId(row?.id, "id", "PEC_NOTE_ID_INVALID"),
    positiveInteger(row?.numero, "numero", "PEC_NOTE_NUMBER_INVALID"),
    requiredText(row?.tarefa, "tarefa", "PEC_NOTE_TEXT_EMPTY"),
    validDate(row?.cadastro, "cadastro", "PEC_NOTE_CREATED_AT_INVALID"),
    validDate(row?.inicio_semana, "inicio_semana", "PEC_NOTE_WEEK_START_INVALID"),
    validDate(row?.fim_semana, "fim_semana", "PEC_NOTE_WEEK_END_INVALID"),
    validDate(row?.cadastro_original, "cadastro_original", "PEC_NOTE_ORIGINAL_DATE_INVALID"),
    requiredResolution(
      context,
      "user",
      row?.usuario_id,
      ["tb_admin.usuarios"],
      "usuario_id",
      "PEC_NOTE_USER",
    ),
    optionalResolution(
      context,
      "client",
      row?.cliente_id,
      ["tb_regularize.clientes"],
      "cliente_id",
      "PEC_NOTE_CLIENT",
    ),
  ]);
}

function classifyWorkspaceCategory(row, context) {
  const bound = authenticContext("tb_workspace.solicitacoes_categorias", row, context);
  if (bound.status !== "prepared") return bound;
  const department = requiredResolution(
    context,
    "department",
    row?.departamento_id,
    ["tb_admin.departamentos"],
    "departamento_id",
    "WORKSPACE_CATEGORY_DEPARTMENT",
  );
  if (department.status !== "prepared") return department;
  if (context.resolutions.department.relatedIdentityRef !== "technology") {
    return quarantine("departamento_id", "WORKSPACE_CATEGORY_NOT_TECHNOLOGY");
  }
  return firstFailure([
    validId(row?.id, "id", "WORKSPACE_CATEGORY_ID_INVALID"),
    requiredText(row?.nome, "nome", "WORKSPACE_CATEGORY_NAME_EMPTY"),
  ]);
}

function classifyWorkspaceRequest(row, context) {
  const bound = authenticContext("tb_workspace.solicitacoes", row, context);
  if (bound.status !== "prepared") return bound;
  const department = requiredResolution(
    context,
    "department",
    row?.departamento,
    ["tb_admin.departamentos"],
    "departamento",
    "WORKSPACE_REQUEST_DEPARTMENT",
  );
  if (department.status !== "prepared") return department;
  if (context.resolutions.department.relatedIdentityRef !== "technology") {
    return quarantine("departamento", "WORKSPACE_REQUEST_NOT_TECHNOLOGY");
  }
  return firstFailure([
    validId(row?.id, "id", "WORKSPACE_REQUEST_ID_INVALID"),
    requiredText(row?.titulo, "titulo", "WORKSPACE_REQUEST_TITLE_EMPTY"),
    requiredText(row?.descricao, "descricao", "WORKSPACE_REQUEST_DESCRIPTION_EMPTY"),
    validDate(row?.data_cadastro, "data_cadastro", "WORKSPACE_REQUEST_CREATED_AT_INVALID"),
    validDate(row?.data_atualizacao, "data_atualizacao", "WORKSPACE_REQUEST_UPDATED_AT_INVALID"),
    requiredResolution(
      context,
      "requester",
      row?.requerente,
      ["tb_admin.usuarios"],
      "requerente",
      "WORKSPACE_REQUEST_REQUESTER",
    ),
    optionalResolution(
      context,
      "assignee",
      row?.atribuido,
      ["tb_admin.usuarios"],
      "atribuido",
      "WORKSPACE_REQUEST_ASSIGNEE",
    ),
    requiredResolution(
      context,
      "category",
      row?.categoria,
      ["tb_workspace.solicitacoes_categorias"],
      "categoria",
      "WORKSPACE_REQUEST_CATEGORY",
    ),
  ]);
}

function classifyWorkspaceMessage(row, context) {
  const bound = authenticContext("tb_workspace.solicitacoes_mensagens", row, context);
  if (bound.status !== "prepared") return bound;
  const type = Number(row?.tipo);
  if (!Number.isSafeInteger(type) || type < 0 || type > 6) {
    return quarantine("tipo", "WORKSPACE_MESSAGE_TYPE_INVALID");
  }
  if (type === 6 && context.capabilities.legacyAssets !== true) {
    return quarantine("mensagem", "LEGACY_ATTACHMENT_NOT_MIGRATED");
  }
  return firstFailure([
    validId(row?.id, "id", "WORKSPACE_MESSAGE_ID_INVALID"),
    requiredText(row?.mensagem, "mensagem", "WORKSPACE_MESSAGE_EMPTY"),
    validDate(row?.data_envio, "data_envio", "WORKSPACE_MESSAGE_DATE_INVALID"),
    requiredResolution(
      context,
      "request",
      row?.solicitacao,
      ["tb_workspace.solicitacoes"],
      "solicitacao",
      "WORKSPACE_MESSAGE_REQUEST",
    ),
    requiredResolution(
      context,
      "sender",
      row?.remetente,
      ["tb_admin.usuarios"],
      "remetente",
      "WORKSPACE_MESSAGE_SENDER",
    ),
  ]);
}

function categoryResolution(context, row) {
  const resolution = context.resolutions.category;
  if (resolution?.state === "many") return quarantine("produto_id", "CBS_STOCK_CATEGORY_AMBIGUOUS");
  if (resolution?.state === "zero") return quarantine("produto_id", "CBS_STOCK_CATEGORY_NOT_FOUND");
  if (resolution?.state !== "one")
    return quarantine("produto_id", "CBS_STOCK_CATEGORY_LOOKUP_NOT_EXECUTED");
  if (resolution.sourceTable !== "tb_cbs.estoque_categorias") {
    return quarantine("produto_id", "CBS_STOCK_CATEGORY_SOURCE_INVALID");
  }
  if (resolution.joinSourceTable !== "tb_cbs.estoque_categorias_itens") {
    return quarantine("produto_id", "CBS_STOCK_CATEGORY_JOIN_SOURCE_INVALID");
  }
  if (resolution.itemSourceKey !== normalizeKey(row?.produto_id)) {
    return quarantine("produto_id", "CBS_STOCK_CATEGORY_ITEM_MISMATCH");
  }
  if (resolution.departmentSourceKey !== normalizeKey(row?.departamento_id)) {
    return quarantine("departamento_id", "CBS_STOCK_CATEGORY_DEPARTMENT_MISMATCH");
  }
  return prepared();
}

function extensionNumberSlot(context, row) {
  const resolution = context.resolutions.numberSlot;
  if (resolution?.state === "many") {
    return quarantine("numero", "EXTENSION_NUMBER_AMBIGUOUS");
  }
  if (resolution?.state === "zero") {
    return quarantine("numero", "EXTENSION_NUMBER_NOT_FOUND");
  }
  if (resolution?.state !== "one") {
    return quarantine("numero", "EXTENSION_NUMBER_LOOKUP_NOT_EXECUTED");
  }
  if (
    resolution.sourceTable !== "tb_cbs.ramais" ||
    resolution.sourceKey !== normalizeKey(row?.numero)
  ) {
    return quarantine("numero", "EXTENSION_NUMBER_REFERENCE_MISMATCH");
  }
  if (resolution.ownerSourceKey !== normalizeKey(row?.id)) {
    return quarantine("id", "EXTENSION_NUMBER_OWNER_MISMATCH");
  }
  return prepared();
}

function triageClientSlot(context, row) {
  const resolution = context.resolutions.clientSlot;
  if (resolution?.state === "conflict") {
    return quarantine("cliente_id", "TRIAGE_CONFIG_CANONICAL_CLIENT_CONFLICT");
  }
  if (resolution?.state === "duplicate") {
    return notEmitted("TRIAGE_CONFIG_CANONICAL_CLIENT_DUPLICATE");
  }
  if (resolution?.state !== "owner") {
    return quarantine("cliente_id", "TRIAGE_CONFIG_CLIENT_SLOT_NOT_RESOLVED");
  }
  if (
    resolution.sourceTable !== "tb_triagem.campos" ||
    resolution.sourceKey !== context.resolutions.client.identityRef ||
    resolution.ownerSourceKey !== normalizeKey(row?.id)
  ) {
    return quarantine("cliente_id", "TRIAGE_CONFIG_CLIENT_SLOT_MISMATCH");
  }
  return prepared();
}

function stockLocationResolution(context, row) {
  const result = requiredResolution(
    context,
    "location",
    row?.localizacao,
    ["tb_cbs.estoque_localizacoes"],
    "localizacao",
    "CBS_STOCK_LOCATION",
  );
  if (result.status !== "prepared") return result;
  if (context.resolutions.location.relatedIdentityRef !== `floor:${normalizeKey(row?.andar)}`) {
    return quarantine("andar", "CBS_STOCK_LOCATION_FLOOR_MISMATCH");
  }
  if (context.resolutions.location.departmentSourceKey !== normalizeKey(row?.departamento_id)) {
    return quarantine("departamento_id", "CBS_STOCK_LOCATION_DEPARTMENT_MISMATCH");
  }
  return prepared();
}

function authenticContext(sourceTable, row, context) {
  if (
    !isObject(context) ||
    !ISSUED_CONTEXTS.has(context) ||
    context.sourceTable !== sourceTable ||
    context.rowFingerprint !== fingerprint(row)
  ) {
    return quarantine("id", "REFERENCE_CONTEXT_INVALID");
  }
  return prepared();
}

function requiredResolution(context, name, sourceKey, sourceTables, field, prefix) {
  if (!validLegacyId(sourceKey)) return quarantine(field, `${prefix}_LINK_INVALID`);
  const resolution = context.resolutions[name];
  if (resolution?.state === "zero") return quarantine(field, `${prefix}_NOT_FOUND`);
  if (resolution?.state === "many") return quarantine(field, `${prefix}_AMBIGUOUS`);
  if (resolution?.state !== "one") return quarantine(field, `${prefix}_LOOKUP_NOT_EXECUTED`);
  if (
    !sourceTables.includes(resolution.sourceTable) ||
    resolution.sourceKey !== normalizeKey(sourceKey)
  ) {
    return quarantine(field, `${prefix}_REFERENCE_MISMATCH`);
  }
  return prepared();
}

function optionalResolution(context, name, sourceKey, sourceTables, field, prefix) {
  if (emptyReference(sourceKey)) return prepared();
  return requiredResolution(context, name, sourceKey, sourceTables, field, prefix);
}

function normalizeResolution(resolution) {
  if (!isObject(resolution)) return { state: "invalid" };
  return {
    state: resolution.state,
    sourceTable: resolution.sourceTable,
    sourceKey: normalizeKey(resolution.sourceKey),
    identityRef: safeOptionalReference(resolution.identityRef),
    relatedIdentityRef: safeOptionalReference(resolution.relatedIdentityRef),
    joinSourceTable: safeOptionalReference(resolution.joinSourceTable),
    itemSourceKey: normalizeKey(resolution.itemSourceKey),
    departmentSourceKey: normalizeKey(resolution.departmentSourceKey),
    ownerSourceKey: normalizeKey(resolution.ownerSourceKey),
    floor: resolution.floor,
  };
}

function toEmission(step, identityRef, classification) {
  if (classification.status === "prepared") {
    return {
      stepId: step.stepId,
      destinationTable: step.destinationTable,
      status: "prepared",
      identityRef,
      field: null,
      reasonCode: null,
    };
  }
  return {
    stepId: step.stepId,
    destinationTable: step.destinationTable,
    status: classification.status,
    identityRef,
    field: classification.status === "quarantine" ? classification.field : null,
    reasonCode: classification.reasonCode,
  };
}

function firstFailure(classifications) {
  return classifications.find(({ status }) => status !== "prepared") ?? prepared();
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

function validId(value, field, reasonCode) {
  return validLegacyId(value) ? prepared() : quarantine(field, reasonCode);
}

function requiredText(value, field, reasonCode) {
  return typeof value === "string" && value.trim().length > 0
    ? prepared()
    : quarantine(field, reasonCode);
}

function positiveInteger(value, field, reasonCode) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? prepared() : quarantine(field, reasonCode);
}

function nonNegativeInteger(value, field, reasonCode) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? prepared() : quarantine(field, reasonCode);
}

function validDate(value, field, reasonCode) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(text)) {
    return quarantine(field, reasonCode);
  }
  const date = new Date(`${text.replace(" ", "T")}Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text.slice(0, 10)
    ? prepared()
    : quarantine(field, reasonCode);
}

function generateIdentity(legacyColumn, scope) {
  return {
    kind: "generate",
    legacyColumn,
    scope,
    namespace: REQUIRED_IDENTITY_NAMESPACE,
  };
}

function resolveIdentity(sourceTable, sourceColumn, targetLegacyColumn) {
  return { kind: "resolve", sourceTable, sourceColumn, targetLegacyColumn };
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
      `A coluna ${sourceColumn ?? "derivada"} alimenta ${destinationColumn} conforme o contrato atual validado.`,
  };
}

function notPreserved(sourceColumn, reason, options = {}) {
  return {
    sourceColumn,
    destinationColumn: null,
    status: "not_preserved",
    transformation: "not_emitted_no_equivalent_current_column",
    nullHandling: "A coluna não produz valor de destino.",
    referenceRole: "none",
    sensitivity: options.sensitivity ?? "none",
    reason,
  };
}

function reference() {
  return {
    referenceRole: "foreign_key",
    reason: "A referência é resolvida exclusivamente pelo vínculo legado explícito.",
  };
}

function personal() {
  return { sensitivity: "personal" };
}

function credential() {
  return { sensitivity: "credential" };
}

function secret() {
  return { sensitivity: "secret" };
}

function rowIdentity(sourceTable, value) {
  return validLegacyId(value) ? `${sourceTable}:${normalizeKey(value)}` : `${sourceTable}:invalid`;
}

function fingerprint(value) {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function corpusFingerprint(rows) {
  return fingerprint(rows.map((row) => canonical(row)).sort());
}

function triagePayloadFingerprint(row) {
  return fingerprint(
    TRIAGE_ACTIVE_COLUMNS.map((column) => String(row?.[column] ?? "").trim() === "1"),
  );
}

function triageSlot(state, identityRef, ownerSourceKey) {
  return Object.freeze({
    state,
    sourceTable: "tb_triagem.campos",
    sourceKey: identityRef,
    ownerSourceKey: normalizeKey(ownerSourceKey),
  });
}

function extensionSlot(state, number, ownerSourceKey) {
  const slot = Object.freeze({
    state,
    sourceTable: "tb_cbs.ramais",
    sourceKey: number,
    ownerSourceKey: normalizeKey(ownerSourceKey),
  });
  EXTENSION_SLOT_ISSUANCE.add(slot);
  return slot;
}

function compareEntriesByLegacyId(left, right) {
  const leftId = Number(left.row?.id);
  const rightId = Number(right.row?.id);
  return leftId - rightId;
}

function validLegacyId(value) {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0;
  return typeof value === "string" && /^[1-9]\d*$/.test(value.trim());
}

function emptyReference(value) {
  return value === null || value === undefined || value === "" || value === 0 || value === "0";
}

function normalizeKey(value) {
  return value === null || value === undefined ? null : String(value).trim();
}

function safeOptionalReference(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]+$/.test(value) ? value : null;
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
