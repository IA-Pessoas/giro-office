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
  ApproveRhPointAdjustmentsBulkPayload,
  CreateRhPointAdjustmentPayload,
  CreateRhRetroactivePointPayload,
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
  RejectRhPointAdjustmentPayload,
  RecalculateRhPointsPayload,
} from "../types";
import { RH_QUERY_KEY } from "./useRhRequests";

export const RH_POINT_QUERY_KEY = [...RH_QUERY_KEY, "point"] as const;

interface RhPointReadQueryOptions {
  enabled?: boolean;
}

export function rhPointConfigQueryKey(userId?: string) {
  return [...RH_POINT_QUERY_KEY, "config", userId ?? "me"] as const;
}

export function rhPointCalculationQueryKey(pointId: string) {
  return [...RH_POINT_QUERY_KEY, "calculation", pointId] as const;
}

export function rhPointListQueryKey(filters: RhPointListFilters = {}) {
  return [
    ...RH_POINT_QUERY_KEY,
    "list",
    filters.user_id ?? "me",
    filters.date_from ?? "",
    filters.date_to ?? "",
  ] as const;
}

export function rhTodayPointQueryKey() {
  return [...RH_POINT_QUERY_KEY, "today", "me"] as const;
}

export function rhPointSummaryQueryKey(filters: { month: string; user_id?: string }) {
  return [
    ...RH_POINT_QUERY_KEY,
    "summary",
    filters.user_id ?? "me",
    filters.month,
  ] as const;
}

export function rhPointAdjustmentRequestsQueryKey(
  filters: RhPointAdjustmentListFilters = {},
) {
  return [
    ...RH_POINT_QUERY_KEY,
    "adjustments",
    filters.user_id ?? "me",
    filters.status ?? "all",
  ] as const;
}

export function useRhPointConfig(
  userId?: string,
  options?: RhPointReadQueryOptions,
): UseQueryResult<RhPointConfig | null, Error> {
  return useFetch(
    rhPointConfigQueryKey(userId),
    () =>
      userId ? rhPointService.getPointConfigByUserId(userId) : rhPointService.getMyPointConfig(),
    {
      enabled: options?.enabled,
    },
  );
}

export function useRhPoints(
  filters: RhPointListFilters = {},
  options?: RhPointReadQueryOptions,
): UseQueryResult<RhPointListItem[], Error> {
  return useFetch(rhPointListQueryKey(filters), () => rhPointService.listPoints(filters), {
    enabled: options?.enabled,
  });
}

export function useRhTodayPoint(
  options?: RhPointReadQueryOptions,
): UseQueryResult<RhTodayPoint, Error> {
  return useFetch(rhTodayPointQueryKey(), () => rhPointService.getTodayPoint(), {
    enabled: options?.enabled,
  });
}

export function useRhPointSummary(filters: {
  month: string;
  user_id?: string;
}, options?: RhPointReadQueryOptions): UseQueryResult<RhPointMonthlySummary, Error> {
  return useFetch(
    rhPointSummaryQueryKey(filters),
    () => rhPointService.getMonthlySummary(filters),
    {
      enabled: (options?.enabled ?? true) && Boolean(filters.month),
    },
  );
}

export function useRhPointAdjustmentRequests(
  filters: RhPointAdjustmentListFilters = {},
  options?: RhPointReadQueryOptions,
): UseQueryResult<RhPointAdjustmentRequest[], Error> {
  return useFetch(
    rhPointAdjustmentRequestsQueryKey(filters),
    () => rhPointService.listAdjustmentRequests(filters),
    {
      enabled: options?.enabled,
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
      await queryClient.invalidateQueries({ queryKey: RH_POINT_QUERY_KEY });
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
      await queryClient.invalidateQueries({ queryKey: RH_POINT_QUERY_KEY });
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
      await queryClient.invalidateQueries({ queryKey: RH_POINT_QUERY_KEY });
    },
  });
}

export function useRecalculateRhPointsMutation(): UseMutationResult<
  RhPointCalculationResult[],
  Error,
  RecalculateRhPointsPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhPointService.recalculatePoints(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_POINT_QUERY_KEY });
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
      await queryClient.invalidateQueries({ queryKey: RH_POINT_QUERY_KEY });
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
      await queryClient.invalidateQueries({ queryKey: RH_POINT_QUERY_KEY });
    },
  });
}

export function useRejectRhPointAdjustmentMutation(): UseMutationResult<
  RhPointAdjustmentRequest,
  Error,
  RejectRhPointAdjustmentPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhPointService.rejectAdjustment(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_POINT_QUERY_KEY });
    },
  });
}

export function useApproveRhPointAdjustmentsBulkMutation(): UseMutationResult<
  RhPointAdjustmentRequest[],
  Error,
  ApproveRhPointAdjustmentsBulkPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhPointService.approveAdjustmentsBulk(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_POINT_QUERY_KEY });
    },
  });
}

export function useCreateRhRetroactivePointMutation(): UseMutationResult<
  RhPointAdjustmentRequest,
  Error,
  CreateRhRetroactivePointPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhPointService.createRetroactiveAdjustment(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_POINT_QUERY_KEY });
    },
  });
}

export function useUploadRhPointAdjustmentAttachmentMutation(): UseMutationResult<
  RhPointAdjustmentRequest,
  Error,
  { requestId: string; file: File }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ requestId, file }) =>
      rhPointService.uploadAdjustmentAttachment(requestId, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_POINT_QUERY_KEY });
    },
  });
}
