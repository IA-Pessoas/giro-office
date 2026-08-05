import { getUserById, type UserItem } from "@workspace/api";
import type { UseQueryResult } from "@tanstack/react-query";

import { api } from "@shared/services/apiClient";
import { useFetch } from "./useFetch";

export function useUserProfile(
  userId: string | undefined,
): UseQueryResult<UserItem, Error> {
  return useFetch(
    ["user", "profile", userId],
    () => getUserById(api, userId as string),
    { enabled: Boolean(userId) },
  );
}
