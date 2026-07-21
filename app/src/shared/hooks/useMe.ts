import { getMe, type MeSessionUser } from "@workspace/api";
import type { UseQueryResult } from "@tanstack/react-query";

import { api } from "@shared/services/apiClient";
import { useFetch } from "./useFetch";

export const ME_QUERY_KEY = ["me"] as const;

type UseMeOptions = {
  enabled?: boolean;
};

export function useMe(options: UseMeOptions = {}): UseQueryResult<MeSessionUser, Error> {
  return useFetch(ME_QUERY_KEY, () => getMe(api), {
    retry: false,
    enabled: options.enabled ?? true,
  });
}
