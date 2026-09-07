/** Cobrança em `integracao.tasks.billing` (legado). */
export type TaskBilling = "Realizar" | "Não Realizar";

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

export type IntegracaoTaskStatus = (typeof INTEGRACAO_TASK_STATUS_VALUES)[number];

export const TASK_ASSIGNMENT_FILTER_VALUES = ["assigned", "unassigned"] as const;

export const TASK_ASSIGNMENT_FILTER = {
  ASSIGNED: TASK_ASSIGNMENT_FILTER_VALUES[0],
  UNASSIGNED: TASK_ASSIGNMENT_FILTER_VALUES[1],
} as const;

export type TaskAssignmentFilter = (typeof TASK_ASSIGNMENT_FILTER_VALUES)[number];
