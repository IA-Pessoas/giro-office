import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { rhPointService } from "../services/rhPointService";
import type {
  ApproveRhPointAdjustmentPayload,
  CreateRhPointAdjustmentPayload,
  RhPointAdjustmentListFilters,
  RhPointAdjustmentRequest,
  RhPointCalculationResult,
  RhPointConfig,
  RhPointListFilters,
  RhPointListItem,
  RhPointMonthlySummary,
  RhRegisterPointResult,
  RhTodayPoint,
  UpsertRhPointConfigPayload,
} from "../types";
import { RH_QUERY_KEY } from "./useRhRequests";

export function rhPointConfigQueryKey(userId?: string) {
  return [...RH_QUERY_KEY, "point", "config", userId ?? "me"] as const;
}

export function rhPointCalculationQueryKey(pointId: string) {
  return [...RH_QUERY_KEY, "point", "calculation", pointId] as const;
}

export function rhPointListQueryKey(filters: RhPointListFilters = {}) {
  return [
    ...RH_QUERY_KEY,
    "point",
    "list",
    filters.user_id ?? "me",
    filters.date_from ?? "",
    filters.date_to ?? "",
  ] as const;
}

export function rhTodayPointQueryKey() {
  return [...RH_QUERY_KEY, "point", "today", "me"] as const;
}

export function rhPointSummaryQueryKey(filters: { month: string; user_id?: string }) {
  return [
    ...RH_QUERY_KEY,
    "point",
    "summary",
    filters.user_id ?? "me",
    filters.month,
  ] as const;
}

export function rhPointAdjustmentRequestsQueryKey(
  filters: RhPointAdjustmentListFilters = {},
) {
  return [
    ...RH_QUERY_KEY,
    "point",
    "adjustments",
    filters.user_id ?? "me",
    filters.status ?? "all",
  ] as const;
}

export function useRhPointConfig(userId?: string): UseQueryResult<RhPointConfig | null, Error> {
  return useFetch(
    rhPointConfigQueryKey(userId),
    () =>
      userId ? rhPointService.getPointConfigByUserId(userId) : rhPointService.getMyPointConfig(),
    {
      refetchOnWindowFocus: false,
    },
  );
}

export function useRhPoints(
  filters: RhPointListFilters = {},
): UseQueryResult<RhPointListItem[], Error> {
  return useFetch(rhPointListQueryKey(filters), () => rhPointService.listPoints(filters), {
    refetchOnWindowFocus: false,
  });
}

export function useRhTodayPoint(): UseQueryResult<RhTodayPoint, Error> {
  return useFetch(rhTodayPointQueryKey(), () => rhPointService.getTodayPoint(), {
    refetchOnWindowFocus: false,
  });
}

export function useRhPointSummary(filters: {
  month: string;
  user_id?: string;
}): UseQueryResult<RhPointMonthlySummary, Error> {
  return useFetch(
    rhPointSummaryQueryKey(filters),
    () => rhPointService.getMonthlySummary(filters),
    {
      refetchOnWindowFocus: false,
      enabled: Boolean(filters.month),
    },
  );
}

export function useRhPointAdjustmentRequests(
  filters: RhPointAdjustmentListFilters = {},
): UseQueryResult<RhPointAdjustmentRequest[], Error> {
  return useFetch(
    rhPointAdjustmentRequestsQueryKey(filters),
    () => rhPointService.listAdjustmentRequests(filters),
    {
      refetchOnWindowFocus: false,
    },
  );
}

export function useCreateOrUpdateRhPointConfigMutation(): UseMutationResult<
  RhPointConfig,
  Error,
  UpsertRhPointConfigPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhPointService.upsertPointConfig(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
    },
  });
}

export function useRegisterRhPointMutation(): UseMutationResult<
  RhRegisterPointResult,
  Error,
  void
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => rhPointService.registerPoint(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
    },
  });
}

export function useCalculateRhPointMutation(): UseMutationResult<
  RhPointCalculationResult,
  Error,
  string
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (pointId) => rhPointService.calculatePoint(pointId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
    },
  });
}

export function useRequestRhPointAdjustmentMutation(): UseMutationResult<
  RhPointAdjustmentRequest,
  Error,
  CreateRhPointAdjustmentPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhPointService.requestAdjustment(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
    },
  });
}

export function useApproveRhPointAdjustmentMutation(): UseMutationResult<
  RhPointAdjustmentRequest,
  Error,
  ApproveRhPointAdjustmentPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhPointService.approveAdjustment(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
    },
  });
}
