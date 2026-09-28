import { api } from "@shared/services/apiClient";

import type {
  MarketingEvent,
  MarketingEventEnvelope,
  MarketingEventPayload,
} from "../types/marketingEvent";

function unwrap<T>(envelope: MarketingEventEnvelope<T>): T {
  if (!envelope.success || envelope.data === undefined) {
    throw new Error(envelope.error || "A resposta de eventos do Marketing é inválida.");
  }
  return envelope.data;
}

export const marketingEventsService = {
  async listEvents(): Promise<MarketingEvent[]> {
    const response = await api.get<MarketingEventEnvelope<MarketingEvent[]>>(
      "/marketing/events/list",
    );
    return unwrap(response.data);
  },

  async createEvent(payload: MarketingEventPayload): Promise<MarketingEvent> {
    const response = await api.post<MarketingEventEnvelope<MarketingEvent>>(
      "/marketing/events",
      payload,
    );
    return unwrap(response.data);
  },

  async updateEvent(id: string, payload: MarketingEventPayload): Promise<MarketingEvent> {
    const response = await api.put<MarketingEventEnvelope<MarketingEvent>>(
      `/marketing/events/${id}`,
      payload,
    );
    return unwrap(response.data);
  },
};
