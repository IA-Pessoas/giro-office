import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { toast } from "@shared/services/toast";

import { useAssignableUsers } from "../hooks/useAssignableUsers";
import {
  useRhPointAdjustmentRequests,
  useRhPointConfig,
  useRhPoints,
  useRhPointSummary,
  useRecalculateRhPointsMutation,
  useRegisterRhPointMutation,
  useRhTodayPoint,
} from "../hooks/useRhPoint";
import { useRhPermissions } from "../hooks/useRhPermissions";
import type { RhPointAdjustmentStatus, RhPointListItem } from "../types";
import { RhPointAdjustmentPanel } from "./RhPointAdjustmentPanel";
import { RhPointAdjustmentRequestModal } from "./RhPointAdjustmentRequestModal";
import { RhPointConfigCard } from "./RhPointConfigCard";
import { RhPointFilters } from "./RhPointFilters";
import { RhPointRetroactiveModal } from "./RhPointRetroactiveModal";
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

function isBusinessDay(date: Date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function getLastBusinessDaysRange(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    return getMonthDateRange(month);
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 0);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === monthIndex;
  const rangeEnd = isCurrentMonth && today < monthEnd ? today : monthEnd;
  const cursor = new Date(rangeEnd);
  let businessDaysFound = 0;

  while (cursor >= monthStart) {
    if (isBusinessDay(cursor)) {
      businessDaysFound += 1;

      if (businessDaysFound === 5) {
        break;
      }
    }

    cursor.setDate(cursor.getDate() - 1);
  }

  const rangeStart = cursor < monthStart ? monthStart : cursor;

  return {
    dateFrom: formatInputDate(rangeStart),
    dateTo: formatInputDate(rangeEnd),
  };
}

export function RhPointSection() {
  const { user, canManageRhWorkday, canManageRhPointAdjustments } = useRhPermissions("point");
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
  const [isMissingPointAdjustmentOpen, setIsMissingPointAdjustmentOpen] = useState(false);
  const [isRetroactiveOpen, setIsRetroactiveOpen] = useState(false);
  const canManagePoint = canManageRhWorkday;
  const canDecideAdjustments = canManageRhPointAdjustments;

  const assignableUsersQuery = useAssignableUsers({
    enabled: canDecideAdjustments,
    module: "rh",
  });

  const assignableUsers = assignableUsersQuery.data ?? [];
  const auxiliaryError = canDecideAdjustments ? assignableUsersQuery.error : null;
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
      user_id: canManagePoint ? effectiveUserId || undefined : undefined,
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
      user_id: canManagePoint ? effectiveUserId || undefined : undefined,
    },
    {
      enabled: hasAuthenticatedUser && isPointTabActive,
    },
  );
  const adjustmentsQuery = useRhPointAdjustmentRequests(
    {
      user_id: canDecideAdjustments ? selectedUserId || undefined : undefined,
      status: selectedAdjustmentStatus || undefined,
    },
    {
      enabled: hasAuthenticatedUser && isPointTabActive,
    },
  );
  const registerMutation = useRegisterRhPointMutation();
  const recalculateMutation = useRecalculateRhPointsMutation();

  useEffect(() => {
    const { dateFrom: nextDateFrom, dateTo: nextDateTo } = getLastBusinessDaysRange(month);
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
    setIsMissingPointAdjustmentOpen(false);
    setIsRetroactiveOpen(false);
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
      toast.error(message, {
        autoClose: typeof responseMessage === "string" ? 8000 : 5000,
      });
    }
  }

  async function handleRecalculate() {
    if (!selectedUserId || !dateFrom || !dateTo) {
      toast.warn("Selecione o colaborador e o período do recálculo.");
      return;
    }

    try {
      await recalculateMutation.mutateAsync({
        target_user_id: selectedUserId,
        date_from: `${dateFrom}T00:00:00.000Z`,
        date_to: `${dateTo}T23:59:59.999Z`,
      });
      toast.success("Registros recalculados com sucesso.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível recalcular os registros.",
      );
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
  const canRequestOwnAdjustment =
    Boolean(user?.id) &&
    (!canDecideAdjustments || !selectedUserId || selectedUserId === user?.id);

  const pointSections = [
    { key: "point" as const, title: "Registros de ponto" },
    { key: "timebank" as const, title: "Banco de horas" },
    { key: "timesheets" as const, title: "Folhas de ponto" },
  ];

  return (
    <div className="min-w-0 space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              Controle de jornada
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
              Batidas, banco de horas e folhas de ponto.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            {pointSections.map((section) => {
              const isActive = activePointTab === section.key;

              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setActivePointTab(section.key)}
                  className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:hover:bg-gray-700"
                  }`}
                >
                  {section.title}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {activePointTab === "point" ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="rounded-xl bg-gray-50/80 p-4 dark:bg-gray-900/20">
            <RhPointFilters
              assignableUsers={assignableUsers}
              canManagePoint={canDecideAdjustments}
              currentUserLabel={currentUserName}
              selectedUserId={selectedUserId}
              month={month}
              selectedAdjustmentStatus={selectedAdjustmentStatus}
              onUserChange={setSelectedUserId}
              onMonthChange={setMonth}
              onAdjustmentStatusChange={setSelectedAdjustmentStatus}
            />
          </div>
        </div>
      ) : null}

      {activePointTab === "point" && auxiliaryError ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300">
          Não foi possível carregar a lista de colaboradores agora.
        </div>
      ) : null}

      {activePointTab === "timebank" ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="rounded-xl bg-gray-50/80 p-4 dark:bg-gray-900/20">
            <RhTimeBankSection />
          </div>
        </div>
      ) : null}

      {activePointTab === "timesheets" ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="rounded-xl bg-gray-50/80 p-4 dark:bg-gray-900/20">
            <RhTimesheetsSection />
          </div>
        </div>
      ) : null}

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

          {canManagePoint ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/30">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Operações administrativas
                </p>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  Use o colaborador selecionado para corrigir ou recalcular o período.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setIsRetroactiveOpen(true)}
                  disabled={!selectedUserId}
                  className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/20"
                >
                  Lançar ponto retroativo
                </button>
                <button
                  type="button"
                  onClick={() => void handleRecalculate()}
                  disabled={!selectedUserId || recalculateMutation.isPending}
                  className="rounded-lg bg-gray-700 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-600 dark:hover:bg-gray-500"
                >
                  {recalculateMutation.isPending ? "Recalculando..." : "Recalcular período"}
                </button>
              </div>
            </div>
          ) : null}

          {canRequestOwnAdjustment ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/40 dark:bg-blue-900/10">
              <div>
                <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                  Faltou um dia no histórico?
                </p>
                <p className="mt-1 text-xs text-blue-800/80 dark:text-blue-300/80">
                  Solicite a inclusão do dia com os horários e uma justificativa.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMissingPointAdjustmentOpen(true)}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                Solicitar dia sem registro
              </button>
            </div>
          ) : null}

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
            canManagePoint={canDecideAdjustments}
            currentUserId={user?.id ?? ""}
            getUserLabel={getUserLabel}
          />

          <RhPointAdjustmentRequestModal
            open={Boolean(selectedPointForAdjustment) || isMissingPointAdjustmentOpen}
            point={selectedPointForAdjustment}
            onClose={() => {
              setSelectedPointForAdjustment(null);
              setIsMissingPointAdjustmentOpen(false);
            }}
          />

          {canManagePoint ? (
            <RhPointRetroactiveModal
              open={isRetroactiveOpen}
              targetUserId={selectedUserId}
              targetUserLabel={getUserLabel(selectedUserId)}
              onClose={() => setIsRetroactiveOpen(false)}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
