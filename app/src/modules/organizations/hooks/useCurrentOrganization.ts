import type { UseQueryResult } from "@tanstack/react-query";

import type { Organization } from "../types";
import { organizationService } from "../services/organizationService";
import { useFetch } from "@shared/hooks";

export const CURRENT_ORGANIZATION_QUERY_KEY = ["organizations", "current"] as const;

export function getCurrentOrganizationQueryKey(organizationId: string | undefined) {
  return [...CURRENT_ORGANIZATION_QUERY_KEY, organizationId] as const;
}

export function useCurrentOrganization(
  organizationId: string | undefined,
): UseQueryResult<Organization, Error> {
  return useFetch(
    getCurrentOrganizationQueryKey(organizationId),
    () => organizationService.getById(organizationId as string),
    {
      enabled: Boolean(organizationId),
      retry: false,
      refetchOnWindowFocus: false,
    },
  );
}
