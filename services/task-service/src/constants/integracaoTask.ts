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

export type IntegracaoTaskStatus = (typeof INTEGRACAO_TASK_STATUS_VALUES)[number];
