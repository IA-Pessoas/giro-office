import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { reportsService } from "../services/reportsService";
import type {
  ReportDownloadResult,
  ReportHistoryPage,
  ReportHistoryScope,
  ReportJob,
  ReportModel,
  ReportModelDefinition,
  ReportSnapshotPage,
  SharedReportModel,
} from "../types/report.types";
import {
  reportJobPollInterval,
  reportsHistoryQueryKey,
  reportsJobQueryKey,
  reportsModelsQueryKey,
  reportsSnapshotQueryKey,
  REPORTS_QUERY_KEY,
} from "./queryKeys";

export function useReportModels(enabled = true): UseQueryResult<ReportModel[], Error> {
  return useFetch(reportsModelsQueryKey("personal"), () => reportsService.listModels(), { enabled });
}

export function useSharedReportModels(enabled = true): UseQueryResult<SharedReportModel[], Error> {
  return useFetch(reportsModelsQueryKey("shared"), () => reportsService.listSharedModels(), {
    enabled,
  });
}

export function useReportHistory(
  params: {
    scope: ReportHistoryScope;
    status?: string;
    from?: string;
    to?: string;
    model_id?: string;
    author_id?: string;
    cursor?: number;
  },
  enabled = true,
): UseQueryResult<ReportHistoryPage, Error> {
  return useFetch(reportsHistoryQueryKey(params), () => reportsService.listJobs(params), {
    enabled,
    placeholderData: (previousData) => previousData,
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      return items.some((item) => item.status === "queued" || item.status === "processing")
        ? 4000
        : false;
    },
  });
}

export function useReportSnapshot(
  id: string | null,
  scope: ReportHistoryScope,
  cursor?: number,
): UseQueryResult<ReportSnapshotPage, Error> {
  return useFetch(
    reportsSnapshotQueryKey(id ?? "missing", scope, cursor),
    () => reportsService.getSnapshot(id ?? "", scope, cursor),
    { enabled: Boolean(id) },
  );
}

export function useReportJob(id: string | null): UseQueryResult<ReportJob, Error> {
  return useFetch(
    reportsJobQueryKey(id ?? "missing"),
    () => reportsService.getJob(id ?? ""),
    {
      enabled: Boolean(id),
      refetchInterval: (query) =>
        reportJobPollInterval(query.state.data?.status, query.state.dataUpdateCount),
      // Com a aba oculta o react-query pausa o intervalo, e refetchOnWindowFocus é false no app:
      // a tela ficava "na fila" para sempre. É um job só, e o polling para no estado terminal.
      refetchIntervalInBackground: true,
    },
  );
}

export function useCreateReportJobMutation(): UseMutationResult<
  ReportJob,
  Error,
  ReportModelDefinition | { modelVersionId: string; parameterValues?: Record<string, unknown> }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => reportsService.createJob(input),
    onSuccess: async (job) => {
      queryClient.setQueryData(reportsJobQueryKey(job.id), job);
      await queryClient.invalidateQueries({ queryKey: [...REPORTS_QUERY_KEY, "history"] });
    },
  });
}

export function useCancelReportJobMutation(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => reportsService.cancelJob(id),
    onSuccess: async (_data, id) => {
      await queryClient.invalidateQueries({ queryKey: reportsJobQueryKey(id) });
      await queryClient.invalidateQueries({ queryKey: [...REPORTS_QUERY_KEY, "history"] });
    },
  });
}

export function useDownloadReportMutation(): UseMutationResult<
  ReportDownloadResult,
  Error,
  { id: string; format: "pdf" | "csv" | "xlsx" }
> {
  return useMutation({
    mutationFn: ({ id, format }) => reportsService.downloadSnapshot(id, format),
  });
}

export function useDeleteReportModelMutation(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => reportsService.deleteModel(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: reportsModelsQueryKey("personal") });
    },
  });
}

export function useCreateReportModelMutation(): UseMutationResult<
  ReportModel,
  Error,
  { name: string; description?: string; definition: ReportModelDefinition }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => reportsService.createModel(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: reportsModelsQueryKey("personal") });
    },
  });
}

export function useCopySharedReportModelMutation(): UseMutationResult<ReportModel, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => reportsService.copySharedModel(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: reportsModelsQueryKey("personal") });
    },
  });
}

export function useUpdateSharedReportModelMutation(): UseMutationResult<
  SharedReportModel,
  Error,
  { id: string; name?: string; description?: string | null; definition: ReportModelDefinition }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name, description, definition }) =>
      reportsService.updateSharedModel(id, { name, description, definition }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: reportsModelsQueryKey("shared") });
    },
  });
}
