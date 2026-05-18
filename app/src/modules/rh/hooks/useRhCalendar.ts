import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { rhCalendarService } from "../services/rhCalendarService";
import type {
  ApproveRhTimeBankReleasePayload,
  CreateRhHolidayPayload,
  CreateRhTimeBankReleasePayload,
  CreateRhTimeSheetPayload,
  DeleteRhHolidayPayload,
  RhHoliday,
  RhMutationMessage,
  RhTimeBankOverview,
  RhTimeBankRelease,
  RhTimeBankReleaseListFilters,
  RhTimeBankSummary,
  RhTimeSheetDetail,
  RhTimeSheetListItem,
  RhTimeSheetListFilters,
  SignRhTimeSheetPayload,
  UpdateRhHolidayPayload,
} from "../types";
import { RH_QUERY_KEY } from "./useRhRequests";

export function rhHolidaysQueryKey() {
  return [...RH_QUERY_KEY, "calendar", "holidays"] as const;
}

export function rhTimeBankReleasesQueryKey(filters: RhTimeBankReleaseListFilters = {}) {
  return [
    ...RH_QUERY_KEY,
    "calendar",
    "time-bank-releases",
    filters.user_id ?? "",
    filters.is_approved ?? "all",
    filters.date_from ?? "",
    filters.date_to ?? "",
  ] as const;
}

export function rhTimeBankSummaryQueryKey(userId?: string) {
  return [...RH_QUERY_KEY, "calendar", "time-bank-summary", userId ?? "me"] as const;
}

export function rhTimeBankOverviewQueryKey() {
  return [...RH_QUERY_KEY, "calendar", "time-bank-overview"] as const;
}

export function rhTimeSheetsQueryKey(filters: RhTimeSheetListFilters = {}) {
  return [...RH_QUERY_KEY, "calendar", "timesheets", filters.target_user_id ?? "me"] as const;
}

export function rhTimeSheetDetailQueryKey(id?: string | null) {
  return [...RH_QUERY_KEY, "calendar", "timesheet-detail", id ?? ""] as const;
}

export function useRhHolidays(): UseQueryResult<RhHoliday[], Error> {
  return useFetch(rhHolidaysQueryKey(), () => rhCalendarService.listHolidays(), {
    refetchOnWindowFocus: false,
  });
}

export function useRhTimeBankReleases(
  filters: RhTimeBankReleaseListFilters = {},
): UseQueryResult<RhTimeBankRelease[], Error> {
  return useFetch(
    rhTimeBankReleasesQueryKey(filters),
    () => rhCalendarService.listTimeBankReleases(filters),
    {
      refetchOnWindowFocus: false,
    },
  );
}

export function useRhTimeBankSummary(
  userId?: string,
  enabled = true,
): UseQueryResult<RhTimeBankSummary, Error> {
  return useFetch(
    rhTimeBankSummaryQueryKey(userId),
    () =>
      userId
        ? rhCalendarService.getTimeBankSummaryByUserId(userId)
        : rhCalendarService.getMyTimeBankSummary(),
    {
      enabled,
      refetchOnWindowFocus: false,
    },
  );
}

export function useRhTimeBankOverview(enabled = true): UseQueryResult<RhTimeBankOverview, Error> {
  return useFetch(rhTimeBankOverviewQueryKey(), () => rhCalendarService.getTimeBankOverview(), {
    enabled,
    refetchOnWindowFocus: false,
  });
}

export function useRhTimeSheets(
  filters: RhTimeSheetListFilters = {},
): UseQueryResult<RhTimeSheetListItem[], Error> {
  return useFetch(
    rhTimeSheetsQueryKey(filters),
    () => rhCalendarService.listTimeSheets(filters),
    {
      refetchOnWindowFocus: false,
    },
  );
}

export function useRhTimeSheetDetail(
  id?: string | null,
  enabled = true,
): UseQueryResult<RhTimeSheetDetail, Error> {
  return useFetch(rhTimeSheetDetailQueryKey(id), () => rhCalendarService.getTimeSheetDetail(id ?? ""), {
    enabled: enabled && Boolean(id),
    refetchOnWindowFocus: false,
  });
}

export function useCreateRhHolidayMutation(): UseMutationResult<
  RhHoliday,
  Error,
  CreateRhHolidayPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhCalendarService.createHoliday(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: rhHolidaysQueryKey() });
    },
  });
}

export function useUpdateRhHolidayMutation(): UseMutationResult<
  RhHoliday,
  Error,
  UpdateRhHolidayPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhCalendarService.updateHoliday(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: rhHolidaysQueryKey() });
    },
  });
}

export function useDeleteRhHolidayMutation(): UseMutationResult<
  RhMutationMessage,
  Error,
  DeleteRhHolidayPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhCalendarService.deleteHoliday(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: rhHolidaysQueryKey() });
    },
  });
}

export function useCreateRhTimeBankReleaseMutation(): UseMutationResult<
  RhTimeBankRelease,
  Error,
  CreateRhTimeBankReleasePayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhCalendarService.createTimeBankRelease(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
    },
  });
}

export function useApproveRhTimeBankReleaseMutation(): UseMutationResult<
  RhTimeBankRelease,
  Error,
  ApproveRhTimeBankReleasePayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhCalendarService.approveTimeBankRelease(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
    },
  });
}

export function useCreateRhTimeSheetMutation(): UseMutationResult<
  RhTimeSheetDetail,
  Error,
  CreateRhTimeSheetPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhCalendarService.createTimeSheet(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
    },
  });
}

export function useSignRhTimeSheetMutation(): UseMutationResult<
  RhTimeSheetDetail,
  Error,
  SignRhTimeSheetPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhCalendarService.signTimeSheet(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
    },
  });
}
