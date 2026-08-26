import { useMutation, useQueryClient } from "@tanstack/react-query";

import { platformService } from "../services/platformService";
import type {
  CreatePlatformOrganizationPayload,
  PlatformOrganization,
  PlatformOrganizationPlan,
  PlatformOrganizationStatus,
} from "../types";
import { isPlatformConflict } from "../utils/platformManagement";
import { platformOrganizationKeys } from "./usePlatformOrganizations";

interface OrganizationMutationVariables {
  organizationId: string;
  expectedUpdatedAt: string;
}

function usePlatformOrganizationCache() {
  const queryClient = useQueryClient();

  const syncPlatformOrganization = async (organization: PlatformOrganization) => {
    queryClient.setQueryData(platformOrganizationKeys.detail(organization.id), organization);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: platformOrganizationKeys.lists }),
      queryClient.invalidateQueries({ queryKey: ["platform", "audit"] }),
    ]);
  };

  const invalidatePlatformOrganization = async (organizationId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: platformOrganizationKeys.detail(organizationId) }),
      queryClient.invalidateQueries({ queryKey: platformOrganizationKeys.lists }),
    ]);
  };

  return { syncPlatformOrganization, invalidatePlatformOrganization };
}

export function useCreatePlatformOrganization() {
  const cache = usePlatformOrganizationCache();
  return useMutation({
    mutationFn: (data: CreatePlatformOrganizationPayload) =>
      platformService.createOrganization(data),
    retry: false,
    onSuccess: cache.syncPlatformOrganization,
  });
}

export function useUpdatePlatformOrganizationStatus() {
  const cache = usePlatformOrganizationCache();
  return useMutation({
    mutationFn: ({
      organizationId,
      status,
      expectedUpdatedAt,
    }: OrganizationMutationVariables & {
      status: PlatformOrganizationStatus;
    }) =>
      platformService.updateStatus(organizationId, {
        status,
        expected_updated_at: expectedUpdatedAt,
      }),
    retry: false,
    onSuccess: cache.syncPlatformOrganization,
    onError: (error, variables) =>
      isPlatformConflict(error)
        ? cache.invalidatePlatformOrganization(variables.organizationId)
        : undefined,
  });
}

export function useUpdatePlatformOrganizationPlan() {
  const cache = usePlatformOrganizationCache();
  return useMutation({
    mutationFn: ({
      organizationId,
      subscriptionPlan,
      expectedUpdatedAt,
    }: OrganizationMutationVariables & { subscriptionPlan: PlatformOrganizationPlan }) =>
      platformService.updateSubscriptionPlan(organizationId, {
        subscription_plan: subscriptionPlan,
        expected_updated_at: expectedUpdatedAt,
      }),
    retry: false,
    onSuccess: cache.syncPlatformOrganization,
    onError: (error, variables) =>
      isPlatformConflict(error)
        ? cache.invalidatePlatformOrganization(variables.organizationId)
        : undefined,
  });
}

export function useUpdatePlatformOrganizationLogo() {
  const cache = usePlatformOrganizationCache();
  return useMutation({
    mutationFn: ({
      organizationId,
      logoUrl,
      expectedUpdatedAt,
    }: OrganizationMutationVariables & { logoUrl: string | null }) =>
      platformService.updateLogoUrl(organizationId, {
        logo_url: logoUrl,
        expected_updated_at: expectedUpdatedAt,
      }),
    retry: false,
    onSuccess: cache.syncPlatformOrganization,
    onError: (error, variables) =>
      isPlatformConflict(error)
        ? cache.invalidatePlatformOrganization(variables.organizationId)
        : undefined,
  });
}
