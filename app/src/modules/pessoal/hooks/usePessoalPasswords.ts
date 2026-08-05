import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { pessoalService } from "../services/pessoalService";
import type {
  PessoalPasswordDetail,
  PessoalPasswordListItem,
  PessoalPasswordPayload,
  PessoalPasswordUpdatePayload,
} from "../types/passwords";
import { pessoalQueryKey } from "./queryKeys";

function passwordsKey(clientId: string) {
  return pessoalQueryKey("passwords", clientId || "missing");
}

function passwordDetailKey(id: string) {
  return pessoalQueryKey("passwords", "detail", id || "missing");
}

export function usePessoalPasswords(
  clientId: string,
  enabled: boolean,
): UseQueryResult<PessoalPasswordListItem[], Error> {
  return useFetch(passwordsKey(clientId), () => pessoalService.listPasswords(clientId), {
    enabled: enabled && clientId.length > 0,
  });
}

export function usePessoalPasswordDetail(
  id: string,
  enabled: boolean,
): UseQueryResult<PessoalPasswordDetail, Error> {
  return useFetch(passwordDetailKey(id), () => pessoalService.detailPassword(id), {
    enabled: enabled && id.length > 0,
    gcTime: 0,
  });
}

export function useCreatePessoalPasswordMutation(): UseMutationResult<
  PessoalPasswordListItem,
  Error,
  PessoalPasswordPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => pessoalService.createPassword(payload),
    onSuccess: async (password) => {
      await queryClient.invalidateQueries({ queryKey: passwordsKey(password.client_id) });
    },
  });
}

export function useUpdatePessoalPasswordMutation(
  id: string,
  clientId: string,
): UseMutationResult<PessoalPasswordListItem, Error, PessoalPasswordUpdatePayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => pessoalService.updatePassword(id, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: passwordsKey(clientId) }),
        queryClient.removeQueries({ queryKey: passwordDetailKey(id) }),
      ]);
    },
  });
}

export function useDeletePessoalPasswordMutation(
  clientId: string,
): UseMutationResult<PessoalPasswordListItem, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => pessoalService.deletePassword(id),
    onSuccess: async (_password, id) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: passwordsKey(clientId) }),
        queryClient.removeQueries({ queryKey: passwordDetailKey(id) }),
      ]);
    },
  });
}
