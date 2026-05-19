import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { Clock3, FileText, WalletCards } from "lucide-react";
import { toast } from "react-toastify";

import { useAssignableUsers } from "../hooks/useAssignableUsers";
import { useRhPermissions } from "../hooks/useRhPermissions";
import type { RhPointAdjustmentStatus, RhPointListItem } from "../types";
import {
  useRhPointAdjustmentRequests,
  useRhPointConfig,
  useRhPoints,
  useRhPointSummary,
  useRegisterRhPointMutation,
  useRhTodayPoint,
} from "../hooks/useRhPoint";
import { RhPointAdjustmentPanel } from "./RhPointAdjustmentPanel";
import { RhPointAdjustmentRequestModal } from "./RhPointAdjustmentRequestModal";
import { RhPointConfigCard } from "./RhPointConfigCard";
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
  const { user, canManageRh } = useRhPermissions("point");
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
  const canManagePoint = canManageRh;

  const assignableUsersQuery = useAssignableUsers({
    enabled: canManagePoint,
  });

  const assignableUsers = assignableUsersQuery.data ?? [];
  const currentUserName = user?.name?.trim() || "Você";
  const effectiveUserId = canManagePoint ? selectedUserId || (user?.id ?? "") : user?.id ?? "";
  const hasAuthenticatedUser = Boolean(user?.id);
  const isPointTabActive = activePointTab === "point";
  const shouldShowTodayCard = !canManagePoint || !selectedUserId || selectedUserId === user?.id;

  const pointConfigQuery = useRhPointConfig(
    canManagePoint ? selectedUserId || undefined : undefined,
    {
      enabled: hasAuthenticatedUser && isPointTabActive,
    },
  );
  const myPointConfigQuery = useRhPointConfig(undefined, {
    enabled: hasAuthenticatedUser && isPointTabActive,
  });
  const todayPointQuery = useRhTodayPoint({
    enabled: hasAuthenticatedUser && isPointTabActive,
  });
  const pointsQuery = useRhPoints(
    {
      user_id: effectiveUserId || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    },
    {
      enabled: hasAuthenticatedUser && isPointTabActive,
    },
  );
  const summaryQuery = useRhPointSummary(
    {
      month,
      user_id: effectiveUserId || undefined,
    },
    {
      enabled: hasAuthenticatedUser && isPointTabActive,
    },
  );
  const adjustmentsQuery = useRhPointAdjustmentRequests(
    {
      user_id: effectiveUserId || undefined,
      status: selectedAdjustmentStatus || undefined,
    },
    {
      enabled: hasAuthenticatedUser && isPointTabActive,
    },
  );
  const registerMutation = useRegisterRhPointMutation();

  useEffect(() => {
    const { dateFrom: nextDateFrom, dateTo: nextDateTo } = getMonthDateRange(month);
    setDateFrom(nextDateFrom);
    setDateTo(nextDateTo);
  }, [month]);

  useEffect(() => {
    if (activePointTab === "point") {
      return;
    }

    setSelectedUserId("");
    setMonth(getCurrentMonthValue());
    setSelectedAdjustmentStatus("");
    setSelectedPointForAdjustment(null);
  }, [activePointTab]);

  async function handleRegisterPoint() {
    try {
      await registerMutation.mutateAsync();
      toast.success("Ponto registrado com sucesso.");
    } catch (error) {
      const responseMessage = isAxiosError(error) ? error.response?.data?.error : undefined;
      const message =
        typeof responseMessage === "string"
          ? responseMessage
          : error instanceof Error
            ? error.message
            : "Não foi possível registrar o ponto.";
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

  const pointConfigTargetLabel =
    canManagePoint && selectedUserId ? getUserLabel(selectedUserId) : currentUserName;

  const pointSections = [
    {
      key: "point" as const,
      title: "Registros de ponto",
      description: "Batidas, resumo do mês e ajustes.",
      icon: Clock3,
    },
    {
      key: "timebank" as const,
      title: "Banco de horas",
      description: "Lançamentos, saldo e aprovações.",
      icon: WalletCards,
    },
    {
      key: "timesheets" as const,
      title: "Folhas de ponto",
      description: "Folhas geradas, assinatura e consulta.",
      icon: FileText,
    },
  ];

  return (
    <div className="min-w-0 space-y-6">
      <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="bg-transparent px-4 pb-0 pt-4">
          <div className="flex max-w-full flex-wrap items-end gap-2">
            {pointSections.map((section) => {
              const Icon = section.icon;
              const isActive = activePointTab === section.key;

              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setActivePointTab(section.key)}
                  className={`flex min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors ${
                    isActive
                      ? "-mb-px rounded-t-2xl bg-gray-50/80 text-gray-900 shadow-sm dark:bg-gray-800/90 dark:text-white"
                      : "rounded-2xl bg-transparent text-gray-500 opacity-55 hover:opacity-75 dark:text-gray-500 dark:hover:bg-gray-700/10"
                  }`}
                >
                  <div
                    className={`rounded-lg p-2 ${
                      isActive
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
                        : "bg-transparent text-gray-500 dark:text-gray-500"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="min-w-0">
                    <p
                      className={`text-sm font-semibold ${
                        isActive
                          ? "text-gray-900 dark:text-white"
                          : "text-gray-600 dark:text-gray-400"
                      }`}
                    >
                      {section.title}
                    </p>
                    <p
                      className={`mt-1 text-xs leading-5 ${
                        isActive
                          ? "text-gray-600 dark:text-gray-400"
                          : "text-gray-500 dark:text-gray-500"
                      }`}
                    >
                      {section.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {activePointTab === "point" ? (
          <div className="bg-gray-50/80 p-4 dark:bg-gray-800/90">
            <RhPointFilters
              assignableUsers={assignableUsers}
              canManagePoint={canManagePoint}
              currentUserLabel={currentUserName}
              selectedUserId={selectedUserId}
              month={month}
              selectedAdjustmentStatus={selectedAdjustmentStatus}
              onUserChange={setSelectedUserId}
              onMonthChange={setMonth}
              onAdjustmentStatusChange={setSelectedAdjustmentStatus}
            />
          </div>
        ) : null}

        {activePointTab === "timebank" ? (
          <div className="bg-gray-50/80 p-4 dark:bg-gray-800/90">
            <RhTimeBankSection />
          </div>
        ) : null}

        {activePointTab === "timesheets" ? (
          <div className="bg-gray-50/80 p-4 dark:bg-gray-800/90">
            <RhTimesheetsSection />
          </div>
        ) : null}
      </div>

      {activePointTab === "point" ? (
        <>
          <RhPointConfigCard
            config={pointConfigQuery.data ?? null}
            isLoading={pointConfigQuery.isLoading}
            hasError={Boolean(pointConfigQuery.error)}
            canManagePoint={canManagePoint}
            selectedUserId={selectedUserId}
            targetUserLabel={pointConfigTargetLabel}
          />

          {shouldShowTodayCard ? (
            <RhPointTodayCard
              currentUserName={currentUserName}
              todayPoint={todayPointQuery.data ?? null}
              isLoading={todayPointQuery.isLoading}
              hasError={Boolean(todayPointQuery.error)}
              isConfigMissing={
                !myPointConfigQuery.isLoading &&
                !myPointConfigQuery.error &&
                !myPointConfigQuery.data
              }
              isRegistering={registerMutation.isPending}
              onRegister={handleRegisterPoint}
            />
          ) : null}

          <RhPointSummaryCards
            summary={summaryQuery.data ?? null}
            isLoading={summaryQuery.isLoading}
            hasError={Boolean(summaryQuery.error)}
            error={summaryQuery.error ?? null}
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
    </div>
  );
}
