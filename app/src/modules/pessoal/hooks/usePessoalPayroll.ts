import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { pessoalService } from "../services/pessoalService";
import type { PessoalPayroll, PessoalPayrollPayload } from "../types/payroll";
import { pessoalQueryKey } from "./queryKeys";

function payrollKey(clientId: string) {
  return pessoalQueryKey("payroll", clientId || "missing");
}

export function usePessoalPayroll(
  clientId: string,
  enabled: boolean,
): UseQueryResult<PessoalPayroll | null, Error> {
  return useFetch(payrollKey(clientId), () => pessoalService.detailPayroll(clientId), {
    enabled: enabled && clientId.length > 0,
  });
}

export function useCreatePessoalPayrollMutation(): UseMutationResult<
  PessoalPayroll,
  Error,
  PessoalPayrollPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => pessoalService.createPayroll(payload),
    onSuccess: async (payroll) => {
      await queryClient.invalidateQueries({ queryKey: payrollKey(payroll.client_id) });
    },
  });
}

export function useUpdatePessoalPayrollMutation(
  clientId: string,
): UseMutationResult<PessoalPayroll, Error, PessoalPayrollPayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => pessoalService.updatePayroll(clientId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: payrollKey(clientId) });
    },
  });
}
