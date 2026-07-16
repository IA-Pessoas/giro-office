import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { pessoalService } from "../services/pessoalService";
import type {
  PessoalLdd,
  PessoalLddPayload,
  PessoalLddUpdatePayload,
  PessoalSituation,
  PessoalSituationPayload,
  PessoalSituationUpdatePayload,
} from "../types/tracking";
import { pessoalQueryKey } from "./queryKeys";

function trackingKey(...parts: string[]) {
  return pessoalQueryKey("tracking", ...parts.map((part) => part || "missing"));
}

function lddKey(clientId: string) {
  return trackingKey(clientId, "ldd");
}

function situationsKey(clientId: string) {
  return trackingKey(clientId, "situations");
}

function situationDetailKey(id: string) {
  return trackingKey("situations", id);
}

export function usePessoalLdd(
  clientId: string,
  enabled: boolean,
): UseQueryResult<PessoalLdd[], Error> {
  return useFetch(lddKey(clientId), () => pessoalService.listLdd(clientId), {
    enabled: enabled && clientId.length > 0,
  });
}

export function useCreatePessoalLddMutation(): UseMutationResult<
  PessoalLdd,
  Error,
  PessoalLddPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => pessoalService.createLdd(payload),
    onSuccess: async (ldd) => {
      await queryClient.invalidateQueries({ queryKey: trackingKey(ldd.client_id) });
    },
  });
}

export function useUpdatePessoalLddMutation(
  id: string,
  clientId: string,
): UseMutationResult<PessoalLdd, Error, PessoalLddUpdatePayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => pessoalService.updateLdd(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trackingKey(clientId) });
    },
  });
}

export function useDeletePessoalLddMutation(
  clientId: string,
): UseMutationResult<PessoalLdd, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => pessoalService.deleteLdd(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trackingKey(clientId) });
    },
  });
}

export function usePessoalSituations(
  clientId: string,
  enabled: boolean,
): UseQueryResult<PessoalSituation[], Error> {
  return useFetch(situationsKey(clientId), () => pessoalService.listSituations(clientId), {
    enabled: enabled && clientId.length > 0,
  });
}

export function usePessoalSituationDetail(
  id: string,
  enabled: boolean,
): UseQueryResult<PessoalSituation, Error> {
  return useFetch(situationDetailKey(id), () => pessoalService.detailSituation(id), {
    enabled: enabled && id.length > 0,
  });
}

export function useCreatePessoalSituationMutation(): UseMutationResult<
  PessoalSituation,
  Error,
  PessoalSituationPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => pessoalService.createSituation(payload),
    onSuccess: async (situation) => {
      await queryClient.invalidateQueries({ queryKey: trackingKey(situation.client_id) });
    },
  });
}

export function useUpdatePessoalSituationMutation(
  clientId: string,
): UseMutationResult<
  PessoalSituation,
  Error,
  { id: string; payload: PessoalSituationUpdatePayload }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }) => pessoalService.updateSituation(id, payload),
    onSuccess: async (_situation, { id }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trackingKey(clientId) }),
        queryClient.invalidateQueries({ queryKey: situationDetailKey(id) }),
      ]);
    },
  });
}
