import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { tiRobotsService } from "../services";
import type {
  TiId,
  TiListFilters,
  TiReadQueryOptions,
  TiRobot,
  TiRobotPayload,
  TiRobotRun,
  TiRobotRunPayload,
} from "../types";
import { tiQueryKeys } from "./queryKeys";

function invalidateTiRobots(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: tiQueryKeys.robots.all() }),
    queryClient.invalidateQueries({ queryKey: tiQueryKeys.dashboard() }),
  ]);
}

export function useTiRobots(
  filters?: TiListFilters,
  options?: TiReadQueryOptions,
): UseQueryResult<TiRobot[], Error> {
  return useFetch(
    tiQueryKeys.robots.list(filters),
    () => tiRobotsService.listRobots(filters),
    options,
  );
}

export function useTiRobot(
  id?: TiId,
  options?: TiReadQueryOptions,
): UseQueryResult<TiRobot, Error> {
  return useFetch(
    tiQueryKeys.robots.detail(id),
    () => tiRobotsService.getRobotById(id as TiId),
    {
      ...options,
      enabled: Boolean(id) && options?.enabled !== false,
    },
  );
}

export function useTiRobotRuns(
  id?: TiId,
  filters?: TiListFilters,
  options?: TiReadQueryOptions,
): UseQueryResult<TiRobotRun[], Error> {
  return useFetch(
    tiQueryKeys.robots.runs(id, filters),
    () => tiRobotsService.listRobotRuns(id as TiId, filters),
    {
      ...options,
      enabled: Boolean(id) && options?.enabled !== false,
    },
  );
}

export function useCreateTiRobot(): UseMutationResult<TiRobot, Error, TiRobotPayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => tiRobotsService.createRobot(payload),
    onSuccess: async () => {
      await invalidateTiRobots(queryClient);
    },
  });
}

export function useUpdateTiRobot(): UseMutationResult<
  TiRobot,
  Error,
  { id: TiId; payload: TiRobotPayload }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }) => tiRobotsService.updateRobot(id, payload),
    onSuccess: async () => {
      await invalidateTiRobots(queryClient);
    },
  });
}

export function useCreateTiRobotRun(): UseMutationResult<
  TiRobotRun,
  Error,
  { id: TiId; payload: TiRobotRunPayload }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }) => tiRobotsService.createRobotRun(id, payload),
    onSuccess: async () => {
      await invalidateTiRobots(queryClient);
    },
  });
}
