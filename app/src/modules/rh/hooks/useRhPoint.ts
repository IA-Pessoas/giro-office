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
  RhPointAdjustmentRequest,
  RhPointCalculationResult,
  RhPointConfig,
  RhRegisterPointResult,
  UpsertRhPointConfigPayload,
} from "../types";
import { RH_QUERY_KEY } from "./useRhRequests";

export function rhPointConfigQueryKey(userId?: string) {
  return [...RH_QUERY_KEY, "point", "config", userId ?? "me"] as const;
}

export function rhPointCalculationQueryKey(pointId: string) {
  return [...RH_QUERY_KEY, "point", "calculation", pointId] as const;
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

export function useCreateOrUpdateRhPointConfigMutation(): UseMutationResult<
  RhPointConfig,
  Error,
  UpsertRhPointConfigPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhPointService.upsertPointConfig(payload),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
      await queryClient.invalidateQueries({
        queryKey: rhPointConfigQueryKey(variables.target_user_id),
      });
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
    onSuccess: async (_data, pointId) => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
      await queryClient.invalidateQueries({
        queryKey: rhPointCalculationQueryKey(pointId),
      });
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
