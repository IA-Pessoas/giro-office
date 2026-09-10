export const COMMERCIAL_TASK_BILLING_UPDATED_EVENT = "commercial.task_billing.updated" as const;

export const COMMERCIAL_TASK_BILLING_EVENT_VERSION = 1 as const;

export const COMMERCIAL_TASK_HIRING_STATUSES = [
  "A Realizar",
  "Contratado",
  "Não Contratado",
] as const;

export type CommercialTaskHiringStatus = (typeof COMMERCIAL_TASK_HIRING_STATUSES)[number];

export interface CommercialTaskBillingUpdatedEvent {
  event_id: string;
  event_type: typeof COMMERCIAL_TASK_BILLING_UPDATED_EVENT;
  event_version: typeof COMMERCIAL_TASK_BILLING_EVENT_VERSION;
  organization_id: string;
  task_id: string;
  hiring_status: CommercialTaskHiringStatus;
  payment: string | null;
  billing_description: string | null;
  audit_correlation_id: string;
  occurred_at: string;
}

export interface CommercialTaskBillingProjectionResult {
  event_id: string;
  applied: boolean;
  duplicate: boolean;
  task_id: string;
}
