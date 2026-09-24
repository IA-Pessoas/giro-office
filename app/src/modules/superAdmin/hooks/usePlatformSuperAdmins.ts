import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";

import { platformService } from "../services/platformService";
import type { PlatformSuperAdmin } from "../types";

export function usePlatformSuperAdmins(): UseQueryResult<PlatformSuperAdmin[]> {
  return useQuery({
    queryKey: ["platform", "super-admins"],
    queryFn: () => platformService.listSuperAdmins(),
    staleTime: 15_000,
  });
}

export function useUpdatePlatformSuperAdminImpersonationPermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ superAdminId, canImpersonate }: { superAdminId: string; canImpersonate: boolean }) =>
      platformService.updateSuperAdminImpersonationPermission(superAdminId, {
        can_impersonate: canImpersonate,
      }),
    retry: false,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["platform", "super-admins"] }),
        queryClient.invalidateQueries({ queryKey: ["platform", "audit"] }),
      ]);
    },
  });
}
