import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../../../context/AuthContext";
import { organizationService } from "../services/organizationService";
import type { UserOrganization } from "../types";

export const organizationSwitcherQueryKey = (userId?: string) => [
  "auth",
  "organizations",
  userId ?? "anonymous",
] as const;

export interface OrganizationSwitcherResult {
  organizations: UserOrganization[];
  isLoading: boolean;
  isSwitching: boolean;
  switchOrganization: (organizationId: string) => Promise<void>;
}

export function useOrganizationSwitcher(): OrganizationSwitcherResult {
  const { user, switchOrganization } = useAuth();
  const queryClient = useQueryClient();
  const organizationsQuery = useQuery({
    queryKey: organizationSwitcherQueryKey(user?.id),
    queryFn: organizationService.listMine,
    enabled: Boolean(user?.id),
  });
  const switchMutation = useMutation({
    mutationFn: switchOrganization,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: organizationSwitcherQueryKey(user?.id),
      });
    },
  });

  return {
    organizations: organizationsQuery.data ?? [],
    isLoading: organizationsQuery.isLoading,
    isSwitching: switchMutation.isPending,
    switchOrganization: switchMutation.mutateAsync,
  };
}
