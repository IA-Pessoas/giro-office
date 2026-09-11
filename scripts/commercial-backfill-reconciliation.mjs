import { createHash } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_NAMESPACE = "giro-office:migration:v2:castelo-contabilidade";
export const PROSPECTING_STATUSES = new Set([
  "Análise Financeira",
  "Análise/Agendamento",
  "Envio de Proposta",
  "Paralisado",
  "Recusado pelo Cliente",
  "Fechado",
]);
export const COMMERCIAL_TASK_HIRING_STATUSES = new Set([
  "A Realizar",
  "Contratado",
  "Não Contratado",
]);

export function canonicalId(kind, legacyId, namespace = DEFAULT_NAMESPACE) {
  const namespaceBytes = createHash("sha1").update(String(namespace)).digest().subarray(0, 16);
  const valueBytes = createHash("sha1")
    .update(namespaceBytes)
    .update(`${kind}:${String(legacyId)}`)
    .digest()
    .subarray(0, 16);

  valueBytes[6] = (valueBytes[6] & 0x0f) | 0x50;
  valueBytes[8] = (valueBytes[8] & 0x3f) | 0x80;
  const hex = valueBytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}

export function buildCommercialBackfillPlan(input) {
  const context = validateInput(input);
  const { organizationId, cutoffAt, namespace, legacy, current } = context;
  const writes = cloneEmptyWrites();
  const quarantine = [];
  const legacyClients = new Map(legacy.clients.map((row) => [String(row.id), row]));
  const legacyTasks = new Map(legacy.tasks.map((row) => [String(row.id), row]));
  const currentClients = new Map(current.clients.map((row) => [String(row.id), row]));
  const currentProspecting = new Map(current.prospecting.map((row) => [String(row.id), row]));
  const currentTasks = new Map(current.tasks.map((row) => [String(row.id), row]));
  const currentProjects = new Map(current.projects.map((row) => [String(row.id), row]));
  const currentConfigs = new Map(current.proposalConfigs.map((row) => [String(row.id), row]));
  const currentTaskBillings = new Map(current.taskBillings.map((row) => [String(row.id), row]));
  const currentTaskBillingsByTask = new Map(
    current.taskBillings.map((row) => [orgScopedKey(row.organization_id, row.task_id), row]),
  );
  const currentProspectingByClient = new Map(
    current.prospecting.map((row) => [orgScopedKey(row.organization_id, row.client_id), row]),
  );
  const currentConfigsByName = new Map(
    current.proposalConfigs.map((row) => [orgScopedKey(row.organization_id, row.name), row]),
  );
  const reconciliation = {
    counts: {
      legacyProspecting: legacy.prospecting.length,
      legacyBilling: legacy.taskBillings.length,
      legacyProposalConfigs: legacy.proposalConfigs.length,
      currentProspecting: current.prospecting.length,
      currentBillingTasks: current.taskBillings.length,
      currentProposalConfigs: current.proposalConfigs.length,
    },
    links: {
      prospectingClient: { matched: 0, divergent: 0 },
      taskClient: { matched: 0, divergent: 0 },
      taskProject: { matched: 0, divergent: 0 },
    },
    projections: { matched: 0, divergent: 0 },
    fields: {
      prospecting: { matched: 0, divergent: 0 },
      billing: { matched: 0, divergent: 0 },
      proposalConfig: { matched: 0, divergent: 0 },
      billingProjection: { matched: 0, divergent: 0 },
    },
  };

  for (const row of legacy.prospecting) {
    const legacyId = scalarId(row.id);
    const clientLegacyId = scalarId(row.cliente_id);
    const status = text(row.status_prospeccao ?? row.status);
    const client = clientLegacyId ? legacyClients.get(clientLegacyId) : null;
    const clientId = clientLegacyId
      ? canonicalId("client", `integracao:${clientLegacyId}`, namespace)
      : null;

    if (!legacyId) {
      addQuarantine(
        quarantine,
        "tb_integracao.prospeccao_comercial",
        row,
        "PROSPECTING_ID_INVALID",
      );
      continue;
    }
    if (!PROSPECTING_STATUSES.has(status)) {
      addQuarantine(
        quarantine,
        "tb_integracao.prospeccao_comercial",
        row,
        "PROSPECTING_STATUS_UNSUPPORTED",
        "status_prospeccao",
      );
      continue;
    }
    if (!client || !clientId) {
      addQuarantine(
        quarantine,
        "tb_integracao.prospeccao_comercial",
        row,
        "PROSPECTING_CLIENT_REFERENCE_INVALID",
        "cliente_id",
      );
      continue;
    }

    const targetClient = currentClients.get(clientId);
    if (!targetClient) {
      addQuarantine(
        quarantine,
        "tb_integracao.prospeccao_comercial",
        row,
        "CLIENT_NOT_FOUND",
        "client_id",
      );
      continue;
    }
    if (targetClient.organization_id !== organizationId) {
      addQuarantine(
        quarantine,
        "tb_integracao.prospeccao_comercial",
        row,
        "CLIENT_TENANT_MISMATCH",
        "organization_id",
      );
      continue;
    }
    reconciliation.links.prospectingClient.matched += 1;

    const description = nullableText(row.description ?? row.solucao);
    const statusDate = normalizeDate(row.status_date ?? row.data_status);
    if (row.status_date !== undefined || row.data_status !== undefined) {
      const rawDate = row.status_date ?? row.data_status;
      if (rawDate !== null && rawDate !== undefined && !statusDate) {
        addQuarantine(
          quarantine,
          "tb_integracao.prospeccao_comercial",
          row,
          "PROSPECTING_DATE_INVALID",
          "data_status",
        );
        continue;
      }
    }

    reconcileClientProjection({
      client: targetClient,
      status,
      statusDate,
      description,
      row,
      quarantine,
      reconciliation,
    });

    const prospectingId = canonicalId("commercial-prospecting", legacyId, namespace);
    const target = currentProspecting.get(prospectingId);
    const existingForClient = currentProspectingByClient.get(
      orgScopedKey(organizationId, clientId),
    );
    if (existingForClient && existingForClient.id !== prospectingId) {
      addQuarantine(
        quarantine,
        "tb_integracao.prospeccao_comercial",
        row,
        "PROSPECTING_CLIENT_CONFLICT",
        "client_id",
      );
      continue;
    }

    const desired = {
      id: prospectingId,
      client_id: clientId,
      organization_id: organizationId,
      status,
      status_date: statusDate,
      description,
      registered_at: normalizeDate(row.registered_at ?? row.data_cadastro) ?? cutoffAt,
      updated_at: cutoffAt,
    };
    if (!target) {
      writes.prospecting.inserts.push(desired);
    } else if (target.organization_id !== organizationId) {
      addQuarantine(
        quarantine,
        "tb_integracao.prospeccao_comercial",
        row,
        "PROSPECTING_TENANT_MISMATCH",
        "organization_id",
      );
    } else if (sameProspecting(target, desired)) {
      reconciliation.fields.prospecting.matched += 1;
      // A segunda execução é um no-op.
    } else if (isAfterCutoff(target.updated_at, cutoffAt)) {
      reconciliation.fields.prospecting.divergent += 1;
      addQuarantine(
        quarantine,
        "tb_integracao.prospeccao_comercial",
        row,
        "POST_CUTOVER_PROSPECTING_PRESERVED",
        "updated_at",
      );
    } else {
      reconciliation.fields.prospecting.divergent += 1;
      writes.prospecting.updates.push(desired);
    }
  }

  for (const row of legacy.taskBillings) {
    const legacyId = scalarId(row.id ?? row.task_id);
    const taskLegacyId = scalarId(row.task_id ?? row.id);
    const taskId = taskLegacyId ? canonicalId("task", taskLegacyId, namespace) : null;
    const hiringStatus = text(row.hiring_status);
    const payment = nullableText(row.payment);
    const billingDescription = nullableText(row.billing_description);
    if (!legacyId) {
      addQuarantine(quarantine, "tb_integracao.cobrancas", row, "BILLING_ID_INVALID");
      continue;
    }
    if (!taskId) {
      addQuarantine(
        quarantine,
        "tb_integracao.cobrancas",
        row,
        "BILLING_TASK_ID_INVALID",
        "task_id",
      );
      continue;
    }
    if (!legacyTasks.has(taskLegacyId)) {
      addQuarantine(
        quarantine,
        "tb_integracao.cobrancas",
        row,
        "BILLING_TASK_REFERENCE_INVALID",
        "task_id",
      );
      continue;
    }
    if (!COMMERCIAL_TASK_HIRING_STATUSES.has(hiringStatus)) {
      addQuarantine(
        quarantine,
        "tb_integracao.cobrancas",
        row,
        "BILLING_HIRING_STATUS_UNSUPPORTED",
        "hiring_status",
      );
      continue;
    }
    const target = currentTasks.get(taskId);
    if (!target) {
      addQuarantine(quarantine, "tb_integracao.cobrancas", row, "TASK_NOT_FOUND", "task_id");
      continue;
    }
    if (target.organization_id !== organizationId) {
      addQuarantine(
        quarantine,
        "tb_integracao.cobrancas",
        row,
        "TASK_TENANT_MISMATCH",
        "organization_id",
      );
      continue;
    }
    if (!target.client_id || !currentClients.get(target.client_id)) {
      addQuarantine(
        quarantine,
        "tb_integracao.cobrancas",
        row,
        "TASK_CLIENT_REFERENCE_INVALID",
        "client_id",
      );
      continue;
    }
    const taskClient = currentClients.get(target.client_id);
    if (taskClient.organization_id !== organizationId) {
      addQuarantine(
        quarantine,
        "tb_integracao.cobrancas",
        row,
        "TASK_CLIENT_TENANT_MISMATCH",
        "client_id",
      );
      continue;
    }
    reconciliation.links.taskClient.matched += 1;

    const project = target.project_id ? currentProjects.get(target.project_id) : null;
    if (
      !project ||
      project.organization_id !== organizationId ||
      project.client_id !== target.client_id
    ) {
      reconciliation.links.taskProject.divergent += 1;
      addQuarantine(
        quarantine,
        "tb_integracao.cobrancas",
        row,
        "TASK_PROJECT_LINK_DIVERGENCE",
        "project_id",
      );
      continue;
    }
    reconciliation.links.taskProject.matched += 1;
    const billingId = canonicalId("commercial-task-billing", legacyId, namespace);
    const targetBilling =
      currentTaskBillings.get(billingId) ??
      currentTaskBillingsByTask.get(orgScopedKey(organizationId, taskId));
    const desiredBilling = {
      id: billingId,
      task_id: taskId,
      organization_id: organizationId,
      hiring_status: hiringStatus,
      payment,
      billing_description: billingDescription,
      created_at: normalizeDate(row.created_at) ?? cutoffAt,
      updated_at: cutoffAt,
    };
    if (!targetBilling) {
      writes.billing.inserts.push(desiredBilling);
    } else if (targetBilling.id !== billingId) {
      addQuarantine(quarantine, "commercial.task_billing", row, "BILLING_TASK_ID_CONFLICT", "id");
      continue;
    } else if (targetBilling.organization_id !== organizationId) {
      addQuarantine(
        quarantine,
        "commercial.task_billing",
        row,
        "BILLING_TENANT_MISMATCH",
        "organization_id",
      );
      continue;
    } else if (sameTaskBilling(targetBilling, desiredBilling)) {
      reconciliation.fields.billing.matched += 1;
    } else if (isAfterCutoff(targetBilling.updated_at, cutoffAt)) {
      reconciliation.fields.billing.divergent += 1;
      addQuarantine(
        quarantine,
        "commercial.task_billing",
        row,
        "POST_CUTOVER_BILLING_PRESERVED",
        "updated_at",
      );
    } else {
      reconciliation.fields.billing.divergent += 1;
      writes.billing.updates.push(desiredBilling);
    }

    const projection = taskBillingProjection(target, hiringStatus, payment, billingDescription);
    if (sameTaskProjection(target, projection)) {
      reconciliation.fields.billingProjection.matched += 1;
    } else if (isAfterCutoff(target.date_updated, cutoffAt)) {
      reconciliation.fields.billingProjection.divergent += 1;
      addQuarantine(
        quarantine,
        "integracao.tasks",
        row,
        "POST_CUTOVER_BILLING_PROJECTION_PRESERVED",
        "date_updated",
      );
    } else {
      reconciliation.fields.billingProjection.divergent += 1;
      writes.billing.projectionUpdates.push({
        id: taskId,
        organization_id: organizationId,
        ...projection,
        date_updated: cutoffAt,
      });
    }
  }

  for (const row of legacy.tasks) {
    if (row.cobranca === undefined && row.billing === undefined) continue;
    addQuarantine(
      quarantine,
      "tb_integracao.tarefas",
      row,
      "LEGACY_TASK_BILLING_FIELD_UNMAPPED",
      row.cobranca === undefined ? "billing" : "cobranca",
    );
  }

  for (const row of legacy.proposalConfigs) {
    const legacyId = scalarId(row.id);
    const name = text(row.name);
    const contractValue = Number(row.contract_value);
    if (!legacyId) {
      addQuarantine(quarantine, "proposal.config", row, "PROPOSAL_CONFIG_ID_INVALID");
      continue;
    }
    if (!name) {
      addQuarantine(quarantine, "proposal.config", row, "PROPOSAL_CONFIG_NAME_INVALID", "name");
      continue;
    }
    if (!Number.isFinite(contractValue) || contractValue < 0) {
      addQuarantine(
        quarantine,
        "proposal.config",
        row,
        "PROPOSAL_CONFIG_VALUE_INVALID",
        "contract_value",
      );
      continue;
    }
    const id = canonicalId("proposal-config", legacyId, namespace);
    const target = currentConfigs.get(id);
    const sameName = currentConfigsByName.get(orgScopedKey(organizationId, name));
    if (sameName && sameName.id !== id) {
      addQuarantine(quarantine, "proposal.config", row, "PROPOSAL_CONFIG_NAME_CONFLICT", "name");
      continue;
    }
    const desired = { id, name, contract_value: contractValue, organization_id: organizationId };
    if (!target) {
      writes.proposalConfigs.inserts.push(desired);
    } else if (target.organization_id !== organizationId) {
      addQuarantine(
        quarantine,
        "proposal.config",
        row,
        "PROPOSAL_CONFIG_TENANT_MISMATCH",
        "organization_id",
      );
    } else if (target.name !== name || Number(target.contract_value) !== contractValue) {
      reconciliation.fields.proposalConfig.divergent += 1;
      addQuarantine(
        quarantine,
        "proposal.config",
        row,
        "PROPOSAL_CONFIG_CONFLICT_PRESERVED",
        "contract_value",
      );
    } else {
      reconciliation.fields.proposalConfig.matched += 1;
    }
  }

  for (const source of legacy.unsupported) {
    const rows = Array.isArray(source.rows) ? source.rows : [];
    for (const [index, row] of rows.entries()) {
      addQuarantine(
        quarantine,
        source.sourceTable,
        row,
        "UNSUPPORTED_SOURCE_QUARANTINED",
        null,
        scalarId(row?.id) ?? `row-${index + 1}`,
      );
    }
  }

  return {
    schemaVersion: 1,
    mode: "commercial-backfill-validation",
    organizationId,
    cutoffAt,
    namespace,
    sourceDigest: digest({ legacy, current, organizationId, cutoffAt, namespace }),
    writes,
    quarantine,
    reconciliation,
    approval: {
      readyForCutover: quarantine.length === 0,
      blockers: quarantine.map(({ reason, sourceTable, legacyId }) => ({
        reason,
        sourceTable,
        legacyId,
      })),
    },
  };
}

export async function applyCommercialBackfillPlan(db, plan, approvedReport) {
  assertApprovedCommercialAuditReport(plan, approvedReport);
  const { organizationId, cutoffAt } = plan;
  for (const row of plan.writes.prospecting.inserts) {
    const result = await db.query(
      `INSERT INTO "commercial.prospecting"
        (id, client_id, organization_id, status, status_date, description, registered_at, updated_at)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8
       WHERE EXISTS (
         SELECT 1 FROM "clients" c WHERE c.id = $2 AND c.organization_id = $3
       )
       ON CONFLICT (id) DO NOTHING`,
      [
        row.id,
        row.client_id,
        organizationId,
        row.status,
        row.status_date,
        row.description,
        row.registered_at,
        cutoffAt,
      ],
    );
    await assertInsertResult(
      db,
      result,
      `SELECT 1 FROM "commercial.prospecting"
       WHERE id = $1 AND client_id = $2 AND organization_id = $3`,
      [row.id, row.client_id, organizationId],
      "prospecção comercial",
    );
  }
  for (const row of plan.writes.prospecting.updates) {
    const result = await db.query(
      `UPDATE "commercial.prospecting"
       SET client_id = $2, status = $3, status_date = $4, description = $5, updated_at = $6
       WHERE id = $1 AND organization_id = $7 AND updated_at <= $6
         AND EXISTS (
           SELECT 1 FROM "clients" c WHERE c.id = $2 AND c.organization_id = $7
         )`,
      [
        row.id,
        row.client_id,
        row.status,
        row.status_date,
        row.description,
        cutoffAt,
        organizationId,
      ],
    );
    assertSingleUpdate(result, "prospecção comercial");
  }
  for (const row of plan.writes.billing.inserts) {
    const result = await db.query(
      `INSERT INTO "commercial.task_billing"
        (id, task_id, organization_id, hiring_status, payment, billing_description, created_at, updated_at)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8
       WHERE EXISTS (
         SELECT 1 FROM "integracao.tasks" t
         WHERE t.id = $2 AND t.organization_id = $3
           AND EXISTS (
             SELECT 1 FROM "clients" c
             WHERE c.id = t.client_id AND c.organization_id = $3
           )
           AND EXISTS (
             SELECT 1 FROM "integracao.projects" p
             WHERE p.id = t.project_id AND p.organization_id = $3 AND p.client_id = t.client_id
           )
       )
       ON CONFLICT (task_id) DO NOTHING`,
      [
        row.id,
        row.task_id,
        organizationId,
        row.hiring_status,
        row.payment,
        row.billing_description,
        row.created_at,
        cutoffAt,
      ],
    );
    await assertInsertResult(
      db,
      result,
      `SELECT 1 FROM "commercial.task_billing"
       WHERE id = $1 AND task_id = $2 AND organization_id = $3`,
      [row.id, row.task_id, organizationId],
      "cobrança comercial",
    );
  }
  for (const row of plan.writes.billing.updates) {
    const result = await db.query(
      `UPDATE "commercial.task_billing"
       SET hiring_status = $3, payment = $4, billing_description = $5, updated_at = $6
       WHERE id = $1 AND organization_id = $2 AND updated_at <= $6
         AND EXISTS (
           SELECT 1
           FROM "commercial.task_billing" b
           JOIN "integracao.tasks" t ON t.id = b.task_id
           WHERE b.id = $1 AND t.organization_id = $2
             AND EXISTS (
               SELECT 1 FROM "clients" c
               WHERE c.id = t.client_id AND c.organization_id = $2
             )
             AND EXISTS (
               SELECT 1 FROM "integracao.projects" p
               WHERE p.id = t.project_id AND p.organization_id = $2 AND p.client_id = t.client_id
             )
         )`,
      [row.id, organizationId, row.hiring_status, row.payment, row.billing_description, cutoffAt],
    );
    assertSingleUpdate(result, "cobrança comercial");
  }
  for (const row of plan.writes.billing.projectionUpdates) {
    const result = await db.query(
      `UPDATE "integracao.tasks" AS t
       SET status = $3, charge_comercial = $4, charge_financeiro = $5,
           hiring_status = $6, payment = $7, billing_description = $8, date_updated = $9
       WHERE t.id = $1 AND t.organization_id = $2
         AND (t.date_updated IS NULL OR t.date_updated <= $9)
         AND EXISTS (
           SELECT 1 FROM "clients" c
           WHERE c.id = t.client_id AND c.organization_id = $2
         )
         AND EXISTS (
           SELECT 1 FROM "integracao.projects" p
           WHERE p.id = t.project_id AND p.organization_id = $2 AND p.client_id = t.client_id
         )`,
      [
        row.id,
        organizationId,
        row.status,
        row.charge_comercial,
        row.charge_financeiro,
        row.hiring_status,
        row.payment,
        row.billing_description,
        cutoffAt,
      ],
    );
    assertSingleUpdate(result, "projeção de cobrança na tarefa");
  }
  for (const row of plan.writes.proposalConfigs.inserts) {
    const result = await db.query(
      `INSERT INTO "proposal.config" (id, name, contract_value, organization_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [row.id, row.name, row.contract_value, organizationId],
    );
    await assertInsertResult(
      db,
      result,
      `SELECT 1 FROM "proposal.config"
       WHERE id = $1 AND name = $2 AND contract_value = $3 AND organization_id = $4`,
      [row.id, row.name, row.contract_value, organizationId],
      "configuração de proposta",
    );
  }
  return {
    prospecting: plan.writes.prospecting.inserts.length + plan.writes.prospecting.updates.length,
    billing: plan.writes.billing.updates.length,
    proposalConfigs: plan.writes.proposalConfigs.inserts.length,
  };
}

export function buildCommercialAuditReport(plan, appliedAt = null) {
  return {
    schemaVersion: plan.schemaVersion,
    mode: plan.mode,
    organizationId: plan.organizationId,
    cutoffAt: plan.cutoffAt,
    namespace: plan.namespace,
    sourceDigest: plan.sourceDigest,
    reconciliation: plan.reconciliation,
    counts: {
      prospectingInserts: plan.writes.prospecting.inserts.length,
      prospectingUpdates: plan.writes.prospecting.updates.length,
      billingInserts: plan.writes.billing.inserts.length,
      billingUpdates: plan.writes.billing.updates.length,
      billingProjectionUpdates: plan.writes.billing.projectionUpdates.length,
      proposalConfigInserts: plan.writes.proposalConfigs.inserts.length,
      quarantine: plan.quarantine.length,
    },
    quarantine: plan.quarantine,
    approval: plan.approval,
    appliedAt,
  };
}

export function assertApprovedCommercialAuditReport(plan, report) {
  if (!report || report.sourceDigest !== plan.sourceDigest) {
    throw new Error("O relatório prévio não corresponde ao digest do snapshot atual.");
  }
  if (report.organizationId !== plan.organizationId || report.cutoffAt !== plan.cutoffAt) {
    throw new Error("O relatório prévio não corresponde ao tenant ou corte atual.");
  }
  if (report.approval?.readyForCutover !== true || report.quarantine?.length !== 0) {
    throw new Error("O relatório prévio não está aprovado para o corte.");
  }
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const input = JSON.parse(await readFile(args.input, "utf8"));
  const plan = buildCommercialBackfillPlan(input);
  if (args.command === "validate") {
    const report = buildCommercialAuditReport(plan);
    await writeAuditReport(args.report, report);
    writeReportSummary(report, args.report);
    return;
  }
  if (!plan.approval.readyForCutover) {
    throw new Error("Validação prévia bloqueou o corte; consulte o relatório de quarentena.");
  }
  if (!args.approve) {
    throw new Error("O modo apply exige --approve-cutover após a validação prévia.");
  }
  if (!args.validatedReport) {
    throw new Error("O modo apply exige --validated-report gerado pelo modo validate.");
  }
  const validatedReport = JSON.parse(await readFile(args.validatedReport, "utf8"));
  assertApprovedCommercialAuditReport(plan, validatedReport);
  const databaseUrl = process.env.MIGRATION_DATABASE_URL;
  if (!databaseUrl) throw new Error("MIGRATION_DATABASE_URL não configurada.");
  const { Client } = await loadPg();
  const client = new Client(createDatabaseConfig(databaseUrl));
  await client.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await applyCommercialBackfillPlan(client, plan, validatedReport);
    await client.query("COMMIT");
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
  const report = buildCommercialAuditReport(plan, new Date().toISOString());
  await writeAuditReport(args.report, report);
  writeReportSummary(report, args.report);
}

async function writeAuditReport(filePath, report) {
  await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(filePath, 0o600);
}

function writeReportSummary(report, filePath) {
  process.stdout.write(
    `${JSON.stringify({
      mode: report.mode,
      reportPath: filePath,
      sourceDigest: report.sourceDigest,
      readyForCutover: report.approval.readyForCutover,
      quarantine: report.quarantine.length,
    })}\n`,
  );
}

function validateInput(input) {
  if (!input || typeof input !== "object") throw new TypeError("Entrada comercial inválida.");
  const organizationId = text(input.organizationId);
  const cutoffAt = normalizeDate(input.cutoffAt);
  if (!organizationId || !cutoffAt)
    throw new TypeError("organizationId e cutoffAt são obrigatórios.");
  const legacy = input.legacy ?? {};
  const current = input.current ?? {};
  return {
    organizationId,
    cutoffAt,
    namespace: text(input.namespace) || DEFAULT_NAMESPACE,
    current: {
      clients: array(current.clients),
      projects: array(current.projects),
      prospecting: array(current.prospecting),
      tasks: array(current.tasks),
      proposalConfigs: array(current.proposalConfigs),
      taskBillings: array(current.taskBillings),
    },
    legacy: {
      clients: array(legacy.clients),
      prospecting: array(legacy.prospecting),
      tasks: array(legacy.tasks),
      taskBillings: array(legacy.taskBillings),
      proposalConfigs: array(legacy.proposalConfigs),
      unsupported: array(legacy.unsupported),
    },
  };
}

function reconcileClientProjection({
  client,
  status,
  statusDate,
  description,
  row,
  quarantine,
  reconciliation,
}) {
  const matches =
    client.prospecting_status === status &&
    sameDate(client.date_status, statusDate) &&
    nullableText(client.description_prospecting) === description;
  if (matches) {
    reconciliation.projections.matched += 1;
    return;
  }
  reconciliation.projections.divergent += 1;
  addQuarantine(
    quarantine,
    "tb_integracao.prospeccao_comercial",
    row,
    "CLIENT_PROJECTION_DIVERGENCE",
    "prospecting_status",
  );
}

function sameProspecting(left, right) {
  return (
    left.client_id === right.client_id &&
    left.organization_id === right.organization_id &&
    left.status === right.status &&
    sameDate(left.status_date, right.status_date) &&
    nullableText(left.description) === right.description
  );
}

function addQuarantine(target, sourceTable, row, reason, field = null, forcedId = null) {
  target.push({
    sourceTable,
    legacyId: forcedId ?? scalarId(row?.id) ?? null,
    field,
    reason,
  });
}

function orgScopedKey(organizationId, value) {
  return JSON.stringify([organizationId, value]);
}

function assertSingleUpdate(result, label) {
  if (result?.rowCount !== 1) throw new Error(`Conflito de corte ao atualizar ${label}.`);
}

async function assertInsertResult(db, result, verificationSql, values, label) {
  if (result?.rowCount === 1) return;
  const verification = await db.query(verificationSql, values);
  if (verification?.rowCount !== 1) {
    throw new Error(`Conflito de identidade ou tenant ao inserir ${label}.`);
  }
}

function cloneEmptyWrites() {
  return {
    prospecting: { inserts: [], updates: [] },
    billing: { inserts: [], updates: [], projectionUpdates: [] },
    proposalConfigs: { inserts: [] },
  };
}

function sameTaskBilling(left, right) {
  return (
    left.task_id === right.task_id &&
    left.organization_id === right.organization_id &&
    left.hiring_status === right.hiring_status &&
    nullableText(left.payment) === right.payment &&
    nullableText(left.billing_description) === right.billing_description
  );
}

function taskBillingProjection(task, hiringStatus, payment, billingDescription) {
  if (hiringStatus === "Contratado") {
    return {
      status: "Em Andamento",
      charge_comercial: false,
      charge_financeiro: true,
      hiring_status: hiringStatus,
      payment,
      billing_description: billingDescription,
    };
  }
  if (hiringStatus === "Não Contratado") {
    return {
      status: "Não Contratado",
      charge_comercial: false,
      charge_financeiro: false,
      hiring_status: hiringStatus,
      payment,
      billing_description: billingDescription,
    };
  }
  return {
    status: task.status,
    charge_comercial: true,
    charge_financeiro: false,
    hiring_status: hiringStatus,
    payment,
    billing_description: billingDescription,
  };
}

function sameTaskProjection(left, right) {
  return (
    left.status === right.status &&
    left.charge_comercial === right.charge_comercial &&
    left.charge_financeiro === right.charge_financeiro &&
    nullableText(left.hiring_status) === right.hiring_status &&
    nullableText(left.payment) === right.payment &&
    nullableText(left.billing_description) === right.billing_description
  );
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function scalarId(value) {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result.length > 0 ? result : null;
}

function text(value) {
  return value === null || value === undefined ? "" : String(value).replace(/\s+/gu, " ").trim();
}

function nullableText(value) {
  const valueText = text(value);
  return valueText || null;
}

function normalizeDate(value) {
  if (value === null || value === undefined || text(value) === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sameDate(left, right) {
  return normalizeDate(left) === normalizeDate(right);
}

function isAfterCutoff(value, cutoffAt) {
  const date = normalizeDate(value);
  return date !== null && date > cutoffAt;
}

function digest(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function parseArgs(argv) {
  const args = {
    command: argv[0] || "validate",
    input: null,
    report: null,
    validatedReport: null,
    approve: false,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") args.input = argv[++index];
    else if (arg === "--report") args.report = argv[++index];
    else if (arg === "--validated-report") args.validatedReport = argv[++index];
    else if (arg === "--approve-cutover") args.approve = true;
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }
  if (!["validate", "apply"].includes(args.command)) throw new Error("Use validate ou apply.");
  if (!args.input || !args.report) throw new Error("--input e --report são obrigatórios.");
  return args;
}

function createDatabaseConfig(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("MIGRATION_DATABASE_URL inválida.");
  }
  const sslMode = parsed.searchParams.get("sslmode");
  if (sslMode !== "verify-full" && process.env.MIGRATION_DATABASE_SSL !== "true") {
    throw new Error(
      "MIGRATION_DATABASE_URL deve usar sslmode=verify-full ou MIGRATION_DATABASE_SSL=true.",
    );
  }
  const ca = process.env.MIGRATION_DATABASE_SSL_CA;
  return {
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
  };
}

async function loadPg() {
  const require = createRequire(import.meta.url);
  const infraRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "infra");
  const pgEntry = require.resolve("pg", { paths: [infraRoot] });
  return require(pgEntry);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
