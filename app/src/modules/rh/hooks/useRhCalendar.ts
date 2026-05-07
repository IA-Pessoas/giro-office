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
  RhTimeBankRelease,
  RhTimeBankReleaseListFilters,
  RhTimeSheet,
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

export function rhTimeSheetsQueryKey(filters: RhTimeSheetListFilters = {}) {
  return [...RH_QUERY_KEY, "calendar", "timesheets", filters.target_user_id ?? "me"] as const;
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

export function useRhTimeSheets(
  filters: RhTimeSheetListFilters = {},
): UseQueryResult<RhTimeSheet[], Error> {
  return useFetch(
    rhTimeSheetsQueryKey(filters),
    () => rhCalendarService.listTimeSheets(filters),
    {
      refetchOnWindowFocus: false,
    },
  );
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
  RhTimeSheet,
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
  RhTimeSheet,
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
