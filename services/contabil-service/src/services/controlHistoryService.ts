// Histórico do Controle Contábil (#1722).
import { AUDIT_UPDATE_ACTION } from "./auditActions.js";
import {
  type AuditHistoryPage,
  type AuditHistoryPrisma,
  listAuditFieldHistory,
} from "./auditHistoryService.js";

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
  updateField: AUDIT_UPDATE_ACTION,
  completeAll: "Concluir todos os itens do controle contábil",
} as const;

export type ControlHistoryPrisma = AuditHistoryPrisma & {
  controlContabil: { findFirst(args: unknown): Promise<{ id: string } | null> };
};

export type ControlHistoryInput = AuditHistoryPage & {
  organizationId: string;
  clientId: string;
  competence: string;
};

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

  return {
    ...base,
    ...(await listAuditFieldHistory(prisma, {
      organizationId: input.organizationId,
      referring: CONTROL_AUDIT_REFERRING,
      referringId: control.id,
      actions: Object.values(CONTROL_AUDIT_ACTIONS),
      fields: CONTROL_HISTORY_FIELDS,
      page: input.page,
      pageSize: input.pageSize,
    })),
  };
}
