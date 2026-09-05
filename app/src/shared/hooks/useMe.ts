import { getMe, type MeSessionUser } from "@workspace/api";
import type { UseQueryResult } from "@tanstack/react-query";

import { api } from "@shared/services/apiClient";
import { useFetch } from "./useFetch";

export const ME_QUERY_KEY = ["me"] as const;

export function useMe(options?: { enabled?: boolean }): UseQueryResult<MeSessionUser, Error> {
  return useFetch(ME_QUERY_KEY, () => getMe(api), {
    retry: false,
    ...options,
  });
}
