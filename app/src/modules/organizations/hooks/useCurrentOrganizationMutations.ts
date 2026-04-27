import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "react-toastify";

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
): Promise<void> {
  const queryKey = getCurrentOrganizationQueryKey(organizationId);

  await queryClient.invalidateQueries({ queryKey });

  try {
    await queryClient.refetchQueries({ queryKey, type: "active" });
  } catch {
    toast.warn("A organizacao foi atualizada, mas os dados nao puderam ser recarregados agora.");
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
    onSuccess: async (_organization, { organizationId }) => {
      await refetchCurrentOrganization(queryClient, organizationId);
      toast.success("Logo da organizacao atualizada com sucesso!");
    },
    onError: (error: unknown) => {
      if (shouldSkipToastForServerError(error)) {
        return;
      }

      toast.error("Nao foi possivel atualizar a logo da organizacao.");
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
    onSuccess: async (_organization, { organizationId }) => {
      await refetchCurrentOrganization(queryClient, organizationId);
      toast.success("Plano da organizacao atualizado com sucesso!");
    },
    onError: (error: unknown) => {
      if (shouldSkipToastForServerError(error)) {
        return;
      }

      toast.error("Nao foi possivel atualizar o plano da organizacao.");
      console.log(error);
    },
  });
}
