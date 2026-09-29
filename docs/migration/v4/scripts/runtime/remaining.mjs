import { createRuntimeEntry } from "../lib/execution-registry.mjs";
import { CASTELO_ORGANIZATION_ID } from "../lib/mapping-contract.mjs";
import { createV2ClientIdentityResolver } from "../rules/admin-business.mjs";
import {
  buildCbsStockCategoryContexts,
  buildCbsStockContexts,
  buildCbsStockEntryContexts,
  buildCbsStockExitContexts,
  buildCbsStockLocationContexts,
  buildMarketingEventContexts,
  buildMarketingEventEditionContexts,
  buildMarketingEventEditionFeedbackContexts,
  buildMarketingPasswordContexts,
  buildMarketingSocialContexts,
  buildPecNoteContexts,
  buildTriageClientSlotContexts,
  buildWorkspaceCategoryContexts,
  buildWorkspaceMessageContexts,
  buildWorkspaceRequestContexts,
  projectMarketingEventEditionBudgetItem,
  projectRemainingRow,
  REMAINING_RULES,
  REMAINING_TRANSFORMERS,
} from "../rules/remaining.mjs";

const RUNTIME_KIND = "migration-v4-remaining";
const DIRECT_SOURCES = new Set(["tb_cbc.emails", "tb_cbs.estoque_inventario"]);
const ENTRIES_BY_SOURCE = new Map();

export { REMAINING_TRANSFORMERS };

export const REMAINING_EXECUTION_ENTRIES = Object.freeze(
  REMAINING_RULES.flatMap((rule) =>
    rule.destinations.map((step) => {
      const entry = createRemainingEntry({ rule, step });
      const entries = ENTRIES_BY_SOURCE.get(rule.sourceTable) ?? [];
      entries.push(entry);
      ENTRIES_BY_SOURCE.set(rule.sourceTable, entries);
      return entry;
    }),
  ),
);

export function buildRemainingRuntimeState(options = {}) {
  if (!isPlainObject(options)) throw new TypeError("options deve ser um objeto simples");
  const organizationId = options.organizationId ?? CASTELO_ORGANIZATION_ID;
  if (organizationId !== CASTELO_ORGANIZATION_ID) {
    throw new Error("Runtime Remaining exige o tenant Castelo");
  }

  const rowsBySource = normalizeSourceRows(options);
  const contextsBySource = buildContextIndexes(rowsBySource, options);
  const state = Object.freeze({
    runtimeKind: RUNTIME_KIND,
    organizationId,
    contextFor(sourceTable, row) {
      if (!ENTRIES_BY_SOURCE.has(sourceTable)) {
        throw new Error(`Origem Remaining desconhecida: ${String(sourceTable)}`);
      }
      if (!isPlainObject(row)) throw new TypeError("row deve ser um objeto simples");
      if (DIRECT_SOURCES.has(sourceTable)) return undefined;
      return contextsBySource.get(sourceTable)?.get(rowKey(row));
    },
    async *iterateRows(sourceTable, rows) {
      if (!isIterable(rows)) throw new TypeError("rows deve ser iterável");
      const entries = ENTRIES_BY_SOURCE.get(sourceTable);
      if (entries === undefined) {
        throw new Error(`Origem Remaining desconhecida: ${String(sourceTable)}`);
      }
      for await (const row of rows) {
        const context = state.contextFor(sourceTable, row);
        for (const entry of entries) {
          const emissions = entry
            .emitRows(row, state)
            .filter((emission) => emission.stepId === entry.stepId);
          for (const emission of emissions) {
            if (emission.status !== "prepared") {
              yield Object.freeze({
                sourceTable,
                stepId: entry.stepId,
                status: emission.status,
                ...(sourceTable === "tb_mkt.eventos_feedbacks" ||
                sourceTable === "tb_mkt.eventos_feedbacks_periodos"
                  ? { identityRef: emission.identityRef }
                  : {}),
                field: emission.field,
                reasonCode: emission.reasonCode,
              });
              continue;
            }
            yield Object.freeze({
              sourceTable,
              stepId: entry.stepId,
              status: "prepared",
              payload: entry.projector(emission, row, state),
              context,
            });
          }
        }
      }
    },
  });
  return state;
}

function createRemainingEntry({ rule, step }) {
  const runtimeRule = {
    ...rule,
    classifySourceRow(row, runtimeState) {
      return runtimeEmission(rule, row, runtimeState)[0];
    },
    emitRows(row, runtimeState) {
      return runtimeEmission(rule, row, runtimeState);
    },
  };
  return createRuntimeEntry({
    rule: runtimeRule,
    step,
    organizationId: CASTELO_ORGANIZATION_ID,
    contextRequirements: [...(step.dependencies ?? []).map((dependency) => `source:${dependency}`)],
    projector: (emission, row, runtimeState) =>
      projectRuntimePayload(rule, step, emission, row, runtimeState),
    cleanup: cleanupForStep(step),
    projectionKind: "custom_projector",
  });
}

function runtimeEmission(rule, row, runtimeState) {
  if (!isRemainingRuntimeState(runtimeState)) {
    return Object.freeze(
      rule.emitRows(row, undefined).map((emission) =>
        Object.freeze({
          ...emission,
          status: "quarantine",
          field: "runtime_state",
          reasonCode: "REMAINING_RUNTIME_STATE_INVALID",
        }),
      ),
    );
  }
  const emissions = rule.emitRows(row, runtimeState.contextFor(rule.sourceTable, row));
  if (rule.sourceTable === "tb_mkt.senhas") {
    return emissions.map((emission) =>
      emission.status === "prepared"
        ? Object.freeze({
            ...emission,
            status: "quarantine",
            field: "password",
            reasonCode: "MKT_PASSWORD_DESTINATION_ENCRYPTION_UNAVAILABLE",
          })
        : emission,
    );
  }
  return emissions;
}

function projectRuntimePayload(rule, step, emission, row, runtimeState) {
  if (emission?.status !== "prepared" || !isRemainingRuntimeState(runtimeState)) {
    throw new Error("REMAINING_PROJECTION_NOT_PREPARED");
  }
  if (
    rule.sourceTable === "tb_mkt.eventos_feedbacks_periodos" ||
    rule.sourceTable === "tb_mkt.eventos_feedbacks"
  ) {
    const plan = runtimeState.contextFor(rule.sourceTable, row)?.resolutions?.feedback?.importPlan;
    if (plan?.status !== "prepared") throw new Error("MKT_EDITION_FEEDBACK_PLAN_INVALID");
    if (plan.kind === "period") {
      return {
        id: plan.editionId,
        organization_id: plan.organizationId,
        feedback_period_start: plan.feedbackPeriodStart,
        feedback_period_end: plan.feedbackPeriodEnd,
      };
    }
    if (plan.kind === "evaluation") return plan.evaluation;
    throw new Error("MKT_EDITION_FEEDBACK_KIND_INVALID");
  }
  const audit = projectRemainingRow({
    sourceTable: rule.sourceTable,
    row,
    context: runtimeState.contextFor(rule.sourceTable, row),
  });
  if (audit.decision.status !== "prepared" || audit.payload === null) {
    throw new Error("REMAINING_PROJECTION_NOT_PREPARED");
  }
  if (step.stepId === "mkt-event-edition-budget-insert") {
    return projectMarketingEventEditionBudgetItem({
      row,
      context: runtimeState.contextFor(rule.sourceTable, row),
      identityRef: emission.identityRef,
    });
  }
  return audit.payload;
}

function isRemainingRuntimeState(value) {
  return (
    isPlainObject(value) &&
    value.runtimeKind === RUNTIME_KIND &&
    value.organizationId === CASTELO_ORGANIZATION_ID &&
    typeof value.contextFor === "function"
  );
}

function cleanupForStep(step) {
  if (step.mode === "insert") {
    return {
      kind: "delete_by_identity",
      identityColumns: ["id"],
      ownedColumns: [],
      resetValues: {},
    };
  }
  const ownedColumns = step.columns
    .filter(({ status, destinationColumn }) => status === "mapped" && destinationColumn !== "id")
    .map(({ destinationColumn }) => destinationColumn);
  return {
    kind: "reset_owned_columns",
    identityColumns: ["id"],
    ownedColumns,
    resetValues: Object.fromEntries(ownedColumns.map((column) => [column, null])),
  };
}

function buildContextIndexes(rowsBySource, options) {
  const contextsBySource = new Map();
  const orderedContextsBySource = new Map();
  const has = (sourceTable) => rowsBySource.has(sourceTable);
  const rows = (sourceTable) => rowsBySource.get(sourceTable) ?? [];
  const register = (sourceTable, contexts) => {
    const index = new Map();
    for (const [position, row] of rows(sourceTable).entries()) {
      const key = rowKey(row);
      if (index.has(key)) throw new Error(`Linha legada duplicada no runtime: ${sourceTable}`);
      index.set(key, contexts[position]);
    }
    contextsBySource.set(sourceTable, index);
    orderedContextsBySource.set(sourceTable, contexts);
  };

  const departments = rows("tb_admin.departamentos");
  const users = rows("tb_admin.usuarios");
  const categories = rows("tb_cbs.estoque_categorias");
  const locations = rows("tb_cbs.estoque_localizacoes");
  const stocks = rows("tb_cbs.estoque");
  const clientResolver = createV2ClientIdentityResolver({
    regularizeRows: rows("tb_regularize.clientes"),
    integrationRows: rows("tb_integracao.clientes"),
  });
  const marketingEventEditionResolutions = options.marketingEventEditionResolutions ?? new Map();
  if (
    !(marketingEventEditionResolutions instanceof Map) ||
    [...marketingEventEditionResolutions].some(
      ([digest, targetId]) =>
        !/^sha256:[a-f0-9]{64}$/.test(digest) ||
        typeof targetId !== "string" ||
        targetId.length === 0,
    )
  ) {
    throw new Error("MKT_EDITION_RESOLUTIONS_INVALID");
  }

  if (has("tb_cbs.estoque_categorias")) {
    register(
      "tb_cbs.estoque_categorias",
      buildCbsStockCategoryContexts({ rows: categories, departmentRows: departments }),
    );
  }
  if (has("tb_cbs.estoque_localizacoes")) {
    register(
      "tb_cbs.estoque_localizacoes",
      buildCbsStockLocationContexts({
        rows: locations,
        floorRows: rows("tb_cbs.estoque_andares"),
        departmentRows: departments,
      }),
    );
  }
  if (has("tb_cbs.estoque")) {
    register(
      "tb_cbs.estoque",
      buildCbsStockContexts({
        rows: stocks,
        departmentRows: departments,
        itemRows: rows("tb_cbs.estoque_itens"),
        categoryRows: categories,
        categoryContexts: orderedContextsBySource.get("tb_cbs.estoque_categorias") ?? [],
        categoryItemRows: rows("tb_cbs.estoque_categorias_itens"),
        locationRows: locations,
        locationContexts: orderedContextsBySource.get("tb_cbs.estoque_localizacoes") ?? [],
        floorRows: rows("tb_cbs.estoque_andares"),
      }),
    );
  }
  if (has("tb_cbs.estoque_entradas")) {
    register(
      "tb_cbs.estoque_entradas",
      buildCbsStockEntryContexts({
        rows: rows("tb_cbs.estoque_entradas"),
        stockRows: stocks,
        stockContexts: orderedContextsBySource.get("tb_cbs.estoque") ?? [],
        userRows: users,
      }),
    );
  }
  if (has("tb_cbs.estoque_saidas")) {
    register(
      "tb_cbs.estoque_saidas",
      buildCbsStockExitContexts({
        rows: rows("tb_cbs.estoque_saidas"),
        stockRows: stocks,
        stockContexts: orderedContextsBySource.get("tb_cbs.estoque") ?? [],
        userRows: users,
      }),
    );
  }
  if (has("tb_mkt.redes_sociais")) {
    register(
      "tb_mkt.redes_sociais",
      buildMarketingSocialContexts({ rows: rows("tb_mkt.redes_sociais"), clientResolver }),
    );
  }
  if (has("tb_mkt.eventos")) {
    register("tb_mkt.eventos", buildMarketingEventContexts({ rows: rows("tb_mkt.eventos") }));
  }
  if (has("tb_mkt.eventos_edicoes")) {
    register(
      "tb_mkt.eventos_edicoes",
      buildMarketingEventEditionContexts({
        rows: rows("tb_mkt.eventos_edicoes"),
        eventRows: rows("tb_mkt.eventos"),
        resolutions: marketingEventEditionResolutions,
      }),
    );
  }
  if (has("tb_mkt.eventos_feedbacks_periodos")) {
    register(
      "tb_mkt.eventos_feedbacks_periodos",
      buildMarketingEventEditionFeedbackContexts({
        sourceTable: "tb_mkt.eventos_feedbacks_periodos",
        rows: rows("tb_mkt.eventos_feedbacks_periodos"),
        editionRows: rows("tb_mkt.eventos_edicoes"),
        eventRows: rows("tb_mkt.eventos"),
        evaluationRows: rows("tb_mkt.eventos_feedbacks"),
        resolutions: marketingEventEditionResolutions,
      }),
    );
  }
  if (has("tb_mkt.eventos_feedbacks")) {
    register(
      "tb_mkt.eventos_feedbacks",
      buildMarketingEventEditionFeedbackContexts({
        sourceTable: "tb_mkt.eventos_feedbacks",
        rows: rows("tb_mkt.eventos_feedbacks"),
        editionRows: rows("tb_mkt.eventos_edicoes"),
        eventRows: rows("tb_mkt.eventos"),
        evaluationRows: rows("tb_mkt.eventos_feedbacks"),
        resolutions: marketingEventEditionResolutions,
      }),
    );
  }
  if (has("tb_mkt.senhas")) {
    register(
      "tb_mkt.senhas",
      buildMarketingPasswordContexts({
        rows: rows("tb_mkt.senhas"),
        encryptionConfigured: options.encryptionConfigured === true,
      }),
    );
  }
  if (has("tb_pec.notas")) {
    register(
      "tb_pec.notas",
      buildPecNoteContexts({ rows: rows("tb_pec.notas"), userRows: users, clientResolver }),
    );
  }
  if (has("tb_triagem.campos")) {
    register(
      "tb_triagem.campos",
      buildTriageClientSlotContexts({ rows: rows("tb_triagem.campos"), clientResolver }),
    );
  }
  if (has("tb_workspace.solicitacoes_categorias")) {
    register(
      "tb_workspace.solicitacoes_categorias",
      buildWorkspaceCategoryContexts({
        rows: rows("tb_workspace.solicitacoes_categorias"),
        departmentRows: departments,
      }),
    );
  }
  if (has("tb_workspace.solicitacoes")) {
    register(
      "tb_workspace.solicitacoes",
      buildWorkspaceRequestContexts({
        rows: rows("tb_workspace.solicitacoes"),
        userRows: users,
        departmentRows: departments,
        categoryRows: rows("tb_workspace.solicitacoes_categorias"),
        categoryContexts: orderedContextsBySource.get("tb_workspace.solicitacoes_categorias") ?? [],
      }),
    );
  }
  if (has("tb_workspace.solicitacoes_mensagens")) {
    register(
      "tb_workspace.solicitacoes_mensagens",
      buildWorkspaceMessageContexts({
        rows: rows("tb_workspace.solicitacoes_mensagens"),
        requestRows: rows("tb_workspace.solicitacoes"),
        requestContexts: orderedContextsBySource.get("tb_workspace.solicitacoes") ?? [],
        userRows: users,
      }),
    );
  }
  return contextsBySource;
}

function normalizeSourceRows(options) {
  const input = options.sourceRows ?? {};
  const entries = input instanceof Map ? [...input] : Object.entries(input);
  if (!isPlainObject(input) && !(input instanceof Map)) {
    throw new TypeError("sourceRows deve ser um objeto ou Map");
  }
  const rowsBySource = new Map(
    entries.map(([sourceTable, rows]) => [sourceTable, requireRows(rows, sourceTable)]),
  );
  if (!rowsBySource.has("tb_admin.usuarios") && options.users !== undefined) {
    rowsBySource.set("tb_admin.usuarios", requireRows(options.users, "users"));
  }
  if (!rowsBySource.has("tb_regularize.clientes") && options.clients !== undefined) {
    rowsBySource.set("tb_regularize.clientes", requireRows(options.clients, "clients"));
  }
  return rowsBySource;
}

function rowKey(row) {
  return JSON.stringify(
    Object.fromEntries(
      Object.keys(row)
        .sort()
        .map((key) => [key, row[key]]),
    ),
  );
}

function requireRows(value, field) {
  if (!Array.isArray(value) || value.some((row) => !isPlainObject(row))) {
    throw new TypeError(`${field} deve ser um array de objetos`);
  }
  return value.map((row) => ({ ...row }));
}

function isIterable(value) {
  return (
    value !== null &&
    value !== undefined &&
    (typeof value[Symbol.iterator] === "function" ||
      typeof value[Symbol.asyncIterator] === "function")
  );
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
