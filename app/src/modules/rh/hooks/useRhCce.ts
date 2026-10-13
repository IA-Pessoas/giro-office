import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useFetch } from "@shared/hooks";

import { rhCceService } from "../services/rhCceService";
import type { CreateCceCyclePayload, UpdateCceWeeklyEvaluationPayload } from "../types";
import { RH_QUERY_KEY } from "./useRhRequests";

function useCceQueryKey() {
  const { user } = useAuth();
  return [...RH_QUERY_KEY, "cce", user?.organization_id ?? null, user?.id ?? null] as const;
}

export function useRhCceFloors() {
  const queryKey = useCceQueryKey();
  return useFetch([...queryKey, "floors"], () => rhCceService.getFloors(), {
    enabled: Boolean(queryKey[3]),
  });
}

export function useRhCceCycles() {
  const queryKey = useCceQueryKey();
  return useFetch([...queryKey, "cycles"], () => rhCceService.listCycles(), {
    enabled: Boolean(queryKey[3]),
  });
}

function useInvalidateCce() {
  const queryClient = useQueryClient();
  const queryKey = useCceQueryKey();
  return () => queryClient.invalidateQueries({ queryKey });
}

export function useConfigureRhCceFloors() {
  const invalidate = useInvalidateCce();
  return useMutation({
    mutationFn: (floorCount: number) => rhCceService.configureFloors(floorCount),
    onSuccess: invalidate,
  });
}

export function useCreateRhCceCycle() {
  const invalidate = useInvalidateCce();
  return useMutation({
    mutationFn: (payload: CreateCceCyclePayload) => rhCceService.createCycle(payload),
    onSuccess: invalidate,
  });
}

export function useUpdateRhCceWeek() {
  const invalidate = useInvalidateCce();
  return useMutation({
    mutationFn: (payload: UpdateCceWeeklyEvaluationPayload) => rhCceService.updateWeek(payload),
    onSuccess: invalidate,
  });
}
