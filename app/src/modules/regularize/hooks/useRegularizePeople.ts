import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { regularizeService } from "../services/regularizeService";
import type {
  RegularizeClientPfDetail,
  RegularizeClientPfListFilters,
  RegularizeClientPfListItem,
  RegularizeId,
  RegularizePartner,
  RegularizePartnerListFilters,
} from "../types";
import { regularizeQueryKeys } from "./queryKeys";

type RegularizeReadQueryOptions = {
  enabled?: boolean;
};

export function useRegularizeClientPfs(
  filters: RegularizeClientPfListFilters,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizeClientPfListItem[], Error> {
  return useFetch(
    regularizeQueryKeys.clientPfs(filters),
    () => regularizeService.listClientPfs(filters),
    {
      enabled: Boolean(filters.status) && (options?.enabled ?? true),
    },
  );
}

export function useRegularizeClientPfDetail(
  id: RegularizeId | undefined | null,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizeClientPfDetail, Error> {
  return useFetch(
    regularizeQueryKeys.clientPfDetail(id),
    () => regularizeService.getClientPf(id ?? ""),
    {
      enabled: Boolean(id) && (options?.enabled ?? true),
    },
  );
}

export function useRegularizePartners(
  filters: RegularizePartnerListFilters | undefined,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizePartner[], Error> {
  const safeFilters = filters ?? { type: "pf", client_id: "" };

  return useFetch(
    regularizeQueryKeys.partners(safeFilters),
    () => regularizeService.listPartners(safeFilters),
    {
      enabled: Boolean(filters?.client_id && filters?.type) && (options?.enabled ?? true),
    },
  );
}

export function useRegularizePartnerDetail(
  id: RegularizeId | undefined | null,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizePartner, Error> {
  return useFetch(
    regularizeQueryKeys.partnerDetail(id),
    () => regularizeService.getPartner(id ?? ""),
    {
      enabled: Boolean(id) && (options?.enabled ?? true),
    },
  );
}
