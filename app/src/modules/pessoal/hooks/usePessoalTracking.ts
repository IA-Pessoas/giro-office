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
  PessoalLddImportPreview,
  PessoalLddImportPreviewPayload,
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
  return trackingKey(clientId || "all", "ldd");
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
    enabled,
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
    onSettled: async (_ldd, _error, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trackingKey(payload.client_id) }),
        queryClient.invalidateQueries({ queryKey: lddKey("") }),
      ]);
    },
  });
}

/** Só leitura do PDF: nada é gravado, então não há cache a invalidar. */
export function usePreviewPessoalLddImportMutation(): UseMutationResult<
  PessoalLddImportPreview,
  Error,
  PessoalLddImportPreviewPayload
> {
  return useMutation({
    mutationFn: (payload) => pessoalService.previewLddImport(payload),
  });
}

export function useUpdatePessoalLddMutation(
  id: string,
  clientId: string,
): UseMutationResult<PessoalLdd, Error, PessoalLddUpdatePayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => pessoalService.updateLdd(id, payload),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trackingKey(clientId) }),
        queryClient.invalidateQueries({ queryKey: lddKey("") }),
      ]);
    },
  });
}

export function useDeletePessoalLddMutation(
  clientId: string,
): UseMutationResult<PessoalLdd, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => pessoalService.deleteLdd(id),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trackingKey(clientId) }),
        queryClient.invalidateQueries({ queryKey: lddKey("") }),
      ]);
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
    onSettled: async (_situation, _error, payload) => {
      await queryClient.invalidateQueries({ queryKey: trackingKey(payload.client_id) });
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
    onSettled: async (_situation, _error, { id }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trackingKey(clientId) }),
        queryClient.invalidateQueries({ queryKey: situationDetailKey(id) }),
      ]);
    },
  });
}

export function useDeletePessoalSituationMutation(
  clientId: string,
): UseMutationResult<PessoalSituation, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => pessoalService.deleteSituation(id),
    onSettled: async (_situation, _error, id) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: situationsKey(clientId) }),
        queryClient.invalidateQueries({ queryKey: situationDetailKey(id) }),
      ]);
    },
  });
}
