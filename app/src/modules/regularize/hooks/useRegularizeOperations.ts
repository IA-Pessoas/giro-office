import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";
import type { PaginatedResult } from "@shared/pagination/pagination";

import { regularizeService } from "../services/regularizeService";
import type {
  AddRegularizeGuidanceActivityPayload,
  AddRegularizeGuidancePartnerPayload,
  CreateRegularizeGuidancePayload,
  CreateRegularizeLicensePayload,
  CreateRegularizeMunicipalTaxPayload,
  CreateRegularizeProcessPayload,
  RemoveRegularizeGuidanceActivityPayload,
  RemoveRegularizeGuidancePartnerPayload,
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
  UpdateRegularizeGuidancePayload,
  UpdateRegularizeLicensePayload,
  UpdateRegularizeMunicipalTaxPayload,
  UpdateRegularizeProcessPayload,
} from "../types";
import { regularizeQueryKeys } from "./queryKeys";

type RegularizeReadQueryOptions = {
  enabled?: boolean;
};

async function invalidateRegularizeOperations(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: regularizeQueryKeys.operations(),
    }),
    queryClient.invalidateQueries({
      queryKey: regularizeQueryKeys.dashboardRoot(),
    }),
  ]);
}

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

export function useCreateRegularizeMunicipalTaxMutation(): UseMutationResult<
  RegularizeMunicipalTaxesDetail,
  Error,
  CreateRegularizeMunicipalTaxPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => regularizeService.createMunicipalTax(payload),
    onSuccess: () => invalidateRegularizeOperations(queryClient),
  });
}

export function useUpdateRegularizeMunicipalTaxMutation(): UseMutationResult<
  RegularizeMunicipalTaxesDetail,
  Error,
  UpdateRegularizeMunicipalTaxPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => regularizeService.updateMunicipalTax(payload),
    onSuccess: () => invalidateRegularizeOperations(queryClient),
  });
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

export function usePaginatedRegularizeProcesses(
  filters: RegularizeProcessListFilters & { page: number; limit: number },
  options?: RegularizeReadQueryOptions,
): UseQueryResult<PaginatedResult<RegularizeProcessListItem>, Error> {
  return useFetch(
    regularizeQueryKeys.processesPage(filters),
    () => regularizeService.listProcessesPage(filters),
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

export function useCreateRegularizeProcessMutation(): UseMutationResult<
  RegularizeProcessDetail,
  Error,
  CreateRegularizeProcessPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => regularizeService.createProcess(payload),
    onSuccess: () => invalidateRegularizeOperations(queryClient),
  });
}

export function useUpdateRegularizeProcessMutation(): UseMutationResult<
  RegularizeProcessDetail,
  Error,
  UpdateRegularizeProcessPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => regularizeService.updateProcess(payload),
    onSuccess: () => invalidateRegularizeOperations(queryClient),
  });
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

export function useCreateRegularizeGuidanceMutation(): UseMutationResult<
  RegularizeGuidance,
  Error,
  CreateRegularizeGuidancePayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => regularizeService.createGuidance(payload),
    onSuccess: () => invalidateRegularizeOperations(queryClient),
  });
}

export function useUpdateRegularizeGuidanceMutation(): UseMutationResult<
  RegularizeGuidance,
  Error,
  UpdateRegularizeGuidancePayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => regularizeService.updateGuidance(payload),
    onSuccess: () => invalidateRegularizeOperations(queryClient),
  });
}

export function useAddRegularizeGuidanceActivityMutation(): UseMutationResult<
  RegularizeGuidance,
  Error,
  AddRegularizeGuidanceActivityPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => regularizeService.addGuidanceActivity(payload),
    onSuccess: () => invalidateRegularizeOperations(queryClient),
  });
}

export function useRemoveRegularizeGuidanceActivityMutation(): UseMutationResult<
  RegularizeGuidance,
  Error,
  RemoveRegularizeGuidanceActivityPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => regularizeService.removeGuidanceActivity(payload),
    onSuccess: () => invalidateRegularizeOperations(queryClient),
  });
}

export function useAddRegularizeGuidancePartnerMutation(): UseMutationResult<
  RegularizeGuidance,
  Error,
  AddRegularizeGuidancePartnerPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => regularizeService.addGuidancePartner(payload),
    onSuccess: () => invalidateRegularizeOperations(queryClient),
  });
}

export function useRemoveRegularizeGuidancePartnerMutation(): UseMutationResult<
  RegularizeGuidance,
  Error,
  RemoveRegularizeGuidancePartnerPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => regularizeService.removeGuidancePartner(payload),
    onSuccess: () => invalidateRegularizeOperations(queryClient),
  });
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

export function useCreateRegularizeLicenseMutation(): UseMutationResult<
  RegularizeLicenseDetail,
  Error,
  CreateRegularizeLicensePayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => regularizeService.createLicense(payload),
    onSuccess: () => invalidateRegularizeOperations(queryClient),
  });
}

export function useUpdateRegularizeLicenseMutation(): UseMutationResult<
  RegularizeLicenseDetail,
  Error,
  UpdateRegularizeLicensePayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => regularizeService.updateLicense(payload),
    onSuccess: () => invalidateRegularizeOperations(queryClient),
  });
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
