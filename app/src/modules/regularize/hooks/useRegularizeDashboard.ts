import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { regularizeService } from "../services/regularizeService";
import type { RegularizeDashboard } from "../types";
import { regularizeQueryKeys } from "./queryKeys";

export function useRegularizeDashboard(
  year: number,
  options?: { enabled?: boolean },
): UseQueryResult<RegularizeDashboard, Error> {
  return useFetch(
    regularizeQueryKeys.dashboard(year),
    () => regularizeService.getDashboard(year),
    { enabled: Boolean(year) && (options?.enabled ?? true) },
  );
}
