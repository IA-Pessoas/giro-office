import { COMMERCIAL_TASK_HIRING_STATUSES } from "@workspace/shared";

/** Cobrança em `integracao.tasks.billing` (legado). */
export const TASK_BILLING_VALUES = ["Realizar", "Não Realizar"] as const;
export const TASK_BILLING_REALIZE = TASK_BILLING_VALUES[0];
export const TASK_BILLING_NOT_REALIZE = TASK_BILLING_VALUES[1];
export const TASK_HIRING_STATUS_CONTRACTED = COMMERCIAL_TASK_HIRING_STATUSES[1];

export type TaskBilling = (typeof TASK_BILLING_VALUES)[number];

/**
 * Status possíveis em `integracao.tasks.status` (alinhado ao legado `TaskService` / front).
 */
export const INTEGRACAO_TASK_STATUS_VALUES = [
  "Em Andamento",
  "Paralisado",
  "Concluída",
  "Não Contratado",
  "A Realizar",
  "Em Espera",
  "Pendente",
  "PEC",
  "APEC",
] as const;

export const INTEGRACAO_TASK_STATUS_TODO = INTEGRACAO_TASK_STATUS_VALUES[4];
export const INTEGRACAO_TASK_STATUS_WAITING = INTEGRACAO_TASK_STATUS_VALUES[5];
export const INTEGRACAO_TASK_STATUS_IN_PROGRESS = INTEGRACAO_TASK_STATUS_VALUES[0];

export type IntegracaoTaskStatus = (typeof INTEGRACAO_TASK_STATUS_VALUES)[number];

export const TASK_ASSIGNMENT_FILTER_VALUES = ["assigned", "unassigned"] as const;

export const TASK_ASSIGNMENT_FILTER = {
  ASSIGNED: TASK_ASSIGNMENT_FILTER_VALUES[0],
  UNASSIGNED: TASK_ASSIGNMENT_FILTER_VALUES[1],
} as const;

export type TaskAssignmentFilter = (typeof TASK_ASSIGNMENT_FILTER_VALUES)[number];
