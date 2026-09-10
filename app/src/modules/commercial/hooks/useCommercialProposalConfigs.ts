import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { commercialService } from "../services/commercialService";
import type {
  CreateCommercialProposalConfigPayload,
  UpdateCommercialProposalConfigPayload,
} from "../types";

export const COMMERCIAL_PROPOSAL_CONFIGS_QUERY_KEY = ["commercial", "proposal-configs"] as const;

export function useCommercialProposalConfigs() {
  return useFetch(COMMERCIAL_PROPOSAL_CONFIGS_QUERY_KEY, () => commercialService.listProposalConfigs());
}

export function useCreateCommercialProposalConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateCommercialProposalConfigPayload) =>
      commercialService.createProposalConfig(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COMMERCIAL_PROPOSAL_CONFIGS_QUERY_KEY }),
  });
}

export function useUpdateCommercialProposalConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCommercialProposalConfigPayload }) =>
      commercialService.updateProposalConfig(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COMMERCIAL_PROPOSAL_CONFIGS_QUERY_KEY }),
  });
}
