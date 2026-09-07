/**
 * Valores de `client.prospecting_status` usados no front (Comercial / DataTab) e no legado.
 * Quando `project-service` passar a ser a fonte da verdade, revisar esta lista.
 */
export const PROSPECTING_STATUS_VALUES = [
  "Análise Financeira",
  "Análise/Agendamento",
  "Envio de Proposta",
  "Paralisado",
  "Recusado pelo Cliente",
  "Fechado",
  "Baixada",
  "Inativo",
] as const;

export const PROSPECTING_STATUS_CLOSED = PROSPECTING_STATUS_VALUES[5];

export type ProspectingStatus = (typeof PROSPECTING_STATUS_VALUES)[number];
