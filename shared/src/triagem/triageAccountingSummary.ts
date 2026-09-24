export const TRIAGE_ACCOUNTING_SUMMARY_VERSION = 1 as const;

export const TRIAGE_ACCOUNTING_STATUS_PRECEDENCE = [
  "URGENT_OPEN",
  "ROUTINE_PENDING",
  "BANK_PENDING",
  "COMPLETE",
  // Nenhum item de rotina ou extrato aplicável: não é o mesmo que concluída.
  "NO_APPLICABLE_ITEMS",
] as const;

export type TriageAccountingStatus = (typeof TRIAGE_ACCOUNTING_STATUS_PRECEDENCE)[number];

export interface TriageAccountingSummaryDto {
  version: typeof TRIAGE_ACCOUNTING_SUMMARY_VERSION;
  organization_id: string;
  client_id: string;
  legal_name: string;
  competence: string;
  status: TriageAccountingStatus;
}
