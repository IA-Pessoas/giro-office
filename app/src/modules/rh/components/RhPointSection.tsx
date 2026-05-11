import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";

import { useAuth } from "@/context/AuthContext";
import { permissionService } from "@modules/users/services/permissionService";
import { normalizePermissionResponse } from "@modules/users/utils/permissionUtils";
import { useFetch } from "@shared/hooks";
import { useAssignableUsers } from "../hooks/useAssignableUsers";
import type { RhPointAdjustmentStatus, RhPointListItem } from "../types";
import {
  useRhPointAdjustmentRequests,
  useRhPoints,
  useRhPointSummary,
  useRegisterRhPointMutation,
  useRhTodayPoint,
} from "../hooks/useRhPoint";
import { RhPointAdjustmentPanel } from "./RhPointAdjustmentPanel";
import { RhPointAdjustmentRequestModal } from "./RhPointAdjustmentRequestModal";
import { RhPointFilters } from "./RhPointFilters";
import { RhPointSummaryCards } from "./RhPointSummaryCards";
import { RhPointTable } from "./RhPointTable";
import { RhPointTodayCard } from "./RhPointTodayCard";
import { RhTimeBankSection } from "./RhTimeBankSection";
import { RhTimesheetsSection } from "./RhTimesheetsSection";

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

function getCurrentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthDateRange(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    return {
      dateFrom: getMonthStartInputValue(),
      dateTo: getTodayInputValue(),
    };
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 0);

  return {
    dateFrom: formatInputDate(monthStart),
    dateTo: formatInputDate(monthEnd),
  };
}

export function RhPointSection() {
  const { user } = useAuth();
  const [activePointTab, setActivePointTab] = useState<"point" | "timebank" | "timesheets">(
    "point",
  );
  const [selectedUserId, setSelectedUserId] = useState("");
  const [month, setMonth] = useState(getCurrentMonthValue);
  const [dateFrom, setDateFrom] = useState(getMonthStartInputValue);
  const [dateTo, setDateTo] = useState(getTodayInputValue);
  const [selectedAdjustmentStatus, setSelectedAdjustmentStatus] = useState<
    "" | RhPointAdjustmentStatus
  >("");
  const [selectedPointForAdjustment, setSelectedPointForAdjustment] =
    useState<RhPointListItem | null>(null);

  const permissionQuery = useFetch(
    ["rh", "point", "permissions", user?.id ?? ""],
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

  const canManagePoint = Boolean(
    user?.permission === 2 ||
      (normalizedPermissions?.rh !== null &&
        normalizedPermissions?.rh !== undefined &&
        normalizedPermissions.rh >= 1),
  );

  const assignableUsersQuery = useAssignableUsers({
    enabled: canManagePoint,
  });

  const assignableUsers = assignableUsersQuery.data ?? [];
  const currentUserName = user?.name?.trim() || "Você";
  const effectiveUserId = canManagePoint ? selectedUserId || (user?.id ?? "") : (user?.id ?? "");
  const todayPointQuery = useRhTodayPoint();
  const pointsQuery = useRhPoints({
    user_id: effectiveUserId || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  });
  const summaryQuery = useRhPointSummary({
    month,
    user_id: effectiveUserId || undefined,
  });
  const adjustmentsQuery = useRhPointAdjustmentRequests({
    user_id: effectiveUserId || undefined,
    status: selectedAdjustmentStatus || undefined,
  });
  const registerMutation = useRegisterRhPointMutation();

  useEffect(() => {
    const { dateFrom: nextDateFrom, dateTo: nextDateTo } = getMonthDateRange(month);
    setDateFrom(nextDateFrom);
    setDateTo(nextDateTo);
  }, [month]);

  async function handleRegisterPoint() {
    try {
      await registerMutation.mutateAsync();
      toast.success("Ponto registrado com sucesso.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível registrar o ponto.";
      toast.error(message);
    }
  }

  function getUserLabel(userId: string) {
    if (user?.id === userId) {
      return currentUserName;
    }

    const matchedUser = assignableUsers.find((assignableUser) => assignableUser.id === userId);
    return matchedUser?.name ?? "Colaborador não encontrado";
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setActivePointTab("point")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activePointTab === "point"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            }`}
          >
            Ponto
          </button>
          <button
            type="button"
            onClick={() => setActivePointTab("timebank")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activePointTab === "timebank"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            }`}
          >
            Banco de Horas
          </button>
          <button
            type="button"
            onClick={() => setActivePointTab("timesheets")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activePointTab === "timesheets"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            }`}
          >
            Folhas de Ponto
          </button>
        </div>
      </div>

      {activePointTab === "point" ? (
        <>
          <RhPointFilters
            assignableUsers={assignableUsers}
            canManagePoint={canManagePoint}
            currentUserLabel={currentUserName}
            selectedUserId={selectedUserId}
            month={month}
            dateFrom={dateFrom}
            dateTo={dateTo}
            selectedAdjustmentStatus={selectedAdjustmentStatus}
            onUserChange={setSelectedUserId}
            onMonthChange={setMonth}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            onAdjustmentStatusChange={setSelectedAdjustmentStatus}
          />

          <RhPointTodayCard
            currentUserName={currentUserName}
            todayPoint={todayPointQuery.data ?? null}
            isLoading={todayPointQuery.isLoading}
            hasError={Boolean(todayPointQuery.error)}
            isRegistering={registerMutation.isPending}
            onRegister={handleRegisterPoint}
          />
          <RhPointSummaryCards
            summary={summaryQuery.data ?? null}
            isLoading={summaryQuery.isLoading}
            hasError={Boolean(summaryQuery.error)}
          />
          <RhPointTable
            points={pointsQuery.data ?? []}
            isLoading={pointsQuery.isLoading}
            hasError={Boolean(pointsQuery.error)}
            currentUserId={user?.id ?? ""}
            onRequestAdjustment={setSelectedPointForAdjustment}
          />
          <RhPointAdjustmentPanel
            adjustments={adjustmentsQuery.data ?? []}
            isLoading={adjustmentsQuery.isLoading}
            hasError={Boolean(adjustmentsQuery.error)}
            canManagePoint={canManagePoint}
            currentUserId={user?.id ?? ""}
            getUserLabel={getUserLabel}
          />

          <RhPointAdjustmentRequestModal
            open={Boolean(selectedPointForAdjustment)}
            point={selectedPointForAdjustment}
            onClose={() => setSelectedPointForAdjustment(null)}
          />
        </>
      ) : null}

      {activePointTab === "timebank" ? <RhTimeBankSection /> : null}
      {activePointTab === "timesheets" ? <RhTimesheetsSection /> : null}
    </div>
  );
}
