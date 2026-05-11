import { useMemo, useState } from "react";

import { useAuth } from "@/context/AuthContext";
import { permissionService } from "@modules/users/services/permissionService";
import { normalizePermissionResponse } from "@modules/users/utils/permissionUtils";
import { useFetch } from "@shared/hooks";
import { useAssignableUsers } from "../hooks/useAssignableUsers";
import { useRhTimeSheets } from "../hooks/useRhCalendar";
import type { RhTimeSheet, RhTimeSheetListFilters } from "../types";
import { RhTimesheetGenerateModal } from "./RhTimesheetGenerateModal";
import { RhTimesheetsFilters } from "./RhTimesheetsFilters";
import { RhTimesheetsTable } from "./RhTimesheetsTable";

function formatInputDate(date: Date) {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function getMonthStartInputValue() {
  const now = new Date();
  return formatInputDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

function getTodayInputValue() {
  return formatInputDate(new Date());
}

function parseDateStart(value: string) {
  if (!value) {
    return null;
  }

  return new Date(`${value}T00:00:00`);
}

function parseDateEnd(value: string) {
  if (!value) {
    return null;
  }

  return new Date(`${value}T23:59:59.999`);
}

function intersectsSelectedPeriod(
  sheet: RhTimeSheet,
  dateFrom: string,
  dateTo: string,
) {
  const start = new Date(sheet.start_time);
  const end = new Date(sheet.end_time);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return false;
  }

  const from = parseDateStart(dateFrom);
  const to = parseDateEnd(dateTo);

  if (from && end < from) {
    return false;
  }

  if (to && start > to) {
    return false;
  }

  return true;
}

export function RhTimesheetsSection() {
  const { user } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [dateFrom, setDateFrom] = useState(getMonthStartInputValue);
  const [dateTo, setDateTo] = useState(getTodayInputValue);
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);

  const permissionQuery = useFetch(
    ["rh", "timesheets", "permissions", user?.id ?? ""],
    () => permissionService.getByUserId(user?.id ?? ""),
    {
      enabled: Boolean(user?.id),
      retry: false,
      refetchOnWindowFocus: false,
    },
  );

  const normalizedPermissions = useMemo(() => {
    if (!permissionQuery.data) {
      return null;
    }

    return normalizePermissionResponse(permissionQuery.data).known;
  }, [permissionQuery.data]);

  const canManageTimesheets = Boolean(
    user?.permission === 2 ||
      (normalizedPermissions?.rh !== null &&
        normalizedPermissions?.rh !== undefined &&
        normalizedPermissions.rh >= 1),
  );

  const assignableUsersQuery = useAssignableUsers({
    enabled: canManageTimesheets,
  });

  const effectiveUserId = canManageTimesheets
    ? selectedUserId || (user?.id ?? "")
    : (user?.id ?? "");
  const filters: RhTimeSheetListFilters = {
    target_user_id: effectiveUserId || undefined,
  };

  const timeSheetsQuery = useRhTimeSheets(filters);
  const assignableUsers = assignableUsersQuery.data ?? [];
  const timeSheets = timeSheetsQuery.data ?? [];

  const filteredTimeSheets = useMemo(() => {
    return timeSheets.filter((sheet) =>
      intersectsSelectedPeriod(sheet, dateFrom, dateTo),
    );
  }, [dateFrom, dateTo, timeSheets]);

  const userNameById = useMemo(() => {
    return new Map(
      assignableUsers.map((assignableUser) => [
        assignableUser.id,
        assignableUser.name,
      ]),
    );
  }, [assignableUsers]);

  function getUserLabel(userId: string) {
    if (user?.id === userId) {
      return user?.name?.trim() || "Você";
    }

    return userNameById.get(userId) ?? "Colaborador não encontrado";
  }

  function handleOpenGenerate() {
    if (!canManageTimesheets) {
      return;
    }

    setIsGenerateOpen(true);
  }

  const isLoading =
    timeSheetsQuery.isLoading ||
    (canManageTimesheets &&
      assignableUsersQuery.isLoading &&
      !assignableUsersQuery.data);
  const error =
    timeSheetsQuery.error || (canManageTimesheets ? assignableUsersQuery.error : null);

  return (
    <div className="space-y-6">
      <RhTimesheetsFilters
        assignableUsers={assignableUsers}
        canManageTimesheets={canManageTimesheets}
        selectedUserId={selectedUserId}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onUserChange={setSelectedUserId}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onOpenGenerate={handleOpenGenerate}
      />

      {canManageTimesheets ? (
        <RhTimesheetGenerateModal
          open={isGenerateOpen}
          assignableUsers={assignableUsers}
          defaultUserId={selectedUserId}
          onClose={() => setIsGenerateOpen(false)}
        />
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          Carregando folhas de ponto...
        </div>
      ) : null}

      {!isLoading && !error && filteredTimeSheets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          Nenhuma folha encontrada para os filtros selecionados.
        </div>
      ) : null}

      {!isLoading && error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
          Não foi possível carregar as folhas de ponto.
        </div>
      ) : null}

      {!isLoading && !error && filteredTimeSheets.length > 0 ? (
        <RhTimesheetsTable
          timeSheets={filteredTimeSheets}
          getUserLabel={getUserLabel}
        />
      ) : null}
    </div>
  );
}
