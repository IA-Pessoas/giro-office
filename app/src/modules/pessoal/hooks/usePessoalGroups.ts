import { useMutation, useQueryClient, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { pessoalService } from "../services/pessoalService";
import type { PessoalGroup, PessoalGroupPayload } from "../types/groups";
import { pessoalQueryKey } from "./queryKeys";

const groupsKey = pessoalQueryKey("groups");

export function usePessoalGroups(): UseQueryResult<PessoalGroup[], Error> {
  return useFetch(groupsKey, () => pessoalService.listGroups());
}

function usePessoalGroupsMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<PessoalGroup>,
): UseMutationResult<PessoalGroup, Error, TVariables> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: groupsKey });
    },
  });
}

export function useCreatePessoalGroupMutation(): UseMutationResult<
  PessoalGroup,
  Error,
  PessoalGroupPayload
> {
  return usePessoalGroupsMutation((payload) => pessoalService.createGroup(payload));
}

export function useUpdatePessoalGroupMutation(
  id: string,
): UseMutationResult<PessoalGroup, Error, PessoalGroupPayload> {
  return usePessoalGroupsMutation((payload) => pessoalService.updateGroup(id, payload));
}

export function useArchivePessoalGroupMutation(): UseMutationResult<PessoalGroup, Error, string> {
  return usePessoalGroupsMutation((id) => pessoalService.archiveGroup(id));
}

export function useReactivatePessoalGroupMutation(): UseMutationResult<
  PessoalGroup,
  Error,
  string
> {
  return usePessoalGroupsMutation((id) => pessoalService.reactivateGroup(id));
}
