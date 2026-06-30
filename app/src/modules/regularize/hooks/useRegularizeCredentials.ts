import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { regularizeService } from "../services/regularizeService";
import type {
  RegularizeId,
  RegularizePasswordDetail,
  RegularizePasswordListFilters,
  RegularizePasswordListItem,
  RegularizeSitePasswordDetail,
  RegularizeSitePasswordListFilters,
  RegularizeSitePasswordListItem,
} from "../types";
import { regularizeQueryKeys } from "./queryKeys";

type RegularizeReadQueryOptions = {
  enabled?: boolean;
};

export function useRegularizeSitePasswords(
  filters: RegularizeSitePasswordListFilters,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizeSitePasswordListItem[], Error> {
  return useFetch(
    regularizeQueryKeys.sitePasswords(filters),
    () => regularizeService.listSitePasswords(filters),
    {
      enabled: options?.enabled ?? true,
    },
  );
}

export function useRegularizeSitePasswordDetail(
  id: RegularizeId | undefined | null,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizeSitePasswordDetail, Error> {
  return useFetch(
    regularizeQueryKeys.sitePasswordDetail(id),
    () => regularizeService.getSitePassword(id ?? ""),
    {
      enabled: Boolean(id) && (options?.enabled ?? true),
    },
  );
}

export function useRegularizePasswords(
  filters: RegularizePasswordListFilters | undefined,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizePasswordListItem[], Error> {
  const safeFilters = filters ?? { client_id: "" };

  return useFetch(
    regularizeQueryKeys.passwords(safeFilters),
    () => regularizeService.listPasswords(safeFilters),
    {
      enabled: Boolean(filters?.client_id) && (options?.enabled ?? true),
    },
  );
}

export function useRegularizePasswordDetail(
  id: RegularizeId | undefined | null,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizePasswordDetail, Error> {
  return useFetch(
    regularizeQueryKeys.passwordDetail(id),
    () => regularizeService.getPassword(id ?? ""),
    {
      enabled: Boolean(id) && (options?.enabled ?? true),
    },
  );
}
