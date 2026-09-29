import { createHash } from "node:crypto";

import { REMAINING_EVIDENCE } from "../evidence/remaining.mjs";
import { normalizeRequiredScalarText } from "../lib/empty-scalar-policy.mjs";
import { REQUIRED_IDENTITY_NAMESPACE } from "../lib/mapping-contract.mjs";
import { toLegacyIdRef } from "../lib/sensitivity.mjs";
import { uuidV5 } from "../lib/uuid-v5.mjs";
import {
  isAuthenticLegacyReferenceResolution,
  isAuthoritativeV2ClientIdentityResolution,
} from "./admin-business.mjs";
import {
  planMarketingEventEditionFeedbackImport,
  planMarketingEventEditionImport,
} from "./marketing-event-editions.mjs";
import { V2_RULES } from "./v2.mjs";

const ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const EVIDENCE_BY_SOURCE = new Map(
  REMAINING_EVIDENCE.map((decision) => [decision.sourceTable, decision]),
);
const CONTEXT_ISSUANCE = new WeakMap();
const RESOLUTION_ISSUANCE = new WeakMap();
const REMAINING_AUDITED_CORPORA = Object.freeze({
  "tb_admin.departamentos": Object.freeze({
    rowCount: 48,
    digest: "077a330c4884224db1450214ea344a70524023160106f5b5017794c59994048c",
  }),
  "tb_admin.usuarios": Object.freeze({
    rowCount: 306,
    digest: "3700feded01eed70e321c015d262222f0f5a37eb12b1c98065a7340918895582",
  }),
  "tb_cbs.estoque": Object.freeze({
    rowCount: 433,
    digest: "c4da376a54ad6c5bcb55b1b534eccc0eeb4c3349ab8d83cf42ecd1f321fe847b",
  }),
  "tb_cbs.estoque_categorias": Object.freeze({
    rowCount: 65,
    digest: "e48f5dccdc728fe964b2e4263d6d81d89cbab5c6a078e534d66668c0c51d85e4",
  }),
  "tb_cbs.estoque_categorias_itens": Object.freeze({
    rowCount: 234,
    digest: "80de431a3799afcfd2234250c3ff0949facd55543fe868037ff7b14f82134cc3",
  }),
  "tb_cbs.estoque_entradas": Object.freeze({
    rowCount: 2215,
    digest: "51035d4d0fad577bfe625214540d4427e5f15931eb818ce546fc5b15fd1fdd7b",
  }),
  "tb_cbs.estoque_itens": Object.freeze({
    rowCount: 451,
    digest: "68260b165404fb3d142acc9c772c74dc9f94376ff68c08994ea932a9bb7c0b5f",
  }),
  "tb_cbs.estoque_localizacoes": Object.freeze({
    rowCount: 27,
    digest: "63df748197ae94b08719c4cb735d1824cbb9b46ac13734cc46716d8ee0a01e55",
  }),
  "tb_cbs.estoque_andares": Object.freeze({
    rowCount: 14,
    digest: "f303bdef46e5237fa8b1e82b0bc970071a8255cd509dcaab9638c2f08c5de15b",
  }),
  "tb_cbs.estoque_saidas": Object.freeze({
    rowCount: 3000,
    digest: "372bb5d1565a96b939d455e0ea99eca283c0c7ce29268d8fa777236ab895a21f",
  }),
  "tb_mkt.redes_sociais": Object.freeze({
    rowCount: 205,
    digest: "20dda56fe29ce7137ea01bb361e6b25aa2380a6633dfd57f22ff7177bf9ea5b6",
  }),
  "tb_mkt.senhas": Object.freeze({
    rowCount: 54,
    digest: "30fad1aa531ac3412a5994812c18c3e47224885911720926747d1e1936c052db",
  }),
  "tb_pec.notas": Object.freeze({
    rowCount: 41628,
    digest: "170963e85faaa2898089244d13e61e0daac51e44c386ea1f8df21dac345e171b",
  }),
  "tb_triagem.campos": Object.freeze({
    rowCount: 553,
    digest: "4e6754d092be5d594a5c90a7d53fe3c507a951354a5eedf0ec306e47675f23ca",
  }),
  "tb_workspace.solicitacoes": Object.freeze({
    rowCount: 5,
    digest: "6ca12c4225dbc9c4ed8a2b4cde671c5663f601bebd430d96cd1c68243af2244a",
  }),
  "tb_workspace.solicitacoes_categorias": Object.freeze({
    rowCount: 1,
    digest: "dbe1db3435c627bd35b8bedbc4b41fbaf9a602e9d49f356d65cef0843425af69",
  }),
  "tb_workspace.solicitacoes_mensagens": Object.freeze({
    rowCount: 2,
    digest: "03713d3f76c79f60d4ce03bbee6d41a82484a86d56a3c525a629bbfadd337d82",
  }),
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
const MARKETING_EVENT_STATUSES = new Set(["Novo", "Em andamento", "Concluído", "Descontinuado"]);
const MARKETING_EVENT_PRIORITIES = new Set(["Baixa", "Média", "Alta"]);

// As projeções deste domínio são centralizadas em projectRemainingRow para preservar
// as decisões auditadas de contexto, quarentena e payload.
export const REMAINING_TRANSFORMERS = Object.freeze({});

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
  return Object.freeze({
    sourceTable,
    rowFingerprint: fingerprint(row),
    resolutions: Object.freeze({ ...resolutions }),
    capabilities: Object.freeze(
      Object.fromEntries(
        Object.entries(capabilities).map(([name, value]) => [name, value === true]),
      ),
    ),
  });
}

export function projectRemainingRow({ sourceTable, row, context }) {
  const mappingRule = REMAINING_RULES.find((rule) => rule.sourceTable === sourceTable);
  if (mappingRule === undefined || !isObject(row)) {
    throw new TypeError("sourceTable confirmado e row são obrigatórios para a projeção");
  }
  const decision = mappingRule.emitRows(row, context)[0];
  const blockers = auditBlockers(sourceTable, row, context, decision);
  const payload =
    decision.status === "prepared" ? projectPreparedPayload(sourceTable, row, context) : null;
  const candidate = projectSanitizedCandidate(sourceTable, row);
  return Object.freeze({
    sourceTable,
    decision: Object.freeze({ ...decision }),
    blockers: Object.freeze(blockers),
    payload,
    candidate,
  });
}

export function projectMarketingEventEditionBudgetItem({ row, context, identityRef }) {
  const bound = authenticContext("tb_mkt.eventos_edicoes", row, context);
  if (bound.status !== "prepared") throw new Error("MKT_EDITION_BUDGET_CONTEXT_INVALID");
  const importPlan = context.resolutions.event?.importPlan;
  if (importPlan?.status !== "prepared") throw new Error("MKT_EDITION_BUDGET_PLAN_INVALID");
  const expectedPrefix = `tb_mkt.eventos_edicoes:${generatedIdentityId("tb_mkt.eventos_edicoes", row?.id)}:budget:`;
  const item = importPlan.budgetItems.find(
    ({ legacy_id }) => `${expectedPrefix}${legacy_id}` === identityRef,
  );
  if (item === undefined) throw new Error("MKT_EDITION_BUDGET_ITEM_NOT_FOUND");
  return item;
}

export function buildCbsStockContexts({
  rows,
  departmentRows,
  itemRows,
  categoryRows,
  categoryContexts,
  categoryItemRows,
  locationRows,
  locationContexts,
  floorRows,
}) {
  assertAuditedCorpus("tb_cbs.estoque", rows);
  const categoryMigrationStates = auditedParentMigrationStates({
    kind: "cbs-stock-category",
    sourceTable: "tb_cbs.estoque_categorias",
    rows: categoryRows,
    contexts: categoryContexts,
  });
  const locationMigrationStates = auditedParentMigrationStates({
    kind: "cbs-stock-location",
    sourceTable: "tb_cbs.estoque_localizacoes",
    rows: locationRows,
    contexts: locationContexts,
  });
  const departments = auditedLookup("tb_admin.departamentos", departmentRows, (row) => ({
    scope: departmentScope(row),
  }));
  const items = auditedLookup("tb_cbs.estoque_itens", itemRows, (row) => ({
    itemName: normalizeRequiredScalarText(row?.nome),
    itemDescription: normalizeNullableText(row?.descricao),
    itemActive: normalizeLegacyStockItemActive(row?.status),
    departmentSourceKey: normalizeKey(row?.departamento_id),
  }));
  const categories = auditedLookup("tb_cbs.estoque_categorias", categoryRows, (row) => ({
    departmentSourceKey: normalizeKey(row?.departamento_id),
    migrationState: categoryMigrationStates.get(normalizeKey(row?.id)),
  }));
  assertAuditedCorpus("tb_cbs.estoque_categorias_itens", categoryItemRows);
  const categoryLinks = Map.groupBy(categoryItemRows, ({ item }) => normalizeKey(item));
  const locations = auditedLookup("tb_cbs.estoque_localizacoes", locationRows, (row) => ({
    departmentSourceKey: normalizeKey(row?.departamento_id),
    floorSourceKey: normalizeKey(row?.andar),
    migrationState: locationMigrationStates.get(normalizeKey(row?.id)),
  }));
  const floors = auditedLookup("tb_cbs.estoque_andares", floorRows, (row) => ({
    departmentSourceKey: normalizeKey(row?.departamento_id),
    floor: normalizeLegacyFloor(row?.nome),
    floorLabel: normalizeText(row?.nome),
  }));

  return Object.freeze(
    rows.map((row) => {
      const item = items.resolve(row?.produto_id);
      const location = locations.resolve(row?.localizacao);
      const links = categoryLinks.get(normalizeKey(row?.produto_id)) ?? [];
      const categoryCandidates = links
        .map(({ categoria }) => categories.resolve(categoria))
        .filter(({ state }) => state === "one");
      const category = issueResolution({
        state:
          categoryCandidates.length === 0
            ? "zero"
            : categoryCandidates.length === 1
              ? "one"
              : "many",
        sourceTable: "tb_cbs.estoque_categorias",
        sourceKey: categoryCandidates.length === 1 ? categoryCandidates[0].sourceKey : null,
        identityRef: categoryCandidates.length === 1 ? categoryCandidates[0].identityRef : null,
        joinSourceTable: "tb_cbs.estoque_categorias_itens",
        itemSourceKey: normalizeKey(row?.produto_id),
        departmentSourceKey:
          categoryCandidates.length === 1
            ? categoryCandidates[0].departmentSourceKey
            : normalizeKey(row?.departamento_id),
        migrationState:
          categoryCandidates.length === 1 ? categoryCandidates[0].migrationState : null,
      });
      return issueContext("cbs-stock", "tb_cbs.estoque", row, {
        department: departments.resolve(row?.departamento_id),
        item,
        category,
        location,
        floor: floors.resolve(row?.andar),
        locationFloor: floors.resolve(location.floorSourceKey),
      });
    }),
  );
}

export function buildCbsStockCategoryContexts({ rows, departmentRows }) {
  assertAuditedCorpus("tb_cbs.estoque_categorias", rows);
  const departments = auditedLookup("tb_admin.departamentos", departmentRows, (row) => ({
    scope: departmentScope(row),
  }));
  return issueContexts("cbs-stock-category", "tb_cbs.estoque_categorias", rows, (row) => ({
    department: departments.resolve(row?.departamento_id),
  }));
}

export function buildCbsStockEntryContexts({ rows, stockRows, stockContexts, userRows }) {
  assertAuditedCorpus("tb_cbs.estoque_entradas", rows);
  const stockMigrationStates = auditedParentMigrationStates({
    kind: "cbs-stock",
    sourceTable: "tb_cbs.estoque",
    rows: stockRows,
    contexts: stockContexts,
  });
  const stocks = auditedLookup("tb_cbs.estoque", stockRows, (row) => ({
    departmentSourceKey: normalizeKey(row?.departamento_id),
    migrationState: stockMigrationStates.get(normalizeKey(row?.id)),
  }));
  const users = auditedUserLookup(userRows);
  return issueContexts("cbs-stock-entry", "tb_cbs.estoque_entradas", rows, (row) => ({
    stock: stocks.resolve(row?.produto_id),
    user: users.resolve(row?.repositor),
  }));
}

export function buildCbsStockLocationContexts({ rows, floorRows, departmentRows }) {
  assertAuditedCorpus("tb_cbs.estoque_localizacoes", rows);
  const floors = auditedLookup("tb_cbs.estoque_andares", floorRows, (row) => ({
    departmentSourceKey: normalizeKey(row?.departamento_id),
    floor: normalizeLegacyFloor(row?.nome),
    floorLabel: normalizeText(row?.nome),
  }));
  const departments = auditedLookup("tb_admin.departamentos", departmentRows, (row) => ({
    scope: departmentScope(row),
  }));
  return issueContexts("cbs-stock-location", "tb_cbs.estoque_localizacoes", rows, (row) => ({
    floor: floors.resolve(row?.andar),
    department: departments.resolve(row?.departamento_id),
  }));
}

export function buildCbsStockExitContexts({ rows, stockRows, stockContexts, userRows }) {
  assertAuditedCorpus("tb_cbs.estoque_saidas", rows);
  const stockMigrationStates = auditedParentMigrationStates({
    kind: "cbs-stock",
    sourceTable: "tb_cbs.estoque",
    rows: stockRows,
    contexts: stockContexts,
  });
  const stocks = auditedLookup("tb_cbs.estoque", stockRows, (row) => ({
    departmentSourceKey: normalizeKey(row?.departamento_id),
    migrationState: stockMigrationStates.get(normalizeKey(row?.id)),
  }));
  const users = auditedUserLookup(userRows);
  return issueContexts("cbs-stock-exit", "tb_cbs.estoque_saidas", rows, (row) => ({
    stock: stocks.resolve(row?.produto_id),
    requester: users.resolve(row?.solicitante),
    approver: emptyReference(row?.autorizador) ? null : users.resolve(row?.autorizador),
    operator: emptyReference(row?.operador) ? null : users.resolve(row?.operador),
  }));
}

export function buildMarketingPasswordContexts({ rows, encryptionConfigured }) {
  assertAuditedCorpus("tb_mkt.senhas", rows);
  return issueContexts("mkt-password", "tb_mkt.senhas", rows, () => ({}), {
    encryption: encryptionConfigured === true,
  });
}

export function buildMarketingEventContexts({ rows }) {
  const sourceTable = "tb_mkt.eventos";
  const nameCounts = new Map();
  for (const row of rows) {
    const key = marketingEventNameKey(row?.nome);
    if (key) nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  return issueContexts("mkt-event", sourceTable, rows, (row) => {
    const key = marketingEventNameKey(row?.nome);
    return { duplicateName: Boolean(key && nameCounts.get(key) > 1) };
  });
}

export function buildMarketingEventEditionContexts({
  rows,
  eventRows = [],
  resolutions = new Map(),
}) {
  const eventContexts = buildMarketingEventContexts({ rows: eventRows });
  const eventRule = REMAINING_RULES.find(({ sourceTable }) => sourceTable === "tb_mkt.eventos");
  const candidates = eventRows.map((row, index) => ({
    legacyId: row?.id,
    id: generatedIdentityId("tb_mkt.eventos", row?.id),
    status: eventRule?.emitRows(row, eventContexts[index])[0]?.status ?? "quarantine",
  }));

  return issueContexts("mkt-event-edition", "tb_mkt.eventos_edicoes", rows, (row) => {
    const sourceIdentityDigest = toLegacyIdRef(
      `tb_mkt.eventos_edicoes:${String(row?.id ?? "missing")}`,
    );
    const resolvedEventId = resolutions.get(sourceIdentityDigest);
    const plan = planMarketingEventEditionImport({
      editionRow: row,
      eventCandidates: candidates,
      resolvedEventId,
    });
    const matches = candidates.filter((event) => String(event.legacyId) === String(row?.evento_id));
    const event =
      matches.length === 1
        ? matches[0]
        : matches.length > 1 && typeof resolvedEventId === "string"
          ? { legacyId: row?.evento_id, id: resolvedEventId, status: "prepared" }
          : null;
    return {
      event: issueResolution({
        state: event === null ? (matches.length === 0 ? "zero" : "many") : "one",
        sourceTable: "tb_mkt.eventos",
        sourceKey: validLegacyId(row?.evento_id) ? normalizeKey(row.evento_id) : null,
        identityRef:
          event === null
            ? null
            : typeof resolvedEventId === "string"
              ? `mtk.events:${resolvedEventId}`
              : `tb_mkt.eventos:${normalizeKey(event.legacyId)}`,
        migrationState: event?.status ?? "quarantine",
        importPlan: plan,
      }),
    };
  });
}

export function buildMarketingEventEditionFeedbackContexts({
  sourceTable,
  rows,
  editionRows = [],
  eventRows = [],
  evaluationRows = [],
  resolutions = new Map(),
}) {
  if (
    sourceTable !== "tb_mkt.eventos_feedbacks" &&
    sourceTable !== "tb_mkt.eventos_feedbacks_periodos"
  ) {
    throw new TypeError(`origem de feedback de edição inválida: ${String(sourceTable)}`);
  }
  const editionContexts = buildMarketingEventEditionContexts({
    rows: editionRows,
    eventRows,
    resolutions,
  });
  const editionRule = REMAINING_RULES.find(
    ({ sourceTable: candidate }) => candidate === "tb_mkt.eventos_edicoes",
  );
  const editionCandidates = editionRows.map((row, index) => ({
    legacyId: row?.id,
    id: generatedIdentityId("tb_mkt.eventos_edicoes", row?.id),
    status: editionRule?.emitRows(row, editionContexts[index])[0]?.status ?? "quarantine",
  }));

  return issueContexts(`mkt-event-edition-feedback:${sourceTable}`, sourceTable, rows, (row) => {
    const importPlan = planMarketingEventEditionFeedbackImport({
      sourceTable,
      feedbackRow: row,
      editionCandidates,
      evaluationRows,
    });
    return {
      feedback: issueResolution({
        state: importPlan.status === "prepared" ? "one" : "unresolved",
        sourceTable,
        sourceKey: validLegacyId(row?.id)
          ? normalizeKey(row.id)
          : normalizeKey(row?.edicao ?? row?.edicao_id),
        identityRef:
          importPlan.status === "prepared"
            ? `${sourceTable}:${normalizeKey(row?.id ?? row?.edicao)}`
            : null,
        importPlan,
      }),
    };
  });
}

export function buildMarketingSocialContexts({ rows, clientResolver }) {
  assertAuditedCorpus("tb_mkt.redes_sociais", rows);
  const entries = authoritativeClientEntries(rows, clientResolver);
  const slots = canonicalClientSlots(entries, socialPayloadFingerprint, "tb_mkt.redes_sociais");
  return Object.freeze(
    entries.map(({ row, index, client }) =>
      issueContext("mkt-social", "tb_mkt.redes_sociais", row, {
        client,
        clientSlot: slots[index] ?? canonicalSlot("unresolved", "tb_mkt.redes_sociais"),
      }),
    ),
  );
}

export function buildPecNoteContexts({ rows, userRows, clientResolver }) {
  assertAuditedCorpus("tb_pec.notas", rows);
  const users = auditedUserLookup(userRows);
  return issueContexts("pec-note", "tb_pec.notas", rows, (row) => {
    const client = emptyReference(row?.cliente_id)
      ? null
      : clientResolver?.resolve(row?.cliente_id);
    if (client !== null && !isAuthoritativeV2ClientIdentityResolution(client, row?.cliente_id)) {
      throw new TypeError("clientResolver não produziu resolução V2 autoritativa para PEC");
    }
    return { user: users.resolve(row?.usuario_id), client };
  });
}

export function buildTriageClientSlotContexts({ rows, clientResolver }) {
  assertAuditedCorpus("tb_triagem.campos", rows);

  const entries = authoritativeClientEntries(rows, clientResolver);
  const slots = canonicalClientSlots(entries, triagePayloadFingerprint, "tb_triagem.campos");

  return Object.freeze(
    entries.map(({ row, index, client }) =>
      issueContext("triage", "tb_triagem.campos", row, {
        client,
        clientSlot: slots[index] ?? canonicalSlot("unresolved", "tb_triagem.campos"),
      }),
    ),
  );
}

export function buildWorkspaceCategoryContexts({ rows, departmentRows }) {
  assertAuditedCorpus("tb_workspace.solicitacoes_categorias", rows);
  const departments = auditedLookup("tb_admin.departamentos", departmentRows, (row) => ({
    scope: departmentScope(row),
  }));
  return issueContexts(
    "workspace-category",
    "tb_workspace.solicitacoes_categorias",
    rows,
    (row) => ({ department: departments.resolve(row?.departamento_id) }),
  );
}

export function buildWorkspaceRequestContexts({
  rows,
  userRows,
  departmentRows,
  categoryRows,
  categoryContexts,
}) {
  assertAuditedCorpus("tb_workspace.solicitacoes", rows);
  const categoryMigrationStates = auditedParentMigrationStates({
    kind: "workspace-category",
    sourceTable: "tb_workspace.solicitacoes_categorias",
    rows: categoryRows,
    contexts: categoryContexts,
  });
  const users = auditedUserLookup(userRows);
  const departments = auditedLookup("tb_admin.departamentos", departmentRows, (row) => ({
    scope: departmentScope(row),
  }));
  const categories = auditedLookup("tb_workspace.solicitacoes_categorias", categoryRows, (row) => ({
    departmentSourceKey: normalizeKey(row?.departamento_id),
    migrationState: categoryMigrationStates.get(normalizeKey(row?.id)),
  }));
  return issueContexts("workspace-request", "tb_workspace.solicitacoes", rows, (row) => ({
    requester: users.resolve(row?.requerente),
    assignee: emptyReference(row?.atribuido) ? null : users.resolve(row?.atribuido),
    category: categories.resolve(row?.categoria),
    department: departments.resolve(row?.departamento),
  }));
}

export function buildWorkspaceMessageContexts({ rows, requestRows, requestContexts, userRows }) {
  assertAuditedCorpus("tb_workspace.solicitacoes_mensagens", rows);
  const requestMigrationStates = auditedParentMigrationStates({
    kind: "workspace-request",
    sourceTable: "tb_workspace.solicitacoes",
    rows: requestRows,
    contexts: requestContexts,
  });
  const requests = auditedLookup("tb_workspace.solicitacoes", requestRows, (row) => ({
    departmentSourceKey: normalizeKey(row?.departamento),
    migrationState: requestMigrationStates.get(normalizeKey(row?.id)),
  }));
  const users = auditedUserLookup(userRows);
  return issueContexts("workspace-message", "tb_workspace.solicitacoes_mensagens", rows, (row) => ({
    request: requests.resolve(row?.solicitacao),
    sender: users.resolve(row?.remetente),
  }));
}

export function mapWorkspaceMessageType(value, attachmentState = {}) {
  const type = String(value ?? "").trim();
  const mappedTypes = new Map([
    ["0", "Message"],
    ["1", "Solution"],
    ["2", "Rejection"],
    ["3", "Rejection"],
    ["4", "Acceptance"],
    ["5", "Acceptance"],
  ]);
  if (mappedTypes.has(type)) {
    return { status: "mapped", value: mappedTypes.get(type), attachment: false };
  }
  if (type !== "6") {
    return quarantine("tipo", "WORKSPACE_MESSAGE_TYPE_INVALID");
  }
  const supportedMediaTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  return attachmentState.correlated === true &&
    attachmentState.storageSupported === true &&
    supportedMediaTypes.has(attachmentState.mediaType)
    ? { status: "mapped", value: "Message", attachment: true }
    : quarantine("mensagem", "WORKSPACE_ATTACHMENT_CORRELATION_UNRESOLVED");
}

export const REMAINING_RULES = Object.freeze(
  [
    createRule({
      sourceTable: "tb_mkt.eventos",
      domain: "marketing",
      stepId: "mkt-event-insert",
      destinationTable: "mtk.events",
      columns: [
        mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
        mapped("id", "legacy_id", "preserve_legacy_numeric_identity"),
        mapped("nome", "name", "preserve_legacy_name_value"),
        mapped("nome", "name_key", "normalize_mysql_general_ci_unique_key"),
        mapped("logo", "logo", "preserve_optional_logo_or_empty_default"),
        mapped("status", "status", "preserve_legacy_status_enum"),
        mapped("prioridade", "priority", "preserve_legacy_priority_enum"),
        mapped("objetivo", "objective", "preserve_text_or_empty_default"),
        mapped("publico", "audience", "preserve_text_or_empty_default"),
      ],
      defaults: { logo: "", status: "Novo", objective: "", audience: "" },
      classify: classifyMarketingEvent,
    }),
    createMarketingEventEditionRule(),
    createMarketingEventEditionFeedbackPeriodRule(),
    createMarketingEventEditionFeedbackRule(),
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
        mapped("produto_id", "description", "resolve_stock_item_description", reference()),
        mapped("produto_id", "status", "map_legacy_stock_item_zero_active_status", reference()),
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
          technologyResolution(
            context,
            "department",
            "departamento_id",
            "CBS_STOCK_NOT_TECHNOLOGY",
          ),
          requiredResolution(
            context,
            "item",
            row?.produto_id,
            ["tb_cbs.estoque_itens"],
            "produto_id",
            "CBS_STOCK_ITEM",
          ),
          resolutionDepartmentMatch(
            context,
            "item",
            row?.departamento_id,
            "produto_id",
            "CBS_STOCK_ITEM_DEPARTMENT_MISMATCH",
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
          technologyResolution(
            context,
            "department",
            "departamento_id",
            "CBS_STOCK_CATEGORY_NOT_TECHNOLOGY",
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
      sourceTable: "tb_mkt.redes_sociais",
      domain: "marketing",
      stepId: "mkt-client-social-merge",
      destinationTable: "clients",
      mode: "merge",
      identity: resolveIdentity("tb_regularize.clientes", "cliente_id", "codigo"),
      dependencies: ["tb_regularize.clientes"],
      precedence: ["explicit_legacy_link", "source_row"],
      cardinality: "N:1",
      emissionIdentity: (_row, context) =>
        context?.resolutions?.client?.identityRef ?? "tb_mkt.redes_sociais:unresolved",
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
          canonicalClientSlot(context, row, "tb_mkt.redes_sociais", "MKT_SOCIAL_CANONICAL_CLIENT"),
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
          passwordObservationDoesNotContainSecret(row),
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
        mapped("nfce_tomados", "active_items", "aggregate_enabled_fiscal_field_nfse_received"),
        mapped("modelo_21", "active_items", "aggregate_enabled_fiscal_field_model_21_invoice"),
        mapped("cte_emitente", "active_items", "aggregate_enabled_fiscal_field_cte_as_issuer"),
        mapped(
          "prestadas_mei",
          "active_items",
          "aggregate_enabled_fiscal_field_services_provided_as_mei",
        ),
        notPreserved(
          "faturamento",
          "FISCAL_FIELDS não possui token para faturamento; somente linhas com zero podem prosseguir e qualquer valor funcional coloca a linha integral em quarentena.",
        ),
        notPreserved(
          "envio",
          "A preferência legada de envio não integra o checklist fiscal atual; somente valor vazio pode prosseguir e qualquer preferência funcional coloca a linha integral em quarentena.",
        ),
      ],
      constants: { organization_id: ORGANIZATION_ID, type: "FISCAL" },
      cardinality: "N:1",
      emissionIdentity: (_row, context) =>
        context?.resolutions?.client?.identityRef ?? "tb_triagem.campos:unresolved",
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
          triageUnmappedFunctionalValue(row),
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
          "TIMessage não persiste destinatário; somente zero pode prosseguir e qualquer destinatário funcional coloca a linha integral em quarentena.",
        ),
        notPreserved(
          "lida",
          "TIMessage não possui recibo de leitura; somente zero pode prosseguir e qualquer indicador funcional coloca a linha integral em quarentena.",
        ),
        mapped("data_envio", "created_at", "normalize_required_datetime"),
        mapped("mensagem", "message", "normalize_required_non_attachment_message", personal()),
        notPreserved(
          "mensagem",
          "Anexos tipo 6 só poderiam alimentar attachment após correlação inequívoca e MIME JPEG/PNG/WEBP; o PDF real não possui vínculo pelo nome vazio do backup.",
          personal(),
        ),
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
  cardinality = "1:1",
  emissionIdentity = (row) => rowIdentity(sourceTable, row?.id),
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
    cardinality,
    dependencies,
    destinations: [step],
    classifySourceRow: classify,
    emitRows(row, context) {
      return [toEmission(step, emissionIdentity(row, context), classify(row, context))];
    },
  };
}

function createMarketingEventEditionRule() {
  const sourceTable = "tb_mkt.eventos_edicoes";
  const evidence = EVIDENCE_BY_SOURCE.get(sourceTable);
  const editionStep = {
    stepId: "mkt-event-edition-insert",
    destinationTable: "mtk.event_editions",
    mode: "insert",
    identity: generateIdentity("id", sourceTable),
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("id", "legacy_id", "preserve_legacy_numeric_identity"),
      mapped("evento_id", "event_id", "resolve_marketing_event_by_legacy_id", reference()),
      mapped("nome", "name", "preserve_legacy_name_value"),
      mapped("data_local", "date", "parse_legacy_date_local"),
      mapped(null, "place", "parse_legacy_date_local"),
      notPreserved(
        "orcamentos",
        "Cada item de orçamento é migrado como linha relacional em mtk.event_edition_budget_items.",
      ),
      mapped("parcerias", "partnerships", "normalize_legacy_named_list"),
      mapped("organizacao", "organizing_team", "normalize_legacy_named_list"),
      mapped("logistica", "logistics", "validate_legacy_planning_section"),
      mapped("mkt_comunicacao", "marketing_communication", "validate_legacy_planning_section"),
      mapped("durante_evento", "during_event", "validate_legacy_planning_section"),
      mapped("pos_evento", "after_event", "validate_legacy_planning_section"),
      mapped("obs", "notes", "preserve_legacy_notes"),
    ],
    constants: { organization_id: ORGANIZATION_ID },
    defaults: {},
    precedence: ["legacy_identity"],
    dependencies: ["tb_mkt.eventos"],
  };
  const budgetStep = {
    stepId: "mkt-event-edition-budget-insert",
    destinationTable: "mtk.event_edition_budget_items",
    mode: "insert",
    identity: generateIdentity("id", sourceTable),
    columns: [
      mapped("orcamentos", "id", "uuid_v5_from_legacy_edition_and_budget_identity"),
      mapped("id", "edition_id", "resolve_legacy_edition_identity"),
      mapped("orcamentos", "legacy_id", "preserve_nested_legacy_budget_id"),
      mapped("orcamentos", "name", "preserve_nested_legacy_budget_name"),
      mapped("orcamentos", "amount", "normalize_legacy_decimal_amount"),
      mapped("orcamentos", "position", "preserve_legacy_budget_order"),
    ],
    constants: { organization_id: ORGANIZATION_ID },
    defaults: {},
    precedence: ["legacy_identity"],
    dependencies: ["tb_mkt.eventos"],
  };

  return {
    sourceTable,
    status: "confirmed",
    domain: "marketing",
    ruleOrigin: evidence.ruleId,
    evidence: {
      legacy: [...evidence.legacyReferences, ...evidence.legacyRelationships],
      current: [...evidence.currentContractEvidence],
    },
    cardinality: "1:N",
    dependencies: ["tb_mkt.eventos"],
    destinations: [editionStep, budgetStep],
    classifySourceRow: classifyMarketingEventEdition,
    emitRows(row, context) {
      const classification = classifyMarketingEventEdition(row, context);
      const editionEmission = toEmission(
        editionStep,
        rowIdentity(sourceTable, row?.id),
        classification,
      );
      const importPlan = context?.resolutions?.event?.importPlan;
      if (classification.status !== "prepared") {
        return [
          editionEmission,
          toEmission(
            budgetStep,
            `${rowIdentity(sourceTable, row?.id)}:budget:unresolved`,
            classification,
          ),
        ];
      }
      if (importPlan.budgetItems.length === 0) {
        return [
          editionEmission,
          {
            stepId: budgetStep.stepId,
            destinationTable: budgetStep.destinationTable,
            status: "not_emitted",
            identityRef: `${rowIdentity(sourceTable, row?.id)}:budget:empty`,
            field: null,
            reasonCode: "MKT_EDITION_BUDGET_EMPTY",
          },
        ];
      }
      return [
        editionEmission,
        ...importPlan.budgetItems.map((item) =>
          toEmission(
            budgetStep,
            `${sourceTable}:${generatedIdentityId(sourceTable, row?.id)}:budget:${item.legacy_id}`,
            classification,
          ),
        ),
      ];
    },
  };
}

function createMarketingEventEditionFeedbackPeriodRule() {
  return createRule({
    sourceTable: "tb_mkt.eventos_feedbacks_periodos",
    domain: "marketing",
    stepId: "mkt-event-edition-feedback-period-update",
    destinationTable: "mtk.event_editions",
    mode: "merge",
    identity: resolveIdentity("tb_mkt.eventos_edicoes", "edicao", "id"),
    columns: [
      mapped("inicio", "feedback_period_start", "preserve_legacy_datetime_wall_clock"),
      mapped("fim", "feedback_period_end", "preserve_legacy_datetime_wall_clock"),
    ],
    dependencies: ["tb_mkt.eventos_edicoes"],
    precedence: ["explicit_legacy_link", "source"],
    emissionIdentity: (row, context) =>
      context?.resolutions?.feedback?.importPlan?.editionId ??
      `${"tb_mkt.eventos_feedbacks_periodos"}:${normalizeKey(row?.edicao) ?? "invalid"}`,
    classify: (row, context) =>
      classifyMarketingEventEditionFeedback(row, context, "tb_mkt.eventos_feedbacks_periodos"),
  });
}

function createMarketingEventEditionFeedbackRule() {
  return createRule({
    sourceTable: "tb_mkt.eventos_feedbacks",
    domain: "marketing",
    stepId: "mkt-event-edition-feedback-insert",
    destinationTable: "mtk.event_edition_feedback",
    identity: generateIdentity("id", "tb_mkt.eventos_feedbacks"),
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("edicao_id", "edition_id", "resolve_legacy_edition_identity", reference()),
      mapped("nota", "rating", "normalize_legacy_rating_1_to_5"),
      mapped("obs", "observation", "preserve_legacy_observation"),
      mapped("data", "evaluated_at", "preserve_legacy_datetime_wall_clock"),
    ],
    dependencies: ["tb_mkt.eventos_edicoes"],
    emissionIdentity: (row) => rowIdentity("tb_mkt.eventos_feedbacks", row?.id),
    classify: (row, context) =>
      classifyMarketingEventEditionFeedback(row, context, "tb_mkt.eventos_feedbacks"),
  });
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
    technologyStockResolution(context, "stock", "produto_id", "CBS_STOCK_ENTRY_NOT_TECHNOLOGY"),
    preparedParentResolution(context, "stock", "produto_id", "CBS_STOCK_ENTRY_TARGET_QUARANTINED"),
    requiredResolution(
      context,
      "user",
      row?.repositor,
      ["tb_admin.usuarios"],
      "repositor",
      "CBS_STOCK_ENTRY_USER",
    ),
    preparedParentResolution(context, "user", "repositor", "CBS_STOCK_ENTRY_USER_QUARANTINED"),
  ]);
}

function classifyMarketingEvent(row, context) {
  const bound = authenticContext("tb_mkt.eventos", row, context);
  if (bound.status !== "prepared") return bound;
  const name = marketingEventName(row?.nome);
  const status = normalizeText(row?.status) ?? "Novo";
  const priority = normalizeRequiredScalarText(row?.prioridade);
  return firstFailure([
    validId(row?.id, "id", "MKT_EVENT_ID_INVALID"),
    typeof name === "string" && name.length > 0 && name.trim().length > 0 && name.length <= 50
      ? prepared()
      : quarantine("nome", "MKT_EVENT_NAME_INVALID"),
    typeof row?.logo === "string" && row.logo.length <= 100
      ? prepared()
      : row?.logo == null
        ? prepared()
        : quarantine("logo", "MKT_EVENT_LOGO_INVALID"),
    MARKETING_EVENT_STATUSES.has(status)
      ? prepared()
      : quarantine("status", "MKT_EVENT_STATUS_INVALID"),
    MARKETING_EVENT_PRIORITIES.has(priority)
      ? prepared()
      : quarantine("prioridade", "MKT_EVENT_PRIORITY_INVALID"),
    [row?.objetivo, row?.publico].every((value) => value == null || typeof value === "string")
      ? prepared()
      : quarantine("objetivo", "MKT_EVENT_TEXT_INVALID"),
    context.resolutions.duplicateName === true
      ? quarantine("nome", "MKT_EVENT_NAME_AMBIGUOUS")
      : prepared(),
  ]);
}

function classifyMarketingEventEdition(row, context) {
  const bound = authenticContext("tb_mkt.eventos_edicoes", row, context);
  if (bound.status !== "prepared") return bound;
  const event = requiredResolution(
    context,
    "event",
    row?.evento_id,
    ["tb_mkt.eventos"],
    "evento_id",
    "MKT_EDITION_EVENT",
  );
  if (event.status !== "prepared") return event;
  const parent = preparedParentResolution(
    context,
    "event",
    "evento_id",
    "MKT_EDITION_EVENT_TARGET_QUARANTINED",
  );
  if (parent.status !== "prepared") return parent;
  const importPlan = context.resolutions.event.importPlan;
  return importPlan?.status === "prepared"
    ? prepared()
    : quarantine(
        importPlan?.field ?? "evento_id",
        importPlan?.reasonCode ?? "MKT_EDITION_IMPORT_PLAN_MISSING",
      );
}

function classifyMarketingEventEditionFeedback(row, context, sourceTable) {
  const bound = authenticContext(sourceTable, row, context);
  if (bound.status !== "prepared") return bound;
  const resolution = context.resolutions.feedback;
  if (!isAuthenticRemainingResolution(resolution) || resolution.sourceTable !== sourceTable) {
    return quarantine(
      sourceTable.endsWith("_periodos") ? "edicao" : "edicao_id",
      "MKT_EDITION_FEEDBACK_CONTEXT_INVALID",
    );
  }
  const plan = resolution.importPlan;
  if (plan?.status !== "prepared") {
    return quarantine(
      plan?.field ?? (sourceTable.endsWith("_periodos") ? "edicao" : "edicao_id"),
      plan?.reasonCode ?? "MKT_EDITION_FEEDBACK_IMPORT_PLAN_MISSING",
    );
  }
  return prepared();
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
  if (!Number.isSafeInteger(context.resolutions.floor.floor)) {
    return quarantine("andar", "CBS_STOCK_FLOOR_LABEL_UNMAPPABLE");
  }
  if (context.resolutions.floor.departmentSourceKey !== normalizeKey(row?.departamento_id)) {
    return quarantine("andar", "CBS_STOCK_FLOOR_DEPARTMENT_MISMATCH");
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
    technologyResolution(
      context,
      "department",
      "departamento_id",
      "CBS_STOCK_LOCATION_NOT_TECHNOLOGY",
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
    technologyStockResolution(context, "stock", "produto_id", "CBS_STOCK_EXIT_NOT_TECHNOLOGY"),
    preparedParentResolution(context, "stock", "produto_id", "CBS_STOCK_EXIT_TARGET_QUARANTINED"),
    requiredResolution(
      context,
      "requester",
      row?.solicitante,
      ["tb_admin.usuarios"],
      "solicitante",
      "CBS_STOCK_EXIT_REQUESTER",
    ),
    preparedParentResolution(
      context,
      "requester",
      "solicitante",
      "CBS_STOCK_EXIT_REQUESTER_QUARANTINED",
    ),
    optionalResolution(
      context,
      "approver",
      row?.autorizador,
      ["tb_admin.usuarios"],
      "autorizador",
      "CBS_STOCK_EXIT_APPROVER",
    ),
    preparedOptionalParentResolution(
      context,
      "approver",
      row?.autorizador,
      "autorizador",
      "CBS_STOCK_EXIT_APPROVER_QUARANTINED",
    ),
    optionalResolution(
      context,
      "operator",
      row?.operador,
      ["tb_admin.usuarios"],
      "operador",
      "CBS_STOCK_EXIT_OPERATOR",
    ),
    preparedOptionalParentResolution(
      context,
      "operator",
      row?.operador,
      "operador",
      "CBS_STOCK_EXIT_OPERATOR_QUARANTINED",
    ),
    normalizeNullableText(row?.obs) === null
      ? prepared()
      : quarantine("obs", "CBS_STOCK_EXIT_OBS_UNMAPPABLE"),
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
    preparedParentResolution(context, "user", "usuario_id", "PEC_NOTE_USER_QUARANTINED"),
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
  if (context.resolutions.department.scope !== "technology") {
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
  if (context.resolutions.department.scope !== "technology") {
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
    preparedParentResolution(
      context,
      "requester",
      "requerente",
      "WORKSPACE_REQUEST_REQUESTER_QUARANTINED",
    ),
    optionalResolution(
      context,
      "assignee",
      row?.atribuido,
      ["tb_admin.usuarios"],
      "atribuido",
      "WORKSPACE_REQUEST_ASSIGNEE",
    ),
    preparedOptionalParentResolution(
      context,
      "assignee",
      row?.atribuido,
      "atribuido",
      "WORKSPACE_REQUEST_ASSIGNEE_QUARANTINED",
    ),
    requiredResolution(
      context,
      "category",
      row?.categoria,
      ["tb_workspace.solicitacoes_categorias"],
      "categoria",
      "WORKSPACE_REQUEST_CATEGORY",
    ),
    preparedParentResolution(
      context,
      "category",
      "categoria",
      "WORKSPACE_REQUEST_CATEGORY_QUARANTINED",
    ),
    resolutionDepartmentMatch(
      context,
      "category",
      row?.departamento,
      "categoria",
      "WORKSPACE_REQUEST_CATEGORY_DEPARTMENT_MISMATCH",
    ),
  ]);
}

function classifyWorkspaceMessage(row, context) {
  const bound = authenticContext("tb_workspace.solicitacoes_mensagens", row, context);
  if (bound.status !== "prepared") return bound;
  const type = mapWorkspaceMessageType(row?.tipo);
  const references = firstFailure([
    validId(row?.id, "id", "WORKSPACE_MESSAGE_ID_INVALID"),
    validDate(row?.data_envio, "data_envio", "WORKSPACE_MESSAGE_DATE_INVALID"),
    requiredResolution(
      context,
      "request",
      row?.solicitacao,
      ["tb_workspace.solicitacoes"],
      "solicitacao",
      "WORKSPACE_MESSAGE_REQUEST",
    ),
    technologyStockResolution(
      context,
      "request",
      "solicitacao",
      "WORKSPACE_MESSAGE_REQUEST_NOT_TECHNOLOGY",
    ),
    preparedParentResolution(
      context,
      "request",
      "solicitacao",
      "WORKSPACE_MESSAGE_REQUEST_QUARANTINED",
    ),
    requiredResolution(
      context,
      "sender",
      row?.remetente,
      ["tb_admin.usuarios"],
      "remetente",
      "WORKSPACE_MESSAGE_SENDER",
    ),
    preparedParentResolution(
      context,
      "sender",
      "remetente",
      "WORKSPACE_MESSAGE_SENDER_QUARANTINED",
    ),
  ]);
  if (references.status !== "prepared") return references;
  if (type.status !== "mapped") return type;
  if (!emptyReference(row?.destinatario) || String(row?.lida ?? "0").trim() !== "0") {
    return quarantine("lida", "WORKSPACE_MESSAGE_READ_STATE_UNMAPPABLE");
  }
  return type.attachment
    ? prepared()
    : requiredText(row?.mensagem, "mensagem", "WORKSPACE_MESSAGE_EMPTY");
}

function categoryResolution(context, row) {
  const resolution = context.resolutions.category;
  if (!isAuthenticRemainingResolution(resolution)) {
    return quarantine("produto_id", "CBS_STOCK_CATEGORY_CONTEXT_INVALID");
  }
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
  return preparedParentResolution(
    context,
    "category",
    "produto_id",
    "CBS_STOCK_CATEGORY_QUARANTINED",
  );
}

function triageClientSlot(context, row) {
  return canonicalClientSlot(context, row, "tb_triagem.campos", "TRIAGE_CONFIG_CANONICAL_CLIENT");
}

function auditBlockers(sourceTable, row, context, decision) {
  if (sourceTable !== "tb_triagem.campos") {
    return decision.status === "prepared" ? [] : [sanitizeBlocker(decision)];
  }
  const bound = authenticContext(sourceTable, row, context);
  if (bound.status !== "prepared") return [sanitizeBlocker(bound)];
  return [triageUnmappedFunctionalValue(row), triageClientSlot(context, row)]
    .filter(({ status }) => status !== "prepared")
    .map(sanitizeBlocker);
}

function sanitizeBlocker(classification) {
  return Object.freeze({
    status: classification.status,
    field: classification.status === "quarantine" ? classification.field : null,
    reasonCode: classification.reasonCode,
  });
}

function projectPreparedPayload(sourceTable, row, context) {
  const id = generatedIdentityId(sourceTable, row?.id);
  switch (sourceTable) {
    case "tb_cbc.emails":
      return Object.freeze({
        id,
        email: normalizeRequiredScalarText(row?.email),
        responsible: normalizeRequiredScalarText(row?.responsavel),
        new_client_sending: normalizeLegacyBoolean(row?.cliente_novo_integracao),
        task_stalled_sending: normalizeLegacyBoolean(row?.tarefa_paralisada_integracao),
        organization_id: ORGANIZATION_ID,
      });
    case "tb_cbs.estoque":
      return Object.freeze({
        id,
        department_id: resolvedIdentityId(context, "department"),
        name: context.resolutions.item.itemName,
        description: context.resolutions.item.itemDescription,
        status: context.resolutions.item.itemActive,
        category_id: resolvedIdentityId(context, "category"),
        quantity: Number(row?.quantidade),
        location_id: resolvedIdentityId(context, "location"),
        organization_id: ORGANIZATION_ID,
      });
    case "tb_cbs.estoque_categorias":
      return Object.freeze({
        id,
        name: normalizeRequiredScalarText(row?.nome),
        department_id: resolvedIdentityId(context, "department"),
        status: true,
        organization_id: ORGANIZATION_ID,
      });
    case "tb_cbs.estoque_entradas":
      return Object.freeze({
        id,
        stock_id: resolvedIdentityId(context, "stock"),
        quantity: Number(row?.quantidade),
        entry_date: normalizeText(row?.data_entrada),
        entry_by_user_id: resolvedIdentityId(context, "user"),
        organization_id: ORGANIZATION_ID,
      });
    case "tb_cbs.estoque_inventario":
      return Object.freeze({
        id,
        name: normalizeRequiredScalarText(row?.tipo_item),
        tag: normalizeNullableText(row?.tag),
        active: normalizeActiveText(row?.status),
        organization_id: ORGANIZATION_ID,
      });
    case "tb_cbs.estoque_localizacoes":
      return Object.freeze({
        id,
        name: normalizeRequiredScalarText(row?.nome),
        floor: context.resolutions.floor.floor,
        department_id: resolvedIdentityId(context, "department"),
        status: true,
        organization_id: ORGANIZATION_ID,
      });
    case "tb_cbs.estoque_saidas":
      return Object.freeze({
        id,
        stock_id: resolvedIdentityId(context, "stock"),
        quantity: Number(row?.quantidade),
        exit_date: normalizeText(row?.data_saida),
        destination: normalizeNullableText(row?.destino),
        requester_id: resolvedIdentityId(context, "requester"),
        approver_id: optionalResolvedIdentityId(context, "approver"),
        operator_id: optionalResolvedIdentityId(context, "operator"),
        location_destination_id: null,
        organization_id: ORGANIZATION_ID,
      });
    case "tb_mkt.redes_sociais":
      return Object.freeze({
        id: resolvedIdentityId(context, "client"),
        instagram: normalizeNullableText(row?.instagram),
      });
    case "tb_mkt.eventos": {
      const name = marketingEventName(row?.nome) ?? normalizeRequiredScalarText(row?.nome);
      return Object.freeze({
        id,
        organization_id: ORGANIZATION_ID,
        legacy_id: Number(row.id),
        name,
        name_key: marketingEventNameKey(name),
        logo: normalizeNullableText(row?.logo) ?? "",
        status: normalizeText(row?.status) ?? "Novo",
        priority: normalizeRequiredScalarText(row?.prioridade),
        objective: normalizeNullableText(row?.objetivo) ?? "",
        audience: normalizeNullableText(row?.publico) ?? "",
      });
    }
    case "tb_mkt.eventos_edicoes":
      return context.resolutions.event.importPlan.edition;
    case "tb_mkt.senhas":
      return Object.freeze({
        id,
        local: normalizeRequiredScalarText(row?.local),
        userPresent: normalizeRequiredScalarText(row?.user) !== null,
        notes: normalizeNullableText(row?.obs),
        organization_id: ORGANIZATION_ID,
        credential: Object.freeze({
          sourcePresent: normalizeText(row?.password) !== null,
          encryptionRequired: context?.capabilities?.encryption === true,
          plaintextIncluded: false,
        }),
      });
    case "tb_pec.notas":
      return Object.freeze({
        id,
        user_id: resolvedIdentityId(context, "user"),
        number: Number(row?.numero),
        note: normalizeRequiredScalarText(row?.tarefa),
        created_at: normalizeText(row?.cadastro),
        due_date: normalizeLegacyZeroDate(row?.previsao),
        completion_date: normalizeLegacyZeroDate(row?.conclusao),
        status: String(row?.status).trim() !== "0",
        week_start_date: normalizeText(row?.inicio_semana),
        week_end_date: normalizeText(row?.fim_semana),
        original_creation_date: normalizeText(row?.cadastro_original),
        has_penalty: normalizeLegacyBoolean(row?.multa),
        is_urgent: normalizeLegacyBoolean(row?.urgente),
        is_internal: emptyReference(row?.cliente_id),
        client_id: emptyReference(row?.cliente_id) ? null : resolvedIdentityId(context, "client"),
        organization_id: ORGANIZATION_ID,
      });
    case "tb_triagem.campos":
      return Object.freeze({
        id,
        client_id: resolvedIdentityId(context, "client"),
        type: "FISCAL",
        active_items: Object.freeze(projectTriageActiveItems(row)),
        organization_id: ORGANIZATION_ID,
      });
    case "tb_workspace.solicitacoes_categorias":
      return Object.freeze({
        id,
        name: normalizeRequiredScalarText(row?.nome),
        active: normalizeLegacyBoolean(row?.status),
        organization_id: ORGANIZATION_ID,
      });
    case "tb_workspace.solicitacoes":
      return Object.freeze({
        id,
        title: normalizeRequiredScalarText(row?.titulo),
        description: normalizeRequiredScalarText(row?.descricao),
        status: projectWorkspaceRequestStatus(row?.status),
        requester_id: resolvedIdentityId(context, "requester"),
        assigned_to_id: optionalResolvedIdentityId(context, "assignee"),
        category_id: resolvedIdentityId(context, "category"),
        urgency: projectWorkspaceRequestUrgency(row?.urgencia),
        attachment: null,
        created_at: normalizeText(row?.data_cadastro),
        updated_at: normalizeText(row?.data_atualizacao),
        organization_id: ORGANIZATION_ID,
      });
    case "tb_workspace.solicitacoes_mensagens": {
      const type = mapWorkspaceMessageType(row?.tipo);
      return Object.freeze({
        id,
        request_id: resolvedIdentityId(context, "request"),
        sender_id: resolvedIdentityId(context, "sender"),
        message: normalizeRequiredScalarText(row?.mensagem),
        attachment: null,
        type: type.status === "mapped" ? type.value : null,
        created_at: normalizeText(row?.data_envio),
        organization_id: ORGANIZATION_ID,
      });
    }
    default:
      throw new TypeError(`projetor de payload ausente para ${sourceTable}`);
  }
}

function projectSanitizedCandidate(sourceTable, row) {
  if (sourceTable !== "tb_workspace.solicitacoes_mensagens") return null;
  const type = mapWorkspaceMessageType(row?.tipo);
  const content = normalizeNullableText(row?.mensagem);
  return Object.freeze({
    type: type.status === "mapped" ? type.value : null,
    content: Object.freeze({ present: content !== null, length: content?.length ?? 0 }),
    attachment: type.status === "mapped" && type.attachment,
  });
}

function generatedIdentityId(sourceTable, sourceKey) {
  return uuidV5(REQUIRED_IDENTITY_NAMESPACE, rowIdentity(sourceTable, sourceKey));
}

function resolvedIdentityId(context, name) {
  return uuidV5(REQUIRED_IDENTITY_NAMESPACE, context.resolutions[name].identityRef);
}

function optionalResolvedIdentityId(context, name) {
  return context.resolutions[name] === null ? null : resolvedIdentityId(context, name);
}

function normalizeLegacyBoolean(value) {
  return String(value ?? "").trim() === "1";
}

function passwordObservationDoesNotContainSecret(row) {
  const password = normalizeText(row?.password);
  const observation = normalizeNullableText(row?.obs);
  return password !== null && observation?.includes(password)
    ? quarantine("obs", "MKT_PASSWORD_OBSERVATION_CONTAINS_SECRET")
    : prepared();
}

function normalizeActiveText(value) {
  return (
    String(value ?? "")
      .trim()
      .toLocaleLowerCase("pt-BR") === "ativo"
  );
}

function normalizeLegacyZeroDate(value) {
  const text = String(value ?? "").trim();
  return text.length === 0 || text.startsWith("0000-00-00") ? null : text;
}

function projectTriageActiveItems(row) {
  const fields = [
    ["nfce", "nfce_documents"],
    ["sped", "sped_fiscal"],
    ["spedContribuicoes", "sped_contributions"],
    ["nfce_tomados", "nfse_received"],
    ["modelo_21", "model_21_invoice"],
    ["cte_emitente", "cte_as_issuer"],
    ["prestadas_mei", "services_provided_as_mei"],
  ];
  return fields.flatMap(([column, token]) =>
    String(row?.[column] ?? "").trim() === "1" ? [token] : [],
  );
}

function projectWorkspaceRequestStatus(value) {
  return new Map([
    ["0", "New"],
    ["1", "In_Progress"],
    ["2", "Resolved"],
    ["3", "Closed"],
  ]).get(String(value).trim());
}

function projectWorkspaceRequestUrgency(value) {
  return new Map([
    ["1", "Low"],
    ["2", "Medium"],
    ["3", "High"],
  ]).get(String(value).trim());
}

function canonicalClientSlot(context, row, sourceTable, prefix) {
  const resolution = context.resolutions.clientSlot;
  if (!isAuthenticRemainingResolution(resolution)) {
    return quarantine("cliente_id", `${prefix}_SLOT_CONTEXT_INVALID`);
  }
  if (resolution?.state === "conflict") {
    return quarantine("cliente_id", `${prefix}_CONFLICT`);
  }
  if (resolution?.state === "duplicate") {
    return notEmitted(`${prefix}_DUPLICATE`);
  }
  if (resolution?.state !== "owner") {
    return quarantine("cliente_id", `${prefix}_SLOT_NOT_RESOLVED`);
  }
  if (
    resolution.sourceTable !== sourceTable ||
    resolution.sourceKey !== context.resolutions.client.identityRef ||
    resolution.ownerSourceKey !== normalizeKey(row?.id)
  ) {
    return quarantine("cliente_id", `${prefix}_SLOT_MISMATCH`);
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
  const parent = preparedParentResolution(
    context,
    "location",
    "localizacao",
    "CBS_STOCK_LOCATION_QUARANTINED",
  );
  if (parent.status !== "prepared") return parent;
  // No legado, Estoque::atualizarLocalizacao() atualiza somente localizacao;
  // por isso andar pode permanecer defasado após a troca do local. O contrato
  // atual guarda o andar em stock.locations, então a localização resolvida é
  // a fonte autoritativa e o andar legado não deve bloquear o estoque.
  if (context.resolutions.location.departmentSourceKey !== normalizeKey(row?.departamento_id)) {
    return quarantine("departamento_id", "CBS_STOCK_LOCATION_DEPARTMENT_MISMATCH");
  }
  const floor = requiredResolution(
    context,
    "floor",
    row?.andar,
    ["tb_cbs.estoque_andares"],
    "andar",
    "CBS_STOCK_FLOOR",
  );
  if (floor.status !== "prepared") return floor;
  const locationFloor = requiredResolution(
    context,
    "locationFloor",
    context.resolutions.location.floorSourceKey,
    ["tb_cbs.estoque_andares"],
    "andar",
    "CBS_STOCK_LOCATION_FLOOR",
  );
  if (locationFloor.status !== "prepared") return locationFloor;
  if (
    !Number.isSafeInteger(context.resolutions.floor.floor) ||
    !Number.isSafeInteger(context.resolutions.locationFloor.floor)
  ) {
    return quarantine("andar", "CBS_STOCK_FLOOR_LABEL_UNMAPPABLE");
  }
  return prepared();
}

function authenticContext(sourceTable, row, context) {
  const issuance = CONTEXT_ISSUANCE.get(context);
  if (
    !isObject(context) ||
    issuance === undefined ||
    issuance.snapshot !== canonical(context) ||
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
  const authentic =
    name === "client"
      ? isAuthoritativeV2ClientIdentityResolution(resolution, sourceKey)
      : isAuthenticRemainingResolution(resolution) ||
        sourceTables.some((sourceTable) =>
          isAuthenticLegacyReferenceResolution(resolution, sourceTable, sourceKey),
        );
  if (!authentic) return quarantine(field, `${prefix}_CONTEXT_INVALID`);
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

function requiredText(_value, _field, _reasonCode) {
  return prepared();
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
  return fingerprint({
    activeItems: TRIAGE_ACTIVE_COLUMNS.map((column) => String(row?.[column] ?? "").trim() === "1"),
    billing: String(row?.faturamento ?? "").trim(),
    delivery: String(row?.envio ?? "").trim(),
  });
}

function socialPayloadFingerprint(row) {
  return fingerprint(normalizeNullableText(row?.instagram));
}

function canonicalSlot(state, sourceTable, identityRef = null, ownerSourceKey = null) {
  return issueResolution({
    state,
    sourceTable,
    sourceKey: identityRef,
    identityRef,
    ownerSourceKey: normalizeKey(ownerSourceKey),
  });
}

function compareEntriesByLegacyId(left, right) {
  const leftId = Number(left.row?.id);
  const rightId = Number(right.row?.id);
  return leftId - rightId;
}

function authoritativeClientEntries(rows, clientResolver) {
  if (typeof clientResolver?.resolve !== "function") {
    throw new TypeError("clientResolver autoritativo é obrigatório");
  }
  return rows.map((row, index) => {
    const client = clientResolver.resolve(row?.cliente_id);
    if (!isAuthoritativeV2ClientIdentityResolution(client, row?.cliente_id)) {
      throw new TypeError("clientResolver não produziu resolução V2 autoritativa");
    }
    return { row, index, client };
  });
}

function canonicalClientSlots(entries, payloadFingerprint, sourceTable) {
  const groups = Map.groupBy(
    entries.filter(({ client }) => client.state === "one"),
    ({ client }) => client.identityRef,
  );
  const slots = new Array(entries.length);
  for (const [identityRef, group] of groups) {
    if (group.length === 1) {
      const [owner] = group;
      slots[owner.index] = canonicalSlot("owner", sourceTable, identityRef, owner.row?.id);
      continue;
    }
    const payloads = new Set(group.map(({ row }) => payloadFingerprint(row)));
    if (payloads.size > 1) {
      for (const entry of group) {
        slots[entry.index] = canonicalSlot("conflict", sourceTable, identityRef);
      }
      continue;
    }
    const [owner, ...duplicates] = [...group].sort(compareEntriesByLegacyId);
    slots[owner.index] = canonicalSlot("owner", sourceTable, identityRef, owner.row?.id);
    for (const duplicate of duplicates) {
      slots[duplicate.index] = canonicalSlot("duplicate", sourceTable, identityRef, owner.row?.id);
    }
  }
  return slots;
}

function auditedLookup(sourceTable, rows, project = () => ({})) {
  assertAuditedCorpus(sourceTable, rows);
  const snapshots = rows.map((row) => Object.freeze({ ...row }));
  const rowsById = Map.groupBy(snapshots, ({ id }) => normalizeKey(id));
  return Object.freeze({
    resolve(value) {
      const sourceKey = validLegacyId(value) ? normalizeKey(value) : null;
      const candidates = sourceKey === null ? [] : (rowsById.get(sourceKey) ?? []);
      if (candidates.length === 0) {
        return issueResolution({
          state: "zero",
          sourceTable,
          sourceKey,
          identityRef: null,
        });
      }
      if (candidates.length > 1) {
        return issueResolution({
          state: "many",
          sourceTable,
          sourceKey,
          identityRef: null,
        });
      }
      return issueResolution({
        state: "one",
        sourceTable,
        sourceKey,
        identityRef: `${sourceTable}:${sourceKey}`,
        ...project(candidates[0]),
      });
    },
  });
}

function issueContexts(kind, sourceTable, rows, resolutionsForRow, capabilities = {}) {
  return Object.freeze(
    rows.map((row) => issueContext(kind, sourceTable, row, resolutionsForRow(row), capabilities)),
  );
}

function issueContext(kind, sourceTable, row, resolutions, capabilities = {}) {
  const context = Object.freeze({
    sourceTable,
    rowFingerprint: fingerprint(row),
    resolutions: Object.freeze({ ...resolutions }),
    capabilities: Object.freeze({ ...capabilities }),
  });
  CONTEXT_ISSUANCE.set(context, Object.freeze({ kind, snapshot: canonical(context) }));
  return context;
}

function issueResolution(value) {
  const resolution = Object.freeze({ ...value });
  RESOLUTION_ISSUANCE.set(resolution, canonical(resolution));
  return resolution;
}

function auditedUserLookup(rows) {
  assertAuditedCorpus("tb_admin.usuarios", rows);
  const userRule = V2_RULES.find(({ sourceTable }) => sourceTable === "tb_admin.usuarios");
  if (userRule === undefined) {
    throw new TypeError("regra-pai confirmada ausente para tb_admin.usuarios");
  }
  const migrationStates = new Map(
    rows.map((row) => [normalizeKey(row?.id), userRule.emitRows(row)[0].status]),
  );
  return auditedLookup("tb_admin.usuarios", rows, (row) => ({
    migrationState: migrationStates.get(normalizeKey(row?.id)),
  }));
}

function auditedParentMigrationStates({ kind, sourceTable, rows, contexts }) {
  assertAuditedCorpus(sourceTable, rows);
  if (!Array.isArray(contexts) || contexts.length !== rows.length) {
    throw new TypeError(`preflight opaco completo de ${sourceTable} é obrigatório`);
  }
  const parentRule = REMAINING_RULES.find((rule) => rule.sourceTable === sourceTable);
  if (parentRule === undefined) {
    throw new TypeError(`regra-pai confirmada ausente para ${sourceTable}`);
  }
  return new Map(
    rows.map((row, index) => {
      const context = contexts[index];
      const issuance = CONTEXT_ISSUANCE.get(context);
      if (
        issuance?.kind !== kind ||
        issuance.snapshot !== canonical(context) ||
        context.sourceTable !== sourceTable ||
        context.rowFingerprint !== fingerprint(row)
      ) {
        throw new TypeError(`preflight opaco inválido para ${sourceTable}:${String(row?.id)}`);
      }
      return [normalizeKey(row?.id), parentRule.emitRows(row, context)[0].status];
    }),
  );
}

function isAuthenticRemainingResolution(resolution) {
  const snapshot = RESOLUTION_ISSUANCE.get(resolution);
  return (
    snapshot !== undefined && Object.isFrozen(resolution) && snapshot === canonical(resolution)
  );
}

function assertAuditedCorpus(sourceTable, rows) {
  if (!Array.isArray(rows)) throw new TypeError(`rows de ${sourceTable} deve ser um array`);
  const manifest = REMAINING_AUDITED_CORPORA[sourceTable];
  if (
    manifest === undefined ||
    rows.length !== manifest.rowCount ||
    corpusFingerprint(rows) !== manifest.digest
  ) {
    throw new TypeError(`corpus completo auditado inválido para ${sourceTable}`);
  }
}

function departmentScope(row) {
  return normalizeKey(row?.id) === "27" && normalizeText(row?.nome) === "Tecnologia"
    ? "technology"
    : "other";
}

function technologyResolution(context, name, field, reasonCode) {
  return context.resolutions[name]?.scope === "technology"
    ? prepared()
    : quarantine(field, reasonCode);
}

function technologyStockResolution(context, name, field, reasonCode) {
  return context.resolutions[name]?.departmentSourceKey === "27"
    ? prepared()
    : quarantine(field, reasonCode);
}

function preparedParentResolution(context, name, field, reasonCode) {
  return context.resolutions[name]?.migrationState === "prepared"
    ? prepared()
    : quarantine(field, reasonCode);
}

function preparedOptionalParentResolution(context, name, sourceKey, field, reasonCode) {
  return emptyReference(sourceKey)
    ? prepared()
    : preparedParentResolution(context, name, field, reasonCode);
}

function resolutionDepartmentMatch(context, name, departmentSourceKey, field, reasonCode) {
  return context.resolutions[name]?.departmentSourceKey === normalizeKey(departmentSourceKey)
    ? prepared()
    : quarantine(field, reasonCode);
}

function normalizeLegacyStockItemActive(value) {
  if (String(value).trim() === "0") return true;
  if (String(value).trim() === "1") return false;
  return null;
}

function normalizeLegacyFloor(value) {
  const text = normalizeText(value)
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
  if (text === "terreo") return 0;
  const named = new Map([
    ["primeiro andar", 1],
    ["segundo andar", 2],
    ["terceiro andar", 3],
  ]);
  if (named.has(text)) return named.get(text);
  const ordinal = text?.match(/^(\d+)\s*[º°o]\s*andar$/);
  return ordinal === null || ordinal === undefined ? null : Number(ordinal[1]);
}

function normalizeText(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function marketingEventName(value) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value;
}

function marketingEventNameKey(value) {
  return String(value ?? "")
    .replace(/ +$/u, "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\u{10000}-\u{10ffff}]/gu, "\uFFFD")
    .toLowerCase()
    .replace(/ß/g, "s");
}

function normalizeNullableText(value) {
  return normalizeText(value);
}

function triageUnmappedFunctionalValue(row) {
  const billing = String(row?.faturamento ?? "").trim();
  const delivery = String(row?.envio ?? "").trim();
  if (!["", "0"].includes(billing)) {
    return quarantine("faturamento", "TRIAGE_FUNCTIONAL_FIELD_UNMAPPABLE");
  }
  return delivery.length > 0
    ? quarantine("envio", "TRIAGE_FUNCTIONAL_FIELD_UNMAPPABLE")
    : prepared();
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

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
