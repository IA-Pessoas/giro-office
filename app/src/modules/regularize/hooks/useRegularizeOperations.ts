import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { regularizeService } from "../services/regularizeService";
import type {
  RegularizeGuidance,
  RegularizeGuidanceListFilters,
  RegularizeId,
  RegularizeLicenseDetail,
  RegularizeLicenseListFilters,
  RegularizeLicenseListItem,
  RegularizeMunicipalTaxesClientSummary,
  RegularizeMunicipalTaxesDetail,
  RegularizeMunicipalTaxesListFilters,
  RegularizeProcessDetail,
  RegularizeProcessListFilters,
  RegularizeProcessListItem,
} from "../types";
import { regularizeQueryKeys } from "./queryKeys";

type RegularizeReadQueryOptions = {
  enabled?: boolean;
};

export function useRegularizeMunicipalTaxes(
  filters: RegularizeMunicipalTaxesListFilters,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizeMunicipalTaxesClientSummary[], Error> {
  return useFetch(
    regularizeQueryKeys.municipalTaxes(filters),
    () => regularizeService.listMunicipalTaxes(filters),
    {
      enabled: Boolean(filters.year) && (options?.enabled ?? true),
    },
  );
}

export function useRegularizeMunicipalTaxDetail(
  id: RegularizeId | undefined | null,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizeMunicipalTaxesDetail, Error> {
  return useFetch(
    regularizeQueryKeys.municipalTaxDetail(id),
    () => regularizeService.getMunicipalTax(id ?? ""),
    {
      enabled: Boolean(id) && (options?.enabled ?? true),
    },
  );
}

export function useRegularizeProcesses(
  filters: RegularizeProcessListFilters,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizeProcessListItem[], Error> {
  return useFetch(
    regularizeQueryKeys.processes(filters),
    () => regularizeService.listProcesses(filters),
    {
      enabled: Boolean(filters.status) && (options?.enabled ?? true),
    },
  );
}

export function useRegularizeProcessDetail(
  id: RegularizeId | undefined | null,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizeProcessDetail, Error> {
  return useFetch(
    regularizeQueryKeys.processDetail(id),
    () => regularizeService.getProcess(id ?? ""),
    {
      enabled: Boolean(id) && (options?.enabled ?? true),
    },
  );
}

export function useRegularizeGuidance(
  filters: RegularizeGuidanceListFilters | undefined,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizeGuidance[], Error> {
  const safeFilters = filters ?? { process_id: "" };

  return useFetch(
    regularizeQueryKeys.guidance(safeFilters),
    () => regularizeService.listGuidance(safeFilters),
    {
      enabled: Boolean(filters?.process_id) && (options?.enabled ?? true),
    },
  );
}

export function useRegularizeGuidanceDetail(
  id: RegularizeId | undefined | null,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizeGuidance, Error> {
  return useFetch(
    regularizeQueryKeys.guidanceDetail(id),
    () => regularizeService.getGuidance(id ?? ""),
    {
      enabled: Boolean(id) && (options?.enabled ?? true),
    },
  );
}

export function useRegularizeLicenses(
  filters: RegularizeLicenseListFilters,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizeLicenseListItem[], Error> {
  return useFetch(
    regularizeQueryKeys.licenses(filters),
    () => regularizeService.listLicenses(filters),
    {
      enabled: Boolean(filters.status) && (options?.enabled ?? true),
    },
  );
}

export function useRegularizeLicenseDetail(
  id: RegularizeId | undefined | null,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizeLicenseDetail, Error> {
  return useFetch(
    regularizeQueryKeys.licenseDetail(id),
    () => regularizeService.getLicense(id ?? ""),
    {
      enabled: Boolean(id) && (options?.enabled ?? true),
    },
  );
}
