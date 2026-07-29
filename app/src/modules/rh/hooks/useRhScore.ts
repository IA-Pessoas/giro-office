import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { rhScoreService } from "../services/rhScoreService";
import type {
  CreateRhScoreQuestionPayload,
  CreateRhScoreQuarterPayload,
  DeleteRhScoreQuestionPayload,
  RhMutationMessage,
  RhPendingScoreEvaluation,
  RhScoreNitro,
  RhScoreQuestion,
  RhScoreQuestionListFilters,
  RhScoreQuarter,
  SubmitRhScoreEvaluationPayload,
  UpdateRhQuarterNitroPayload,
  UpdateRhScoreNitroPayload,
  UpdateRhScoreQuestionPayload,
} from "../types";
import { RH_QUERY_KEY } from "./useRhRequests";

interface RhScoreReadQueryOptions {
  enabled?: boolean;
}

export function rhScoreQuestionsQueryKey(filters: RhScoreQuestionListFilters = {}) {
  return [...RH_QUERY_KEY, "score", "questions", filters.type ?? "", filters.all ?? false] as const;
}

export function rhMyScoresQueryKey() {
  return [...RH_QUERY_KEY, "score", "quarters", "me"] as const;
}

export function rhScoreDetailQueryKey(id: string) {
  return [...RH_QUERY_KEY, "score", "quarters", "detail", id] as const;
}

export function rhPendingScoreEvaluationsQueryKey() {
  return [...RH_QUERY_KEY, "score", "evaluations", "pending"] as const;
}

export function useRhScoreQuestions(
  filters: RhScoreQuestionListFilters = {},
): UseQueryResult<RhScoreQuestion[], Error> {
  return useFetch(
    rhScoreQuestionsQueryKey(filters),
    () => rhScoreService.listQuestions(filters),
    {
    },
  );
}

export function useRhMyScores(): UseQueryResult<RhScoreQuarter[], Error> {
  return useFetch(rhMyScoresQueryKey(), () => rhScoreService.listMyScores(), {
  });
}

export function useRhScoreDetail(id: string | undefined): UseQueryResult<RhScoreQuarter, Error> {
  return useFetch(
    rhScoreDetailQueryKey(id ?? "missing"),
    () => rhScoreService.getScoreDetail(id ?? ""),
    {
      enabled: Boolean(id),
    },
  );
}

export function useRhPendingScoreEvaluations(
  options?: RhScoreReadQueryOptions,
): UseQueryResult<
  RhPendingScoreEvaluation[],
  Error
> {
  return useFetch(
    rhPendingScoreEvaluationsQueryKey(),
    () => rhScoreService.listPendingEvaluations(),
    {
      enabled: options?.enabled ?? true,
    },
  );
}

export function useCreateRhScoreQuestionMutation(): UseMutationResult<
  RhScoreQuestion,
  Error,
  CreateRhScoreQuestionPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhScoreService.createQuestion(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
    },
  });
}

export function useUpdateRhScoreQuestionMutation(): UseMutationResult<
  RhScoreQuestion,
  Error,
  UpdateRhScoreQuestionPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhScoreService.updateQuestion(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
    },
  });
}

export function useDeleteRhScoreQuestionMutation(): UseMutationResult<
  RhMutationMessage,
  Error,
  DeleteRhScoreQuestionPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhScoreService.deleteQuestion(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
    },
  });
}

export function useGenerateRhScoreQuarterMutation(): UseMutationResult<
  RhScoreQuarter,
  Error,
  CreateRhScoreQuarterPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhScoreService.generateQuarterScore(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
    },
  });
}

export function useUpdateRhQuarterNitroMutation(): UseMutationResult<
  RhScoreNitro,
  Error,
  UpdateRhQuarterNitroPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhScoreService.updateQuarterNitro(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
    },
  });
}

export function useSubmitRhScoreEvaluationMutation(): UseMutationResult<
  RhMutationMessage,
  Error,
  SubmitRhScoreEvaluationPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhScoreService.submitEvaluation(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
    },
  });
}

export function useUpdateRhScoreNitroMutation(): UseMutationResult<
  RhScoreNitro,
  Error,
  UpdateRhScoreNitroPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhScoreService.updateNitroMetric(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
    },
  });
}
