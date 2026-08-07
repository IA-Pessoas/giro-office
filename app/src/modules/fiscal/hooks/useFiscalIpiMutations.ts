import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";

import { fiscalIpiService } from "../services";
import type {
  CreateFiscalIpiPayload,
  FiscalIpi,
  UpdateFiscalIpiPayload,
} from "../types";
import { FISCAL_QUERY_KEY } from "./queryKeys";

export function useCreateFiscalIpiMutation(): UseMutationResult<
  FiscalIpi,
  Error,
  CreateFiscalIpiPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => fiscalIpiService.create(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: FISCAL_QUERY_KEY });
    },
  });
}

export function useUpdateFiscalIpiMutation(): UseMutationResult<
  FiscalIpi,
  Error,
  UpdateFiscalIpiPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => fiscalIpiService.update(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: FISCAL_QUERY_KEY });
    },
  });
}

export function useDeleteFiscalIpiMutation(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => fiscalIpiService.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: FISCAL_QUERY_KEY });
    },
  });
}
