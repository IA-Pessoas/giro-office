// Histórico do Controle Contábil: lido da auditoria (`audit_requests`), que guarda cada
// alteração com valor anterior e novo e não tem prazo de retenção. Usado pelo serviço
// Node e pelo Worker.

export const CONTROL_HISTORY_FIELDS = [
  "regenerate_accounting_entries",
  "check_summary_by_accumulator",
  "post_accounting_transaction",
  "import_bank_statements",
  "reconcile_bank_statements",
  "reconcile_vendors",
  "integrate_taxes",
  "settle_federal_taxes_via_ecac",
  "settle_state_taxes_via_sefaz_ba",
  "integrate_payroll",
  "suspense_accounts",
  "check_overdrawn_accounts",
  "general_account_reconciliation",
  "check_loan_and_interest_accounts",
  "monthly_closing",
  "reconcile_icms_pis_cofins",
  "depreciation",
  "notes",
] as const;

// Quem grava (updateField e completeAll, Node e Worker) usa estas constantes; o histórico
// filtra por elas. Mudar o texto aqui muda os dois lados juntos.
export const CONTROL_AUDIT_REFERRING = "contabil.control";
export const CONTROL_AUDIT_ACTIONS = {
  updateField: "Atualização",
  completeAll: "Concluir todos os itens do controle contábil",
} as const;

type AuditRow = {
  id: string;
  user_id: string | null;
  created_at: Date;
  action: string | null;
  changes_json: unknown;
};

export type ControlHistoryPrisma = {
  controlContabil: { findFirst(args: unknown): Promise<{ id: string } | null> };
  auditRequest: {
    findMany(args: unknown): Promise<AuditRow[]>;
    count(args: unknown): Promise<number>;
  };
  user: { findMany(args: unknown): Promise<Array<{ id: string; name: string }>> };
};

export type ControlHistoryInput = {
  organizationId: string;
  clientId: string;
  competence: string;
  page: number;
  pageSize: number;
};

function fieldChanges(changes: unknown) {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return [];
  const record = changes as Record<string, { from?: unknown; to?: unknown } | undefined>;
  return CONTROL_HISTORY_FIELDS.filter((field) => record[field]).map((field) => ({
    field,
    from: record[field]?.from ?? null,
    to: record[field]?.to ?? null,
  }));
}

export async function listControlHistory(prisma: ControlHistoryPrisma, input: ControlHistoryInput) {
  const base = {
    client_id: input.clientId,
    competence: input.competence,
    page: input.page,
    pageSize: input.pageSize,
  };
  const control = await prisma.controlContabil.findFirst({
    where: {
      organization_id: input.organizationId,
      client_id: input.clientId,
      competence: input.competence,
    },
    select: { id: true },
  });
  if (!control) return { ...base, total: 0, items: [] };

  const where = {
    organization_id: input.organizationId,
    referring: CONTROL_AUDIT_REFERRING,
    referring_id: control.id,
    action: { in: Object.values(CONTROL_AUDIT_ACTIONS) },
    // logUpdateIfChanged grava `{}` quando nada mudou (mesmo valor, tudo já concluído).
    NOT: { changes_json: { equals: {} } },
  };
  const [rows, total] = await Promise.all([
    prisma.auditRequest.findMany({
      where,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: { id: true, user_id: true, created_at: true, action: true, changes_json: true },
    }),
    prisma.auditRequest.count({ where }),
  ]);

  const userIds = [...new Set(rows.map((row) => row.user_id).filter((id): id is string => !!id))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : [];
  const names = new Map(users.map((user) => [user.id, user.name]));

  return {
    ...base,
    total,
    items: rows.map((row) => ({
      id: row.id,
      at: new Date(row.created_at).toISOString(),
      actor: row.user_id ? { id: row.user_id, name: names.get(row.user_id) ?? null } : null,
      action: row.action,
      changes: fieldChanges(row.changes_json),
    })),
  };
}
