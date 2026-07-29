import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";

import { fiscalNcmService } from "../services";
import type {
  CreateFiscalNcmPayload,
  FiscalNcm,
  UpdateFiscalNcmPayload,
} from "../types";
import { FISCAL_QUERY_KEY } from "./queryKeys";

export function useCreateFiscalNcmMutation(): UseMutationResult<
  FiscalNcm,
  Error,
  CreateFiscalNcmPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => fiscalNcmService.create(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: FISCAL_QUERY_KEY });
    },
  });
}

export function useUpdateFiscalNcmMutation(): UseMutationResult<
  FiscalNcm,
  Error,
  UpdateFiscalNcmPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => fiscalNcmService.update(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: FISCAL_QUERY_KEY });
    },
  });
}

export function useDeleteFiscalNcmMutation(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => fiscalNcmService.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: FISCAL_QUERY_KEY });
    },
  });
}
