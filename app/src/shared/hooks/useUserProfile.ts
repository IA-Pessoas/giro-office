import { getUserById } from "@workspace/api";

import { api } from "@shared/services/apiClient";
import { useFetch } from "./useFetch";

export function useUserProfile(userId: string | undefined) {
  return useFetch(
    ["user", "profile", userId],
    () => getUserById(api, userId as string),
    { enabled: Boolean(userId) },
  );
}