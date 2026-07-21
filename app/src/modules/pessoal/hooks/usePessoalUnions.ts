import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { pessoalService } from "../services/pessoalService";
import type { PessoalUnion, PessoalUnionPayload } from "../types/unions";
import { pessoalQueryKey } from "./queryKeys";

const unionsKey = pessoalQueryKey("unions");

export function usePessoalUnions(): UseQueryResult<PessoalUnion[], Error> {
  return useFetch(unionsKey, () => pessoalService.listUnions());
}

export function useCreatePessoalUnionMutation(): UseMutationResult<
  PessoalUnion,
  Error,
  PessoalUnionPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => pessoalService.createUnion(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: unionsKey });
    },
  });
}

export function useUpdatePessoalUnionMutation(
  id: string,
): UseMutationResult<PessoalUnion, Error, PessoalUnionPayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => pessoalService.updateUnion(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: unionsKey });
    },
  });
}
