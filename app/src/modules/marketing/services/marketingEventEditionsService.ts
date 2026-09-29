import { api } from "@shared/services/apiClient";

import type { MarketingEventEnvelope } from "../types/marketingEvent";
import type {
  MarketingEventEdition,
  MarketingEventEditionFeedback,
  MarketingEventEditionPayload,
  MarketingEventEditionReport,
} from "../types/marketingEventEdition";

function unwrap<T>(envelope: MarketingEventEnvelope<T>): T {
  if (!envelope.success || envelope.data === undefined) {
    throw new Error(envelope.error || "A resposta de edições do Marketing é inválida.");
  }
  return envelope.data;
}

export const marketingEventEditionsService = {
  async list(eventId: string): Promise<MarketingEventEdition[]> {
    const response = await api.get<MarketingEventEnvelope<MarketingEventEdition[]>>(
      `/marketing/events/${eventId}/editions`,
    );
    return unwrap(response.data);
  },

  async create(eventId: string, payload: MarketingEventEditionPayload): Promise<MarketingEventEdition> {
    const response = await api.post<MarketingEventEnvelope<MarketingEventEdition>>(
      `/marketing/events/${eventId}/editions`, payload,
    );
    return unwrap(response.data);
  },

  async update(eventId: string, editionId: string, payload: MarketingEventEditionPayload): Promise<MarketingEventEdition> {
    const response = await api.put<MarketingEventEnvelope<MarketingEventEdition>>(
      `/marketing/events/${eventId}/editions/${editionId}`, payload,
    );
    return unwrap(response.data);
  },

  async createFeedback(
    eventId: string,
    editionId: string,
    payload: { rating: number; observation?: string },
  ): Promise<MarketingEventEditionFeedback> {
    const response = await api.post<MarketingEventEnvelope<MarketingEventEditionFeedback>>(
      `/marketing/events/${eventId}/editions/${editionId}/feedback`,
      payload,
    );
    return unwrap(response.data);
  },

  async getReport(eventId: string, editionId: string): Promise<MarketingEventEditionReport> {
    const response = await api.get<MarketingEventEnvelope<MarketingEventEditionReport>>(
      `/marketing/events/${eventId}/editions/${editionId}/report`,
    );
    return unwrap(response.data);
  },
};
