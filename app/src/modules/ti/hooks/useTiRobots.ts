import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { tiRobotsService } from "../services";
import type { TiId, TiListFilters, TiReadQueryOptions, TiRobot, TiRobotRun } from "../types";
import { tiQueryKeys } from "./queryKeys";

export function useTiRobots(
  filters?: TiListFilters,
  options?: TiReadQueryOptions,
): UseQueryResult<TiRobot[], Error> {
  return useFetch(tiQueryKeys.robots.list(filters), () => tiRobotsService.list(filters), options);
}

export function useTiRobot(
  id?: TiId,
  options?: TiReadQueryOptions,
): UseQueryResult<TiRobot, Error> {
  return useFetch(tiQueryKeys.robots.detail(id), () => tiRobotsService.getById(id as TiId), {
    ...options,
    enabled: Boolean(id) && options?.enabled !== false,
  });
}

export function useTiRobotRuns(
  id?: TiId,
  filters?: TiListFilters,
  options?: TiReadQueryOptions,
): UseQueryResult<TiRobotRun[], Error> {
  return useFetch(
    tiQueryKeys.robots.runs(id, filters),
    () => tiRobotsService.listRuns(id as TiId, filters),
    {
      ...options,
      enabled: Boolean(id) && options?.enabled !== false,
    },
  );
}
