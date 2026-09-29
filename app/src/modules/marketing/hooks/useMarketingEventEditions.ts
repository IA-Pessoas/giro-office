import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { marketingEventEditionsService } from "../services/marketingEventEditionsService";
import type { MarketingEventEditionPayload } from "../types/marketingEventEdition";

export const marketingEventEditionsQueryKey = (eventId: string) => ["marketing", "events", eventId, "editions"] as const;

export function useMarketingEventEditions(eventId: string, enabled: boolean) {
  return useFetch(marketingEventEditionsQueryKey(eventId), () => marketingEventEditionsService.list(eventId), { enabled });
}

export function useSaveMarketingEventEdition(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ editionId, payload }: { editionId?: string; payload: MarketingEventEditionPayload }) =>
      editionId
        ? marketingEventEditionsService.update(eventId, editionId, payload)
        : marketingEventEditionsService.create(eventId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: marketingEventEditionsQueryKey(eventId) }),
  });
}

export function useCreateMarketingEventEditionFeedback(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ editionId, rating, observation }: { editionId: string; rating: number; observation?: string }) =>
      marketingEventEditionsService.createFeedback(eventId, editionId, { rating, observation }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: marketingEventEditionsQueryKey(eventId) }),
  });
}

export function useMarketingEventEditionReport(
  eventId: string,
  editionId: string | null,
  enabled: boolean,
) {
  return useFetch(
    ["marketing", "events", eventId, "editions", editionId, "report"],
    () => {
      if (!editionId) throw new Error("Edição não selecionada.");
      return marketingEventEditionsService.getReport(eventId, editionId);
    },
    { enabled: enabled && Boolean(editionId) },
  );
}
