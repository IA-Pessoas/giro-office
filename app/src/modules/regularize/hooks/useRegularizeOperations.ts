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
  RegularizeDteImport,
  RegularizeDteImportPayload,
  RegularizeDteImportsPage,
  RegularizeDteNotice,
  RegularizeDteNoticeListFilters,
  RegularizeDteNoticeReadingPayload,
  RegularizeDteNoticesPage,
  RegularizeGuidance,
  RegularizeGuidanceListFilters,
  RegularizeId,
  RegularizeLicenseDetail,
  RegularizeLicenseListFilters,
  RegularizeLicenseListItem,
  RegularizeLicenseProtocolAccess,
  RegularizeLicenseProtocolMetadata,
  RegularizeMunicipalTaxesDetail,
  RegularizeMunicipalTaxesListFilters,
  RegularizeMunicipalTaxesPage,
  RegularizeProcessActionPayload,
  RegularizeProcessActionResult,
  RegularizeProcessDetail,
  RegularizeProcessListFilters,
  RegularizeProcessListItem,
  UpdateRegularizeGuidancePayload,
  UpdateRegularizeGuidanceActivityPayload,
  UpdateRegularizeGuidancePartnerPayload,
  UpdateRegularizeLicensePayload,
  UpdateRegularizeMunicipalTaxPayload,
  UpdateRegularizeProcessPayload,
} from "../types";
import { regularizeQueryKeys, useRegularizeQueryScope } from "./queryKeys";

type RegularizeReadQueryOptions = {
  enabled?: boolean;
};

function shouldEnableRegularizeGuidanceQuery(
  filters: RegularizeGuidanceListFilters | undefined,
  options?: RegularizeReadQueryOptions,
): boolean {
  const hasEmptyProcessFilter =
    filters !== undefined && "process_id" in filters && !filters.process_id;
  const hasEmptyTargetFilter =
    filters !== undefined && "target_type" in filters && !filters.target_type;
  const hasExplicitAllFilters = filters === undefined && options?.enabled === true;
  const hasEffectiveGuidanceFilter =
    filters !== undefined &&
    !hasEmptyProcessFilter &&
    !hasEmptyTargetFilter &&
    Boolean(filters.process_id || filters.target_type);

  return (hasExplicitAllFilters || hasEffectiveGuidanceFilter) && (options?.enabled ?? true);
}

async function invalidateRegularizeOperations(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: regularizeQueryKeys.root,
    }),
    queryClient.invalidateQueries({
      queryKey: regularizeQueryKeys.root,
    }),
  ]);
}

export function useRegularizeMunicipalTaxes(
  filters: RegularizeMunicipalTaxesListFilters,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizeMunicipalTaxesPage, Error> {
  const scope = useRegularizeQueryScope();

  return useFetch(
    regularizeQueryKeys.municipalTaxes(filters, scope),
    () => regularizeService.listMunicipalTaxes(filters),
    {
      enabled: Boolean(filters.year) && (options?.enabled ?? true),
    },
  );
}

export function useRegularizeDteImports(): UseQueryResult<RegularizeDteImportsPage, Error> {
  const scope = useRegularizeQueryScope();

  return useFetch(regularizeQueryKeys.dteImports(scope), () => regularizeService.listDteImports());
}

export function useRegularizeDteNotices(
  filters: RegularizeDteNoticeListFilters,
): UseQueryResult<RegularizeDteNoticesPage, Error> {
  const scope = useRegularizeQueryScope();

  return useFetch(regularizeQueryKeys.dteNotices(filters, scope), () =>
    regularizeService.listDteNotices(filters),
  );
}

export function useSetRegularizeDteNoticeReadingMutation(): UseMutationResult<
  RegularizeDteNotice,
  Error,
  RegularizeDteNoticeReadingPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => regularizeService.setDteNoticeReading(payload),
    onSuccess: () => invalidateRegularizeOperations(queryClient),
  });
}

export function useImportRegularizeDteMutation(): UseMutationResult<
  RegularizeDteImport,
  Error,
  RegularizeDteImportPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => regularizeService.importDte(payload),
    onSuccess: () => invalidateRegularizeOperations(queryClient),
  });
}

export function useRegularizeMunicipalTaxDetail(
  id: RegularizeId | undefined | null,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizeMunicipalTaxesDetail, Error> {
  const scope = useRegularizeQueryScope();

  return useFetch(
    regularizeQueryKeys.municipalTaxDetail(id, scope),
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
  const scope = useRegularizeQueryScope();

  return useFetch(
    regularizeQueryKeys.processes(filters, scope),
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
  const scope = useRegularizeQueryScope();

  return useFetch(
    regularizeQueryKeys.processesPage(filters, scope),
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
  const scope = useRegularizeQueryScope();

  return useFetch(
    regularizeQueryKeys.processDetail(id, scope),
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

export function useSendRegularizeProcessToFiscalMutation(): UseMutationResult<
  RegularizeProcessActionResult,
  Error,
  RegularizeProcessActionPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => regularizeService.sendProcessToFiscal(payload),
    onSuccess: () => invalidateRegularizeOperations(queryClient),
  });
}

export function useReturnRegularizeProcessFromFiscalMutation(): UseMutationResult<
  RegularizeProcessActionResult,
  Error,
  RegularizeProcessActionPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => regularizeService.returnProcessFromFiscal(payload),
    onSuccess: () => invalidateRegularizeOperations(queryClient),
  });
}

export function useRegularizeGuidance(
  filters: RegularizeGuidanceListFilters | undefined,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizeGuidance[], Error> {
  const safeFilters = filters ?? {};
  const scope = useRegularizeQueryScope();

  return useFetch(
    regularizeQueryKeys.guidance(safeFilters, scope),
    () => regularizeService.listGuidance(safeFilters),
    {
      enabled: shouldEnableRegularizeGuidanceQuery(filters, options),
    },
  );
}

export function useRegularizeGuidanceDetail(
  id: RegularizeId | undefined | null,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizeGuidance, Error> {
  const scope = useRegularizeQueryScope();

  return useFetch(
    regularizeQueryKeys.guidanceDetail(id, scope),
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

export function useUpdateRegularizeGuidanceActivityMutation(): UseMutationResult<
  RegularizeGuidance,
  Error,
  UpdateRegularizeGuidanceActivityPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => regularizeService.updateGuidanceActivity(payload),
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

export function useUpdateRegularizeGuidancePartnerMutation(): UseMutationResult<
  RegularizeGuidance,
  Error,
  UpdateRegularizeGuidancePartnerPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => regularizeService.updateGuidancePartner(payload),
    onSuccess: () => invalidateRegularizeOperations(queryClient),
  });
}

export function useRegularizeLicenses(
  filters: RegularizeLicenseListFilters,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizeLicenseListItem[], Error> {
  const scope = useRegularizeQueryScope();

  return useFetch(
    regularizeQueryKeys.licenses(filters, scope),
    () => regularizeService.listLicenses(filters),
    {
      enabled: Boolean(filters.status) && (options?.enabled ?? true),
    },
  );
}

export function usePaginatedRegularizeLicenses(
  filters: RegularizeLicenseListFilters & { page: number; limit: number },
  options?: RegularizeReadQueryOptions,
): UseQueryResult<PaginatedResult<RegularizeLicenseListItem>, Error> {
  const scope = useRegularizeQueryScope();

  return useFetch(
    regularizeQueryKeys.licensesPage(filters, scope),
    () => regularizeService.listLicensesPage(filters),
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
  const scope = useRegularizeQueryScope();

  return useFetch(
    regularizeQueryKeys.licenseDetail(id, scope),
    () => regularizeService.getLicense(id ?? ""),
    {
      enabled: Boolean(id) && (options?.enabled ?? true),
    },
  );
}

export function useUploadRegularizeLicenseProtocolMutation(): UseMutationResult<
  RegularizeLicenseProtocolMetadata,
  Error,
  { id: RegularizeId; file: File }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, file }) => regularizeService.uploadLicenseProtocol(id, file),
    onSuccess: () => invalidateRegularizeOperations(queryClient),
  });
}

export function useRegularizeLicenseProtocolAccessMutation(): UseMutationResult<
  RegularizeLicenseProtocolAccess,
  Error,
  RegularizeId
> {
  return useMutation({
    mutationFn: (id) => regularizeService.getLicenseProtocolAccess(id),
  });
}
