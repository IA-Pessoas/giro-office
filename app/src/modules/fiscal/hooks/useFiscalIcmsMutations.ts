import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";

import { fiscalIcmsService } from "../services";
import type {
  CreateFiscalIcmsPayload,
  FiscalIcms,
  UpdateFiscalIcmsPayload,
} from "../types";
import { FISCAL_QUERY_KEY } from "./queryKeys";

export function useCreateFiscalIcmsMutation(): UseMutationResult<
  FiscalIcms,
  Error,
  CreateFiscalIcmsPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => fiscalIcmsService.create(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: FISCAL_QUERY_KEY });
    },
  });
}

export function useUpdateFiscalIcmsMutation(): UseMutationResult<
  FiscalIcms,
  Error,
  UpdateFiscalIcmsPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => fiscalIcmsService.update(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: FISCAL_QUERY_KEY });
    },
  });
}

export function useDeleteFiscalIcmsMutation(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => fiscalIcmsService.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: FISCAL_QUERY_KEY });
    },
  });
}
