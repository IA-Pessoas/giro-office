import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { tiSpecificAccessesService } from "../services";
import type { TiSpecificAccess } from "../types";
import { tiQueryKeys } from "./queryKeys";

export function useTiSpecificAccesses(): UseQueryResult<TiSpecificAccess[], Error> {
  return useFetch(tiQueryKeys.specificAccesses(), () =>
    tiSpecificAccessesService.listSpecificAccesses(),
  );
}

export function useSetTiTaskCompletionMutation(): UseMutationResult<
  TiSpecificAccess,
  Error,
  { userId: string; taskCompletion: boolean }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, taskCompletion }) =>
      tiSpecificAccessesService.setTaskCompletion(userId, taskCompletion),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tiQueryKeys.specificAccesses() }),
  });
}
