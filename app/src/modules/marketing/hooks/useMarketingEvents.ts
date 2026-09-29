import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { marketingEventsService } from "../services/marketingEventsService";
import type {
  CreateMarketingEventPayload,
  MarketingEventPayload,
} from "../types/marketingEvent";

export const marketingEventsQueryKey = ["marketing", "events"] as const;

export function useMarketingEvents() {
  return useFetch(marketingEventsQueryKey, () => marketingEventsService.listEvents());
}

export function useCreateMarketingEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateMarketingEventPayload) => marketingEventsService.createEvent(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: marketingEventsQueryKey }),
  });
}

export function useUpdateMarketingEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: MarketingEventPayload }) =>
      marketingEventsService.updateEvent(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: marketingEventsQueryKey }),
  });
}
