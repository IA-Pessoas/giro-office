import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import type {
  CreateRhLifeObjectivePayload,
  CreateRhLifeProjectPayload,
  RhLifeProject,
  UpdateRhLifeObjectivePayload,
  UpdateRhLifeProjectPayload,
} from "../types";
import { rhLifeProjectService } from "../services/rhLifeProjectService";
import { RH_QUERY_KEY } from "./useRhRequests";

export const RH_LIFE_PROJECT_QUERY_KEY = [...RH_QUERY_KEY, "life-project"] as const;

export function rhLifeProjectQueryKey(year: number, userId?: string) {
  return [...RH_LIFE_PROJECT_QUERY_KEY, year, userId ?? "me"] as const;
}

export function useRhLifeProject(
  year: number,
  userId?: string,
  enabled = true,
): UseQueryResult<RhLifeProject | null, Error> {
  return useFetch(rhLifeProjectQueryKey(year, userId), () => rhLifeProjectService.get(year, userId), {
    enabled,
  });
}

function useRhLifeProjectMutation<TPayload>(
  mutationFn: (payload: TPayload) => Promise<RhLifeProject>,
): UseMutationResult<RhLifeProject, Error, TPayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: RH_LIFE_PROJECT_QUERY_KEY }),
  });
}

export function useCreateRhLifeProjectMutation(): UseMutationResult<
  RhLifeProject,
  Error,
  CreateRhLifeProjectPayload
> {
  return useRhLifeProjectMutation(rhLifeProjectService.create);
}

export function useUpdateRhLifeProjectMutation(): UseMutationResult<
  RhLifeProject,
  Error,
  UpdateRhLifeProjectPayload
> {
  return useRhLifeProjectMutation(rhLifeProjectService.update);
}

export function useCreateRhLifeObjectiveMutation(): UseMutationResult<
  RhLifeProject,
  Error,
  CreateRhLifeObjectivePayload
> {
  return useRhLifeProjectMutation(rhLifeProjectService.createObjective);
}

export function useUpdateRhLifeObjectiveMutation(): UseMutationResult<
  RhLifeProject,
  Error,
  UpdateRhLifeObjectivePayload
> {
  return useRhLifeProjectMutation(rhLifeProjectService.updateObjective);
}
