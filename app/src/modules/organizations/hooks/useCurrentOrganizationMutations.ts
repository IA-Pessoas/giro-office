import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "@shared/services/toast";

import type { Organization } from "../types";
import { organizationService } from "../services/organizationService";
import { getCurrentOrganizationQueryKey } from "./useCurrentOrganization";

function shouldSkipToastForServerError(error: unknown): boolean {
  return (
    isAxiosError(error) &&
    typeof error.response?.status === "number" &&
    error.response.status >= 500
  );
}

async function refetchCurrentOrganization(
  queryClient: ReturnType<typeof useQueryClient>,
  organizationId: string,
  partialOrganization: Partial<Organization>,
): Promise<void> {
  const queryKey = getCurrentOrganizationQueryKey(organizationId);

  queryClient.setQueryData<Organization | undefined>(queryKey, (currentOrganization) => {
    if (!currentOrganization) {
      return currentOrganization;
    }

    return {
      ...currentOrganization,
      ...partialOrganization,
    };
  });

  await queryClient.invalidateQueries({ queryKey });

  try {
    await queryClient.refetchQueries({ queryKey, type: "active" });
  } catch {
    toast.warn("A organização foi atualizada, mas os dados não puderam ser recarregados agora.");
  }
}

export function useUpdateOrganizationLogo(): UseMutationResult<
  Organization,
  unknown,
  { organizationId: string; logoUrl: string | null },
  unknown
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ organizationId, logoUrl }) =>
      organizationService.updateLogoUrl(organizationId, logoUrl),
    onSuccess: async (organization, { organizationId }) => {
      await refetchCurrentOrganization(queryClient, organizationId, organization);
      toast.success("Logo da organização atualizada com sucesso!");
    },
    onError: (error: unknown) => {
      if (shouldSkipToastForServerError(error)) {
        return;
      }

      toast.error("Não foi possível atualizar a logo da organização.");
      console.log(error);
    },
  });
}

export function useUpdateOrganizationPlan(): UseMutationResult<
  Organization,
  unknown,
  { organizationId: string; subscriptionPlan: string },
  unknown
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ organizationId, subscriptionPlan }) =>
      organizationService.updateSubscriptionPlan(organizationId, subscriptionPlan),
    onSuccess: async (organization, { organizationId }) => {
      await refetchCurrentOrganization(queryClient, organizationId, organization);
      toast.success("Plano da organização atualizado com sucesso!");
    },
    onError: (error: unknown) => {
      if (shouldSkipToastForServerError(error)) {
        return;
      }

      toast.error("Não foi possível atualizar o plano da organização.");
      console.log(error);
    },
  });
}
