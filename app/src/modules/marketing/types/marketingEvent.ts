export const MARKETING_EVENT_STATUSES = [
  "Novo",
  "Em andamento",
  "Concluído",
  "Descontinuado",
] as const;

export const MARKETING_EVENT_PRIORITIES = ["Baixa", "Média", "Alta"] as const;

export type MarketingEventStatus = (typeof MARKETING_EVENT_STATUSES)[number];
export type MarketingEventPriority = (typeof MARKETING_EVENT_PRIORITIES)[number];

export interface MarketingEvent {
  id: string;
  name: string;
  logo: string;
  status: MarketingEventStatus;
  priority: MarketingEventPriority;
  objective: string;
  audience: string;
}

export interface MarketingEventPayload {
  name: string;
  logo: string;
  status: MarketingEventStatus;
  priority: MarketingEventPriority;
  objective: string;
  audience: string;
}

export interface MarketingEventEnvelope<T> {
  success: boolean;
  data: T;
  error?: string;
}
