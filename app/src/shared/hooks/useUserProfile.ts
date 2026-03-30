import { useQuery } from "@tanstack/react-query";
import { getUserById } from "@workspace/api";

import { api } from "@shared/services/apiClient";

export function useUserProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["user", "profile", userId],
    queryFn: () => getUserById(api, userId as string),
    enabled: Boolean(userId),
  });
}
