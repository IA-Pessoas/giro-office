import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { regularizeService } from "../services/regularizeService";
import type { RegularizeDashboard } from "../types";
import { regularizeQueryKeys, useRegularizeQueryScope } from "./queryKeys";

export function useRegularizeDashboard(
  year: number,
  options?: { enabled?: boolean },
): UseQueryResult<RegularizeDashboard, Error> {
  const scope = useRegularizeQueryScope();

  return useFetch(
    regularizeQueryKeys.dashboard(year, scope),
    () => regularizeService.getDashboard(year),
    { enabled: Boolean(year) && (options?.enabled ?? true) },
  );
}
