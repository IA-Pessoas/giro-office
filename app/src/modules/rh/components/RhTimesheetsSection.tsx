import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { toast } from "react-toastify";

import { useAssignableUsers } from "../hooks/useAssignableUsers";
import {
  useRebuildRhTimeSheetMutation,
  useRhTimeSheets,
} from "../hooks/useRhCalendar";
import { useRhPermissions } from "../hooks/useRhPermissions";
import type { RhTimeSheetListFilters, RhTimeSheetListItem } from "../types";
import { RhTimesheetGenerateModal } from "./RhTimesheetGenerateModal";
import { RhTimesheetSignDialog } from "./RhTimesheetSignDialog";
import { RhTimesheetReopenDialog } from "./RhTimesheetReopenDialog";
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

function intersectsSelectedPeriod(sheet: RhTimeSheetListItem, dateFrom: string, dateTo: string) {
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
  const router = useRouter();
  const { user, canManageRhTimesheets: canManageTimesheets } = useRhPermissions("timesheets");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [dateFrom, setDateFrom] = useState(getMonthStartInputValue);
  const [dateTo, setDateTo] = useState(getTodayInputValue);
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [sheetPendingSignature, setSheetPendingSignature] =
    useState<RhTimeSheetListItem | null>(null);
  const [sheetPendingReopen, setSheetPendingReopen] =
    useState<RhTimeSheetListItem | null>(null);
  const [rebuildingSheetId, setRebuildingSheetId] = useState<string | null>(null);
  const rebuildMutation = useRebuildRhTimeSheetMutation();

  const assignableUsersQuery = useAssignableUsers({
    enabled: canManageTimesheets,
    module: "rh",
  });

  const currentUserName = user?.name?.trim() || "Você";
  const assignableUsers = assignableUsersQuery.data ?? [];
  const departments = useMemo(() => {
    return [
      ...new Set(
        assignableUsers.map((assignableUser) => assignableUser.departmentName).filter(Boolean),
      ),
    ];
  }, [assignableUsers]);
  const filteredAssignableUsers = useMemo(() => {
    if (!selectedDepartment) {
      return assignableUsers;
    }

    return assignableUsers.filter(
      (assignableUser) => assignableUser.departmentName === selectedDepartment,
    );
  }, [assignableUsers, selectedDepartment]);
  const shouldDisableGenerate =
    !canManageTimesheets || assignableUsersQuery.isLoading || filteredAssignableUsers.length === 0;

  const effectiveUserId = canManageTimesheets ? selectedUserId || (user?.id ?? "") : user?.id ?? "";
  const filters: RhTimeSheetListFilters = {
    target_user_id: effectiveUserId || undefined,
  };

  const timeSheetsQuery = useRhTimeSheets(filters);
  const timeSheets = timeSheetsQuery.data ?? [];
  const auxiliaryError = canManageTimesheets ? assignableUsersQuery.error : null;

  const filteredTimeSheets = useMemo(() => {
    return timeSheets.filter((sheet) => intersectsSelectedPeriod(sheet, dateFrom, dateTo));
  }, [dateFrom, dateTo, timeSheets]);

  const userNameById = useMemo(() => {
    return new Map(assignableUsers.map((assignableUser) => [assignableUser.id, assignableUser.name]));
  }, [assignableUsers]);

  function getUserLabel(userId: string) {
    if (user?.id === userId) {
      return currentUserName;
    }

    return userNameById.get(userId) ?? "Colaborador não encontrado";
  }

  function handleDepartmentChange(nextDepartment: string) {
    setSelectedDepartment(nextDepartment);
    setSelectedUserId("");
  }

  function handleOpenGenerate() {
    if (!canManageTimesheets) {
      return;
    }

    setIsGenerateOpen(true);
  }

  async function handleRebuild(sheet: RhTimeSheetListItem) {
    setRebuildingSheetId(sheet.id);
    try {
      await rebuildMutation.mutateAsync({ id: sheet.id });
      toast.success("Folha atualizada com os registros atuais.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a folha.");
    } finally {
      setRebuildingSheetId(null);
    }
  }

  const isLoading = timeSheetsQuery.isLoading;
  const error = timeSheetsQuery.error;

  return (
    <div className="space-y-6">
      <RhTimesheetsFilters
        assignableUsers={filteredAssignableUsers}
        departments={departments}
        canManageTimesheets={canManageTimesheets}
        currentUserLabel={currentUserName}
        disableGenerate={shouldDisableGenerate}
        selectedDepartment={selectedDepartment}
        selectedUserId={selectedUserId}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDepartmentChange={handleDepartmentChange}
        onUserChange={setSelectedUserId}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onOpenGenerate={handleOpenGenerate}
      />

      {canManageTimesheets ? (
        <RhTimesheetGenerateModal
          open={isGenerateOpen}
          assignableUsers={filteredAssignableUsers}
          defaultUserId={selectedUserId}
          onClose={() => setIsGenerateOpen(false)}
        />
      ) : null}

      <RhTimesheetSignDialog
        open={Boolean(sheetPendingSignature)}
        sheet={sheetPendingSignature}
        onClose={() => setSheetPendingSignature(null)}
      />

      <RhTimesheetReopenDialog
        open={Boolean(sheetPendingReopen)}
        sheet={sheetPendingReopen}
        onClose={() => setSheetPendingReopen(null)}
      />

      {!isLoading && !error && auxiliaryError ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300">
          Não foi possível carregar a lista de colaboradores agora.
        </div>
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
          currentUserId={user?.id ?? ""}
          canManageTimesheets={canManageTimesheets}
          signingSheetId={sheetPendingSignature?.id ?? null}
          reopeningSheetId={sheetPendingReopen?.id ?? null}
          rebuildingSheetId={rebuildingSheetId}
          getUserLabel={getUserLabel}
          onSign={setSheetPendingSignature}
          onReopen={setSheetPendingReopen}
          onRebuild={(sheet) => void handleRebuild(sheet)}
          onViewDetail={(timesheetId) => void router.push(`/rh/timesheets/${timesheetId}`)}
        />
      ) : null}
    </div>
  );
}
