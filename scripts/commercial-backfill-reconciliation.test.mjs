import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyCommercialBackfillPlan,
  assertApprovedCommercialAuditReport,
  buildCommercialAuditReport,
  buildCommercialBackfillPlan,
  canonicalId,
} from "./commercial-backfill-reconciliation.mjs";

const ORGANIZATION_ID = "org-commercial";
const NAMESPACE = "giro-office:migration:v2:castelo-contabilidade";
const CUTOFF = "2026-09-10T12:00:00.000Z";

function fixture(overrides = {}) {
  const clientId = canonicalId("client", "integracao:10", NAMESPACE);
  const taskId = canonicalId("task", "30", NAMESPACE);
  const projectId = canonicalId("project", "20", NAMESPACE);

  return {
    organizationId: ORGANIZATION_ID,
    cutoffAt: CUTOFF,
    namespace: NAMESPACE,
    legacy: {
      clients: [{ id: 10 }],
      prospecting: [
        {
          id: 20,
          cliente_id: 10,
          status_prospeccao: "Fechado",
          data_status: "2026-09-01T00:00:00.000Z",
          solucao: "Plano anual",
        },
      ],
      tasks: [{ id: 30, cliente_id: 10 }],
      taskBillings: [
        {
          id: 30,
          task_id: 30,
          hiring_status: "A Realizar",
          payment: null,
          billing_description: "Contrato em análise",
        },
      ],
      proposalConfigs: [{ id: 40, name: "Plano anual", contract_value: 1500 }],
      unsupported: [],
    },
    current: {
      clients: [
        {
          id: clientId,
          organization_id: ORGANIZATION_ID,
          prospecting_status: "Fechado",
          date_status: "2026-09-01T00:00:00.000Z",
          description_prospecting: "Plano anual",
        },
      ],
      projects: [{ id: projectId, organization_id: ORGANIZATION_ID, client_id: clientId }],
      prospecting: [],
      tasks: [
        {
          id: taskId,
          organization_id: ORGANIZATION_ID,
          client_id: clientId,
          project_id: projectId,
          billing: "Realizar",
          status: "A Realizar",
          charge_comercial: false,
          charge_financeiro: false,
          hiring_status: null,
          payment: null,
          billing_description: null,
          date_updated: "2026-09-01T00:00:00.000Z",
        },
      ],
      taskBillings: [],
      proposalConfigs: [],
    },
    ...overrides,
  };
}

test("gera backfill válido para prospecção, cobrança e catálogo mínimo", () => {
  const plan = buildCommercialBackfillPlan(fixture());

  assert.equal(plan.approval.readyForCutover, true);
  assert.equal(plan.writes.prospecting.inserts.length, 1);
  assert.equal(plan.writes.billing.inserts.length, 1);
  assert.equal(plan.writes.billing.projectionUpdates.length, 1);
  assert.equal(plan.writes.proposalConfigs.inserts.length, 1);
  assert.equal(plan.reconciliation.links.prospectingClient.matched, 1);
  assert.equal(plan.reconciliation.links.taskClient.matched, 1);
  assert.equal(plan.reconciliation.projections.matched, 1);
  assert.deepEqual(plan.reconciliation.fields, {
    prospecting: { matched: 0, divergent: 0 },
    billing: { matched: 0, divergent: 0 },
    billingProjection: { matched: 0, divergent: 1 },
    proposalConfig: { matched: 0, divergent: 0 },
  });
  assert.deepEqual(plan.quarantine, []);
});

test("fixture versionada produz evidência pronta para aprovação", async () => {
  const input = JSON.parse(
    await readFile(
      new URL("./fixtures/commercial-backfill/valid-input.json", import.meta.url),
      "utf8",
    ),
  );
  const plan = buildCommercialBackfillPlan(input);

  assert.equal(plan.approval.readyForCutover, true);
  assert.equal(plan.writes.prospecting.inserts.length, 1);
  assert.equal(plan.writes.billing.inserts.length, 1);
  assert.equal(plan.writes.billing.projectionUpdates.length, 1);
  assert.equal(plan.writes.proposalConfigs.inserts.length, 1);
});

test("fixture inválida mantém status e fontes auxiliares em quarentena", async () => {
  const input = JSON.parse(
    await readFile(
      new URL("./fixtures/commercial-backfill/invalid-input.json", import.meta.url),
      "utf8",
    ),
  );
  const plan = buildCommercialBackfillPlan(input);

  assert.equal(plan.approval.readyForCutover, false);
  assert.deepEqual(
    plan.quarantine.map((item) => item.reason),
    [
      "PROSPECTING_STATUS_UNSUPPORTED",
      "BILLING_HIRING_STATUS_UNSUPPORTED",
      "UNSUPPORTED_SOURCE_QUARANTINED",
    ],
  );
});

test("é idempotente quando o estado atual já contém o backfill", () => {
  const initial = fixture();
  const first = buildCommercialBackfillPlan(initial);
  const second = buildCommercialBackfillPlan({
    ...initial,
    current: {
      ...initial.current,
      prospecting: [first.writes.prospecting.inserts[0]],
      tasks: [
        {
          ...initial.current.tasks[0],
          ...first.writes.billing.projectionUpdates[0],
          date_updated: CUTOFF,
        },
      ],
      taskBillings: [first.writes.billing.inserts[0]],
      proposalConfigs: [first.writes.proposalConfigs.inserts[0]],
    },
  });

  assert.equal(second.approval.readyForCutover, true);
  assert.deepEqual(second.writes, {
    prospecting: { inserts: [], updates: [] },
    billing: { inserts: [], updates: [], projectionUpdates: [] },
    proposalConfigs: { inserts: [] },
  });
  assert.deepEqual(second.reconciliation.fields, {
    prospecting: { matched: 1, divergent: 0 },
    billing: { matched: 1, divergent: 0 },
    billingProjection: { matched: 1, divergent: 0 },
    proposalConfig: { matched: 1, divergent: 0 },
  });
});

test("quarentena divergências pós-corte e não sobrescreve decisões comerciais", () => {
  const base = fixture();
  const plan = buildCommercialBackfillPlan({
    ...base,
    current: {
      ...base.current,
      prospecting: [
        {
          ...base.legacy.prospecting[0],
          id: canonicalId("commercial-prospecting", "20", NAMESPACE),
          client_id: canonicalId("client", "integracao:10", NAMESPACE),
          organization_id: ORGANIZATION_ID,
          status: "Paralisado",
          updated_at: "2026-09-10T13:00:00.000Z",
        },
      ],
      tasks: [
        {
          ...base.current.tasks[0],
          status: "A Realizar",
          date_updated: "2026-09-10T13:00:00.000Z",
        },
      ],
      taskBillings: [
        {
          ...base.legacy.taskBillings[0],
          id: canonicalId("commercial-task-billing", "30", NAMESPACE),
          task_id: canonicalId("task", "30", NAMESPACE),
          organization_id: ORGANIZATION_ID,
          hiring_status: "Contratado",
          payment: "50%",
          billing_description: "Decisão posterior",
          updated_at: "2026-09-10T13:00:00.000Z",
        },
      ],
      proposalConfigs: [
        {
          id: canonicalId("proposal-config", "40", NAMESPACE),
          organization_id: ORGANIZATION_ID,
          name: "Plano anual",
          contract_value: 1700,
        },
      ],
    },
  });

  assert.equal(plan.writes.prospecting.updates.length, 0);
  assert.equal(plan.writes.billing.inserts.length, 0);
  assert.equal(plan.writes.billing.updates.length, 0);
  assert.equal(plan.writes.billing.projectionUpdates.length, 0);
  assert.equal(plan.writes.proposalConfigs.inserts.length, 0);
  assert.deepEqual(
    plan.quarantine.map((item) => item.reason),
    [
      "POST_CUTOVER_PROSPECTING_PRESERVED",
      "POST_CUTOVER_BILLING_PRESERVED",
      "POST_CUTOVER_BILLING_PROJECTION_PRESERVED",
      "PROPOSAL_CONFIG_CONFLICT_PRESERVED",
    ],
  );
  assert.equal(plan.approval.readyForCutover, false);
  assert.deepEqual(plan.reconciliation.fields, {
    prospecting: { matched: 0, divergent: 1 },
    billing: { matched: 0, divergent: 1 },
    billingProjection: { matched: 0, divergent: 1 },
    proposalConfig: { matched: 0, divergent: 1 },
  });
});

test("isola a organização e não fabrica destino para dados auxiliares", () => {
  const base = fixture();
  const plan = buildCommercialBackfillPlan({
    ...base,
    legacy: {
      ...base.legacy,
      unsupported: [{ sourceTable: "tb_comercial.cobrancas_descricao", rows: [{ id: 99 }] }],
      prospecting: [{ ...base.legacy.prospecting[0], status_prospeccao: "Fechado" }],
    },
    current: {
      ...base.current,
      clients: [{ ...base.current.clients[0], organization_id: "other-org" }],
    },
  });

  assert.equal(plan.writes.prospecting.inserts.length, 0);
  assert.equal(plan.writes.billing.inserts.length, 0);
  assert.equal(plan.writes.billing.updates.length, 0);
  assert.equal(plan.writes.proposalConfigs.inserts.length, 1);
  assert.deepEqual(
    plan.quarantine.map((item) => item.reason),
    ["CLIENT_TENANT_MISMATCH", "TASK_CLIENT_TENANT_MISMATCH", "UNSUPPORTED_SOURCE_QUARANTINED"],
  );
  assert.equal(plan.quarantine[2].legacyId, "99");
  assert.equal("row" in plan.quarantine[2], false);
});

test("coloca status legado sem equivalente em quarentena", () => {
  const base = fixture();
  const plan = buildCommercialBackfillPlan({
    ...base,
    legacy: {
      ...base.legacy,
      prospecting: [{ ...base.legacy.prospecting[0], status_prospeccao: "Aberto" }],
    },
  });

  assert.equal(plan.writes.prospecting.inserts.length, 0);
  assert.equal(plan.quarantine[0].reason, "PROSPECTING_STATUS_UNSUPPORTED");
  assert.equal(plan.approval.readyForCutover, false);
});

test("não inventa equivalência para cobrança textual legada", () => {
  const base = fixture();
  const plan = buildCommercialBackfillPlan({
    ...base,
    legacy: {
      ...base.legacy,
      tasks: [{ id: 30, cliente_id: 10, cobranca: "Realizar" }],
    },
  });

  assert.equal(plan.approval.readyForCutover, false);
  assert.equal(plan.quarantine[0].reason, "LEGACY_TASK_BILLING_FIELD_UNMAPPED");
  assert.equal(plan.quarantine[0].field, "cobranca");
  assert.equal("row" in plan.quarantine[0], false);
});

test("aplica somente operações parametrizadas e tenant-scoped", async () => {
  const plan = buildCommercialBackfillPlan(fixture());
  const report = buildCommercialAuditReport(plan);
  const calls = [];
  await applyCommercialBackfillPlan(
    {
      async query(text, values) {
        calls.push({ text, values });
        return { rowCount: 1 };
      },
    },
    plan,
    report,
  );

  assert.equal(calls.length, 4);
  assert.ok(calls.every(({ text }) => text.includes("organization_id")));
  assert.ok(calls.every(({ values }) => values.includes(ORGANIZATION_ID)));
  assert.ok(calls.every(({ text }) => !text.includes(ORGANIZATION_ID)));
});

test("exige relatório prévio aprovado para liberar o corte", () => {
  const plan = buildCommercialBackfillPlan(fixture());
  const report = buildCommercialAuditReport(plan);

  assert.doesNotThrow(() => assertApprovedCommercialAuditReport(plan, report));
  assert.throws(
    () =>
      assertApprovedCommercialAuditReport(plan, {
        ...report,
        sourceDigest: "digest-divergente",
      }),
    /digest/i,
  );
  assert.throws(
    () =>
      assertApprovedCommercialAuditReport(plan, {
        ...report,
        approval: { readyForCutover: false, blockers: [{ reason: "manual" }] },
      }),
    /aprovado/i,
  );
});
