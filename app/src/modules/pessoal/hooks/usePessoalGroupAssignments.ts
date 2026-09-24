import { useMutation, useQueryClient, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";
import type { PaginatedResult } from "@shared/pagination/pagination";

import { pessoalService } from "../services/pessoalService";
import type {
  PessoalGroupAssignmentApplyResult,
  PessoalGroupAssignmentEligible,
  PessoalGroupAssignmentEligibleParams,
  PessoalGroupAssignmentPreview,
} from "../types/groupAssignments";
import { pessoalQueryKey } from "./queryKeys";

export function usePessoalEligibleGroupAssignments(
  params: PessoalGroupAssignmentEligibleParams,
): UseQueryResult<PaginatedResult<PessoalGroupAssignmentEligible>, Error> {
  return useFetch(
    pessoalQueryKey("group-assignments", "eligible", params.page, params.limit, params.search ?? ""),
    () => pessoalService.listEligibleGroupAssignments(params),
  );
}

export function usePessoalGroupAssignmentPreview(
  previewId: string | null,
  page: number,
): UseQueryResult<PessoalGroupAssignmentPreview, Error> {
  return useFetch(
    pessoalQueryKey("group-assignments", "preview", previewId ?? "missing", page),
    () => pessoalService.getGroupAssignmentPreview(previewId ?? "", page, 25),
    { enabled: Boolean(previewId) },
  );
}

export function useCreatePessoalGroupAssignmentPreviewMutation(): UseMutationResult<
  PessoalGroupAssignmentPreview,
  Error,
  { groupId: string; clientIds: string[] }
> {
  return useMutation({
    mutationFn: ({ groupId, clientIds }) => pessoalService.createGroupAssignmentPreview(groupId, clientIds),
  });
}

export function useApplyPessoalGroupAssignmentPreviewMutation(): UseMutationResult<
  PessoalGroupAssignmentApplyResult,
  Error,
  { previewId: string; fingerprint: string; idempotencyKey: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ previewId, fingerprint, idempotencyKey }) =>
      pessoalService.applyGroupAssignmentPreview(previewId, fingerprint, idempotencyKey),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: pessoalQueryKey("group-assignments", "eligible") });
      await queryClient.invalidateQueries({ queryKey: pessoalQueryKey("payroll") });
    },
  });
}
